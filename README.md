# agent-workflow-kernel

The reusable, stack-agnostic **workflow kernel** extracted from the synth-d project — the canonical home of the OpenSpec spec-driven workflow, the roborev review gates, the worktree lifecycle, and the conventional-commits / release discipline — plus reusable **presets** (the instrument-agnostic chassis).

This repo lets new apps be generated with the established workflow and chassis already in place, and lets kernel improvements propagate to existing apps.

## What's here

The kernel's deliverables (Phase-2 slices 1–5, all built and gated by the `smoke-app` CI pipeline):

- [`scripts/new-app.sh`](scripts/new-app.sh) — generator: emit a fresh app from the kernel + a chosen `--preset`
- [`scripts/sync-kernel.sh`](scripts/sync-kernel.sh) — re-pull kernel files into an existing app (clobber-protected, kernel-version-stamped)
- [`scripts/setup.sh`](scripts/setup.sh) — idempotent per-checkout setup with a `--check` mode CI reuses
- [`presets/svelte-faust-synth/`](presets/svelte-faust-synth/) — the chassis (Shell, `param-schema.js`, tokenized components + `theme.css`) plus a minimal reference instrument, extracted from synth-d
- the `smoke-app` CI gate, the kernel's [`.githooks`](.githooks/), and `release-please` config

## Creating a new project from this kernel

`new-app.sh` reads the kernel manifest, copies the preset, substitutes your
app's identity, resets the version to `0.1.0`, and runs `git init` with one
chore commit. The generated app is buildable immediately; its instrument starts
as a **silent stub** for you to fill in.

### 1. Prerequisites

From this kernel checkout, verify your machine has the required tools:

```sh
scripts/setup.sh --check
```

It reports any missing prereq (`node` per [`.nvmrc`](.nvmrc), `npm`, `shfmt`,
`shellcheck`, `jq`, `gh`, `openspec`, `roborev`) with an install hint. `faust`
is **not** required — it ships as the `@grame/faustwasm` npm dependency and is
compiled at build time.

### 2. Generate the app

Run the generator from this kernel checkout. `--output` must not already exist:

```sh
scripts/new-app.sh \
  --name my-synth        # required; kebab-case ^[a-z][a-z0-9-]*$ (npm name + localStorage namespace)
  --output ../my-synth   # required; destination dir, refused if it exists
  [--preset svelte-faust-synth]                  # default: svelte-faust-synth
  [--title "My Synth"]                           # default: title-cased --name
  [--repo-url https://github.com/you/my-synth]   # default: https://example.com/<name>
```

(The first line ends with `\`; the rest are annotated arguments — pass them on
one command line, not as written with the inline comments.)

### 3. Install and build

The generator leaves `package-lock.json` intentionally stale, so the first
install must be `npm install` (not `npm ci`) — it regenerates the lockfile and
activates the git hooks via `postinstall`:

```sh
cd ../my-synth
npm install
npm run build      # prebuild compiles the FAUST DSP via @grame/faustwasm — no system FAUST install
```

`npm run build` succeeds against the silent stub instrument, so you get a
working app from the first commit.

### 4. Make it your instrument

Fill in the two app-owned files the stub leaves blank:

- `faust/synth.dsp` — the DSP
- `src/param-schema.js` — the parameter schema the chassis renders

From here, develop with the same spec-driven, worktree-isolated, roborev-gated
workflow this kernel exports — see [CLAUDE.md](CLAUDE.md) and your app's
generated `STACK.md`.

### 5. Pulling kernel updates later

Run [`scripts/sync-kernel.sh`](scripts/sync-kernel.sh) **from this kernel
checkout** to re-pull kernel-tier files into an existing app. Sync is a
deliberate version bump (a no-op when the app is at or ahead of the kernel),
never re-applies your instrument or app-owned identity files, and refuses to
clobber locally-modified synced files. Convention is `--dry-run` first:

```sh
scripts/sync-kernel.sh --kernel-repo . --app-repo ../my-synth --dry-run
scripts/sync-kernel.sh --kernel-repo . --app-repo ../my-synth
```

See [STACK.md](STACK.md) for the full reference on all three scripts.

## Design

This repo is **Phase 2** of a two-phase effort. The full design is captured in
synth-d's archived Phase-1 change:
`synth-d → openspec/changes/archive/2026-05-26-refactor-synth-d-chassis/design.md`
(the "Phase 2" section). The provisional slice plan lives in [ROADMAP.md](ROADMAP.md).
synth-d becomes the **first consumer** of this kernel (slice 6, which lives in
the synth-d repo).

## Workflow

Development follows [CLAUDE.md](CLAUDE.md) (the kernel workflow) + [STACK.md](STACK.md) (this repo's stack: Bash + OpenSpec tooling). Spec-driven, worktree-isolated, roborev-gated — the same rules this kernel exports.
