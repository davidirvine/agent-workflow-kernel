## 0. Slice-2 file refactors (prerequisites for slice 3)

- [x] 0.1 Refactor `scripts/check-identity-leak.sh` per design D12: auto-detect layout — if `presets/` exists with subdirectories, iterate them (current kernel behaviour); else treat `.` as the single "preset". Update `preset_scan_globs` and `shell_allowlist_paths` so they handle a preset path of `"."` correctly (chassis at `./src/`, Shell allowlist at `./src/components/Shell.svelte`). Verify the kernel's `scripts/check-identity-leak.sh` still passes (kernel branch unchanged); the generated-app branch will be verified by `generate-assert.sh` (task 5.x).

## 1. Instrument-tier stubs

- [x] 1.1 Grep every chassis import of `param-schema.js` to determine exactly which exports the chassis consumes — e.g. `git grep -nE "from.*param-schema" presets/svelte-faust-synth/src/`. Per the slice-2 grounding the importers are at least `state/synth.svelte.js`, `components/Shell.svelte`, `chassis-purity.test.js`, and `components/InstrumentPanels.svelte`; the grep is authoritative. This closes the design's Open Question; **the exports listed in 1.2 are provisional and may be adjusted based on this read.**
- [x] 1.2 Write `presets/svelte-faust-synth/stubs/param-schema.js`: declare an empty `PARAM_SCHEMA = Object.freeze({})`, export the schema-derived collections the chassis actually imports (provisional list from synth-d: `PARAM_DEFAULTS`, `PARAM_NAMES`, `AUDIO_PARAMS`, `KNOB_PARAMS`, `BIPOLAR_PARAMS`, `powerOffValue`, `PARAM_RENAMES`, `WAVEFORMS` — confirmed in 1.1) deriving empty / sensible defaults; chassis-purity test is vacuous-but-correct against this stub.
- [x] 1.3 Write `presets/svelte-faust-synth/stubs/InstrumentPanels.svelte`: a valid Svelte component that renders a small "build your instrument here" placeholder; accepts the same props/slots the chassis Shell expects.
- [x] 1.4 Add `presets/svelte-faust-synth/stubs/stubs.test.js` (vitest): import each stub, assert the **full** export surface of the real `param-schema.js` (every named export, not just what `Shell.svelte` happens to import today — a future chassis change that imports an additional export must not silently break stub compatibility), and assert the panel component instantiates without throwing. Run from inside the preset.
- [x] 1.5 Write `presets/svelte-faust-synth/stubs/synth.dsp` — a minimal FAUST DSP exposing exactly the universal engine contract (`freq`, `gate`, `modWheel` inputs; `outputPeak`, `mixerPeak` outputs) and outputting silence (`process = 0, 0`). Required so the generated app's `prebuild` step succeeds before the developer writes their real DSP (per design D3's FAUST-stub extension).

## 2. Extend kernel-manifest and validator

- [x] 2.1 Add `openspec/config.yaml` to `kernel.paths` (per design D15 — was missing from the manifest, hardcoding it in `new-app.sh` would violate the "manifest is source of truth" principle).
- [x] 2.2 Add `kernel.excludeFromGenerate` field listing paths that exist in `kernel.paths` but should NOT travel to a generated app: `.github/workflows/**` (per D14), `scripts/new-app.sh`, `scripts/generate-assert.sh`, `scripts/check-manifest.sh`, `scripts/run-extraction-audit.sh` (kernel-only tools per D2).
- [x] 2.3 Add `instrumentStubs` field to `kernel-manifest.json` under `stack.presets["presets/svelte-faust-synth"]`: `{"src/param-schema.js": "stubs/param-schema.js", "src/components/InstrumentPanels.svelte": "stubs/InstrumentPanels.svelte", "faust/synth.dsp": "stubs/synth.dsp"}` (per design D3's FAUST-stub extension, so the generated app's `prebuild` succeeds).
- [ ] 2.4 Add `appTemplates` field to the same preset entry (per D14): `{".github/workflows/ci.yml": "templates/app-ci.yml"}`.
- [ ] 2.5 Write `presets/svelte-faust-synth/templates/app-ci.yml` — an app-tier CI workflow: lint/format job (`scripts/checks.sh`) and a `npm ci && npm test && npm run build` job inside the app root. Does NOT include `generate-assert` (the generated app isn't itself a generator) or the kernel's preset-build/leak-check jobs (kernel-only).
- [ ] 2.6 Update `scripts/check-manifest.sh`: (a) for each preset's `instrumentStubs`, assert every source path exists and every target path does NOT also appear in the same preset's `paths` list; (b) for each preset's `appTemplates`, the same checks (source exists, target not in `paths`); (c) for each entry in `kernel.excludeFromGenerate`, expand `kernel.paths`'s globs against the filesystem from the repo root into a concrete file set, then treat the exclusion entry as either a literal path or a glob and assert it matches at least one file in that expanded set (per design D2 — `kernel.paths` is glob-based, so literal-string subset comparison would reject every per-file exclusion). Fail with a clear message naming the offending entry.

## 3. Sync `preset-portability` spec update (early-sync per slice 2's D9)

- [ ] 3.1 Sync the `preset-portability` delta from this change into `openspec/specs/preset-portability/spec.md` during implementation (same pattern slice 2 established): add the new "instrument-tier stub mapping" requirement and its two scenarios to the canonical spec, preserving the existing Purpose section and other requirements unchanged. Archive-time sync will be a no-op refresh.

## 4. Write `scripts/new-app.sh`

- [ ] 4.1 Implement the CLI argument parser per design D1: required `--name`, `--output`; optional `--preset` (default `svelte-faust-synth`), `--title` (default title-cased name), `--repo-url` (default `https://example.com/<name>` placeholder). Validate `--name` against `^[a-z][a-z0-9-]*$` and refuse before any work begins. Refuse a `--output` that exists.
- [ ] 4.2 Read `kernel-manifest.json` and emit the copy plan, **including specs**: (a) for each path (expanding globs) in `kernel.paths` that is NOT in the expanded `kernel.excludeFromGenerate` set, plan to copy from the kernel repo to the same relative path under `--output`; (b) for each path in `stack.presets[<preset>].paths`, plan to copy with the `presets/<preset>/` prefix stripped (D10); (c) for each spec in `kernel.specs` and in `stack.presets[<preset>].specs`, plan to copy to the same path under `--output` (specs travel verbatim, no flattening — they live at `openspec/specs/<cap>/spec.md` in both kernel and app). Apply the **preset-wins overlap rule** (D2) for the documented overlap set (exactly `.prettierrc` and `package.json`); document the overlap set inline as a 2-item literal array with a comment.
- [ ] 4.3 Execute the copy plan, preserving file modes (especially executable bits on `scripts/**` and `.githooks/**`).
- [ ] 4.4 For each entry in the preset's `instrumentStubs`, read the stub source file and write it to the target path in `--output`, **creating parent directories as needed** (e.g. `faust/synth.dsp`'s parent `faust/` is not in the preset's `paths` list — it must be `mkdir -p`'d). For each entry in the preset's `appTemplates`, read the template source and write it to the target path (e.g. `presets/<preset>/templates/app-ci.yml` → `<output>/.github/workflows/ci.yml`), also creating parents.
- [ ] 4.5 Substitute identity (per design D4):
  - Sed-style replace `'__APP_NAMESPACE__'` → `'<name>'` in the emitted `src/components/Shell.svelte` (safe: `--name` is kebab-validated).
  - **Use `node -e`** (not sed) to rewrite the `__APP_TITLE__` / `__APP_REPO_URL__` defaults in the emitted `vite.config.js` — load the file as text, replace the specific placeholder string literals using `JSON.stringify(value)` for the replacement so arbitrary characters in `--title`/`--repo-url` (quotes, slashes, backslashes) are safely escaped, write back. **No sed for these values** — `--title`/`--repo-url` are arbitrary user input and sed-injection would corrupt the emitted JavaScript.
- [ ] 4.5b Mutate the emitted `package.json` in one `node -e` pass (per D5): set `name` → `<name>`, `version` → `"0.1.0"`, `description` → `"App scaffolded from agent-workflow-kernel + <preset>"`; **add devDependency `prettier-plugin-toml`** at the version read from the kernel root's own `package.json` (`devDependencies["prettier-plugin-toml"]`) at generation time — so the pin stays in lock-step with the kernel's, not hardcoded; **add `scripts.postinstall`: `"scripts/install-hooks.sh"`** (the install-hooks.sh travels via `kernel.paths`). Write `.release-please-manifest.json` as `{".": "0.1.0"}`. Leave `package-lock.json` un-regenerated (per D5: lockfile is intentionally stale; first `npm install` in the generated app regenerates).
- [ ] 4.6 Reset OpenSpec state per design D6: ensure `openspec/changes/` exists with only a `.gitkeep`; ensure `openspec/changes/archive/` is NOT copied (it is not in any manifest set, but assert by construction). The `openspec/config.yaml` and kernel-tier + stack-tier specs are already in the copy plan from task 4.2 — this task verifies they landed.
- [ ] 4.7 `cd` into `--output` and run `git init`, `git add -A`, `git commit -m "chore: scaffold <name> from agent-workflow-kernel + <preset>"` with a commit-body note "Run \`npm install\` to regenerate package-lock.json and activate git hooks." (per D5's intentionally-stale-lockfile decision). Configure no author beyond what git's local environment provides (so the user's git identity is used).
- [ ] 4.8 Make the script `shfmt -w` / `shellcheck`-clean. `bash` shebang (`#!/usr/bin/env bash`) per the precedent set by `scripts/check-identity-leak.sh`.

## 5. Write `scripts/generate-assert.sh`

- [ ] 5.1 Create a tempdir (using `mktemp -d`); set up an EXIT trap to remove it on success and on early failure.
- [ ] 5.2 Run `new-app.sh --name smoke-app --output <tempdir>/smoke-app --preset svelte-faust-synth --title "Smoke App" --repo-url "https://example.com/smoke-app"`. Capture stderr/stdout; abort with a clear message if the generator exits non-zero.
- [ ] 5.3 Structural assertions (per design D8): every manifest path (`kernel.paths` minus `excludeFromGenerate`, plus the preset's `paths` flattened) exists in the emitted tree at the right relative path; every spec listed in `kernel.specs` and the preset's `specs` exists at `openspec/specs/<cap>/spec.md` in the emitted tree; every `instrumentStubs` target exists; every `appTemplates` target exists; `openspec/changes/` contains exactly one file (`.gitkeep`); `openspec/changes/archive/` does not exist; the emitted dir is a git repo with one commit whose message starts with `chore: scaffold smoke-app`.
- [ ] 5.4 Identity assertions: `package.json` `name === "smoke-app"`, `version === "0.1.0"`, `description` does not contain the preset's reference-instrument phrasing; `Shell.svelte` contains `'smoke-app'` not `'__APP_NAMESPACE__'`; `vite.config.js` carries the chosen title + repo-url values, not the preset's placeholders.
- [ ] 5.5 Run the emitted tree's own `scripts/check-identity-leak.sh` from inside `<tempdir>/smoke-app`; assert it exits 0.
- [ ] 5.6 On success, tear down the tempdir and emit a single-line summary; on failure, leave the tempdir in place with a message pointing the user to it for inspection (override the EXIT trap before exiting).
- [ ] 5.7 Make `shfmt -w` / `shellcheck`-clean.

## 6. CI workflow

- [ ] 6.1 Add a `generate-assert` job to `.github/workflows/ci.yml` that runs `scripts/generate-assert.sh`. Node from `.nvmrc` (used by the `node -e` calls inside the generator); no FAUST install needed for slice 3 (the emitted app is not built here — that's slice 5).

## 7. STACK.md update

- [ ] 7.1 Update `STACK.md`'s "Completion-gate test commands" and "Feature-level verification" sections to list `generate-assert` alongside `preset-build` and `preset-leak-check`. Add a short "Using new-app.sh" subsection documenting the CLI surface (per design D1).

## 8. Verification (slice completion gate)

- [ ] 8.1 Run `scripts/generate-assert.sh` clean locally; verify the script tears down its tempdir on success and leaves it on failure.
- [ ] 8.2 Push the branch; confirm CI: the `generate-assert` job is green alongside the slice-1 and slice-2 jobs; `smoke-app` stub is still present and green.
