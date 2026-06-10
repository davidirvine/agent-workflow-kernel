#!/usr/bin/env bash
#
# setup.sh — idempotent per-checkout setup (default mode) + a non-mutating
# prereq verifier (--check). The same script runs in the kernel checkout and in
# any generated app; layout is auto-detected the same way check-identity-leak.sh
# detects it (design D7). See openspec/specs/repo-setup/spec.md.
#
# Default mode: npm ci at the root (and inside each present preset in kernel
# layout), the preset's `prebuild` npm script (FAUST compile via the
# @grame/faustwasm npm dep — NO system FAUST install), and scripts/install-hooks.sh.
# Re-running is safe (npm ci is lockfile-deterministic; hooks activation and
# FAUST output are idempotent).
#
# --check mode: do no work; verify the global prereq table (node per .nvmrc,
# npm, shfmt at the pinned version, shellcheck, jq, gh, openspec, roborev) and
# exit non-zero on any miss. `faust` is deliberately ABSENT — it ships as an npm
# dep, not a system tool (STACK.md).
#
# Usage:
#   scripts/setup.sh            # default mode
#   scripts/setup.sh --check    # verify prereqs only

set -euo pipefail

cd "$(dirname "$0")/.."

# Pinned shfmt version. Single source in the kernel is STACK.md; this constant
# mirrors it and --check cross-checks the two so they cannot drift (design D7).
SHFMT_VERSION="v3.8.0"

MODE="default"
case "${1:-}" in
"") ;;
--check) MODE="check" ;;
-h | --help)
  cat <<'EOF'
Usage: setup.sh [--check]

  (no flag)   default mode: npm ci (root + presets), preset prebuild, install hooks
  --check     verify global prereqs at their required versions; exit non-zero on any miss
EOF
  exit 0
  ;;
*)
  echo "setup.sh: unknown argument '$1' (expected --check or no flag)" >&2
  exit 2
  ;;
esac
if [ "$#" -gt 1 ]; then
  echo "setup.sh: unexpected extra argument(s) after '$1' (expected --check or no flag)" >&2
  exit 2
fi

# ─── Layout detection (mirrors check-identity-leak.sh, design D7) ───────────
PRESETS=()
if [ -d "presets" ]; then
  while IFS= read -r d; do
    PRESETS+=("$d")
  done < <(find presets -mindepth 1 -maxdepth 1 -type d | sort)
fi
if [ "${#PRESETS[@]}" -eq 0 ]; then
  # No presets/ with subdirectories → generated-app layout; "." is the preset.
  PRESETS=(".")
fi

# ─── --check mode: verify prereqs, do no work ───────────────────────────────
if [ "$MODE" = "check" ]; then
  fails=0
  report() {
    echo "MISSING: $1 — $2" >&2
    fails=$((fails + 1))
  }
  report_version() {
    echo "OUTDATED: $1 — $2" >&2
    fails=$((fails + 1))
  }

  # node, pinned to .nvmrc. The match is a component-prefix: ".nvmrc" of "22"
  # accepts any "22.x.y"; "22.5" accepts any "22.5.z". This is intentional —
  # the kernel pins to a major (or major.minor) line. If a future .nvmrc pins a
  # full "major.minor.patch", the same prefix rule still requires an exact match
  # (there are no further components to wildcard), so a patch mismatch is caught.
  if ! command -v node >/dev/null 2>&1; then
    report "node" "install via nvm: nvm install \$(cat .nvmrc)"
  elif [ -f ".nvmrc" ]; then
    nvmrc_ver="$(tr -d '[:space:]' <.nvmrc | sed 's/^v//')"
    node_ver="$(node --version | sed 's/^v//')"
    case "$node_ver" in
    "$nvmrc_ver" | "$nvmrc_ver".*) ;;
    *) report_version "node" "want v$nvmrc_ver (per .nvmrc), have v$node_ver — nvm install \$(cat .nvmrc)" ;;
    esac
  fi

  # npm (any version; bundled with node).
  command -v npm >/dev/null 2>&1 || report "npm" "install Node, which bundles npm"

  # shfmt, pinned to SHFMT_VERSION. First cross-check the pin against STACK.md
  # so this constant cannot silently drift from the documented version.
  if [ -f "STACK.md" ]; then
    if ! grep -Fq "shfmt $SHFMT_VERSION" STACK.md; then
      echo "INCONSISTENT: STACK.md does not document the shfmt pin '$SHFMT_VERSION' — update one to match the other" >&2
      fails=$((fails + 1))
    fi
  fi
  if ! command -v shfmt >/dev/null 2>&1; then
    report "shfmt" "install shfmt $SHFMT_VERSION (brew install shfmt, or https://github.com/mvdan/sh/releases)"
  else
    shfmt_ver="$(shfmt --version 2>/dev/null | tr -d '[:space:]')"
    if [ "$shfmt_ver" != "$SHFMT_VERSION" ]; then
      report_version "shfmt" "want $SHFMT_VERSION, have ${shfmt_ver:-unknown} — brew install shfmt or https://github.com/mvdan/sh/releases"
    fi
  fi

  # Presence-only prereqs.
  command -v shellcheck >/dev/null 2>&1 || report "shellcheck" "install via 'brew install shellcheck'"
  command -v jq >/dev/null 2>&1 || report "jq" "install via 'brew install jq'"
  command -v gh >/dev/null 2>&1 || report "gh" "install via 'brew install gh' then 'gh auth login'"
  command -v openspec >/dev/null 2>&1 || report "openspec" "see the openspec docs"
  command -v roborev >/dev/null 2>&1 || report "roborev" "see the roborev docs"

  if [ "$fails" -ne 0 ]; then
    echo "setup.sh --check: $fails prereq(s) unsatisfied" >&2
    exit 1
  fi
  echo "setup.sh --check: all prereqs satisfied"
  exit 0
fi

# ─── Default mode: do the deterministic per-checkout work ───────────────────
# has_prebuild <dir> — true if <dir>/package.json declares a "prebuild" script.
# Uses node (npm implies node), so it adds no jq dependency to default mode.
has_prebuild() {
  node -e 'try{const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit((p.scripts||{}).prebuild?0:1)}catch(e){process.exit(1)}' "$1/package.json"
}

echo "setup.sh: npm ci (root)…"
npm ci

for p in "${PRESETS[@]}"; do
  if [ "$p" = "." ]; then
    # App layout: the root IS the app; deps installed above. Run its prebuild.
    if has_prebuild "."; then
      echo "setup.sh: npm run prebuild (root)…"
      npm run prebuild
    fi
  else
    if [ -f "$p/package.json" ]; then
      echo "setup.sh: npm ci ($p)…"
      (cd "$p" && npm ci)
      if has_prebuild "$p"; then
        echo "setup.sh: npm run prebuild ($p)…"
        (cd "$p" && npm run prebuild)
      fi
    fi
  fi
done

echo "setup.sh: activating git hooks…"
scripts/install-hooks.sh

echo "setup.sh: done"
