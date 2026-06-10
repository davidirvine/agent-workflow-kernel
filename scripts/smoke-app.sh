#!/usr/bin/env bash
#
# smoke-app.sh — the slice-5 end-to-end gate. Proves a FRESHLY GENERATED app is
# buildable from scratch: generate an app with new-app.sh into a throwaway
# workspace OUTSIDE the kernel checkout, run the generated app's
# `setup.sh --check --ci` (the build-only prereq scope), then install and build
# it (`npm install` + `npm run build`, whose `prebuild` compiles the FAUST DSP
# via the @grame/faustwasm npm dep — no system FAUST). A committed script (not
# workflow YAML) so it runs identically in CI and locally (design D3). Asserts a
# non-empty dist/ artifact before declaring success (D5). Build with `npm
# install`, NOT `npm ci`: the generator leaves package-lock.json intentionally
# stale relative to the mutated package.json, so `npm ci` would fail (D2).
#
# Tempdir discipline mirrors generate-assert.sh: generate outside the kernel
# checkout so the build never pollutes the working tree, tear the workspace down
# on success, and leave it in place with a printed pointer on failure for
# inspection. See openspec/specs/dev-gates/spec.md.
#
# Usage: scripts/smoke-app.sh   (no arguments)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KERNEL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$KERNEL_ROOT"

PRESET="svelte-faust-synth"
NAME="smoke-app"
TITLE="Smoke App"
REPO_URL="https://example.com/smoke-app"

# ─── Tempdir + teardown trap ────────────────────────────────────────────────
# mktemp -d places the workspace outside the kernel checkout (in $TMPDIR), so
# the generated app's node_modules/ and dist/ never touch the working tree.
TMP="$(mktemp -d)"
APP="$TMP/$NAME"
KEEP=0
cleanup() {
  if [ "$KEEP" -eq 0 ]; then
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT

# fail <message> — print the message, mark the workspace for inspection, and
# exit non-zero so any pipeline stage failure fails the whole gate.
fail() {
  KEEP=1
  echo "✗ smoke-app: $1" >&2
  echo "  workspace left for inspection at $TMP" >&2
  exit 1
}

# Provide a git identity for headless/CI runs; new-app.sh deliberately
# configures no author and relies on the environment (design D7). `:-` respects
# an already-configured identity when run locally.
export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-smoke-app}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-smoke-app@example.com}"
export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-smoke-app}"
export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-smoke-app@example.com}"

# ─── 1. Generate the app ────────────────────────────────────────────────────
echo "smoke-app: generating '$NAME' into $APP …"
if ! "$SCRIPT_DIR/new-app.sh" \
  --name "$NAME" --output "$APP" --preset "$PRESET" \
  --title "$TITLE" --repo-url "$REPO_URL" >"$TMP/gen.log" 2>&1; then
  cat "$TMP/gen.log" >&2
  fail "new-app.sh exited non-zero"
fi

# ─── 2. Build-only prereq check from inside the generated app ───────────────
echo "smoke-app: running the generated app's setup.sh --check --ci …"
if ! (cd "$APP" && scripts/setup.sh --check --ci) >"$TMP/check.log" 2>&1; then
  cat "$TMP/check.log" >&2
  fail "the generated app's setup.sh --check --ci failed"
fi

# ─── 3. Install + build (npm install, NOT npm ci — D2) ──────────────────────
echo "smoke-app: npm install (generated app) …"
if ! (cd "$APP" && npm install) >"$TMP/install.log" 2>&1; then
  cat "$TMP/install.log" >&2
  fail "npm install failed in the generated app"
fi

echo "smoke-app: npm run build (FAUST prebuild + vite) …"
if ! (cd "$APP" && npm run build) >"$TMP/build.log" 2>&1; then
  cat "$TMP/build.log" >&2
  fail "npm run build failed in the generated app"
fi

# ─── 4. Assert a non-empty build artifact (D5) ──────────────────────────────
if [ ! -d "$APP/dist" ]; then
  fail "build produced no dist/ directory"
fi
if [ -z "$(find "$APP/dist" -type f -print -quit)" ]; then
  fail "build produced an empty dist/ directory"
fi

# ─── 5. Report ──────────────────────────────────────────────────────────────
echo "✓ smoke-app: generated '$NAME' (preset $PRESET) built cleanly — dist/ artifact present; workspace removed"
