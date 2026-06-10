## Context

This is slice 5, the final slice of the Phase-2 kernel roadmap. The `smoke-app`
CI job has existed as a deliberate green no-op stub since slice 1
(kernel-dev-gates D4): a single step that echoes `smoke-app: pending until
slice 5` and exits 0, reserving the harness slot so each later slice fills in
pipeline stages by editing **this one job** rather than adding new ones.

Slices 2–4 are archived and supply every piece this slice composes:

- `scripts/new-app.sh` (slice 3) emits a fresh app from the kernel + the
  `svelte-faust-synth` preset into an output dir, `git init`-ing it with one
  scaffold commit. Its `package-lock.json` is **intentionally stale** — the
  generator mutates `package.json` (identity fields + two added devDeps) but
  does not re-resolve the lockfile (new-app-generator design).
- `scripts/setup.sh` (slice 4) has a default mode (npm ci + preset prebuild +
  hook install) and a non-mutating `--check` mode. The full `--check` verifies
  the kernel's entire prereq table — `node`, `npm`, `shfmt v3.8.0`,
  `shellcheck`, `jq`, `gh`, `openspec`, `roborev` ([setup.sh:116-121](../../../scripts/setup.sh)).
  Per repo-setup's own spec, that full check is "for human-driven onboarding and
  downstream-consumer CI" and "running a `--check` gate before provisioning would
  fail every bare runner." It auto-detects kernel vs generated-app layout (D7).
- The preset's build is `npm run build` → `prebuild` runs `faust:build`, which
  compiles `faust/synth.dsp` via the `@grame/faustwasm` npm dependency (D10),
  then `vite build`. There is **no** system FAUST prerequisite.

What no existing gate covers: that a **freshly generated app actually builds**.
`generate-assert.sh` (slice 3, extended in slice 4) asserts the emitted tree
structurally + by identity and runs the sync round-trip, but explicitly never
builds the app (new-app-generator D9: "slice 3's contract is 'emit correctly,'
slice 5's is 'emitted app builds and runs'"). This slice supplies exactly that.

## Goals / Non-Goals

**Goals:**

- Turn the `smoke-app` stub into a real end-to-end gate: generate an app →
  run the emitted app's build-prereq check → build the emitted app.
- Prove "a generated app is buildable from scratch" on every push and PR.
- Keep the gate runnable identically in CI and locally (CI-parity, D3 lineage).
- Keep CI provisioning to Node only — no workflow-authoring toolchain on the
  smoke-app runner (D6/D7 lineage).

**Non-Goals:**

- Adding a new CI job (D1 keeps it in the existing `smoke-app` job).
- Re-running the preset's own tests (power-off-silence vitest, chassis-purity)
  — those are `preset-build`'s contract against the preset; smoke-app's contract
  is the **generated** app's buildability.
- Changing `new-app.sh` or the preset — both consumed as-is.
- Changing the existing full `setup.sh --check` semantics or default mode — this
  slice only *adds* a build-only scope alongside them.
- Running the generated app's dev server or doing runtime/audio verification —
  the gate proves the build artifact is produced, not that it sounds correct.

## Decisions

### D1 — Fill the existing `smoke-app` job; add no new job

The `smoke-app` job body is rewritten from the echo stub into the real
pipeline. No new CI job is introduced.

**Why over a new job:** the ROADMAP gate-decomposition (kernel-dev-gates D4,
restated in import-chassis-preset D7 and new-app-generator D9) reserves the
`smoke-app` slot precisely so slice 5 composes generation + build *here*. Each
slice's gate already lives in its own job; smoke-app is the one job that is
*meant* to compose the others end-to-end. Adding a parallel job would orphan the
stub and break the "fill this one job" contract every prior slice deferred to.

### D2 — Build with `npm install`, not `npm ci`

The pipeline installs the generated app's deps with `npm install`.

**Why over `npm ci`:** the generator leaves `package-lock.json` intentionally
stale relative to the mutated `package.json` (new-app-generator design). `npm
ci` requires lockfile/manifest agreement and would fail on every run. The
slice-3 design already anticipated this: "Slice 5's smoke-app runs `npm install`
(not `npm ci`) for the same reason." `npm install` reconciles the lockfile in
the throwaway workspace, which is then discarded. This is the same posture a
real first-time consumer hits (`STACK.md`: "run `npm install` in the new app
once to regenerate `package-lock.json`").

### D3 — Pipeline lives in a committed `scripts/smoke-app.sh`, not inline YAML

The generate → check → build sequence is a committed bash script the CI job
invokes in one step, mirroring `scripts/checks.sh` (pre-push/CI parity) and
`scripts/generate-assert.sh`.

**Why over inline workflow steps:** D3 of kernel-dev-gates makes pre-push/CI
parity *literal identity, not hand-synced copies*; a committed script is the
only way the smoke-app gate runs the same way locally and in CI. It also lets a
developer reproduce a CI failure with one command. The script reuses
generate-assert's proven tempdir discipline: `mktemp -d`, generate **outside**
the kernel checkout (so the build never pollutes the working tree), tear the
workspace down on success, and leave it in place with a printed pointer on
failure for inspection. It also exports a headless git identity for the
generator the same way generate-assert.sh does, so it runs on a bare CI runner.
`scripts/smoke-app.sh` is a kernel-only script — like `generate-assert.sh` and
`new-app.sh` it must be added to `kernel.excludeFromGenerate` in
`kernel-manifest.json` so it never travels to a generated app (where generating
an app from within an app is nonsensical, and where `generate-assert.sh` would
otherwise begin asserting its presence).

### D4 — Smoke-app runs `setup.sh --check --ci` (a new build-only scope), not the full `--check`

This slice adds a build-only check scope to `setup.sh`: `setup.sh --check --ci`
verifies **only** the prereqs needed to install deps and build the app — `node`
(pinned to `.nvmrc`) and `npm` — and skips the workflow-authoring tools
(`shfmt`, `shellcheck`, `jq`, `gh`, `openspec`, `roborev`) and the STACK.md
shfmt-pin cross-check. The smoke-app pipeline runs `setup.sh --check --ci` from
inside the generated app, as a hard gate (non-zero exit fails the pipeline),
between generation and the build.

**Why this over the alternatives the review surfaced:**

- _Run the full `setup.sh --check`_ → rejected. It requires `shfmt v3.8.0`,
  `openspec`, and `roborev` (a review daemon) on `$PATH`; none are on a bare
  `ubuntu-latest` runner. Making it a hard gate while provisioning Node only
  (D6) is a guaranteed failure on every run — the exact contradiction the design
  review caught. repo-setup's own spec says the full check "would fail every bare
  runner," so it was never meant to gate a Node-only build runner.
- _Provision the full toolchain on the runner (including roborev)_ → rejected.
  It contradicts D6 ("provision Node only") and the kernel's dependency posture
  (D7), and installs a code-review daemon purely to satisfy a build smoke test.
- _Drop the check stage entirely_ → rejected. The ROADMAP/STACK.md describes the
  gate as `new-app.sh → setup.sh --check → build`; exercising the generated
  app's `setup.sh` entrypoint is part of the gate's value. The build-only scope
  preserves that while staying Node-only.

The build-essential set is `node` + `npm` because the entire build
(`prebuild` FAUST compile via the `@grame/faustwasm` npm dep, then `vite build`)
runs on Node/npm alone (D10 — no system FAUST). `--ci` is only valid alongside
`--check`, and argument order is irrelevant — both `--check --ci` and
`--ci --check` are equivalent. `--ci` without `--check`, or any other flag
combination the current parser rejects, stays a usage error (exit 2). The
existing full `--check` and default mode are untouched.

### D5 — Build only; no test or runtime stage

After the check, the build stage is `npm install && npm run build` and stops at
a successful build (the `prebuild` FAUST compile + `vite build` producing
`dist/`). The script asserts the build exits 0 and that a `dist/` artifact was
produced before declaring success.

**Why over also running tests:** re-running the preset's vitest here would
duplicate `preset-build`'s contract and blur which gate owns a failure. The
generated app inherits the same tests, but proving they pass is the *generated
app's own* CI concern once it exists as a repo — not the kernel's smoke gate,
whose single claim is "the emitted tree builds." Keeping the stages minimal also
keeps the gate's wall-clock and failure surface small.

### D6 — Job provisions Node via `.nvmrc` and checks out the repo; no FAUST, no npm cache

The rewritten `smoke-app` job mirrors the other jobs' step shape: `actions/checkout@v4`,
then `actions/setup-node` with `node-version-file: .nvmrc`, then one step that
runs `scripts/smoke-app.sh`. It installs no other tool.

**Why `actions/checkout@v4`:** every job in `ci.yml` starts with it; the stub
job omitted it only because an `echo` needs no source. The real pipeline runs a
committed script, so the source must be checked out (a gap the design review
caught).

**Why no FAUST step:** FAUST ships as the `@grame/faustwasm` npm dependency
(D10), pulled in by `npm install` inside the generated app. A system FAUST
install would contradict D10 and the kernel's dependency posture (D7).

**Why no `cache: npm`:** unlike `lint-format`/`preset-build`, this job's
`npm install` runs in a throwaway workspace against the generator's
intentionally-stale lockfile (D2). `setup-node`'s `cache: npm` keys on a
`package-lock.json` that does not yet reflect the resolved tree, so caching here
would be inconsistent for no benefit; the job omits it deliberately.

## Risks / Trade-offs

- **`npm install` network/registry flakiness in CI** → inherent to any npm
  build; `preset-build` already accepts this exact risk. No new mitigation
  needed beyond CI's standard retry-by-re-run.
- **FAUST compile + `vite build` make smoke-app the slowest job (est. 2–4 min)**
  → acceptable; it is one job, runs in parallel with the others, and its value
  (end-to-end buildability) justifies the cost. Build-only scope (D5) keeps it as
  small as the claim allows.
- **The new `--ci` scope could silently pass when a real build prereq is
  missing** → mitigated by a repo-setup spec scenario asserting `--check --ci`
  exits non-zero when `node` is absent/wrong-version, and exits 0 with only
  `node`+`npm` present (so the smoke gate genuinely gates on build readiness).
- **Adding a scope to `setup.sh` touches a slice-4 deliverable** → contained:
  the change is additive (a new `--ci` branch in `--check` mode), leaves the full
  `--check` and default mode untouched, and is covered by its own repo-setup
  delta + scenarios so the contract is explicit, not implicit.
- **`smoke-app.sh` could drift from `new-app.sh`'s flag interface** → the script
  consumes only `new-app.sh`'s documented flags (`--name`, `--output`,
  `--preset`); the gate runs the generator on every CI run, so any interface
  break surfaces immediately as a smoke-app failure.
- **A generated app that builds but is semantically wrong still passes** →
  out of scope by design (D5); buildability is the claim. Semantic/audio
  correctness is the generated app's own downstream concern.

## Migration Plan

Additive and reversible — the behavioral changes are one CI job body, one new
script, one additive `setup.sh` scope, and a STACK.md doc edit; rollback is
reverting the branch. Sequence (one commit per task, per CLAUDE.md): add the
`--check --ci` scope to `setup.sh` (lint clean, repo-setup scenarios honored) →
add `scripts/smoke-app.sh` → rewrite the `smoke-app` CI job to invoke it →
update `STACK.md`. After this slice the Phase-2 roadmap is complete: every slot
in the gate decomposition is live.

## Open Questions

None.
