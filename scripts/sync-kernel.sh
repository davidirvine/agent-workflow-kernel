#!/usr/bin/env bash
#
# sync-kernel.sh — re-pull kernel-tier + stack-tier files into an existing
# consuming app (slice 4). Run it FROM THE KERNEL CHECKOUT against a consuming
# app; the script is itself excluded from generation/sync (design D3a), so the
# running copy is always the kernel's current version.
#
# Mirrors new-app.sh's manifest semantics exactly (design D3): kernel.paths
# minus excludeFromGenerate, preset paths flattened, preset-wins overlap, specs
# verbatim, appTemplates re-applied — but NO identity substitution, NO git init,
# NO release-manifest reset, and instrumentStubs are NEVER re-applied (the
# instrument is app-owned content after generation).
#
# Sync is a deliberate version bump (D1): it compares the app's .kernel-version
# to the kernel's .release-please-manifest.json "." value and is a no-op if the
# app is already at/ahead of the kernel. Clobber protection (D2) refuses to
# overwrite a locally-modified synced file unless --accept-kernel is passed; the
# baseline lives in the app's committed .kernel-sync-hashes.json.
#
# Usage:
#   scripts/sync-kernel.sh --kernel-repo <path> [--app-repo <path>] \
#     [--dry-run] [--accept-kernel] [--adopt-existing]
#
# See openspec/specs/kernel-sync/spec.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<'EOF'
Usage: sync-kernel.sh --kernel-repo <path> [options]

Required:
  --kernel-repo <path>  the kernel checkout to sync FROM (contains
                        kernel-manifest.json + .release-please-manifest.json)

Options:
  --app-repo <path>     the consuming app to sync INTO (default: .)
  --dry-run             report the upgrade path + copy plan, write nothing
  --accept-kernel       overwrite locally-modified synced files with the
                        kernel's version (local edits are lost; git is the
                        safety net)
  --adopt-existing      bootstrap: when the app has no .kernel-sync-hashes.json,
                        adopt its current file contents as the baseline and exit
  -h, --help            show this help
EOF
}

# ─── Parse arguments (4.1) ──────────────────────────────────────────────────
KERNEL_REPO=""
APP_REPO="."
DRY_RUN=0
ACCEPT_KERNEL=0
ADOPT_EXISTING=0

while [ "$#" -gt 0 ]; do
  case "$1" in
  --kernel-repo | --app-repo)
    if [ "$#" -lt 2 ]; then
      echo "sync-kernel.sh: $1 requires a value" >&2
      exit 2
    fi
    case "$1" in
    --kernel-repo) KERNEL_REPO="$2" ;;
    --app-repo) APP_REPO="$2" ;;
    esac
    shift 2
    ;;
  --dry-run)
    DRY_RUN=1
    shift
    ;;
  --accept-kernel)
    ACCEPT_KERNEL=1
    shift
    ;;
  --adopt-existing)
    ADOPT_EXISTING=1
    shift
    ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    echo "sync-kernel.sh: unknown argument '$1'" >&2
    usage >&2
    exit 2
    ;;
  esac
done

# ─── Early prereq preamble (4.1) ────────────────────────────────────────────
# node is required by semver_cmp (and the JSON writer); jq by every manifest
# read. sync may plausibly run before the user has done `setup.sh --check`, so
# fail fast with the same install hints that table uses.
if ! command -v node >/dev/null 2>&1; then
  echo "sync-kernel.sh: 'node' not found — install via nvm: nvm install \$(cat .nvmrc)" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "sync-kernel.sh: 'jq' not found — install via 'brew install jq'" >&2
  exit 1
fi

# ─── Validate inputs (4.1) ──────────────────────────────────────────────────
if [ -z "$KERNEL_REPO" ]; then
  echo "sync-kernel.sh: --kernel-repo is required" >&2
  exit 2
fi
if [ ! -d "$KERNEL_REPO" ]; then
  echo "sync-kernel.sh: --kernel-repo '$KERNEL_REPO' is not a directory" >&2
  exit 1
fi
KERNEL_REPO_ABS="$(cd "$KERNEL_REPO" && pwd)"
if [ ! -f "$KERNEL_REPO_ABS/kernel-manifest.json" ]; then
  echo "sync-kernel.sh: --kernel-repo '$KERNEL_REPO_ABS' has no kernel-manifest.json (not a kernel checkout)" >&2
  exit 1
fi
if [ ! -f "$KERNEL_REPO_ABS/.release-please-manifest.json" ]; then
  echo "sync-kernel.sh: --kernel-repo '$KERNEL_REPO_ABS' has no .release-please-manifest.json (not a kernel checkout)" >&2
  exit 1
fi
if [ ! -d "$APP_REPO" ]; then
  echo "sync-kernel.sh: --app-repo '$APP_REPO' does not exist or is not a directory" >&2
  exit 1
fi
APP_REPO_ABS="$(cd "$APP_REPO" && pwd)"

# ─── Shared manifest primitives (design D6) ─────────────────────────────────
# MANIFEST is the kernel checkout's manifest (absolute); expand_entry globs
# against the cwd, so we cd into the kernel repo before any expansion.
MANIFEST="$KERNEL_REPO_ABS/kernel-manifest.json"
# shellcheck source=scripts/lib/manifest.sh
. "$SCRIPT_DIR/lib/manifest.sh"
cd "$KERNEL_REPO_ABS"

# ─── Determine the preset (D3c) ─────────────────────────────────────────────
preset_keys=()
while IFS= read -r line; do [ -n "$line" ] && preset_keys+=("$line"); done < <(manifest_preset_keys)
if [ "${#preset_keys[@]}" -eq 0 ]; then
  echo "sync-kernel.sh: manifest has no stack preset; nothing to sync" >&2
  exit 1
fi
if [ "${#preset_keys[@]}" -gt 1 ]; then
  echo "sync-kernel.sh: manifest has multiple presets (${preset_keys[*]}); sync cannot disambiguate. Add --preset <name> (not implemented this slice — see design D3c). Until then, the kernel supports a single preset only." >&2
  exit 1
fi
PRESET_KEY="${preset_keys[0]}"

KERNEL_VERSION="$(manifest_kernel_version "$KERNEL_REPO_ABS")"
HASHES_FILE="$APP_REPO_ABS/.kernel-sync-hashes.json"
VERSION_FILE="$APP_REPO_ABS/.kernel-version"

# ─── Build the copy plan (4.3) ──────────────────────────────────────────────
# manifest_copy_plan (scripts/lib/manifest.sh) is the single definition of "what
# travels", shared with new-app.sh so generation and sync cannot drift (D3/D6).
# Deduplicate on target (preset-wins overlap already removed the kernel copy;
# this guards any other accidental double-listing). Keep first occurrence.
PLAN="$(manifest_copy_plan "$PRESET_KEY" | awk -F'\t' '!seen[$1]++')"

# ─── Adopt the current app contents as the baseline (4.2, D2a) ──────────────
# write_hash_file (scripts/lib/manifest.sh) assembles .kernel-sync-hashes.json
# from "<target>\t<sha256hex>" lines on stdin — no temp file, shared with
# new-app.sh.
if [ ! -f "$HASHES_FILE" ]; then
  if [ "$ADOPT_EXISTING" -ne 1 ]; then
    echo "sync-kernel.sh: '$HASHES_FILE' not found — this app has no sync baseline." >&2
    echo "  Run with --adopt-existing to adopt the app's current file contents as the baseline." >&2
    exit 1
  fi
  # Adopt: hash every present plan target, write the baseline + version stamp.
  adopt_pairs="$(
    while IFS=$'\t' read -r target _src; do
      [ -n "$target" ] || continue
      [ -f "$APP_REPO_ABS/$target" ] && printf '%s\t%s\n' "$target" "$(sha256_file "$APP_REPO_ABS/$target")"
    done <<<"$PLAN"
  )"
  present_count="$(printf '%s' "$adopt_pairs" | awk 'NF{c++} END{print c + 0}')"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "sync-kernel.sh: [dry-run] would adopt $present_count present file(s) as the baseline at $KERNEL_VERSION; no file written"
    exit 0
  fi
  printf '%s\n' "$adopt_pairs" | write_hash_file "$HASHES_FILE" "$KERNEL_VERSION"
  printf '%s\n' "$KERNEL_VERSION" >"$VERSION_FILE"
  echo "sync-kernel.sh: adopted baseline at $KERNEL_VERSION ($present_count file(s)); .kernel-sync-hashes.json + .kernel-version written. Re-run sync to apply kernel updates."
  exit 0
fi

# ─── Version comparison (4.2, D1) ───────────────────────────────────────────
if [ -f "$VERSION_FILE" ]; then
  APP_VERSION="$(tr -d '[:space:]' <"$VERSION_FILE")"
  [ -n "$APP_VERSION" ] || APP_VERSION="0.0.0"
else
  APP_VERSION="0.0.0"
fi

cmp=0
semver_cmp "$APP_VERSION" "$KERNEL_VERSION" || cmp=$?
if [ "$cmp" -ne 2 ]; then
  # app >= kernel (equal or ahead) → no-op.
  echo "sync-kernel.sh: up to date at $APP_VERSION (kernel is $KERNEL_VERSION)"
  exit 0
fi

# ─── Categorize each plan entry (4.4) ───────────────────────────────────────
recorded_hash() { jq -r --arg k "$1" '.hashes[$k] // ""' "$HASHES_FILE" 2>/dev/null; }

new_paths=()
clean_paths=()
conflict_paths=()
# parallel arrays: plan_target[i] -> plan_src[i] for the write phase.
plan_target=()
plan_src=()

while IFS=$'\t' read -r target src; do
  [ -n "$target" ] || continue
  plan_target+=("$target")
  plan_src+=("$src")
  app_file="$APP_REPO_ABS/$target"
  if [ ! -f "$app_file" ]; then
    new_paths+=("$target")
    continue
  fi
  rec="$(recorded_hash "$target")"
  rec="${rec#sha256:}"
  cur="$(sha256_file "$app_file")"
  if [ -n "$rec" ] && [ "$rec" = "$cur" ]; then
    clean_paths+=("$target")
  else
    # exists but no recorded baseline, or hash differs → cannot verify it is
    # unmodified → treat as a conflict (safe default).
    conflict_paths+=("$target")
  fi
done <<<"$PLAN"

# ─── Kernel-deleted paths (4.8, D4) ─────────────────────────────────────────
# Paths recorded in the app's baseline but no longer in the kernel's plan.
deleted_paths=()
plan_targets_sorted="$(printf '%s\n' "${plan_target[@]}" | sort -u)"
while IFS= read -r old; do
  [ -n "$old" ] || continue
  if ! printf '%s\n' "$plan_targets_sorted" | grep -Fxq -- "$old"; then
    deleted_paths+=("$old")
  fi
done < <(jq -r '.hashes | keys[]' "$HASHES_FILE" 2>/dev/null)

report_deleted() {
  if [ "${#deleted_paths[@]}" -gt 0 ]; then
    echo "  no longer tracked by kernel (left in place):"
    local p
    for p in "${deleted_paths[@]}"; do echo "    - $p"; done
  fi
}

# App-owned files (D3d) are excluded from the copy plan entirely; report them
# informationally so the user knows a kernel-side change to one of them won't
# arrive via sync and needs a manual merge if wanted.
report_app_owned() {
  local owned p
  owned="$(manifest_app_owned_files)"
  if [ -n "$owned" ]; then
    echo "  app-owned, not re-synced (customized at generation — merge upstream changes by hand if needed):"
    while IFS= read -r p; do [ -n "$p" ] && echo "    - $p"; done <<<"$owned"
  fi
}

# ─── Dry-run report / conflict refusal (4.5) ────────────────────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  echo "sync-kernel.sh: [dry-run] syncing $APP_VERSION → $KERNEL_VERSION"
  echo "  new:      ${#new_paths[@]}"
  echo "  clean:    ${#clean_paths[@]} (would be overwritten with the kernel's version)"
  echo "  conflict: ${#conflict_paths[@]} (locally modified)"
  if [ "${#conflict_paths[@]}" -gt 0 ]; then
    echo "  conflicting paths:"
    for p in "${conflict_paths[@]}"; do echo "    - $p"; done
    echo "  → re-run with --accept-kernel to overwrite these with the kernel's version."
  fi
  report_deleted
  report_app_owned
  echo "sync-kernel.sh: [dry-run] no file written"
  exit 0
fi

if [ "${#conflict_paths[@]}" -gt 0 ] && [ "$ACCEPT_KERNEL" -ne 1 ]; then
  echo "sync-kernel.sh: refusing to sync — ${#conflict_paths[@]} locally-modified file(s) would be clobbered:" >&2
  for p in "${conflict_paths[@]}"; do echo "    - $p" >&2; done
  echo "  Re-run with --accept-kernel to overwrite them with the kernel's version (local edits lost; git is the safety net)," >&2
  echo "  or merge the kernel's changes by hand. No file was written." >&2
  exit 1
fi

# ─── Write phase (4.6) ──────────────────────────────────────────────────────
echo "sync-kernel.sh: syncing $APP_VERSION → $KERNEL_VERSION"

is_in() {
  local needle="$1"
  shift
  local x
  for x in "$@"; do [ "$x" = "$needle" ] && return 0; done
  return 1
}

copied=0
for i in "${!plan_target[@]}"; do
  target="${plan_target[$i]}"
  src="${plan_src[$i]}"
  if is_in "$target" "${conflict_paths[@]+"${conflict_paths[@]}"}"; then
    # only reachable when --accept-kernel (else we exited above)
    echo "  ! overwriting locally-modified $target with the kernel's version" >&2
  fi
  mkdir -p "$(dirname "$APP_REPO_ABS/$target")"
  cp -p "$src" "$APP_REPO_ABS/$target"
  copied=$((copied + 1))
done

# ─── Post-write: rewrite state files (4.7) ──────────────────────────────────
{
  for target in "${plan_target[@]}"; do
    printf '%s\t%s\n' "$target" "$(sha256_file "$APP_REPO_ABS/$target")"
  done
} | write_hash_file "$HASHES_FILE" "$KERNEL_VERSION"
printf '%s\n' "$KERNEL_VERSION" >"$VERSION_FILE"

echo "sync-kernel.sh: synced $copied file(s); .kernel-version now $KERNEL_VERSION"
report_deleted
report_app_owned
