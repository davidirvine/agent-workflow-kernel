# Project-Specific Stack Rules

> These are the stack-specific rules for **agent-workflow-kernel** — the reusable workflow kernel itself. Unlike a generated app, this repo's "stack" is Bash scripts plus the OpenSpec/roborev tooling and Markdown specs; Node is used only by the smoke-app gate. This file is imported into `CLAUDE.md` via `@./STACK.md`. An app generated from this kernel replaces this file with its own stack rules.

## What this repo is

The canonical home of the stack-agnostic workflow kernel (the OpenSpec spec-driven workflow, the roborev review gates, the worktree lifecycle scripts, the conventional-commits/release discipline) plus reusable **presets**. It is **not** a generated app. Its deliverables — built via spec-driven changes — are:

- `new-app.sh` — generator that emits a fresh app from the kernel + a chosen preset
- `sync-kernel.sh` — re-pulls kernel files into an existing app (clobber-protected, version-stamped)
- `setup.sh` — idempotent per-checkout setup with a `--check` mode
- `presets/svelte-faust-synth/` — the instrument-agnostic chassis extracted from synth-d
- the smoke-app CI, the kernel's own `.githooks`, and `release-please` config

The full Phase-2 design lives in synth-d's archived change: `openspec/changes/archive/2026-05-26-refactor-synth-d-chassis/design.md` (the "Phase 2" section). synth-d becomes the first consumer of this kernel.

## Linting and Formatting

After EVERY file edit, run the appropriate tool BEFORE moving to the next task. Do not proceed if it fails.

| File type | Command                                    |
| --------- | ------------------------------------------ |
| `*.md`    | `npx prettier --write <file>`              |
| `*.json`  | `npx prettier --write <file>`              |
| `*.toml`  | `npx prettier --write <file>`              |
| `*.sh`    | `shfmt -w <file>` then `shellcheck <file>` |

## Local dev prerequisites

The kernel root and the preset together require these tools to be on `$PATH`
locally; CI provisions them in the same versions:

- `bash` ≥ 4 (for newer scripts; macOS bash 3.2 is also supported by the
  scripts here).
- `shellcheck` and `shfmt v3.8.0` — used by the pre-commit hook and the
  shared `scripts/checks.sh`. The `v3.8.0` pin is mirrored in
  `scripts/setup.sh --check` (which cross-checks its constant against this
  document so the two cannot drift).
- `jq` — used by `scripts/check-manifest.sh`, `scripts/sync-kernel.sh`, and
  `scripts/setup.sh --check`.
- Node + npm via `.nvmrc` — used by the root prettier gate, by every preset's
  own build, and by `sync-kernel.sh`'s semver comparison + JSON writes.
  **FAUST is NOT a separate prerequisite:** per design D10, FAUST ships as the
  `@grame/faustwasm` npm dep, installed via `npm ci` inside the preset.
- `gh`, `openspec`, `roborev` — required by the workflow; verified (alongside
  the above) by `scripts/setup.sh --check`. Run that on a fresh machine to see
  exactly what is missing.

## Kernel dependency posture (D7)

The kernel root does NOT install preset dependencies. Each preset is
self-contained — its own `package.json`, `package-lock.json`, and
`node_modules/` — and CI runs `npm ci` _inside the preset directory_, so
preset deps land in the preset's `node_modules`, never at the kernel root.
The kernel root's `package.json` stays minimal: prettier + plugins for
formatting the kernel's own files. If a future preset needs a system-level
prereq the kernel does not already provide (e.g. a Rust toolchain), that
provisioning goes in the preset's own job as a conditional step — never
hoisted to the kernel root.

## Completion-gate test commands

The implementation-completion gate in `CLAUDE.md` requires all applicable
tests to pass. Slice 2 established the following gates, which compose with
slice 1's `lint-format`:

- `shellcheck scripts/*.sh` (and any new top-level scripts) — clean.
- `preset-build` (CI): `npm ci && npm run build` inside
  `presets/svelte-faust-synth/`, plus the preset's own prettier check, the
  traveling chassis-purity test, and the power-off-silence vitest. Run
  locally via `cd presets/svelte-faust-synth && npm ci && npm run build`.
- `preset-leak-check` (CI): `scripts/check-manifest.sh` and
  `scripts/check-identity-leak.sh`. Both runnable locally with the same
  command.
- `generate-assert` (CI): `scripts/generate-assert.sh` — runs `new-app.sh`
  into a tempdir and asserts the emitted tree structurally and by identity,
  then runs the emitted app's own `check-identity-leak.sh`, then exercises the
  sync round-trip on the emitted app (asserts the fresh app reports `up to
date`, that a locally-edited file against a bumped kernel copy is refused,
  and that `--accept-kernel` resolves it). Runnable locally with the same
  command; it tears its tempdir(s) down on success and leaves them for
  inspection on failure. Needs Node (for the generator's `node -e` edits),
  `jq`, `git`, and `rsync` (for the bumped-kernel copy).
- The one-time extraction audit (`scripts/run-extraction-audit.sh`) ran
  during this slice's implementation; its evidence is preserved in
  `openspec/changes/import-chassis-preset/audit/`. Future slices do not
  re-run it; the traveling chassis-purity test is the standing guard.
- The `smoke-app` gate (CI): `scripts/smoke-app.sh` — generates an app with
  `new-app.sh` into a throwaway workspace, runs the generated app's
  `setup.sh --check --ci` (the build-only prereq scope), then `npm install`
  (not `npm ci` — the generator's lockfile is intentionally stale) + `npm run
build`, and asserts a non-empty `dist/` artifact before declaring success.
  Proves a freshly generated app builds from scratch. Run locally with
  `scripts/smoke-app.sh`; it needs only Node (per `.nvmrc`) — FAUST ships as
  the `@grame/faustwasm` npm dep — and tears its workspace down on success,
  leaving it with a printed pointer on failure.

## Feature-level verification

These compose with the human-approval gate in `CLAUDE.md`'s Pull Requests
section:

- `shellcheck`/`shfmt` clean on all scripts.
- `preset-build` green locally and in CI.
- `preset-leak-check` green locally and in CI (both scripts exit 0).
- `generate-assert` green locally and in CI (`scripts/generate-assert.sh`
  exits 0 and removes its tempdir).
- `smoke-app` green locally and in CI (`scripts/smoke-app.sh` — `new-app.sh` →
  `setup.sh --check --ci` → build — exits 0 and removes its workspace).
- pre-push hooks run the same checks as the kernel CI's `lint-format` job.

## Using new-app.sh

`scripts/new-app.sh` emits a fresh app from the kernel + a preset. It reads
`kernel-manifest.json` for what travels, seeds the preset's reference
instrument (via the `instrumentStubs` mapping), substitutes donor identity,
resets the version to `0.1.0`, empties
`openspec/changes/` to a `.gitkeep`, and runs `git init` + one chore commit.

```
scripts/new-app.sh \
  --name <app-name>      # required; kebab-case ^[a-z][a-z0-9-]*$ (npm name + localStorage namespace)
  --output <path>        # required; refused if it already exists
  [--preset <name>]      # default: svelte-faust-synth
  [--title <title>]      # default: title-cased --name
  [--repo-url <url>]     # default: https://example.com/<name>
```

After generation, run `npm install` in the new app once to regenerate
`package-lock.json` (the generator leaves it intentionally stale) and to
activate the git hooks via `postinstall`. `npm run build` then works without a
separate FAUST install — the `prebuild` step compiles the DSP via the
`@grame/faustwasm` npm dependency (design D10), not a system FAUST compiler.
The instrument starts seeded with the preset's reference A/R sine synth — a
small, playable, key-triggered instrument — so a fresh app is audible on its
first build. You then edit `faust/synth.dsp` and `src/param-schema.js` to make
it your own; the seeded instrument is app-owned content and is never re-synced.

The generated app also receives `.github/workflows/release-please.yml`, sourced
from the preset's `appTemplates` (alongside `.github/workflows/ci.yml`). It is the
**runner** for the release-please **config** that already travels into the app
(`release-please-config.json` + `.release-please-manifest.json`): it runs
`googleapis/release-please-action@v4` on push to `main` (manifest mode, no
duplicated release settings) to turn the app's Conventional Commit history into
release PRs, version bumps, a `CHANGELOG.md`, and tags. Note the `GITHUB_TOKEN`
caveat documented in the template header — the release PR opened with the default
token does not trigger the app's `ci.yml`; swap in a PAT/app token if you want CI
on release PRs.

## Using sync-kernel.sh

`scripts/sync-kernel.sh` re-pulls kernel-tier + stack-tier files into an
**existing** consuming app. Run it **from the kernel checkout** — the script is
excluded from generation/sync (design D3a), so the running copy is always the
kernel's current version.

```
scripts/sync-kernel.sh \
  --kernel-repo <path>   # required; the kernel checkout to sync FROM
  [--app-repo <path>]    # default: . ; the consuming app to sync INTO
  [--dry-run]            # report the upgrade path + copy plan, write nothing
  [--accept-kernel]      # overwrite locally-modified synced files (see warning)
  [--adopt-existing]     # bootstrap a baseline when the app has none
```

Sync is a **deliberate version bump**, not an unbounded HEAD pull: it compares
the app's `.kernel-version` to the kernel's `.release-please-manifest.json` `"."`
value and is a no-op (`up to date`) when the app is at or ahead of the kernel.
It mirrors `new-app.sh`'s manifest semantics exactly — `excludeFromGenerate`
honored, preset paths flattened, preset-wins overlap, specs verbatim,
`appTemplates` re-applied — but performs **no** identity substitution, **no**
`git init`, and **never** re-applies `instrumentStubs` (your instrument is
app-owned content after generation).

**App-owned files are never re-synced (design D3d).** The files `new-app.sh`
customizes per app — `src/components/Shell.svelte` (namespace), `vite.config.js`
(title/repo), `package.json` (name/version/scripts), and
`.release-please-manifest.json` (the app's release version) — are declared in
`kernel.appOwnedFiles` and excluded from the sync plan and the hash record, so a
sync can never clobber your app's identity or release state. The trade-off:
kernel-side changes to those four files do **not** arrive via sync; sync lists
them as "app-owned, not re-synced" so you can merge any upstream change by hand
if you want it.

**Convention: run `--dry-run` first, then the real sync.** The dry-run prints
the upgrade path (`X.Y.Z → A.B.C`), the count of new/clean/conflict files, and
every conflicting path, without touching anything.

**Clobber protection.** `.kernel-sync-hashes.json` (committed in the consuming
app) records the SHA-256 of every synced file as of the last sync. If a file
was modified locally since then, sync **refuses** and lists the conflicts
rather than silently overwriting. This is accident protection, not a security
boundary.

> **`--accept-kernel` warning:** it overwrites every locally-modified synced
> file with the kernel's version. Your local edits to those files are lost —
> the consuming app's **git history is the only safety net**. Prefer merging by
> hand, or commit first so the overwrite is a reviewable diff.

If the app has no `.kernel-sync-hashes.json` (scaffolded by hand, or generated
by a pre-sync kernel), sync refuses until you bootstrap a baseline with
`--adopt-existing` (which records the app's current file contents as the
baseline and writes the state files, touching nothing else). Sync is
**additive only** — a path the kernel no longer tracks is reported, never
deleted.

## Using setup.sh

`scripts/setup.sh` is the idempotent per-checkout setup. The same script runs in
the kernel checkout and in any generated app (layout auto-detected).

```
scripts/setup.sh              # default mode
scripts/setup.sh --check      # verify the full prereq table; no work, no mutation
scripts/setup.sh --check --ci # verify only build-essential prereqs (node, npm)
```

**Default mode** runs `npm ci` at the root (and inside each preset in the kernel
layout), the preset's `prebuild` (which compiles the DSP via the
`@grame/faustwasm` npm dep — no system FAUST install), and
`scripts/install-hooks.sh`. It is safe to re-run. (In a **freshly generated**
app, run `npm install` once first — `new-app.sh` leaves `package-lock.json`
intentionally stale, so a bare `npm ci` would fail until the lockfile is
regenerated.)

**`--check` mode** does no work; it verifies the prereq table — `node` (per
`.nvmrc`), `npm`, `shfmt` (pinned `v3.8.0`), `shellcheck`, `jq`, `gh`,
`openspec`, `roborev` — and exits non-zero with an actionable install hint for
each miss. `faust` is deliberately **absent** from the table (it ships as an npm
dep). `--check` is the tool a developer runs on a fresh machine, and the one a
downstream consumer's CI can gate on; the kernel's own CI provisions its
prereqs explicitly and adds no `setup-check` job (design D7).

**`--check --ci` mode** is a build-only scope of `--check`: it verifies **only**
the prereqs needed to install deps and build the app — `node` (per `.nvmrc`)
and `npm` — and skips the workflow-authoring tools (`shfmt`, `shellcheck`, `jq`,
`gh`, `openspec`, `roborev`) and the STACK.md shfmt-pin cross-check. It is the
scope a Node-only CI runner (the kernel's `smoke-app` gate, or a consumer's
build-only smoke test) can satisfy without provisioning the full toolchain. The
`--ci` modifier is valid only alongside `--check` (order-independent); `--ci`
without `--check` is a usage error (exit 2). The full `--check` and default mode
are unchanged.
