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

PRESET="svelte-faust-synth"
PRESET_KEY="presets/$PRESET"
NAME="smoke-app"
TITLE="Smoke App"
REPO_URL="https://example.com/smoke-app"

# ─── (5.1) Tempdir + teardown trap ──────────────────────────────────────────
TMP="$(mktemp -d)"
APP="$TMP/$NAME"
KEEP=0
cleanup() {
  if [ "$KEEP" -eq 0 ]; then rm -rf "$TMP"; fi
}
trap cleanup EXIT

problems=0
note() {
  echo "  ✗ $1" >&2
  problems=$((problems + 1))
}

# ─── Helpers ────────────────────────────────────────────────────────────────
# expand_entry is a DUPLICATE of the canonical copy in scripts/check-manifest.sh
# (also duplicated in scripts/new-app.sh) — these are kernel-only scripts that
# cannot source a shared lib without it travelling into generated apps. Keep all
# three in sync.
expand_entry() {
  local p="$1"
  case "$p" in
  */'**')
    if [ -d "${p%/**}" ]; then find "${p%/**}" -type f; fi
    ;;
  *[*?[]*)
    shopt -s nullglob globstar
    # shellcheck disable=SC2206
    local matches=($p)
    shopt -u nullglob globstar
    if [ "${#matches[@]}" -gt 0 ]; then
      local m
      for m in "${matches[@]}"; do [ -f "$m" ] && printf '%s\n' "$m"; done
    fi
    ;;
  *)
    [ -e "$p" ] && printf '%s\n' "$p"
    ;;
  esac
  return 0
}

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
while IFS= read -r line; do exclude_entries+=("$line"); done < <(jq -r '.kernel.excludeFromGenerate // [] | .[]' "$MANIFEST")
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
done < <(jq -r '.kernel.paths[]' "$MANIFEST")

# Preset-tier files present (flattened: presets/<preset>/ prefix stripped).
while IFS= read -r entry; do
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    rel="${f#"$PRESET_KEY"/}"
    [ -e "$APP/$rel" ] || note "missing preset-tier path: $rel"
  done < <(expand_entry "$entry")
done < <(jq -r --arg k "$PRESET_KEY" '.stack[$k].paths[]' "$MANIFEST")

# Specs present at their verbatim paths.
while IFS= read -r s; do
  [ -z "$s" ] && continue
  [ -f "$APP/$s" ] || note "missing spec: $s"
done < <(jq -r --arg k "$PRESET_KEY" '(.kernel.specs // []) + (.stack[$k].specs // []) | .[]' "$MANIFEST")

# instrumentStubs + appTemplates targets present.
while IFS= read -r target; do
  [ -z "$target" ] && continue
  [ -e "$APP/$target" ] || note "missing instrumentStubs target: $target"
done < <(jq -r --arg k "$PRESET_KEY" '.stack[$k].instrumentStubs // {} | keys[]' "$MANIFEST")
while IFS= read -r target; do
  [ -z "$target" ] && continue
  [ -e "$APP/$target" ] || note "missing appTemplates target: $target"
done < <(jq -r --arg k "$PRESET_KEY" '.stack[$k].appTemplates // {} | keys[]' "$MANIFEST")

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

# ─── (5.6) Report ───────────────────────────────────────────────────────────
if [ "$problems" -ne 0 ]; then
  KEEP=1
  echo "generate-assert: FAIL — $problems problem(s); tempdir left for inspection at $TMP" >&2
  exit 1
fi
echo "generate-assert: OK — emitted tree is structurally and identity-clean ($NAME, preset $PRESET); tempdir removed"
