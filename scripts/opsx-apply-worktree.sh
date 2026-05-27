#!/usr/bin/env bash
# opsx-apply-worktree.sh <change-name> [<prefix>]
#
# Creates a sibling git worktree for implementing an approved OpenSpec proposal.
# Assumes the proposal at openspec/changes/<change-name>/ has been committed to main.
# <prefix> defaults to "feature" if omitted; use "bugfix" for bug-fix changes.
#
# Resulting layout:
#   ../<repo>/              <- main worktree, stays on main
#   ../<repo>-<change>/     <- new worktree on <prefix>/<change>

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <change-name> [<prefix>]" >&2
  exit 2
fi

CHANGE_NAME="$1"
PREFIX="${2:-feature}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
PARENT_DIR="$(dirname "$REPO_ROOT")"
WORKTREE_PATH="${PARENT_DIR}/${REPO_NAME}-${CHANGE_NAME}"
BRANCH="${PREFIX}/${CHANGE_NAME}"
CHANGE_DIR="${REPO_ROOT}/openspec/changes/${CHANGE_NAME}"

# --- Preflight checks -------------------------------------------------------

if [[ ! -d "$CHANGE_DIR" ]]; then
  echo "✗ No proposal found at openspec/changes/${CHANGE_NAME}/" >&2
  echo "  Run /opsx:new ${CHANGE_NAME} and /opsx:ff on main first." >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "✗ Must be on 'main' to create a ${PREFIX} worktree (you are on '${CURRENT_BRANCH}')." >&2
  exit 1
fi

if ! git diff-index --quiet HEAD --; then
  echo "✗ Working tree has uncommitted changes." >&2
  echo "  Commit the proposal to main before creating the implementation worktree." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "✗ Branch '${BRANCH}' already exists." >&2
  echo "  If a previous worktree was abandoned, clean it up with:" >&2
  echo "    git worktree remove ${WORKTREE_PATH} --force" >&2
  echo "    git branch -D ${BRANCH}" >&2
  exit 1
fi

if [[ -e "$WORKTREE_PATH" ]]; then
  echo "✗ Path already exists: ${WORKTREE_PATH}" >&2
  exit 1
fi

# --- Sync main --------------------------------------------------------------

if git remote get-url origin &>/dev/null; then
  echo "→ Fetching latest main..."
  git fetch origin main
  git merge --ff-only origin/main
else
  echo "→ No remote 'origin' — skipping fetch (local-only repo)."
fi

# --- Create branch and attach worktree --------------------------------------

# Create the branch from main without checking it out anywhere, so the
# sibling worktree can claim it (git worktree add requires the target branch
# to not be checked out in another worktree).
echo "→ Creating branch ${BRANCH} from main..."
git branch "$BRANCH" main

echo "→ Attaching worktree at ${WORKTREE_PATH}..."
git worktree add "$WORKTREE_PATH" "$BRANCH"

# --- Copy untracked essentials ----------------------------------------------
# Add or remove filenames here to match what your project needs.
UNTRACKED_FILES=(.env .env.local)

for f in "${UNTRACKED_FILES[@]}"; do
  if [[ -f "${REPO_ROOT}/${f}" ]]; then
    cp "${REPO_ROOT}/${f}" "${WORKTREE_PATH}/${f}"
    echo "  copied ${f}"
  fi
done

# --- Report -----------------------------------------------------------------

cat <<EOF

✓ Worktree ready
  Path:   ${WORKTREE_PATH}
  Branch: ${BRANCH}
  Change: ${CHANGE_NAME}

Next steps:
  cd ${WORKTREE_PATH}
  # set up services / venv as needed
  /opsx:apply ${CHANGE_NAME}
EOF
