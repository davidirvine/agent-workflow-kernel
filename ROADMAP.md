# Phase 2 Roadmap — building the kernel's deliverables

> **What this is:** the working plan for turning this bootstrapped repo into the full workflow kernel. It is a **map, not a set of changes** — each slice below is still born the normal way (`/opsx:propose` → roborev design-review → your approval → merge), drawing its content from the scope notes here. **The slicing is provisional: validate it with `/opsx:explore` before proposing slice 1.**
>
> **Full design:** the complete Phase-2 design lives in the synth-d repo at
> `/Users/dirvine/source/agent-workflow/openspec/changes/archive/2026-05-26-refactor-synth-d-chassis/design.md` (the "Phase 2" section). Read it before proposing — it has the decisions (new repo, Option-A preset, the three scripts, openspec partitioning, smoke-app CI, divergence lifecycle) in full.

## Context

This repo is the stack-agnostic workflow kernel extracted from synth-d (Phase 1 is done: synth-d's chassis was made instrument-agnostic — `param-schema.js`, `Shell`/`SubtractivePanels`, and the `chassis-architecture` + `chassis-theming` capabilities). This repo currently holds only the tooling to **self-host the OpenSpec workflow**; the slices below build the actual deliverables. **synth-d becomes the first consumer** of this kernel (slice 6).

## Slices (provisional — pressure-test before committing)

Ordered by dependency. Each is independently valuable and reviewable.

### Gate decomposition (resolved in explore, 2026-05-27)

The smoke-app (slice 5) is **not** an atomic test — it is a pipeline, `new-app.sh → setup.sh --check → npm build`, whose three stages each become testable the moment their producing slice lands. The original plan deferred all real verification to slice 5, which left slices 2–4 merging behind a **hollow gate**: shellcheck/prettier check syntax and formatting but say nothing about whether the generator emits a working app, the manifest is valid, or identity leaked. For a kernel whose product _is_ the discipline, a hollow gate is a credibility bug.

So each slice ships its own **acceptance check**, co-located with its deliverable. These are not extra work — they are slice 5 decomposed and pulled earlier so every merge is honestly gated; slice 5 then mostly _composes_ them plus the real end-to-end build. Each slice below carries an explicit **Gate:** line stating what its completion check actually verifies.

Only slice 1 is correctly gated by shellcheck/prettier alone, because its deliverable _is_ the gate (it proves itself on the next commit/push).

### 1. `kernel-dev-gates`

The kernel's own development infrastructure so later slices have a real completion gate: `.githooks` (shellcheck + prettier on commit; pre-push CI parity), a minimal lint/format CI workflow, and `release-please` config for this repo's own versioning. **Depends on:** nothing. **Why first:** until the repo has a working completion gate, every later slice's "tests pass" step is hollow.

Two harness-shaping responsibilities also land here so slices 2–4 have somewhere to hang their checks:

- **Smoke-app CI job as a skip/no-op stub.** Establish the smoke-app workflow's _shape_ now (a CI job that is allowed to be a pending no-op), so each later slice flips its own stage on and slice 5 only has to enable the full pipeline. "Tests pass" then means something incrementally instead of all-at-once.
- **Reconcile the roborev `post_commit_review` setting.** `.roborev.toml` still declares `post_commit_review = "commit"`, which is now inert (the auto-review `.git/hooks/post-commit` + `post-rewrite` hooks were removed on 2026-05-27 so reviews fire only at explicit gates), but it _reads_ like every commit is reviewed and a fresh `roborev init` would silently re-arm it. Make the committed `.githooks/post-commit` stub the deliberate, version-controlled statement of intent (the kernel's workflow lives in committed hooks, not ambient global state), and either drop the `post_commit_review` line or comment why it is inert.
- **Make the repo's own prettier gate runnable (bootstrap gap, found 2026-05-27).** STACK.md documents `npx prettier --write <file>` as the lint command for `*.md`/`*.json`/`*.toml`, but the repo has no `package.json`/`node_modules` and `.prettierrc` requires `prettier-plugin-svelte` + `prettier-plugin-toml` — so the documented command fails (it can only be run today by bypassing the config with `--no-config`). Slice 1 must land a minimal `package.json` pinning `prettier` and those two plugins as devDeps (plus the hook-installing `postinstall` that `scripts/install-hooks.sh` already expects), so every later slice's prettier gate is real rather than nominal.

**Gate:** shellcheck + prettier on the hook scripts and CI YAML. Sufficient here because the deliverable _is_ the gate.

### 2. `import-chassis-preset`

Bring synth-d's instrument-agnostic chassis into `presets/svelte-faust-synth/` (the `Shell`, `param-schema.js`, the tokenized components + `theme.css`, and the `chassis-architecture` + `chassis-theming` specs). Establish the **openspec partitioning**: tag specs with `tier: kernel | stack | instrument` frontmatter and generate the manifest that `sync-kernel.sh` will read. **Depends on:** 1. **Watch for:** synth-d-specific leakage in the chassis (package name, the `synth-d:` localStorage namespace, GitHub URLs, deploy paths) — these must be parameterized, not copied as-is (cf. the Phase-1 `MidiCcMap` finding).

**The preset is a buildable unit, not just copied files.** The smoke-app pipeline ends in `npm build`, so slice 2 must bring the build scaffolding (`package.json`, vite/svelte config, the FAUST build, deps) — not only `.svelte`/`.css`/`.js`. This makes "preset builds in isolation" slice 2's real acceptance bar, far stronger than "prettier clean," and it de-risks slice 5 by exercising the riskiest build dependency early. **The FAUST toolchain is provisioned in CI here (resolved 2026-05-27):** slice 2 is the first slice that runs a build, so it owns getting `faust` available in the CI runner (`setup.sh` only _verifies_ faust, never installs it).

**The reference instrument is minimal, NOT synth-d's subtractive synth (resolved 2026-05-27).** A bare chassis (Shell + generic components) renders no working synth — its panel slot is empty, there is no DSP or schema — so the preset must carry _some_ instrument to be buildable. It carries a deliberately minimal one, not the full subtractive synth, so the preset reads as a comprehensible "hello-world" a newcomer can extend:

- **single oscillator**; **waveform selector** (`kind: 'switch'`); **frequency knob** (`kind: 'knob'`, `ccScalable: true`, not bipolar) that owns the oscillator's resting pitch. This is the minimal set that exercises both store-backed descriptor kinds plus the CC-scaling path (`KNOB_PARAMS`, `powerOffValue`).
- **Held keys override pitch via the `gate` contract:** `pitch = gate ? freq : knobFreq` (FAUST `select2`). It therefore consumes _both_ universal note params (`freq` and `gate`), and must expose `outputPeak` so the chassis scope/level-LED light up. (`mixerPeak` is also exposed as a constant `0`: design D11 in this slice's proposal reverses the earlier "not required" assumption — every DSP exposes the five universal params uniformly, since chassis modules read `mixerPeak`, and the reference instrument fulfills the contract with a constant since it has no mixer panel.)
- **It drones** — continuous amplitude, no envelope — because the knob's pitch is only audible when no key is held. This is simpler (no AmpEnv) and gives immediate "it works" feedback on power-on. **Consequence:** this is the instrument that actually tests the chassis _power-off-silence_ path (a gated instrument is silent by default and never exercises it), so slice 2 must wire the reference instrument to honor the power lifecycle — go silent when powered off, not merely set the freq knob to its `powerOffValue` — and verify it.

`new-app.sh` (slice 3) blanks this reference instrument when generating a fresh app; the preset keeps it so the preset stays buildable and is a worked example.

**Gate:** four checks. Note that (b) and (c) are **distinct checks guarding different things with opposite dependence on a populated schema** — the original plan conflated them, which is the trap:

- **(a) manifest-validate** — the generated sync manifest is well-formed and every tier-tagged spec is accounted for.
- **(b) identity-leak (denylist, schema-independent)** — no `synth-d` package name, `synth-d:` localStorage namespace, GitHub URL, or deploy path survives unparameterized. This guards the donor's _identity_ and needs no schema; it catches the `synth-d:` namespace, which lives in the **chassis** `patches/storage.js` (Phase 1 deliberately left it un-renamed), so slice 2 must parameterize it — a token the preset carries and `new-app.sh` injects with the new app's name — and assert no raw `synth-d:` remains.
- **(c) chassis-purity extraction audit (allowlist, schema-DERIVED)** — synth-d's `chassis-purity.test.js` builds its forbidden set as `keys(PARAM_SCHEMA) − {freq,gate,modWheel,mixerPeak,outputPeak}`. That is what catches _unknown_ instrument leaks (the `MidiCcMap` finding implies they exist) — but it **goes vacuous on a blank/minimal schema**, exactly the state the minimal reference instrument creates. So the one-time extraction audit MUST run against the chassis **while synth-d's FULL subtractive vocabulary is the forbidden list** (use the donor schema / a throwaway fixture as the name source); otherwise residual `cutoff`/`osc1Level`/`reverbMix` literals left in chassis files are no longer "in the schema" and the test goes blind to them. The purity test still **travels** with the chassis spec (it is the `chassis-architecture` capability guarding the user's _future_ instrument) where it is "vacuous-but-correct" against the small reference schema and strengthens as the user adds params — but the kernel's own smoke-app gate must NOT rely on it for the extraction audit, since smoke-app builds a blanked app where it is vacuous.
- **(d) `npm ci && npm build`** succeeds on the preset (with its reference instrument).

### 3. `new-app-generator`

`new-app.sh` — emit a fresh app from kernel Tier-1 + a chosen `--preset`: copy the preset, blank the instrument (Tier 3), reset version → `0.1.0`, empty `changes/`, rename package + namespace, `git init`. **Depends on:** 2 (needs a preset to emit).

**Gate:** a committed `generate-assert` check, shipped as a script in `scripts/` (resolved 2026-05-27 — a script, not workflow YAML, because the kernel will eventually want to _ship_ this test to consumers). It runs `new-app.sh` and asserts the emitted tree: expected files present, package + namespace renamed, version reset to `0.1.0`, `changes/` empty, and no `synth-d` identity leaked. This is the generate-only stage of the smoke pipeline — it needs the slice-2 preset but not `setup.sh` or a build, so it is the first end-to-end exercise of the generator.

### 4. `kernel-sync-and-setup`

`sync-kernel.sh` (re-pull Tier-1 + kernel specs into an existing app via the manifest; **clobber-protection** for locally-modified synced files; a **kernel-version stamp** so sync is a deliberate bump, not an unbounded pull) and `setup.sh` (idempotent; `--check` mode CI reuses; _does_ the repo-local deterministic work, _verifies_ global prereqs and instructs rather than auto-installing). **Depends on:** 2 (manifest).

**Gate:** committed scripts (same rationale as slice 3) that exercise the next two pipeline stages against slice 3's emitted app as a fixture: (a) a sync round-trip assert — `sync-kernel.sh` pulls the manifest's Tier-1 + kernel specs, clobber-protection refuses to overwrite a locally-modified synced file, and the version stamp advances deliberately; (b) `setup.sh --check` succeeds on the fixture (repo-local work done, global prereqs reported, nothing auto-installed).

### 5. `smoke-app-ci`

The kernel's signature gate: CI runs `new-app.sh` → `setup.sh --check` → build, proving the generator emits a working app (this repo has no instrument suite of its own, so this is how it tests itself). **Depends on:** 3, 4.

**Integration capstone, not first contact.** Under the gate-decomposition above, slices 2–4 have already exercised each stage in isolation (preset build, generate-assert, sync round-trip, `setup --check`). Slice 5's job is to (a) flip slice 1's skip-stub smoke job to the real pipeline, (b) _compose_ those stage checks into one end-to-end run, and (c) add the one stage no earlier slice covers: the real `npm build` of the fully generated-and-set-up app. **Gate:** the full `new-app.sh → setup.sh --check → npm build` pipeline is green in CI.

### 6. `retrofit-synth-d-consumer` — **in the synth-d repo, not here**

Wire synth-d to consume this kernel via `sync-kernel.sh`, so it becomes the first consumer rather than a second diverging donor. **Depends on:** 4. **Note:** this change lives in `synth-d`'s OpenSpec flow, not this repo's.

## Dependency graph

```
1 kernel-dev-gates
        │
        ▼
2 import-chassis-preset ──┬──▶ 3 new-app-generator ──┐
                          │                            ├──▶ 5 smoke-app-ci
                          └──▶ 4 kernel-sync-and-setup ─┘
                                       │
                                       ▼
                              6 retrofit-synth-d-consumer  (in synth-d)
```

## How to proceed in this window

1. **Setup once:** run `roborev init` here (roborev tracks repos individually; the proposal design-review gate needs it).
2. **Validate the slicing:** `/opsx:explore` — paste these slices and attack the ordering, the first-slice choice, and the riskiest unknown (the preset's hidden coupling and the bootstrap circularity of the smoke-app gate are prime targets). Revise this file if the plan changes.
3. **Build slice by slice:** `/opsx:propose <slice>` → design-review → approve → `/opsx-apply-wt <slice>` → `/opsx:apply` → finalize. One slice at a time, in dependency order.
