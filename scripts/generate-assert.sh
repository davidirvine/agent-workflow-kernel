#!/usr/bin/env bash
#
# generate-assert.sh — the slice-3 gate. Runs new-app.sh into a tempdir, then
# asserts the emitted tree structurally and by identity, and runs the emitted
# app's OWN check-identity-leak.sh against itself. A committed script (not
# workflow YAML) so it is runnable locally and in CI and travels with the
# kernel. Tears the tempdir down on success; leaves it in place on failure with
# a pointer for inspection. See openspec/specs/app-generation/spec.md (D8).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KERNEL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$KERNEL_ROOT"
MANIFEST="kernel-manifest.json"

# Shared manifest primitives (design D6): expand_entry + the manifest_* helpers.
# shellcheck source=scripts/lib/manifest.sh
. "$SCRIPT_DIR/lib/manifest.sh"

PRESET="svelte-faust-synth"
PRESET_KEY="presets/$PRESET"
NAME="smoke-app"
TITLE="Smoke App"
REPO_URL="https://example.com/smoke-app"

# ─── (5.1) Tempdir + teardown trap ──────────────────────────────────────────
TMP="$(mktemp -d)"
APP="$TMP/$NAME"
# Second tempdir for the sync negative/accept-kernel cases (task 5.2c/d): a
# bumped copy of the kernel repo. Declared here and registered in the EXIT trap
# so it is torn down alongside $TMP on success and left for inspection on
# failure. Empty until the sync round-trip section creates it.
KERNEL_COPY=""
KEEP=0
cleanup() {
  if [ "$KEEP" -eq 0 ]; then
    rm -rf "$TMP"
    [ -n "$KERNEL_COPY" ] && rm -rf "$KERNEL_COPY"
  fi
}
trap cleanup EXIT

problems=0
note() {
  echo "  ✗ $1" >&2
  problems=$((problems + 1))
}

# expand_entry and the manifest_* helpers come from scripts/lib/manifest.sh,
# sourced above (design D6).

# ─── (5.2) Run the generator ────────────────────────────────────────────────
# Provide a git identity for headless/CI runs; new-app.sh deliberately
# configures no author and relies on the environment (design D7). `:-` respects
# an already-configured identity when run locally.
export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-generate-assert}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-generate-assert@example.com}"
export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-generate-assert}"
export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-generate-assert@example.com}"

echo "generate-assert: generating '$NAME' into $APP …"
if ! "$SCRIPT_DIR/new-app.sh" \
  --name "$NAME" --output "$APP" --preset "$PRESET" \
  --title "$TITLE" --repo-url "$REPO_URL" >"$TMP/gen.log" 2>&1; then
  cat "$TMP/gen.log" >&2
  KEEP=1
  echo "generate-assert: FAIL — new-app.sh exited non-zero; tempdir left at $TMP" >&2
  exit 1
fi

# ─── (5.3) Structural assertions (D8) ───────────────────────────────────────

# Kernel-tier files present (minus excludeFromGenerate). Overlap files
# (.prettierrc, package.json) are present too — supplied by the preset.
exclude_files=""
exclude_entries=()
while IFS= read -r line; do exclude_entries+=("$line"); done < <(manifest_kernel_excludes)
if [ "${#exclude_entries[@]}" -gt 0 ]; then
  exclude_files=$(for e in "${exclude_entries[@]}"; do expand_entry "$e"; done | sort -u)
fi
is_excluded() { [ -n "$exclude_files" ] && printf '%s\n' "$exclude_files" | grep -Fxq -- "$1"; }

while IFS= read -r entry; do
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    # Skip excluded kernel paths: their kernel CONTENT does not travel, but the
    # path may be legitimately re-occupied by an appTemplates target (e.g.
    # .github/workflows/ci.yml — design D14), so absence is not assertable here.
    if is_excluded "$f"; then continue; fi
    [ -e "$APP/$f" ] || note "missing kernel-tier path: $f"
  done < <(expand_entry "$entry")
done < <(manifest_kernel_paths)

# Preset-tier files present (flattened: presets/<preset>/ prefix stripped).
while IFS= read -r entry; do
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    rel="${f#"$PRESET_KEY"/}"
    [ -e "$APP/$rel" ] || note "missing preset-tier path: $rel"
  done < <(expand_entry "$entry")
done < <(manifest_preset_paths "$PRESET_KEY")

# Specs present at their verbatim paths. Process substitution (not a pipe) so
# the loop body's note()/problems mutations stay in the current shell.
while IFS= read -r s; do
  [ -z "$s" ] && continue
  [ -f "$APP/$s" ] || note "missing spec: $s"
done < <(
  manifest_kernel_specs
  manifest_preset_specs "$PRESET_KEY"
)

# instrumentStubs + appTemplates targets present (helpers emit "<target>\t<source>").
while IFS=$'\t' read -r target _source; do
  [ -z "$target" ] && continue
  [ -e "$APP/$target" ] || note "missing instrumentStubs target: $target"
done < <(manifest_preset_instrument_stubs "$PRESET_KEY")
while IFS=$'\t' read -r target _source; do
  [ -z "$target" ] && continue
  [ -e "$APP/$target" ] || note "missing appTemplates target: $target"
done < <(manifest_preset_app_templates "$PRESET_KEY")

# openspec/changes/ contains exactly one file (.gitkeep); no archive/.
changes_count=$(find "$APP/openspec/changes" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$changes_count" != "1" ]; then
  note "openspec/changes/ should contain exactly 1 file, found $changes_count"
elif [ ! -f "$APP/openspec/changes/.gitkeep" ]; then
  note "openspec/changes/ single file is not .gitkeep"
fi
[ -d "$APP/openspec/changes/archive" ] && note "openspec/changes/archive/ present (must not travel)"

# git repo with a single chore-scaffold commit.
if ! git -C "$APP" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  note "emitted tree is not a git repository"
else
  commits=$(git -C "$APP" rev-list --count HEAD)
  [ "$commits" = "1" ] || note "expected exactly 1 commit, found $commits"
  msg=$(git -C "$APP" log -1 --pretty=%s)
  case "$msg" in
  "chore: scaffold smoke-app"*) ;;
  *) note "first commit message does not start with 'chore: scaffold smoke-app': $msg" ;;
  esac
fi

# ─── (5.4) Identity assertions ──────────────────────────────────────────────
pkg_name=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).name||"")' "$APP/package.json")
pkg_version=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version||"")' "$APP/package.json")
pkg_desc=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).description||"")' "$APP/package.json")
[ "$pkg_name" = "$NAME" ] || note "package.json name is '$pkg_name', expected '$NAME'"
[ "$pkg_version" = "0.1.0" ] || note "package.json version is '$pkg_version', expected '0.1.0'"
case "$pkg_desc" in
*droning* | *"Reference preset"*) note "package.json description retains the preset's reference-instrument phrasing: $pkg_desc" ;;
esac

# Fixed-string greps (-F): the patterns contain regex metacharacters (., (, ),
# /) that must match literally.
SHELL_FILE="$APP/src/components/Shell.svelte"
grep -Fq "'$NAME'" "$SHELL_FILE" || note "Shell.svelte does not contain the substituted namespace '$NAME'"
grep -Fq "'__APP_NAMESPACE__'" "$SHELL_FILE" && note "Shell.svelte still contains the '__APP_NAMESPACE__' literal"

VITE_FILE="$APP/vite.config.js"
grep -Fq "JSON.stringify(\"$TITLE\")" "$VITE_FILE" || note "vite.config.js missing the substituted title \"$TITLE\""
grep -Fq "JSON.stringify(\"$REPO_URL\")" "$VITE_FILE" || note "vite.config.js missing the substituted repo URL"
grep -Fq "JSON.stringify('svelte-faust-synth')" "$VITE_FILE" && note "vite.config.js still carries the preset title placeholder"
grep -Fq "github.com/davidirvine/agent-workflow-kernel" "$VITE_FILE" && note "vite.config.js still carries the preset repo-URL placeholder"

# ─── (5.5) The emitted tree's own identity-leak check passes ────────────────
if ! (cd "$APP" && scripts/check-identity-leak.sh >"$TMP/leak.log" 2>&1); then
  cat "$TMP/leak.log" >&2
  note "the emitted tree's scripts/check-identity-leak.sh failed"
fi

# ─── (5.7 / task 5.2a) Sync-state files present and consistent ──────────────
KERNEL_VERSION="$(manifest_kernel_version "$KERNEL_ROOT")"
if [ ! -f "$APP/.kernel-version" ]; then
  note "missing .kernel-version at the emitted tree root"
else
  app_kv="$(tr -d '[:space:]' <"$APP/.kernel-version")"
  [ "$app_kv" = "$KERNEL_VERSION" ] || note ".kernel-version is '$app_kv', expected '$KERNEL_VERSION'"
fi
if [ ! -f "$APP/.kernel-sync-hashes.json" ]; then
  note "missing .kernel-sync-hashes.json at the emitted tree root"
else
  synced_at="$(jq -r '.syncedAt // ""' "$APP/.kernel-sync-hashes.json")"
  [ "$synced_at" = "$KERNEL_VERSION" ] || note ".kernel-sync-hashes.json syncedAt is '$synced_at', expected '$KERNEL_VERSION'"
  # Every tracked (kernel-/stack-tier) path has a hash entry.
  while IFS=$'\t' read -r target _src; do
    [ -n "$target" ] || continue
    h="$(jq -r --arg k "$target" '.hashes[$k] // ""' "$APP/.kernel-sync-hashes.json")"
    [ -n "$h" ] || note ".kernel-sync-hashes.json has no entry for tracked path: $target"
  done < <(manifest_copy_plan "$PRESET_KEY" | awk -F'\t' '!seen[$1]++')

  # App-owned files (D3d) are customized at generation and excluded from sync,
  # so they must NOT appear in the clobber-tracking hash file.
  while IFS= read -r aof; do
    [ -n "$aof" ] || continue
    h="$(jq -r --arg k "$aof" '.hashes[$k] // ""' "$APP/.kernel-sync-hashes.json")"
    [ -z "$h" ] || note ".kernel-sync-hashes.json tracks app-owned file '$aof' (must be excluded from sync)"
  done < <(manifest_app_owned_files)
fi

# ─── (5.8 / task 5.2b) Positive round-trip: fresh app is up to date ─────────
if ! "$SCRIPT_DIR/sync-kernel.sh" --kernel-repo "$KERNEL_ROOT" --app-repo "$APP" --dry-run >"$TMP/sync-dry.log" 2>&1; then
  cat "$TMP/sync-dry.log" >&2
  note "sync round-trip dry-run exited non-zero on a freshly-generated app"
elif ! grep -q "up to date" "$TMP/sync-dry.log"; then
  cat "$TMP/sync-dry.log" >&2
  note "sync round-trip dry-run did not report 'up to date'"
fi

# ─── (5.9 / task 5.2c) Negative case: a locally-modified file blocks sync ───
# A bumped copy of the kernel (rsync excludes node_modules/.git at any depth so
# the copy is small but still contains the manifest, release manifest, every
# kernel.paths source, and the full preset dir that sync reads).
KERNEL_COPY="$(mktemp -d)"
if ! rsync -a --exclude node_modules --exclude .git "$KERNEL_ROOT"/ "$KERNEL_COPY"/ >"$TMP/rsync.log" 2>&1; then
  cat "$TMP/rsync.log" >&2
  note "failed to copy the kernel repo for the sync negative case"
else
  node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,"utf8"));j["."]="99.0.0";fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$KERNEL_COPY/.release-please-manifest.json"
  # Modify one synced kernel-tier file in the app to create a clobber conflict.
  printf '\n# generate-assert local edit (sync negative case)\n' >>"$APP/STACK.md"
  if "$SCRIPT_DIR/sync-kernel.sh" --kernel-repo "$KERNEL_COPY" --app-repo "$APP" >"$TMP/sync-neg.log" 2>&1; then
    cat "$TMP/sync-neg.log" >&2
    note "sync negative case: expected non-zero exit (conflict) but sync succeeded"
  elif ! grep -q "STACK.md" "$TMP/sync-neg.log"; then
    cat "$TMP/sync-neg.log" >&2
    note "sync negative case: conflict output did not name the modified STACK.md"
  fi

  # ─── (5.10 / task 5.2d) --accept-kernel resolves the conflict ─────────────
  if ! "$SCRIPT_DIR/sync-kernel.sh" --kernel-repo "$KERNEL_COPY" --app-repo "$APP" --accept-kernel >"$TMP/sync-acc.log" 2>&1; then
    cat "$TMP/sync-acc.log" >&2
    note "sync --accept-kernel: expected zero exit but it failed"
  else
    if ! diff -q "$KERNEL_COPY/STACK.md" "$APP/STACK.md" >/dev/null 2>&1; then
      note "sync --accept-kernel: app STACK.md does not match the bumped-kernel's version after resolution"
    fi
    acc_synced="$(jq -r '.syncedAt // ""' "$APP/.kernel-sync-hashes.json")"
    [ "$acc_synced" = "99.0.0" ] || note "sync --accept-kernel: syncedAt is '$acc_synced', expected '99.0.0'"
    rec="$(jq -r '.hashes["STACK.md"] // ""' "$APP/.kernel-sync-hashes.json")"
    rec="${rec#sha256:}"
    cur="$(sha256_file "$APP/STACK.md")"
    [ "$rec" = "$cur" ] || note "sync --accept-kernel: recorded STACK.md hash does not match the resolved file"

    # App-owned files (D3d) must survive even an --accept-kernel sync against a
    # bumped kernel: identity substitution and the release-manifest reset are
    # NOT clobbered with the kernel's preset/placeholder versions.
    grep -Fq "'$NAME'" "$APP/src/components/Shell.svelte" || note "sync clobbered Shell.svelte's namespace (lost '$NAME')"
    grep -Fq "'__APP_NAMESPACE__'" "$APP/src/components/Shell.svelte" && note "sync re-introduced the '__APP_NAMESPACE__' sentinel into Shell.svelte"
    aof_pkg_name="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).name||"")' "$APP/package.json")"
    [ "$aof_pkg_name" = "$NAME" ] || note "sync clobbered package.json name (is '$aof_pkg_name', expected '$NAME')"
    aof_app_ver="$(jq -r '."."' "$APP/.release-please-manifest.json")"
    [ "$aof_app_ver" = "0.1.0" ] || note "sync clobbered .release-please-manifest.json (app version is '$aof_app_ver', expected 0.1.0)"
    grep -Fq "JSON.stringify(\"$TITLE\")" "$APP/vite.config.js" || note "sync clobbered vite.config.js title (lost \"$TITLE\")"
  fi
fi

# ─── (5.11) --adopt-existing bootstrap path ─────────────────────────────────
# Distinct code path with its own hash computation + early exit. Drop the app's
# baseline and re-adopt against the (unbumped) kernel; assert it rewrites a
# correct baseline. Done last so it does not perturb the earlier sync cases.
rm -f "$APP/.kernel-sync-hashes.json"
if ! "$SCRIPT_DIR/sync-kernel.sh" --kernel-repo "$KERNEL_ROOT" --app-repo "$APP" --adopt-existing >"$TMP/sync-adopt.log" 2>&1; then
  cat "$TMP/sync-adopt.log" >&2
  note "sync --adopt-existing: expected zero exit but it failed"
else
  if [ ! -f "$APP/.kernel-sync-hashes.json" ]; then
    note "sync --adopt-existing: did not write .kernel-sync-hashes.json"
  else
    adopt_synced="$(jq -r '.syncedAt // ""' "$APP/.kernel-sync-hashes.json")"
    [ "$adopt_synced" = "$KERNEL_VERSION" ] || note "sync --adopt-existing: syncedAt is '$adopt_synced', expected '$KERNEL_VERSION'"
    adopt_count="$(jq -r '.hashes | length' "$APP/.kernel-sync-hashes.json")"
    [ "$adopt_count" -gt 0 ] || note "sync --adopt-existing: wrote an empty hash record"
    # The bootstrap baseline excludes app-owned files, same as generation.
    while IFS= read -r aof; do
      [ -n "$aof" ] || continue
      h="$(jq -r --arg k "$aof" '.hashes[$k] // ""' "$APP/.kernel-sync-hashes.json")"
      [ -z "$h" ] || note "sync --adopt-existing: baseline tracks app-owned file '$aof'"
    done < <(manifest_app_owned_files)
  fi
  [ "$(tr -d '[:space:]' <"$APP/.kernel-version")" = "$KERNEL_VERSION" ] || note "sync --adopt-existing: .kernel-version not set to $KERNEL_VERSION"
  # The adopted baseline must enable a normal sync (spec: "a subsequent
  # sync-kernel.sh invocation operates as a normal sync from a real baseline").
  if ! "$SCRIPT_DIR/sync-kernel.sh" --kernel-repo "$KERNEL_ROOT" --app-repo "$APP" --dry-run >"$TMP/sync-postadopt.log" 2>&1; then
    cat "$TMP/sync-postadopt.log" >&2
    note "sync after --adopt-existing: a normal dry-run sync exited non-zero"
  elif ! grep -q "up to date" "$TMP/sync-postadopt.log"; then
    cat "$TMP/sync-postadopt.log" >&2
    note "sync after --adopt-existing: dry-run did not report 'up to date' from the adopted baseline"
  fi
fi

# ─── (5.6) Report ───────────────────────────────────────────────────────────
if [ "$problems" -ne 0 ]; then
  KEEP=1
  echo "generate-assert: FAIL — $problems problem(s); tempdir left for inspection at $TMP" >&2
  exit 1
fi
echo "generate-assert: OK — emitted tree is structurally and identity-clean ($NAME, preset $PRESET); tempdir removed"
