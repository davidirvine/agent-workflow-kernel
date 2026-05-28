## Context

ROADMAP slice 2 brings synth-d's Phase-1 instrument-agnostic chassis into this kernel as `presets/svelte-faust-synth/`, establishes the openspec tier partitioning + sync manifest so slice 4's `sync-kernel.sh` knows what to pull, and ships a deliberately minimal reference instrument so the preset is buildable in isolation. The decisions on the **reference instrument** (single droning oscillator with waveform selector + frequency knob; pitch = `gate ? freq : knobFreq`) and the **split slice-2 gate** (manifest-validate; schema-independent identity-leak; schema-derived chassis-purity extraction audit run against synth-d's full subtractive vocabulary; `npm ci && npm build`) were locked during the explore phase on 2026-05-27 and recorded in `ROADMAP.md`. This design captures the remaining mechanism choices.

## Goals / Non-Goals

**Goals:**

- Stand up `presets/svelte-faust-synth/` as a self-contained, buildable preset carrying the chassis + a minimal reference instrument.
- Bring the `chassis-architecture` and `chassis-theming` capabilities into this repo, adapted for kernel-tier (Phase-1-only requirements dropped).
- Introduce the `preset-portability` capability: tier frontmatter, the sync manifest, donor-identity parameterization, self-contained buildability, and the reference-instrument contract.
- Catch every residual donor-identity and chassis-purity leak from the synth-d extraction before this slice merges.
- Provision the FAUST toolchain in CI and add a `preset-build` job and a `preset-leak-check` job; leave the `smoke-app` stub for slice 5.

**Non-Goals:**

- No `new-app.sh` / `sync-kernel.sh` / `setup.sh` (slices 3–4). This slice defines the manifest format/contract; the script that consumes it is slice 4.
- No wiring the `smoke-app` CI job to a full pipeline (slice 5).
- No renaming the `synth-d:` namespace in the donor repo (synth-d-side concern, out of scope here).
- No expanding the chassis ↔ instrument seam beyond the param-schema contract (e.g. schema-driven panel generation).
- No alternative presets (only `svelte-faust-synth`); other presets are future work.

## Decisions

### D1 — The preset is a self-contained build unit; root config does not reach into it

`presets/svelte-faust-synth/` carries its **own** `package.json`, `.prettierrc`, `vite.config.js`, `svelte.config.js`, `package-lock.json`, and `node_modules/` (ignored). The kernel root's `package.json` (slice 1) and `.prettierrc` (slice 1, Svelte-trimmed) remain unchanged and do not format / depend on preset code. **Why:** clean tiering — the preset owns its build/format toolchain (Svelte plugin, vite, FAUST glue) because it is the unit that builds into a running app; pulling those into the root would couple the kernel to the preset's stack. The slice-1 root `checks.sh` discovers files via `git ls-files` and the preset has its own `prettier --check` inside its own `npm scripts`, invoked by the preset-build CI job (D7). **Alternative considered:** hoist preset deps to root — rejected (would force the kernel to carry Svelte/Vite/FAUST tooling it does not itself need).

### D2 — Tier partitioning is `tier:` frontmatter on every spec, with the sync manifest as the projection

Every spec file under `openspec/specs/` gets a `tier:` frontmatter field (`kernel`, `stack`, or `instrument`). Slice 1's `dev-gates` and `release-automation` specs are back-tagged `tier: kernel` here. New specs in this slice tag themselves: `chassis-architecture` → `stack`, `chassis-theming` → `stack`, `preset-portability` → `kernel`. The **sync manifest** is a separate machine-readable file that lists all paths that travel via `sync-kernel.sh`, grouped by tier — for specs, the manifest's listed paths SHALL agree with their frontmatter (the manifest-validate gate enforces this); for non-spec paths (scripts, hooks, CI workflow, release-please config), the manifest is the sole declaration. **Why frontmatter + manifest, not just one:** frontmatter is per-file authorial intent (the spec author tags its tier); the manifest is the projection a tool reads. Keeping them separated means a single source for spec-tier (frontmatter) while still allowing the manifest to list non-spec paths and to be linted against. **Alternative considered:** directory-based partitioning (`openspec/specs/kernel/<cap>/spec.md`) — rejected because the established OpenSpec layout is `openspec/specs/<capability>/spec.md`; adding tier directories fragments per-capability discoverability and forces OpenSpec tooling to learn the layout.

### D3 — Sync manifest is JSON at the repo root: `kernel-manifest.json`

The manifest lives at `kernel-manifest.json` (repo root) — JSON for universal tooling compatibility (jq, node, plain shell with `python -m json.tool`). Shape (illustrative; precise schema fixed in implementation):

```json
{
  "version": 1,
  "kernel": {
    "paths": [".githooks/**", ".github/workflows/**", "scripts/**", "release-please-config.json", "..."],
    "specs": ["openspec/specs/dev-gates/spec.md", "openspec/specs/release-automation/spec.md", "openspec/specs/preset-portability/spec.md"]
  },
  "stack": {
    "presets/svelte-faust-synth": {
      "paths": ["src/chassis/**", "src/components/Shell.svelte", "..."],
      "specs": ["openspec/specs/chassis-architecture/spec.md", "openspec/specs/chassis-theming/spec.md"]
    }
  }
}
```

**Why repo root, not under `openspec/`:** the manifest covers scripts, hooks, workflows, configs — not only openspec specs — so locating it under `openspec/` would mislead. **Why JSON over YAML/TOML:** the kernel deliberately stays bash-friendly; JSON has zero parser-install friction. **Alternative considered:** auto-generate the manifest purely from frontmatter — rejected because non-spec paths (`.githooks/`, `scripts/`) have no frontmatter; an explicit manifest is the single source of truth that the kernel can lint, and frontmatter ↔ manifest agreement is the validation that catches drift.

### D4 — Donor-identity parameterization: constructor injection with the sentinel token at the Shell instantiation site

The only identified donor-identity literal in chassis code is the **`synth-d:` localStorage namespace** in `patches/storage.js` (Phase 1 deliberately left it un-renamed). `patches/storage.js` is refactored to **accept the namespace via its constructor** — mirroring the Phase-1 `MidiCcMap` pattern that constructor-injects the rename table. The chassis `Shell` constructs storage with the value `__APP_NAMESPACE__` (the sentinel as a string argument). `new-app.sh` (slice 3) substitutes the sentinel at the **single Shell instantiation site** at generate time; the identity-leak check (D8) asserts no raw `synth-d:` survives and no un-substituted `__APP_NAMESPACE__` survives outside that one site.

**Why constructor injection over a raw token in `storage.js`:** the storage module stays a clean unit (its tests pass an explicit namespace; no raw token in business logic), there is exactly **one** substitution point for `new-app.sh` to handle (the Shell), and the pattern is symmetric with the established Phase-1 `MidiCcMap` constructor-injection — readers already know the shape. **Why not a runtime config object the chassis reads:** that would expand the chassis↔app seam by one more thing the app must provide, in exchange for moving exactly one literal; constructor injection keeps the seam unchanged because storage is chassis-internal — the Shell already owns its instantiation. **Alternative considered:** raw `__APP_NAMESPACE__` token literal directly inside `storage.js` (the earlier framing) — rejected, because it forces `new-app.sh` to substitute deep in chassis source and leaves a sentinel in business logic that the identity-leak check has to keep allowlisted there.

**Fallback for additional donor-identity literals (task 4.2):** if the audit discovers further literals (GitHub URLs naming the donor, deploy paths, package-name references), they are parameterized via the **same** constructor-injection-at-Shell pattern unless one warrants a different approach — in which case the design is updated and the slice re-reviewed before the literal is touched, not resolved mid-implementation.

### D5 — Reference instrument honors the chassis power-lifecycle as a hard requirement

Per the ROADMAP-locked design (single oscillator, waveform selector, frequency knob, `pitch = gate ? freq : knobFreq`, drones), the instrument's continuous amplitude makes it the **first** instrument that exercises the chassis power-off-silence path. The chassis power button must mute the engine output regardless of whether `gate` is high — a gated instrument is silent by default and never tests this. **Implementation consequence:** the chassis power lifecycle is the canonical place this is enforced (e.g. master mute on power-off); the reference instrument is the test case that surfaces it. **Why not gate the drone via a separate "audible" param:** that would re-introduce an amplitude envelope and defeat the minimal-instrument goal; the chassis power button already exists for this. **UX consequence (accepted):** powering on emits an immediate audible tone — fitting for a "hello world" demo (instant confirmation it works), and the power button is right there to stop it.

### D6 — Two purity activities, two artifacts: one-time extraction audit + traveling test

The **one-time extraction audit** runs during this slice's implementation: a script reads a committed fixture of synth-d's full subtractive param-name list (`audit/synthd-instrument-params.json` under this change directory) and asserts no name appears in chassis files. The fixture is committed to the change directory and archived with the change — the audit evidence is preserved for review. The **traveling chassis-purity test** ships at `presets/svelte-faust-synth/src/chassis-purity.test.js`, mirroring synth-d's: it derives its forbidden set from the **current** schema (`keys(PARAM_SCHEMA) − {freq,gate,modWheel,mixerPeak,outputPeak}`) and runs in the preset-build CI job. Against the minimal reference schema it is "vacuous-but-correct" (forbids the reference instrument's names in chassis, which is the right invariant), and strengthens automatically as a downstream app adds params. **Why two artifacts:** the extraction audit and the traveling test guard different windows in time (the one-time copy vs ongoing chassis purity) with different forbidden-list sources (donor's full vocabulary vs current schema); collapsing them creates the vacuous-test trap documented in `ROADMAP.md`.

### D7 — CI gains FAUST + two new jobs alongside slice 1's lint job; smoke-app stays a stub

CI provisions the FAUST toolchain (pinned version — see Open Questions) and adds two jobs:

- **`preset-build`** — `npm ci && npm run build` inside `presets/svelte-faust-synth/`; also runs the preset's own lint/format and the traveling chassis-purity test. Proves the bare preset is buildable (slice-2 gate (d)).
- **`preset-leak-check`** — runs the schema-independent identity-leak denylist and the manifest-validate (frontmatter ↔ manifest agreement) check (slice-2 gates (a), (b)).

The slice-1 `smoke-app` stub stays as it is — slice 5 turns it into the integration pipeline. **Why split into two new jobs over folding into smoke-app:** each slice's gate lives in its own job (per ROADMAP gate-decomposition), so failures point at the slice responsible; smoke-app composes everything in slice 5 without inheriting bisection ambiguity.

### D8 — The four gate checks are scripts, not workflow YAML

The slice-2 gate checks live in committed scripts (`scripts/check-identity-leak.sh`, `scripts/check-manifest.sh`, the audit runner, and the preset's own build/test invoked via `npm`). CI jobs call the scripts; the scripts are runnable locally and can be shipped to consumers later. **Why:** same rationale as slice 3's generate-assert decision in ROADMAP — the kernel wants to _ship_ these checks downstream. Embedding logic in workflow YAML traps them in CI.

### D9 — Sync new specs into `openspec/specs/` during implementation, not at archive

Slice 1 followed the standard OpenSpec convention: deltas live under the change directory, and the archive-time sync moves them into `openspec/specs/`. That works when no CI gate references the canonical spec tree before the change archives. This slice **does** — `scripts/check-manifest.sh` (D8) asserts that every kernel-/stack-tier spec listed in `kernel-manifest.json` exists at its `openspec/specs/<cap>/spec.md` path, and that check runs in CI from the first push. So this slice creates `openspec/specs/{chassis-architecture,chassis-theming,preset-portability}/spec.md` **during implementation** (task 5.1) by syncing each delta's content (dropping the `## ADDED Requirements` header, keeping the `tier:` frontmatter and a Purpose section). The archive-time sync becomes a no-op refresh. **Why not defer manifest-validate to archive time:** the manifest is the contract that `sync-kernel.sh` will consume; validating it only at archive removes the gate from CI feedback during implementation — the exact "hollow gate" the ROADMAP gate-decomposition was written to avoid. **Why not teach `check-manifest.sh` to read pending deltas:** that conflates the canonical spec tree with in-flight changes; the canonical tree is what `sync-kernel.sh` ships downstream, so it must be accurate at every push, not only at archive.

### D10 — FAUST compiles via a `prebuild` npm script invoked before Vite

The preset's `package.json` declares a `"prebuild"` npm script that invokes `faust2wasm` (or the equivalent generator) to compile `faust/synth.dsp` into the `public/` outputs Vite picks up (e.g. `public/synth.wasm` + the JSON metadata). `npm run build` therefore runs `prebuild` → `vite build` atomically. **Why a npm `prebuild` script over a Vite plugin:** the `prebuild` lifecycle is built-in (no custom plugin to maintain), the compilation is one fan-out call out to a shell tool (FAUST CLI), and any subsequent change can layer a Vite plugin later if HMR-on-DSP-edit becomes desirable. **Consequence:** the FAUST compiler MUST be on `$PATH` for `npm run build` to succeed; CI provisions it at the pinned version (D7), the preset's `npm run build` does not attempt to install FAUST, and slice 4's `setup.sh --check` will verify the local install matches the CI pin. The reference DSP is small, so `prebuild` is fast; if it ever becomes noticeable, a `prebuild`-skip / cache flag is a later optimization.

### D11 — Reference DSP exposes both `mixerPeak` and `outputPeak`, even without a mixer panel

Per `chassis-architecture`, the chassis reads both `mixerPeak` and `outputPeak` from the engine. The minimal reference instrument has no Mixer panel, but the DSP SHALL still expose `mixerPeak` (as a constant `0`) so that the universal engine contract is uniformly honored by every preset's DSP regardless of which panels the instrument exposes. **Why expose-constant over chassis-handles-absent:** the contract reads cleanly as "every DSP exposes the five universal params" — no conditional code path in the chassis to handle a missing param, no undefined behavior on FAUST parameter binding. Exposing a constant `0` is one line of FAUST and preserves the contract's clean five-param shape. **Alternative considered:** make `mixerPeak` optional and have the chassis gracefully handle absence — rejected as adding a per-DSP variability that the contract is precisely meant to eliminate.

**ROADMAP reversal (acknowledged):** `ROADMAP.md` slice 2 says "`mixerPeak` is read by a Mixer panel this instrument does not have, so it is not required." That was the explore-phase working assumption. The chassis-architecture spec's universal-contract scenario shows that assumption is wrong — chassis modules read `mixerPeak`, so a DSP that omits it has undefined behavior. D11 reverses the ROADMAP note; `ROADMAP.md` is updated in this slice to match (task 0.1).

## Risks / Trade-offs

- **Extraction surfaces unknown leaks (the `MidiCcMap` finding implies they exist)** → the one-time extraction audit (D6) catches them deterministically against synth-d's full param list; resolve every flagged file before this slice merges. If a leak cannot be removed (e.g. a name happens to also be a common English word matching word-boundary), it goes on an explicit allowlist in the audit fixture with a per-entry rationale.
- **The reference instrument's drone is audible on power-on (D5)** → accepted as a "hello world" feature; the power button stops it. Document it in the preset's README.
- **FAUST version drift between local devs and CI** → pin in CI (Open Questions); slice 4's `setup.sh --check` will verify local matches.
- **Tokenized namespace leaks if `new-app.sh` misses a file** → covered by the identity-leak denylist running on the generated app in slice 3; if a token survives un-substituted, slice 3's gate fails (the slice-2 token approach is safe only because slice 3's gate catches the mis-substitution).
- **Chassis comments / docstrings still mention "synth-d"** → the identity-leak denylist scopes to a curated file set (chassis source, preset config, theme.css, the storage namespace) and explicitly excludes README/CHANGELOG history files where "synth-d" is correctly referenced as the donor; the included scope is defined in `scripts/check-identity-leak.sh`.
- **Bare-word "synth" in filenames (`state/synth.svelte.js`, `faust/synth.dsp`)** → intentional and correct. The kernel-wide synth→app rename was for the _general generated-thing_ term (`new-app.sh`, "smoke-app"); this preset is specifically `svelte-faust-synth` and its output _is_ a synth, so domain-named files keep that vocabulary. The identity-leak denylist targets the **donor-namespace literal `synth-d:`**, not bare-word `synth`, by design.
- **Preset `.sh` files swept by root `checks.sh`** → the preset has none today (it is Node-based; the FAUST build is a Vite-pipeline `prebuild` JS script per D10, not a shell script). If a preset ever introduces a `.sh` file, it will be discovered by `git ls-files '*.sh'` in the root `checks.sh` and linted by the root's shellcheck/shfmt; that is acceptable (the same standard applies repo-wide). No action needed unless the preset adds shell scripts whose conventions diverge from the root's.
- **`patches/storage.js` constructor change has test-update fallout** → the storage tests in synth-d call the existing constructor; the preset's copy refactors the constructor (D4). Task 4.1 updates the tests to pass an explicit namespace at construction — a mechanical signature change, not a weakened assertion (analogous to the Phase-1 `MidiCcMap` test updates).
- **Back-tagging slice 1's specs with `tier: kernel` frontmatter is a content change to canonical specs already on `main`** → done as a task here, not retroactively in slice 1; release-please sees this commit as `chore` (no bump) per CLAUDE.md.
- **Manifest drift vs frontmatter** → manifest-validate gate is the safety net; any spec whose frontmatter disagrees with the manifest fails the check.
- **The preset's `package-lock.json` is committed and must stay in sync with `package.json`** → standard `npm` discipline; `npm ci` in `preset-build` fails fast on a drift.

## Migration Plan

Additive; rollback is reverting the branch. Sequence (one commit per task):

1. Scaffold `presets/svelte-faust-synth/` with `package.json` + svelte/vite config + the preset's own `.prettierrc`. Add `presets/svelte-faust-synth/node_modules/` to root `.gitignore`.
2. Copy chassis source from synth-d into the preset, preserving structure (chassis components, audio engine, MIDI, keyboard, store, patches storage). Adapt comments and identifiers that name `synth-d` as the donor (history references) vs as identity (chassis behavior) — only the latter are removed.
3. Write `param-schema.js` for the reference instrument and the reference instrument's DSP (`faust/synth.dsp`) + panel component(s).
4. Parameterize `patches/storage.js`'s namespace via the `__APP_NAMESPACE__` token.
5. Sync all three new capability specs into `openspec/specs/` **during implementation**, not just as deltas: `openspec/specs/chassis-architecture/spec.md` and `openspec/specs/chassis-theming/spec.md` (adapted from synth-d, Phase-1-only requirements dropped), and `openspec/specs/preset-portability/spec.md` (net-new kernel capability). All three carry the `tier:` frontmatter (`stack`, `stack`, `kernel`). The archive-time sync of the deltas will then be a no-op refresh. This early sync is required because `check-manifest.sh` (task 7.2) and the CI `preset-leak-check` job assert that every kernel-/stack-tier spec listed in the manifest exists on disk — without it, manifest-validate would fail throughout implementation.
6. Back-tag slice 1's `dev-gates` and `release-automation` specs with `tier: kernel`.
7. Write `kernel-manifest.json` at repo root.
8. Add `scripts/check-identity-leak.sh` and `scripts/check-manifest.sh`. Commit the audit fixture under this change directory.
9. Run the one-time extraction audit; resolve every leak before continuing.
10. Add the traveling `chassis-purity.test.js` inside the preset.
11. Extend `.github/workflows/ci.yml`: install FAUST, add `preset-build` and `preset-leak-check` jobs.
12. Verify all four gates (a)–(d) green locally + in CI before requesting merge.

## Open Questions

- **FAUST pinned version:** match what synth-d currently uses (need a quick `faust --version` capture from the synth-d toolchain); confirm before task 11.
- **`kernel-manifest.json` exact schema:** the illustrative shape in D3 is the starting point; the precise schema is fixed during task 7 implementation and validated by `scripts/check-manifest.sh`.
- **`patches/storage.js` token name:** `__APP_NAMESPACE__` is the working name; bikeshed acceptable, but the convention (sentinel-style ALL_CAPS surrounded by `__`) should be used consistently so the identity-leak denylist can also assert no un-substituted tokens leak (a different leak from the donor-identity one).
