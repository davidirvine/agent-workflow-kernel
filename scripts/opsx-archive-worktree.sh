#!/usr/bin/env bash
# opsx-archive-worktree.sh <change-name>
#
# Cleans up the worktree and branch after a change has been archived.
# Run this from the main worktree, AFTER:
#   1. The feature/bugfix PR has been merged to main
#   2. You have pulled main locally
#   3. /opsx:archive <change-name> has been run and committed on main

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <change-name>" >&2
  exit 2
fi

CHANGE_NAME="$1"
REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
PARENT_DIR="$(dirname "$REPO_ROOT")"
WORKTREE_PATH="${PARENT_DIR}/${REPO_NAME}-${CHANGE_NAME}"

# --- Preflight --------------------------------------------------------------

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "✗ Must be on 'main' to clean up (you are on '${CURRENT_BRANCH}')." >&2
  exit 1
fi

# Resolve the branch name — opsx-apply-wt creates either feature/<name> or bugfix/<name>.
if git show-ref --verify --quiet "refs/heads/feature/${CHANGE_NAME}"; then
  BRANCH="feature/${CHANGE_NAME}"
elif git show-ref --verify --quiet "refs/heads/bugfix/${CHANGE_NAME}"; then
  BRANCH="bugfix/${CHANGE_NAME}"
else
  echo "✗ No local branch found for ${CHANGE_NAME} (tried feature/ and bugfix/)." >&2
  exit 1
fi

ARCHIVE_GLOB="${REPO_ROOT}/openspec/changes/archive/*-${CHANGE_NAME}"
# shellcheck disable=SC2086
if ! compgen -G "$ARCHIVE_GLOB" > /dev/null; then
  echo "✗ No archived change found matching openspec/changes/archive/*-${CHANGE_NAME}" >&2
  echo "  Run /opsx:archive ${CHANGE_NAME} first, then commit the archive to main." >&2
  exit 1
fi

# --- Remove worktree --------------------------------------------------------

if [[ -d "$WORKTREE_PATH" ]]; then
  echo "→ Removing worktree at ${WORKTREE_PATH}..."
  if ! git worktree remove "$WORKTREE_PATH" 2>/dev/null; then
    echo "  Worktree has local changes. Re-run with FORCE=1 to discard them:" >&2
    echo "    FORCE=1 $0 ${CHANGE_NAME}" >&2
    if [[ "${FORCE:-0}" == "1" ]]; then
      echo "  FORCE=1 set — removing anyway."
      git worktree remove --force "$WORKTREE_PATH"
    else
      exit 1
    fi
  fi
else
  echo "  (worktree directory already gone, pruning stale refs)"
  git worktree prune
fi

# --- Delete branches --------------------------------------------------------

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "→ Deleting local branch ${BRANCH}..."
  git branch -D "$BRANCH"
fi

if git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null 2>&1; then
  echo "→ Deleting remote branch origin/${BRANCH}..."
  git push origin --delete "$BRANCH"
fi

echo "✓ Cleanup complete for ${CHANGE_NAME}"
