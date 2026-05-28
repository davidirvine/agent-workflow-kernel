## 0. Preflight (resolve load-bearing unknowns before scaffolding)

- [x] 0.1 Capture the FAUST pin: per design D10, FAUST is the `@grame/faustwasm` npm package, **not a system tool**. Read synth-d's `main` HEAD `package.json` (resolve the synth-d repo path as `${SYNTHD_REPO:-/Users/dirvine/source/agent-workflow}`) and synth-d's `main` `package-lock.json` to record the declared range and resolved version. Capture the synth-d HEAD SHA used as the source of truth. Reference these in section 3's prerequisite note instead of pinning a separate FAUST version in `STACK.md` (the preset's own `package-lock.json` is the operational pin once task 1.2 lands). No `STACK.md` edit is required by this task; task 10.5 handles the prerequisite documentation.
- [x] 0.2 Update `ROADMAP.md` slice 2 to reflect design D11's `mixerPeak` resolution: replace the line that says `mixerPeak` is "not required" with a note that D11 reverses that initial assumption (every DSP exposes the five universal params; the reference instrument exposes `mixerPeak` as constant `0`). Commit as `docs: align ROADMAP slice 2 mixerPeak note with D11`.

## 1. Preset scaffold (self-contained build unit)

- [x] 1.1 Create `presets/svelte-faust-synth/` with its own `package.json` (Svelte/Vite/FAUST-glue runtime + dev deps **including `vitest` for the chassis-purity and power-off-silence tests**; the Svelte plugin lives here, not in the root), `vite.config.js`, `svelte.config.js`, `.prettierrc` (Svelte-aware), and `index.html`. Add `presets/svelte-faust-synth/node_modules/` to the root `.gitignore`.
- [x] 1.2 Run `npm install` inside the preset; commit the resulting `package-lock.json` so `npm ci` is reproducible.
- [x] 1.3 Add `presets/` to the **root** `.prettierignore` so the root `scripts/checks.sh` does not attempt to format preset files with the root (Svelte-trimmed) prettier config; the preset formats its own files via its own `npm run lint`/`prettier --check` from its Svelte-aware config.

## 2. Import chassis source from synth-d

- [x] 2.1 Copy chassis components into `presets/svelte-faust-synth/src/components/` (`Shell.svelte`, `Knob`, `Wheel`, `WheelsPanel`, `Keyboard` + harness, `PowerButton`, `MidiStatus`, `PatchControl`, `Scope`, `LevelLed`, `EmptyPanel`, `RegisterPanel`), preserving Phase-1's chassis-purity (no instrument imports).
- [x] 2.2 Copy chassis audio modules into `presets/svelte-faust-synth/src/audio/` (`engine`, `keyboard`, `math`, `midi`, `midiCcMap`, `pitchbend`, `wheelPhysics`, `wheelPhysicsStore`).
- [x] 2.3 Copy chassis state machinery (`state/synth.svelte.js`) and patches storage (`patches/storage.js`) into the preset, preserving derivation-from-schema.
- [x] 2.4 Copy `theme.css` and the tokenized component CSS, preserving the palette/component-token layering.

## 3. Reference instrument (minimal droning oscillator)

> **Prerequisite for this section:** FAUST comes from the `@grame/faustwasm` npm package per design D10 — no system FAUST install is required. Task 1.2's `npm install` provisions it via the preset's `package.json` / lockfile. Verify with `ls presets/svelte-faust-synth/node_modules/@grame/faustwasm/scripts/faust2wasm.js` before starting tasks 3.2 and 3.5.
>
> **FAUST pin (captured by task 0.1, 2026-05-28):** synth-d `main` at SHA `09c5bf63f16e5b89ed2050fc75def0a4f39c31f6` declares `@grame/faustwasm: "^0.16.1"` in `package.json` and resolves it to `0.16.1` in `package-lock.json` (tarball `https://registry.npmjs.org/@grame/faustwasm/-/faustwasm-0.16.1.tgz`). The preset adopts the same declared range; the resolved version is fixed by task 1.2's `npm install` + the resulting `package-lock.json`.

- [x] 3.1 Write `presets/svelte-faust-synth/src/param-schema.js` declaring the reference instrument's schema: a `frequency` knob (`kind: 'knob'`, `ccScalable: true`, bounds 20–2000 Hz, not bipolar) and a `waveform` switch (`kind: 'switch'`, e.g. {sine, triangle, square, saw}). Include `modWheel` as `kind: 'controller'`, `ccScalable: true` per the chassis seam. Export the schema-derived collections (`PARAM_DEFAULTS`, `PARAM_NAMES`, `AUDIO_PARAMS`, `KNOB_PARAMS`, `BIPOLAR_PARAMS`, `powerOffValue`) consistent with `chassis-architecture` spec scenarios.
- [x] 3.2 Write `presets/svelte-faust-synth/faust/synth.dsp`: single oscillator, waveform selector reading the schema's switch values, **pitch = `select2(gate, knobFreq, freq)`** (held key wins; otherwise knob), continuous amplitude (drone), exposes **both** `outputPeak` (real meter readback) **and** `mixerPeak` as constant `0` per design D11 (the universal engine contract is uniformly five params; this instrument has no mixer panel so `mixerPeak` is a constant). Wire FAUST → engine glue using the `prebuild` npm script approach per D10: the script invokes the `@grame/faustwasm` package's shipped compile script (`node node_modules/@grame/faustwasm/scripts/faust2wasm.js faust/synth.dsp public/`), mirroring synth-d's `faust:build` script. No system `faust` binary is invoked.
- [x] 3.3 Write the instrument panel component (`components/InstrumentPanels.svelte` or similar) with the frequency knob + waveform selector, hosted by the chassis Shell via the injection boundary.
- [x] 3.4 Verify the chassis power button mutes the engine output regardless of `gate` state — if the chassis lifecycle does not already enforce this (synth-d's chassis was never tested against a drone), add the master-mute wiring at the power-off chokepoint. Add a `vitest` for power-off-silence using the reference instrument. **The test asserts the chassis state/engine-glue layer sends the correct mute signal when power toggles off** (a unit/integration assertion at the store/glue level — vitest cannot observe Web Audio output directly); the chassis-level audio silence on power-off is then a consequence of the asserted signal flow.
- [x] 3.5 **Build smoke after section 3** — run `npm ci && npm run build` inside the preset and confirm it succeeds with the chassis + reference instrument in place. Catches import-path, dep, and FAUST integration breakage early while the context is fresh, instead of letting it accumulate across the later commits (this is _not_ the section-11 authoritative gate; it is a check-in).

## 4. Donor-identity parameterization

- [x] 4.1 In the preset's `patches/storage.js`, replace the `synth-d:` localStorage namespace literal with constructor-injected configuration (mirroring the Phase-1 `MidiCcMap` pattern in D4) — storage takes the namespace at instantiation, the `Shell` constructs it with the value `__APP_NAMESPACE__`, and tests pass the namespace explicitly. The sentinel string `__APP_NAMESPACE__` therefore appears only at the `Shell`'s instantiation site, where `new-app.sh` substitutes it. Update the storage tests to construct with an explicit namespace; do not regress existing storage scenarios.
- [x] 4.2 Audit chassis source for any other donor-identity literals (GitHub URLs naming `synth-d`, deploy paths, package-name literals). If found, parameterize or remove; record any decisions inline.

## 5. Sync new specs to `openspec/specs/` and back-tag slice 1

- [x] 5.1 Sync the three delta specs into `openspec/specs/` **during implementation** (per design D9): create `openspec/specs/chassis-architecture/spec.md`, `openspec/specs/chassis-theming/spec.md`, and `openspec/specs/preset-portability/spec.md` from the change's delta specs — drop the `## ADDED Requirements` header, keep the `tier:` frontmatter (`stack`, `stack`, `kernel` respectively), add a brief Purpose section. **Use `openspec/specs/dev-gates/spec.md` as the canonical-format exemplar** (the structure that emerged from slice 1's archive sync: frontmatter block → `## Purpose` → `## Requirements` with `### Requirement: …` and `#### Scenario: …` blocks). The archive-time sync will then be a no-op refresh; `check-manifest.sh` passes from the first CI push.
- [x] 5.2 Add `tier: kernel` frontmatter to the existing `openspec/specs/dev-gates/spec.md` and `openspec/specs/release-automation/spec.md` (back-tagging slice 1).

## 6. Sync manifest

- [x] 6.1 Write `kernel-manifest.json` at the repo root listing: kernel-tier paths (`scripts/**`, `.githooks/**`, `.github/workflows/**`, `release-please-config.json`, `.release-please-manifest.json`, `CLAUDE.md`, `STACK.md`, `WORKFLOW-NOTES.md`, root `package.json` excluding the lock, `.prettierrc`, `.prettierignore`, `.nvmrc`, `.roborev.toml`) and their specs (`dev-gates`, `release-automation`, `preset-portability`); plus the `svelte-faust-synth` preset group with its chassis paths **including `presets/svelte-faust-synth/package-lock.json`** (so `npm ci` is reproducible downstream) + `chassis-architecture`, `chassis-theming` specs. Match the JSON shape in `design.md` D3.

## 7. Identity-leak and manifest-validate scripts

- [x] 7.1 Add `scripts/check-identity-leak.sh`: scan the curated file set (chassis source, preset configs, `theme.css`, kernel root configs) for `synth-d:`, `davidirvine/synth-d`, and any other declared donor literals; assert none survive. The script's scope list is committed inside it; README/CHANGELOG/historizing files are explicitly excluded. Also assert no un-substituted sentinel matching `__[A-Z_]+__` (e.g. `__APP_NAMESPACE__`) appears **outside the single allowlisted Shell instantiation site** — per D4, the sentinel lives only at the Shell's storage-construction call site, not inside `storage.js` itself; the allowlist names the Shell file explicitly.
- [x] 7.2 Add `scripts/check-manifest.sh`: parse `kernel-manifest.json`; for every spec listed, assert its `tier:` frontmatter matches the manifest group; for every kernel-/stack-tier spec under `openspec/specs/`, assert it appears in the manifest; for every non-spec path, assert it exists in the repo.

## 8. One-time chassis-purity extraction audit

- [x] 8.1 Capture synth-d's full subtractive param-name list into `openspec/changes/import-chassis-preset/audit/synthd-instrument-params.json` (sourced from synth-d's `src/param-schema.js`, read from the **`main` HEAD**, not whichever ref a working tree happens to be on). **Preflight: resolve the synth-d repo path as `${SYNTHD_REPO:-/Users/dirvine/source/agent-workflow}`** — environment variable wins; the hardcoded path is the default. Assert that path exists, is a git repo, has `src/param-schema.js`, and report `git -C "$SYNTHD_REPO" rev-parse main` for the SHA capture. Fail with an actionable message if any step fails. **Record the resolved commit SHA inside the fixture** (top-level `"sourceCommit": "<sha>"` field) so the audit is reproducible if synth-d's schema later changes. This fixture is the forbidden-list source for the extraction audit; it ships with this change and is archived with it.
- [x] 8.2 Add `scripts/run-extraction-audit.sh` (or invoke a one-shot from inside the preset): apply synth-d's param list as the forbidden set against the preset's chassis files, reporting every flagged file/name. Resolve every flagged hit before continuing (move literals to instrument code, or surface a documented allowlist entry with a per-entry rationale committed to the audit fixture).
- [x] 8.3 Commit the audit run's output (pass/fail + any allowlist rationale) alongside the fixture so the audit evidence is preserved in the change directory.

## 9. Traveling chassis-purity test

- [ ] 9.1 Add `presets/svelte-faust-synth/src/chassis-purity.test.js`: mirror synth-d's structure but derive `INSTRUMENT_PARAM_NAMES` from the current `PARAM_SCHEMA`; hardcode the universal engine set; scan chassis files via the preset's own `INSTRUMENT_FILES` exclusion list. Verify the test PASSES against the reference-instrument schema (vacuous-but-correct) and would fail if a chassis file were edited to reference a reference-instrument param name.

## 10. CI workflow: FAUST + new jobs

- [ ] 10.1 Confirm no dedicated FAUST install step is needed in `.github/workflows/ci.yml` per design D10 — FAUST is provisioned transitively by `preset-build`'s `npm ci` via the `@grame/faustwasm` npm dep. Verify the workflow's existing `setup-node` (from slice 1, via `.nvmrc`) is reused by the new `preset-build` job and no system-level FAUST tool is added at the kernel level (the kernel-dep-posture rule in D7). No workflow YAML change for FAUST.
- [ ] 10.2 Add a `preset-build` job that runs `npm ci && npm run build` inside `presets/svelte-faust-synth/`, plus the preset's own lint/format, plus the traveling chassis-purity test (vitest).
- [ ] 10.3 Add a `preset-leak-check` job that runs `scripts/check-identity-leak.sh` and `scripts/check-manifest.sh`.
- [ ] 10.4 Leave the `smoke-app` stub unchanged (slice 5 turns it on).
- [ ] 10.5 Update `STACK.md`'s "Completion-gate test commands" and "Feature-level verification" sections to list the new gates (`preset-build`, `preset-leak-check`, the extraction audit's one-time run); add **Node + npm (via `.nvmrc`) as the preset's only build-time prerequisite** alongside `shellcheck`/`shfmt` — per design D10 + D7, FAUST is provisioned via the `@grame/faustwasm` npm dep, so it is _not_ a separate local prerequisite. Also state the kernel-dep-posture rule (D7) explicitly: "the kernel root does not install preset deps; each preset is self-contained." Replace the "these gates do not exist yet" bootstrap note since this slice is the change that establishes them.

## 11. Verification (slice completion gate)

- [ ] 11.1 Run all four slice-2 gates locally: (a) `scripts/check-manifest.sh` passes; (b) `scripts/check-identity-leak.sh` passes; (c) the one-time extraction audit passes (its run output is recorded in the change directory); (d) `npm ci && npm run build` succeeds inside `presets/svelte-faust-synth/`, including the traveling chassis-purity test and the power-off-silence vitest.
- [ ] 11.2 Push the branch; confirm CI: `lint-format` (slice 1), `preset-build`, and `preset-leak-check` are all green; `smoke-app` stub is still present and green.
