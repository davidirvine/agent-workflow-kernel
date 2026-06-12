## MODIFIED Requirements

### Requirement: Generator emits a complete, identity-clean fresh app from kernel + preset + name

`scripts/new-app.sh` SHALL, given a `--name <app-name>`, `--output <path>`, and `--preset <name>` (default `svelte-faust-synth`), emit an app directory at the output path containing every kernel-tier and stack-tier file declared in `kernel-manifest.json`, the preset's instrument-tier files — the preset's reference instrument, seeded from the `instrumentStubs` sources — written at their target paths, donor identity substituted to the app's name, package version reset to `0.1.0`, an empty `openspec/changes/`, and an initialized git repository with a single initial commit.

#### Scenario: Generation produces the expected tree

- **WHEN** `new-app.sh --name smoke-app --output <tempdir>/smoke-app --preset svelte-faust-synth` runs against a clean output path
- **THEN** the output is a directory whose contents include every path listed in `kernel.paths` (minus the `kernel.excludeFromGenerate` set) and every path in the preset's `stack.presets[<preset>].paths` (preset-flattened, with the preset winning for any overlap), every spec listed in `kernel.specs` and in the preset's `specs` exists at the corresponding path under `openspec/specs/`, every `instrumentStubs` target path exists with the content of its `instrumentStubs` source — the preset's reference instrument, not a blank — every `appTemplates` target path exists with the corresponding template's content, `openspec/changes/` contains only `.gitkeep`, `openspec/changes/archive/` does not exist, and the directory is a git repository

#### Scenario: Generated instrument is the reference, not a blank

- **WHEN** the emitted tree's instrument-tier files are inspected
- **THEN** the emitted `src/param-schema.js` declares the preset's reference instrument — a non-empty `PARAM_SCHEMA` with at least one `knob` descriptor (so `PARAM_NAMES` and `KNOB_PARAMS` are non-empty) rather than an empty schema — and `faust/synth.dsp` is the reference instrument's DSP rather than a silent stub. The assertion SHALL be structural (non-empty schema / at least one knob) rather than keyed to specific reference param names, so it survives a future reference-instrument swap.
