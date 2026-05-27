#!/usr/bin/env bash
# opsx-abandon-worktree.sh <change-name>
#
# Tears down a worktree + branch for a change that was abandoned
# (proposal rejected after implementation started, direction changed, etc).
#
# This does NOT touch the proposal files on main — if you want to remove those,
# revert or delete openspec/changes/<change-name>/ on main separately.

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

# Resolve the branch name — opsx-apply-wt creates either feature/<name> or bugfix/<name>.
if git show-ref --verify --quiet "refs/heads/feature/${CHANGE_NAME}"; then
  BRANCH="feature/${CHANGE_NAME}"
elif git show-ref --verify --quiet "refs/heads/bugfix/${CHANGE_NAME}"; then
  BRANCH="bugfix/${CHANGE_NAME}"
else
  echo "✗ No local branch found for ${CHANGE_NAME} (tried feature/ and bugfix/)." >&2
  exit 1
fi

echo "⚠ About to abandon worktree for ${CHANGE_NAME}:"
echo "  Remove worktree: ${WORKTREE_PATH}"
echo "  Delete branch:   ${BRANCH} (local, and remote if present)"
echo "  Any uncommitted work in the worktree will be LOST."
echo
read -r -p "Continue? [y/N] " reply
if [[ ! "$reply" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

if [[ -d "$WORKTREE_PATH" ]]; then
  git worktree remove --force "$WORKTREE_PATH"
else
  git worktree prune
fi

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  git branch -D "$BRANCH"
fi

if git ls-remote --exit-code --heads origin "$BRANCH" > /dev/null 2>&1; then
  git push origin --delete "$BRANCH"
fi

echo "✓ Abandoned ${CHANGE_NAME}"
echo "  Note: openspec/changes/${CHANGE_NAME}/ on main is untouched."
echo "  Remove it manually if the proposal should also be dropped."
