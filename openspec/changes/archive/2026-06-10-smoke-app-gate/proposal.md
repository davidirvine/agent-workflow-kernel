## Why

The `smoke-app` CI job has been a green no-op stub since slice 1 (kernel-dev-gates D4), reserving the harness slot so later slices fill it in by editing one job. Slices 2–4 are now complete and archived: a preset builds, the generator emits a correct tree, and sync round-trips. But nothing yet proves a **freshly generated app actually builds** — `generate-assert.sh` deliberately asserts only the emitted tree's structure plus the sync round-trip, never a build. Slice 5 closes the Phase-2 roadmap by turning the stub into the real end-to-end gate, so "a generated app is buildable from scratch" is enforced on every push and pull request.

## What Changes

- Replace the `smoke-app` stub step (`echo "smoke-app: pending until slice 5"`) with the real pipeline: in CI, generate an app via `scripts/new-app.sh` into a throwaway workspace, run the **generated app's** `setup.sh --check --ci` to verify build prereqs, then build it (`npm install` + `npm run build`, whose `prebuild` compiles the FAUST DSP via the `@grame/faustwasm` npm dependency).
- **Add a build-only check scope to `setup.sh`** — `setup.sh --check --ci` verifies only the prereqs needed to install deps and build the app (Node pinned to `.nvmrc`, npm), **not** the full workflow-authoring toolchain (`shfmt`, `shellcheck`, `jq`, `gh`, `openspec`, `roborev`). The existing full `setup.sh --check` is unchanged. This resolves the otherwise-fatal contradiction: a bare CI runner provisioned with Node only (D6) cannot satisfy the full `--check`, but it can and must satisfy the build-essential subset the smoke gate cares about.
- Fill the **existing** `smoke-app` job — no new job is added (kernel-dev-gates D4 / ROADMAP gate-decomposition: each slice's gate stays in its own job; slice 5 is the one that composes generation + build).
- Use `npm install`, **not** `npm ci`: the generated app's `package-lock.json` is intentionally left stale by the generator (new-app-generator design), so `npm ci` would fail. The slice-3 design already anticipated `npm install` here for exactly this reason.
- The build needs no separate FAUST toolchain — FAUST ships as the `@grame/faustwasm` npm dep (D10), so `npm install` brings it in. The job provisions Node from `.nvmrc` and starts with `actions/checkout@v4` (like every other job); `git` is preinstalled on the runner.
- Extract the pipeline into a single committed script (`scripts/smoke-app.sh`) invoked identically by CI and locally, mirroring the `checks.sh` / `generate-assert.sh` CI-parity discipline (D3) so the gate cannot drift between the two.
- Update `STACK.md`: flip the smoke-app gate description from "pending no-op stub. Slice 5 turns it on." to its live behavior (`new-app.sh → setup.sh --check --ci → build`), and document the local-run command.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `dev-gates`: the "Smoke-app CI job exists as a pending stub" requirement is replaced by a requirement that the `smoke-app` job runs the full generate → `setup.sh --check --ci` → build pipeline against a freshly generated app, failing if any stage fails.
- `repo-setup`: a new requirement adds the build-only `setup.sh --check --ci` scope (verifies Node/npm only, suitable for a Node-only CI runner) alongside the existing full `--check`.

## Impact

- `.github/workflows/ci.yml` — the `smoke-app` job body (the only job changed; all others untouched).
- `scripts/setup.sh` — add the `--check --ci` build-only scope (the full `--check` and default mode are unchanged).
- `scripts/smoke-app.sh` — new script encapsulating the generate → `--check --ci` → build pipeline for CI/local parity.
- `kernel-manifest.json` — add `scripts/smoke-app.sh` to `kernel.excludeFromGenerate` (it is a kernel-only script like `generate-assert.sh`/`new-app.sh`; it must not travel to generated apps).
- `STACK.md` — smoke-app gate description (Completion-gate + Feature-level verification sections) and a local-run note.
- No changes to `scripts/new-app.sh` or the preset — both are consumed as-is; this slice composes them.
