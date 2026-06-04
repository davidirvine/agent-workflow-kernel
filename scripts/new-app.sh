#!/usr/bin/env bash
#
# new-app.sh — emit a fresh, identity-clean app from the kernel + a preset.
#
# Reads kernel-manifest.json as the source of truth for what travels:
#   * kernel-tier files (kernel.paths) minus kernel.excludeFromGenerate, copied
#     to the same relative path under --output;
#   * the chosen preset's stack-tier files (stack.presets[<preset>].paths),
#     copied with the `presets/<preset>/` prefix stripped (flattened to the app
#     root, design D13);
#   * kernel-tier and stack-tier specs, copied verbatim to openspec/specs/;
#   * the preset's instrument-tier stubs (instrumentStubs) and app-tier
#     templates (appTemplates), written at their declared target paths.
# It then substitutes donor identity, resets the OpenSpec change state, and runs
# `git init` + a single chore commit. See openspec/specs/app-generation/spec.md.
#
# Usage:
#   scripts/new-app.sh --name <app-name> --output <path> \
#     [--preset <name>] [--title <title>] [--repo-url <url>]

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: new-app.sh --name <app-name> --output <path> [options]

Required:
  --name <app-name>   kebab-case (^[a-z][a-z0-9-]*$); npm name + localStorage namespace
  --output <path>     destination directory; refused if it already exists

Options:
  --preset <name>     preset to generate from (default: svelte-faust-synth)
  --title <title>     app title (default: title-cased --name)
  --repo-url <url>    repo URL (default: https://example.com/<name>)
  -h, --help          show this help
EOF
}

# ─── Locate the kernel root (where the manifest lives) ──────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KERNEL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$KERNEL_ROOT/kernel-manifest.json"

# Shared manifest primitives: expand_entry, the manifest_* jq helpers, and the
# preset-wins overlap set (design D6). MANIFEST is set above, so the helpers read
# this absolute path.
# shellcheck source=scripts/lib/manifest.sh
. "$SCRIPT_DIR/lib/manifest.sh"

# ─── Parse arguments (D1) ───────────────────────────────────────────────────
NAME=""
OUTPUT=""
PRESET="svelte-faust-synth"
TITLE=""
REPO_URL=""

while [ "$#" -gt 0 ]; do
  case "$1" in
  --name | --output | --preset | --title | --repo-url)
    if [ "$#" -lt 2 ]; then
      echo "new-app.sh: $1 requires a value" >&2
      exit 2
    fi
    case "$1" in
    --name) NAME="$2" ;;
    --output) OUTPUT="$2" ;;
    --preset) PRESET="$2" ;;
    --title) TITLE="$2" ;;
    --repo-url) REPO_URL="$2" ;;
    esac
    shift 2
    ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    echo "new-app.sh: unknown argument '$1'" >&2
    usage >&2
    exit 2
    ;;
  esac
done

# ─── Validate inputs before any work begins (D1) ────────────────────────────
if [ -z "$NAME" ]; then
  echo "new-app.sh: --name is required" >&2
  exit 2
fi
if [ -z "$OUTPUT" ]; then
  echo "new-app.sh: --output is required" >&2
  exit 2
fi
if ! [[ "$NAME" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "new-app.sh: --name '$NAME' must match ^[a-z][a-z0-9-]*\$ (lowercase, digits, hyphens; not starting with a digit or hyphen)" >&2
  exit 2
fi
if [ ! -f "$MANIFEST" ]; then
  echo "new-app.sh: manifest not found at $MANIFEST" >&2
  exit 1
fi

PRESET_KEY="presets/$PRESET"
if [ "$(jq -r --arg k "$PRESET_KEY" '.stack | has($k)' "$MANIFEST")" != "true" ]; then
  echo "new-app.sh: unknown preset '$PRESET' (no '$PRESET_KEY' in $MANIFEST)" >&2
  exit 1
fi

# Defaults derived from --name.
if [ -z "$TITLE" ]; then
  TITLE="$(printf '%s' "$NAME" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')"
fi
if [ -z "$REPO_URL" ]; then
  REPO_URL="https://example.com/$NAME"
fi

# Resolve --output to an absolute path (relative to the invocation cwd) and
# refuse an existing path (generation is destructive; D1).
case "$OUTPUT" in
/*) OUTPUT_ABS="$OUTPUT" ;;
*) OUTPUT_ABS="$PWD/$OUTPUT" ;;
esac
if [ -e "$OUTPUT_ABS" ]; then
  echo "new-app.sh: --output '$OUTPUT_ABS' already exists; remove it or choose a different path" >&2
  exit 1
fi

# All source paths are relative to the kernel root from here on.
cd "$KERNEL_ROOT"
mkdir -p "$OUTPUT_ABS"

# ─── Helpers ────────────────────────────────────────────────────────────────
# expand_entry, the manifest_* queries, and the preset-wins overlap set
# (OVERLAP_PRESET_WINS / is_overlap) come from scripts/lib/manifest.sh, sourced
# above (design D6).

# Copy a single file, creating parent directories and preserving mode (so the
# executable bits on scripts/** and .githooks/** survive — task 4.3).
copy_file() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  cp -p "$src" "$dest"
}

# ─── Build the kernel exclusion set (D2) ────────────────────────────────────
kernel_paths=()
while IFS= read -r line; do kernel_paths+=("$line"); done < <(manifest_kernel_paths)
exclude_entries=()
while IFS= read -r line; do exclude_entries+=("$line"); done < <(manifest_kernel_excludes)

exclude_files=""
if [ "${#exclude_entries[@]}" -gt 0 ]; then
  exclude_files=$(
    for e in "${exclude_entries[@]}"; do expand_entry "$e"; done | sort -u
  )
fi
is_excluded() {
  [ -n "$exclude_files" ] && printf '%s\n' "$exclude_files" | grep -Fxq -- "$1"
}

# ─── (4.2 + 4.3) Copy kernel-tier files ─────────────────────────────────────
for entry in "${kernel_paths[@]}"; do
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if is_excluded "$f"; then continue; fi # kernel-only paths (D2)
    if is_overlap "$f"; then continue; fi  # preset wins (D2)
    copy_file "$f" "$OUTPUT_ABS/$f"
  done < <(expand_entry "$entry")
done

# ─── (4.2 + 4.3) Copy preset-tier files, flattened (D13) ────────────────────
preset_path_entries=()
while IFS= read -r line; do
  preset_path_entries+=("$line")
done < <(manifest_preset_paths "$PRESET_KEY")
for entry in "${preset_path_entries[@]}"; do
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    rel="${f#"$PRESET_KEY"/}"
    copy_file "$f" "$OUTPUT_ABS/$rel"
  done < <(expand_entry "$entry")
done

# ─── (4.2 + 4.3) Copy specs verbatim (kernel + preset) ──────────────────────
{
  manifest_kernel_specs
  manifest_preset_specs "$PRESET_KEY"
} | while IFS= read -r s; do
  [ -z "$s" ] && continue
  copy_file "$s" "$OUTPUT_ABS/$s"
done

# ─── (4.4) Write instrument-tier stubs and app-tier templates ───────────────
while IFS=$'\t' read -r target source; do
  [ -z "$target" ] && continue
  copy_file "$PRESET_KEY/$source" "$OUTPUT_ABS/$target"
done < <(manifest_preset_instrument_stubs "$PRESET_KEY")

while IFS=$'\t' read -r target source; do
  [ -z "$target" ] && continue
  copy_file "$PRESET_KEY/$source" "$OUTPUT_ABS/$target"
done < <(manifest_preset_app_templates "$PRESET_KEY")

# ─── (4.5) Substitute donor identity (D4) ───────────────────────────────────

# 1. The '__APP_NAMESPACE__' literal in the chassis Shell → the app name. The
#    literal occurs at multiple sites, so the substitution is global; --name is
#    kebab-validated, so it is sed-safe. Portable in-place edit (no sed -i,
#    whose flag form differs between GNU and BSD).
SHELL_FILE="$OUTPUT_ABS/src/components/Shell.svelte"
if [ ! -f "$SHELL_FILE" ]; then
  echo "new-app.sh: expected chassis Shell at $SHELL_FILE was not emitted" >&2
  exit 1
fi
tmp_shell="$(mktemp)"
# Clean up the temp file even if sed fails under set -e (otherwise it orphans
# in $TMPDIR); on success the mv consumes it.
if ! sed "s/'__APP_NAMESPACE__'/'$NAME'/g" "$SHELL_FILE" >"$tmp_shell"; then
  rm -f "$tmp_shell"
  echo "new-app.sh: namespace substitution (sed) failed for $SHELL_FILE" >&2
  exit 1
fi
mv "$tmp_shell" "$SHELL_FILE"
# Assert the string-LITERAL sites were replaced. A bare `__APP_NAMESPACE__`
# token may still appear in a code comment (it is not a substitution target and
# is allowlisted by check-identity-leak, which exempts Shell.svelte); only the
# quoted form is the namespace seam. -F: match the literal, not as a regex.
if grep -Fq "'__APP_NAMESPACE__'" "$SHELL_FILE"; then
  echo "new-app.sh: '__APP_NAMESPACE__' literal still present in $SHELL_FILE after substitution" >&2
  exit 1
fi

# 2. The Vite __APP_TITLE__ / __APP_REPO_URL__ placeholder defaults → the chosen
#    title / repo URL. node -e with JSON.stringify so arbitrary characters in
#    --title/--repo-url are safely escaped (no sed on user input, D4). The
#    placeholder literals below are this preset's; a future preset would differ
#    (documented identity set, per the stack-agnostic requirement).
VITE_FILE="$OUTPUT_ABS/vite.config.js"
node -e '
  const fs = require("fs");
  const [file, title, repo] = process.argv.slice(1);
  let s = fs.readFileSync(file, "utf8");
  const titlePH = "JSON.stringify(\x27svelte-faust-synth\x27)";
  const repoPH = "JSON.stringify(\x27https://github.com/davidirvine/agent-workflow-kernel\x27)";
  if (!s.includes(titlePH)) throw new Error("vite.config.js: __APP_TITLE__ placeholder not found");
  if (!s.includes(repoPH)) throw new Error("vite.config.js: __APP_REPO_URL__ placeholder not found");
  s = s.replace(titlePH, "JSON.stringify(" + JSON.stringify(title) + ")");
  s = s.replace(repoPH, "JSON.stringify(" + JSON.stringify(repo) + ")");
  fs.writeFileSync(file, s);
' "$VITE_FILE" "$TITLE" "$REPO_URL"

# ─── (4.5b) Mutate package.json + reset release manifest (D4/D5) ─────────────
# prettier-plugin-toml is pinned to the kernel's own version at generation time
# so the app stays in lock-step with the kernel rather than a hardcoded pin.
TOML_VER="$(node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const v = (pkg.devDependencies || {})["prettier-plugin-toml"];
  if (!v) { console.error("kernel package.json missing prettier-plugin-toml devDep"); process.exit(1); }
  process.stdout.write(v);
' "$KERNEL_ROOT/package.json")"

node -e '
  const fs = require("fs");
  const [file, name, preset, tomlVer] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.name = name;
  pkg.version = "0.1.0";
  pkg.description = "App scaffolded from agent-workflow-kernel + " + preset;
  pkg.devDependencies = pkg.devDependencies || {};
  pkg.devDependencies["prettier-plugin-toml"] = tomlVer;
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.postinstall = "scripts/install-hooks.sh";
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
' "$OUTPUT_ABS/package.json" "$NAME" "$PRESET" "$TOML_VER"

# Reset the release manifest to a fresh app at 0.1.0 (overwrites the kernel's).
printf '{\n  ".": "0.1.0"\n}\n' >"$OUTPUT_ABS/.release-please-manifest.json"

# ─── (4.6) Reset OpenSpec change state (D6) ─────────────────────────────────
# config.yaml + specs already landed via the copy plan. changes/ starts empty
# with a .gitkeep; archive/ must not have travelled (it is in no manifest set).
mkdir -p "$OUTPUT_ABS/openspec/changes"
: >"$OUTPUT_ABS/openspec/changes/.gitkeep"
if [ -e "$OUTPUT_ABS/openspec/changes/archive" ]; then
  echo "new-app.sh: openspec/changes/archive/ unexpectedly present in the emitted tree" >&2
  exit 1
fi

# ─── (5.1) Write the sync-state files (.kernel-version + hashes) ────────────
# Record the kernel version this app was generated from, and the SHA-256 of
# every kernel-/stack-tier file just emitted — the exact set sync-kernel.sh
# tracks (manifest_copy_plan, shared so generation and sync cannot drift, D6).
# Hashes are taken AFTER identity substitution, so a freshly-generated app is a
# clean sync baseline (sync sees the emitted files as unmodified). Both files
# are picked up by `git add -A` below and committed with the scaffold.
KERNEL_VERSION="$(manifest_kernel_version "$KERNEL_ROOT")"
gen_tsv="$(mktemp)"
trap 'rm -f "$gen_tsv"' EXIT
while IFS=$'\t' read -r target _src; do
  [ -n "$target" ] || continue
  printf '%s\t%s\n' "$target" "$(sha256_file "$OUTPUT_ABS/$target")" >>"$gen_tsv"
done < <(manifest_copy_plan "$PRESET_KEY" | awk -F'\t' '!seen[$1]++')

node -e '
  const fs = require("fs");
  const [tsvPath, version, outPath] = process.argv.slice(1);
  const hashes = {};
  for (const line of fs.readFileSync(tsvPath, "utf8").split("\n")) {
    if (!line) continue;
    const idx = line.indexOf("\t");
    hashes[line.slice(0, idx)] = "sha256:" + line.slice(idx + 1);
  }
  const sorted = {};
  for (const k of Object.keys(hashes).sort()) sorted[k] = hashes[k];
  fs.writeFileSync(outPath, JSON.stringify({ version: 1, syncedAt: version, hashes: sorted }, null, 2) + "\n");
' "$gen_tsv" "$KERNEL_VERSION" "$OUTPUT_ABS/.kernel-sync-hashes.json"
printf '%s\n' "$KERNEL_VERSION" >"$OUTPUT_ABS/.kernel-version"

# ─── (4.7) git init + single chore commit (D7) ──────────────────────────────
# No author is configured here — git uses the local environment's identity (a
# human's git config, or the GIT_AUTHOR_*/GIT_COMMITTER_* env vars that
# generate-assert.sh sets for headless runs).
(
  cd "$OUTPUT_ABS"
  git init -q
  git add -A
  git commit -q \
    -m "chore: scaffold $NAME from agent-workflow-kernel + $PRESET" \
    -m "Run \`npm install\` to regenerate package-lock.json and activate git hooks."
)

echo "new-app.sh: generated '$NAME' at $OUTPUT_ABS (preset: $PRESET)"
