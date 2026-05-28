#!/usr/bin/env bash
#
# check-identity-leak.sh — assert the chassis and kernel-root configs carry no
# donor-identity literal, and no un-substituted sentinel token leaks outside
# the single allowlisted Shell file.
#
# Scope (curated inside this script per task 7.1): chassis source files in
# every preset, preset config files, and kernel-root configuration files.
# Explicitly EXCLUDED from scope: README, CHANGELOG, ROADMAP, and historizing
# docs that correctly reference the donor; this script's own source; the
# openspec/ tree (changes can legitimately discuss donors by name); and
# build outputs (node_modules, public, dist).
#
# Two checks:
#   1. Donor-identity literals: `synth-d:` (localStorage namespace) and
#      `davidirvine/synth-d` (donor GitHub URL).
#   2. Un-substituted sentinels: any `__[A-Z_]+__` pattern occurring outside
#      the allowlisted Shell file (which is the single substitution site).
#      Excludes the Vite build-time globals (`__APP_VERSION__`, `__GIT_BRANCH__`)
#      because those are legitimate vite-injected build-time constants — not
#      donor-identity or substitution sentinels.

set -euo pipefail

# Run from the repo root.
cd "$(dirname "$0")/.."

# ─── Scope: files to scan ────────────────────────────────────────────────────

# Curated list of preset chassis directories that get scanned. Each entry is a
# preset dir; we'll scan its src/ (chassis source) and its top-level config
# files.
PRESETS=(
  "presets/svelte-faust-synth"
)

# Kernel-root configs.
KERNEL_ROOT_CONFIGS=(
  ".prettierrc"
  ".prettierignore"
  ".nvmrc"
  ".roborev.toml"
  "package.json"
  "release-please-config.json"
  ".release-please-manifest.json"
  "kernel-manifest.json"
)

# Files inside a preset that get scanned (chassis source + preset config).
# Note: the preset's own package-lock.json is NOT scanned — it's an npm-managed
# artifact whose body legitimately mentions repo names that are not chassis
# identity (e.g. transitive deps' homepage URLs).
preset_scan_globs() {
  local preset="$1"
  printf '%s\n' \
    "$preset/package.json" \
    "$preset/vite.config.js" \
    "$preset/svelte.config.js" \
    "$preset/.prettierrc" \
    "$preset/.gitignore" \
    "$preset/index.html"
  find "$preset/src" -type f \( -name '*.js' -o -name '*.svelte' -o -name '*.css' -o -name '*.ts' \)
  if [ -d "$preset/faust" ]; then
    find "$preset/faust" -type f -name '*.dsp'
  fi
}

# Allowlist: the single Shell file that is permitted to contain sentinel
# substitution patterns. Defined per-preset because each preset has its own
# Shell.svelte at the same relative path.
shell_allowlist_paths() {
  local preset="$1"
  printf '%s\n' "$preset/src/components/Shell.svelte"
}

# Build-time globals injected by Vite's `define`; not donor identity, not
# new-app.sh substitution sentinels. Excluded from the un-substituted-sentinel
# check. The preset's vite.config.js provides placeholder defaults for
# __APP_TITLE__ and __APP_REPO_URL__ so the standalone build renders sensible
# text; a generated app overrides them in its own vite.config.js.
VITE_BUILD_SENTINELS_RE='__APP_VERSION__|__GIT_BRANCH__|__APP_TITLE__|__APP_REPO_URL__'

# ─── Donor-identity literals ─────────────────────────────────────────────────

DONOR_LITERAL_RES=(
  'synth-d:'
  'davidirvine/synth-d'
  # The donor app's branded title in upper case. The Shell's title slot is
  # parameterized via the __APP_TITLE__ sentinel; this denylist catches any
  # accidental hardcoding of the literal donor brand (case-sensitive match
  # avoids false-positives on the lowercase `synth-d:` namespace pattern
  # above and on bare-word `synth` in domain-named files like
  # `state/synth.svelte.js` or `faust/synth.dsp`).
  'SYNTH-D'
)

# ─── Run the checks ──────────────────────────────────────────────────────────

violations=0

print_violation() {
  echo "VIOLATION: $1" >&2
  violations=$((violations + 1))
}

# Build the full scan list once.
scan_files=()
for cfg in "${KERNEL_ROOT_CONFIGS[@]}"; do
  if [ -e "$cfg" ]; then
    scan_files+=("$cfg")
  fi
done
for preset in "${PRESETS[@]}"; do
  while IFS= read -r f; do
    if [ -e "$f" ]; then
      scan_files+=("$f")
    fi
  done < <(preset_scan_globs "$preset")
done

if [ "${#scan_files[@]}" -eq 0 ]; then
  print_violation "scan list is empty — script scope produced no files"
fi

# Check 1: donor-identity literals.
for re in "${DONOR_LITERAL_RES[@]}"; do
  hits=$(grep -lE "$re" "${scan_files[@]}" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    while IFS= read -r f; do
      print_violation "donor-identity literal '$re' found in $f"
    done <<<"$hits"
  fi
done

# Check 2: un-substituted sentinels outside the per-preset Shell allowlist.
# We build an allowlist set, then scan every file in scope; any file NOT in
# the allowlist that contains a `__[A-Z_]+__` token (excluding the Vite
# build-time globals) is a violation.
allowlist_set=()
for preset in "${PRESETS[@]}"; do
  while IFS= read -r f; do
    allowlist_set+=("$f")
  done < <(shell_allowlist_paths "$preset")
done

is_allowlisted() {
  local target="$1"
  for allowed in "${allowlist_set[@]}"; do
    if [ "$target" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

for f in "${scan_files[@]}"; do
  if is_allowlisted "$f"; then
    continue
  fi
  # Strip out Vite build-time globals first, then look for any remaining
  # `__[A-Z_]+__` pattern.
  if grep -oE '__[A-Z_]+__' "$f" 2>/dev/null | grep -vE "^($VITE_BUILD_SENTINELS_RE)$" >/dev/null; then
    matches=$(grep -oE '__[A-Z_]+__' "$f" 2>/dev/null | grep -vE "^($VITE_BUILD_SENTINELS_RE)$" | sort -u | tr '\n' ',')
    print_violation "un-substituted sentinel(s) [${matches%,}] in $f (not allowlisted; only the preset's Shell.svelte may host the substitution site)"
  fi
done

# ─── Result ───────────────────────────────────────────────────────────────────

if [ "$violations" -eq 0 ]; then
  echo "check-identity-leak: clean (${#scan_files[@]} files scanned across ${#PRESETS[@]} preset(s))"
  exit 0
else
  echo "check-identity-leak: $violations violation(s)" >&2
  exit 1
fi
