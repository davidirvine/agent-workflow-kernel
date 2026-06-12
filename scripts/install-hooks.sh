#!/usr/bin/env sh
# Activate the repo's git hooks by pointing core.hooksPath at .githooks.
# Invoked from package.json's "postinstall" so a fresh `npm install` wires
# hooks automatically. Idempotent, and a safe no-op outside a git work tree
# (tarball installs, CI containers without git state).
if [ -d .git ] || git rev-parse --git-dir >/dev/null 2>&1; then
  current=$(git config --get core.hooksPath || true)
  if [ "$current" != ".githooks" ]; then
    git config core.hooksPath .githooks
    echo "[install-hooks] core.hooksPath set to .githooks" >&2
  fi
  # Neutralize a roborev-armed post-commit auto-review hook. roborev's
  # `install-hook`/`init` rewrites .githooks/post-commit to run `roborev
  # post-commit` (auto-enqueue) — which violates the explicit-gates posture AND
  # carries roborev's own formatting that fails the shfmt push gate. Restore the
  # committed no-op stub from git. Scoped to post-commit ONLY: .githooks/post-rewrite
  # (roborev's `remap`, wanted at the explicit gates) is intentionally left
  # untouched. The grep guard makes this a no-op when post-commit is already the
  # kernel stub — and thus a no-op on machines without roborev, which never arm it.
  # NOTE: this self-heals on the next install; an out-of-band `roborev init`
  # followed by a commit before re-running setup is the one window it cannot close
  # (enqueue is hook-driven and roborev exposes no config off-switch — see
  # WORKFLOW-NOTES.md). The push gate stays safe regardless (checks.sh excludes
  # these paths).
  if [ -f .githooks/post-commit ] &&
    grep -q 'roborev post-commit hook' .githooks/post-commit 2>/dev/null; then
    if git checkout -- .githooks/post-commit 2>/dev/null; then
      echo "[install-hooks] restored no-op post-commit stub (roborev had armed auto-review)" >&2
    fi
  fi
  # Ensure the committed hooks are executable. git does not reliably preserve
  # the executable bit across clones/platforms, and a non-executable hook is
  # silently skipped — so set it here rather than relying on git.
  if [ -d .githooks ]; then
    chmod +x .githooks/* 2>/dev/null || true
  fi
fi
