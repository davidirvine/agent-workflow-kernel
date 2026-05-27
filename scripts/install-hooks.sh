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
fi
