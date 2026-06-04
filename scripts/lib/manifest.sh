# shellcheck shell=bash
#
# lib/manifest.sh — the single home of the kernel's manifest-reading primitives.
#
# Sourced (never executed) by the kernel scripts that read kernel-manifest.json:
# new-app.sh, generate-assert.sh, check-manifest.sh, and sync-kernel.sh (design
# D6). Consolidates the previously-duplicated expand_entry() plus the common jq
# queries, the preset-wins overlap set, and the semver/sha256 helpers sync needs.
#
# Contract for sourcing scripts:
#   * Set MANIFEST to the manifest path before calling the manifest_* helpers
#     (defaults to "kernel-manifest.json" relative to the cwd — correct for the
#     scripts that cd to the kernel root; sync-kernel.sh sets it to an absolute
#     path under its --kernel-repo).
#   * The lib defines functions and one array; it sets no shell options and runs
#     no manifest reads at source time, so sourcing it in a generated app (where
#     no manifest exists) is harmless.
#
# Standard prologue for a consumer (after computing SCRIPT_DIR):
#   . "$SCRIPT_DIR/lib/manifest.sh"

# Default the manifest location for the cwd-relative consumers; a consumer that
# set MANIFEST before sourcing keeps its value. Also silences SC2154.
: "${MANIFEST:=kernel-manifest.json}"

# ─── expand_entry: a manifest path entry → the on-disk files it covers ───────
# One file per line: `dir/**` → recursive find; other globs → nullglob+globstar
# expansion; literals → themselves if present. Always returns 0 so an absent
# literal does not abort a `set -e`/pipefail caller.
expand_entry() {
  local p="$1"
  case "$p" in
  */'**')
    if [ -d "${p%/**}" ]; then
      find "${p%/**}" -type f
    fi
    ;;
  *[*?[]*)
    shopt -s nullglob globstar
    # shellcheck disable=SC2206
    # (intentional: $p IS a glob; word-splitting the unquoted expansion is the
    # wildcard match)
    local matches=($p)
    shopt -u nullglob globstar
    if [ "${#matches[@]}" -gt 0 ]; then
      local m
      for m in "${matches[@]}"; do
        [ -f "$m" ] && printf '%s\n' "$m"
      done
    fi
    ;;
  *)
    [ -e "$p" ] && printf '%s\n' "$p"
    ;;
  esac
  return 0
}

# ─── Thin jq-query helpers (read $MANIFEST) ──────────────────────────────────
manifest_kernel_paths() { jq -r '.kernel.paths[]' "$MANIFEST"; }
manifest_kernel_excludes() { jq -r '.kernel.excludeFromGenerate // [] | .[]' "$MANIFEST"; }
manifest_kernel_specs() { jq -r '.kernel.specs // [] | .[]' "$MANIFEST"; }
manifest_app_state_files() { jq -r '.kernel.appStateFiles // [] | .[]' "$MANIFEST"; }
manifest_app_owned_files() { jq -r '.kernel.appOwnedFiles // [] | .[]' "$MANIFEST"; }

manifest_preset_keys() { jq -r '.stack | keys[]' "$MANIFEST"; }
manifest_preset_paths() { jq -r --arg k "$1" '.stack[$k].paths[]' "$MANIFEST"; }
manifest_preset_specs() { jq -r --arg k "$1" '.stack[$k].specs // [] | .[]' "$MANIFEST"; }

# instrumentStubs / appTemplates emit "<target>\t<source>" lines.
manifest_preset_instrument_stubs() {
  jq -r --arg k "$1" '.stack[$k].instrumentStubs // {} | to_entries[] | "\(.key)\t\(.value)"' "$MANIFEST"
}
manifest_preset_app_templates() {
  jq -r --arg k "$1" '.stack[$k].appTemplates // {} | to_entries[] | "\(.key)\t\(.value)"' "$MANIFEST"
}

# The kernel's current version, from a kernel checkout's release manifest (D1).
manifest_kernel_version() { jq -r '."."' "$1/.release-please-manifest.json"; }

# ─── Preset-wins overlap set (D2/D3) ─────────────────────────────────────────
# Files declared in BOTH kernel.paths (post-flatten, same path) and the preset's
# paths. The preset's stack-aware variant wins, so both new-app.sh (generation)
# and sync-kernel.sh (sync) skip the kernel's copy. Literal set — growth requires
# a deliberate edit. Shared here so generation and sync cannot drift.
OVERLAP_PRESET_WINS=(
  ".prettierrc"
  "package.json"
)
is_overlap() {
  local target="$1" o
  for o in "${OVERLAP_PRESET_WINS[@]}"; do
    [ "$target" = "$o" ] && return 0
  done
  return 1
}

# ─── manifest_copy_plan <preset-key> (D3/D6) ────────────────────────────────
# Emit the kernel→app copy plan as "<target-rel>\t<src-rel>" lines, where
# target-rel is the path in the consuming app and src-rel is the path under the
# kernel checkout. This is the single definition of "what travels", called by
# BOTH new-app.sh (generation) and sync-kernel.sh (sync) so the two endpoints
# cannot drift (design D3). The caller's cwd MUST be the kernel root (expand_entry
# globs against it) and MANIFEST must point at the kernel's manifest.
#
# Rules (mirrors the D3 table): kernel.paths minus the expanded
# excludeFromGenerate set minus the preset-wins overlap; preset paths flattened
# (presets/<preset>/ stripped); kernel + preset specs verbatim; appTemplates
# (target ← preset source). instrumentStubs are intentionally NOT in the plan.
# kernel.appOwnedFiles are also filtered out (D3d): files generation customizes
# per-app (identity substitution, package.json mutation, release-manifest reset)
# are app-owned afterward — re-syncing them would clobber the app's identity and
# release state. They still travel at GENERATION (new-app.sh copies them via the
# raw path queries, then customizes); they are only excluded from the sync /
# clobber-tracking set. Caller is responsible for de-duplicating on target.
manifest_copy_plan() {
  local preset_key="$1"
  local exclude_files="" exclude_entries=() e owned
  while IFS= read -r e; do [ -n "$e" ] && exclude_entries+=("$e"); done < <(manifest_kernel_excludes)
  if [ "${#exclude_entries[@]}" -gt 0 ]; then
    exclude_files="$(for e in "${exclude_entries[@]}"; do expand_entry "$e"; done | sort -u)"
  fi
  owned="$(manifest_app_owned_files)"

  {
    local entry f rel target source
    # Kernel-tier paths minus excludeFromGenerate and preset-wins overlap.
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        if [ -n "$exclude_files" ] && printf '%s\n' "$exclude_files" | grep -Fxq -- "$f"; then continue; fi
        if is_overlap "$f"; then continue; fi
        printf '%s\t%s\n' "$f" "$f"
      done < <(expand_entry "$entry")
    done < <(manifest_kernel_paths)

    # Preset-tier paths, flattened (strip presets/<preset>/).
    while IFS= read -r entry; do
      [ -n "$entry" ] || continue
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        rel="${f#"$preset_key"/}"
        printf '%s\t%s\n' "$rel" "$f"
      done < <(expand_entry "$entry")
    done < <(manifest_preset_paths "$preset_key")

    # Specs verbatim (kernel + preset).
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      printf '%s\t%s\n' "$f" "$f"
    done < <(
      manifest_kernel_specs
      manifest_preset_specs "$preset_key"
    )

    # appTemplates: target ← preset source (re-applied on sync, D3).
    while IFS=$'\t' read -r target source; do
      [ -n "$target" ] || continue
      printf '%s\t%s\n' "$target" "$preset_key/$source"
    done < <(manifest_preset_app_templates "$preset_key")
  } | while IFS= read -r line; do
    # Drop app-owned targets (D3d). grep -Fxq on the newline-set is portable
    # (BSD awk -v mangles embedded newlines); ~60 lines, negligible cost.
    [ -n "$line" ] || continue
    if [ -n "$owned" ] && printf '%s\n' "$owned" | grep -Fxq -- "${line%%$'\t'*}"; then
      continue
    fi
    printf '%s\n' "$line"
  done
}

# ─── semver_cmp <a> <b> (D1) ─────────────────────────────────────────────────
# Three-value exit-code contract: 0 → a == b; 1 → a > b; 2 → a < b. POSIX-clean
# (no negative codes). Uses node -e to avoid the bash/sort -V portability traps.
# Callers MUST invoke it in an `if`/`case`/`|| ` context (a bare call would abort
# a `set -e` script on the a≠b exit codes).
semver_cmp() {
  node -e '
    const [a, b] = process.argv.slice(1);
    const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x > y) process.exit(1);
      if (x < y) process.exit(2);
    }
    process.exit(0);
  ' "$1" "$2"
}

# ─── sha256_file <path> (D2) ─────────────────────────────────────────────────
# Print the lowercase hex SHA-256 of a file (no "sha256:" prefix — callers add
# it). Delegates to shasum (ships with Perl; universal on macOS/most Linux),
# falling back to sha256sum (Linux coreutils). Fails with an install hint if
# neither is present.
sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "manifest.sh: neither 'shasum' nor 'sha256sum' found; install one (shasum ships with Perl)" >&2
    return 1
  fi
}
