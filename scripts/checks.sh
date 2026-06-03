#!/usr/bin/env sh
# Repo-wide lint/format checks, shared by the pre-push hook and CI so the two
# cannot drift (design D3 — "pre-push CI parity" is literal identity, not two
# hand-synced copies). File discovery uses `git ls-files` (tracked files only),
# so vendored trees like node_modules/ are never inspected.
#
# shfmt is pinned to SHFMT_VERSION below; CI installs that exact version and
# slice 4's setup.sh --check verifies the local copy matches. Different shfmt
# versions can format differently, so the pin keeps local and CI deterministic.
set -eu

SHFMT_VERSION="v3.8.0"

# shfmt invocation used everywhere: 2-space indent to match the repo's scripts
# and prettier's tabWidth. Keep this identical in the pre-commit hook.
SHFMT="shfmt -i 2"

fail=0

# require <tool> <install-hint> — print an actionable message and mark failure
# if a required tool is missing, instead of erroring out opaquely.
require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "✗ required tool '$1' not found — $2" >&2
    fail=1
    return 1
  fi
}

# Shell scripts: every tracked *.sh plus the extensionless .githooks/* scripts.
sh_files=$(git ls-files '*.sh' '.githooks/*')
if [ -n "$sh_files" ]; then
  if require shellcheck "install ShellCheck (brew install shellcheck / apt-get install shellcheck)"; then
    # -x: follow `source`d files (e.g. scripts/lib/manifest.sh) so a script that
    # sources the shared lib is checked against the lib's real definitions rather
    # than flagged SC1091. Each consumer carries a `# shellcheck source=` hint.
    # shellcheck disable=SC2086 # tracked paths have no spaces; word-splitting is intended
    shellcheck -x $sh_files || fail=1
  fi
  if require shfmt "install shfmt ${SHFMT_VERSION} (https://github.com/mvdan/sh/releases)"; then
    # shellcheck disable=SC2086 # tracked paths have no spaces; word-splitting is intended
    $SHFMT --diff $sh_files || fail=1
  fi
fi

# Markdown / JSON / TOML: prettier applies .prettierignore even to explicitly
# passed paths, so ignored trees (openspec/, node_modules/, .claude/, ...) are
# not linted here. Verified: an identical mis-formatted file is skipped under
# openspec/ but flagged at repo root (prettier 3.x).
fmt_files=$(git ls-files '*.md' '*.json' '*.toml')
if [ -n "$fmt_files" ]; then
  if require npx "install Node (see .nvmrc) and run 'npm install'"; then
    # shellcheck disable=SC2086 # tracked paths have no spaces; word-splitting is intended
    npx prettier --check $fmt_files || fail=1
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "✗ checks failed" >&2
  exit 1
fi
echo "✓ checks passed"
