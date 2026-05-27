# Phase 2 Roadmap — building the kernel's deliverables

> **What this is:** the working plan for turning this bootstrapped repo into the full workflow kernel. It is a **map, not a set of changes** — each slice below is still born the normal way (`/opsx:propose` → roborev design-review → your approval → merge), drawing its content from the scope notes here. **The slicing is provisional: validate it with `/opsx:explore` before proposing slice 1.**
>
> **Full design:** the complete Phase-2 design lives in the synth-d repo at
> `/Users/dirvine/source/agent-workflow/openspec/changes/archive/2026-05-26-refactor-synth-d-chassis/design.md` (the "Phase 2" section). Read it before proposing — it has the decisions (new repo, Option-A preset, the three scripts, openspec partitioning, smoke-synth CI, divergence lifecycle) in full.

## Context

This repo is the stack-agnostic workflow kernel extracted from synth-d (Phase 1 is done: synth-d's chassis was made instrument-agnostic — `param-schema.js`, `Shell`/`SubtractivePanels`, and the `chassis-architecture` + `chassis-theming` capabilities). This repo currently holds only the tooling to **self-host the OpenSpec workflow**; the slices below build the actual deliverables. **synth-d becomes the first consumer** of this kernel (slice 6).

## Slices (provisional — pressure-test before committing)

Ordered by dependency. Each is independently valuable and reviewable.

### 1. `kernel-dev-gates`

The kernel's own development infrastructure so later slices have a real completion gate: `.githooks` (shellcheck + prettier on commit; pre-push CI parity), a minimal lint/format CI workflow, and `release-please` config for this repo's own versioning. **Depends on:** nothing. **Why first:** until the repo has a working completion gate, every later slice's "tests pass" step is hollow.

### 2. `import-chassis-preset`

Bring synth-d's instrument-agnostic chassis into `presets/svelte-faust-synth/` (the `Shell`, `param-schema.js`, the tokenized components + `theme.css`, and the `chassis-architecture` + `chassis-theming` specs). Establish the **openspec partitioning**: tag specs with `tier: kernel | stack | instrument` frontmatter and generate the manifest that `sync-kernel.sh` will read. **Depends on:** 1. **Watch for:** synth-d-specific leakage in the chassis (package name, the `synth-d:` localStorage namespace, GitHub URLs, deploy paths) — these must be parameterized, not copied as-is (cf. the Phase-1 `MidiCcMap` finding).

### 3. `new-synth-generator`

`new-synth.sh` — emit a fresh synth from kernel Tier-1 + a chosen `--preset`: copy the preset, blank the instrument (Tier 3), reset version → `0.1.0`, empty `changes/`, rename package + namespace, `git init`. **Depends on:** 2 (needs a preset to emit).

### 4. `kernel-sync-and-setup`

`sync-kernel.sh` (re-pull Tier-1 + kernel specs into an existing synth via the manifest; **clobber-protection** for locally-modified synced files; a **kernel-version stamp** so sync is a deliberate bump, not an unbounded pull) and `setup.sh` (idempotent; `--check` mode CI reuses; *does* the repo-local deterministic work, *verifies* global prereqs and instructs rather than auto-installing). **Depends on:** 2 (manifest).

### 5. `smoke-synth-ci`

The kernel's signature gate: CI runs `new-synth.sh` → `setup.sh --check` → build, proving the generator emits a working synth (this repo has no instrument suite of its own, so this is how it tests itself). **Depends on:** 3, 4.

### 6. `retrofit-synth-d-consumer` — **in the synth-d repo, not here**

Wire synth-d to consume this kernel via `sync-kernel.sh`, so it becomes the first consumer rather than a second diverging donor. **Depends on:** 4. **Note:** this change lives in `synth-d`'s OpenSpec flow, not this repo's.

## Dependency graph

```
1 kernel-dev-gates
        │
        ▼
2 import-chassis-preset ──┬──▶ 3 new-synth-generator ──┐
                          │                            ├──▶ 5 smoke-synth-ci
                          └──▶ 4 kernel-sync-and-setup ─┘
                                       │
                                       ▼
                              6 retrofit-synth-d-consumer  (in synth-d)
```

## How to proceed in this window

1. **Setup once:** run `roborev init` here (roborev tracks repos individually; the proposal design-review gate needs it).
2. **Validate the slicing:** `/opsx:explore` — paste these slices and attack the ordering, the first-slice choice, and the riskiest unknown (the preset's hidden coupling and the bootstrap circularity of the smoke-synth gate are prime targets). Revise this file if the plan changes.
3. **Build slice by slice:** `/opsx:propose <slice>` → design-review → approve → `/opsx-apply-wt <slice>` → `/opsx:apply` → finalize. One slice at a time, in dependency order.
