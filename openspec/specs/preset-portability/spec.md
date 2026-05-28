---
tier: kernel
---

# preset-portability Specification

## Purpose

Defines the kernel-tier conventions that make `presets/<name>/` units travel cleanly to consuming apps via `sync-kernel.sh`: a `tier:` frontmatter on every spec under `openspec/specs/`, a machine-readable sync manifest declaring exactly what travels (paths and specs grouped by tier), the rule that a preset carries no donor-identity literals (with sentinel substitution for identity values like the localStorage namespace), the requirement that a preset is self-contained and buildable in isolation, and the minimum contract a preset's reference instrument MUST honor as a worked example.

## Requirements

### Requirement: Every spec carries a tier frontmatter field

Every spec file under `openspec/specs/` SHALL declare a `tier:` field in YAML frontmatter with one of the values `kernel`, `stack`, or `instrument`. The tier determines whether the spec travels via `sync-kernel.sh` to consuming apps: `kernel` and `stack` specs travel; `instrument` specs are app-local and do not.

#### Scenario: Untagged spec fails validation

- **WHEN** a spec file under `openspec/specs/` is missing the `tier:` frontmatter field or declares a value outside `{kernel, stack, instrument}`
- **THEN** the manifest-validate check fails with the offending file path

### Requirement: A sync manifest declares what travels to consuming apps

The kernel SHALL maintain a machine-readable sync manifest (`kernel-manifest.json` at the repo root) that lists every path travelling to consuming apps via `sync-kernel.sh`, grouped by tier (`kernel` for kernel-tier files and specs; `stack` keyed by preset name for preset-tier paths and specs). The manifest SHALL list non-spec paths (scripts, hooks, CI workflows, configs) explicitly and SHALL agree with the `tier:` frontmatter for every spec it lists.

#### Scenario: Manifest and frontmatter agree

- **WHEN** the manifest-validate check compares each spec listed in the manifest against its `tier:` frontmatter
- **THEN** every spec's frontmatter tier matches the manifest group it appears under, and every kernel-/stack-tier spec under `openspec/specs/` appears in the manifest

#### Scenario: Non-spec paths are explicitly listed

- **WHEN** the manifest declares a non-spec kernel path (e.g. `.githooks/**`, `scripts/**`, a CI workflow, a release-please config)
- **THEN** the manifest-validate check confirms the path exists and is non-empty in the repo

### Requirement: The preset carries no donor-identity literals

A preset's chassis source SHALL NOT contain donor-identity literals — specifically the `synth-d:` localStorage namespace, GitHub URLs that name the donor repo, deploy paths, or the donor's package name — outside files that explicitly historize the donor (e.g. README acknowledgements). Where the chassis must carry an identity value (such as the localStorage namespace), the preset SHALL hold it as a sentinel token (e.g. `__APP_NAMESPACE__`) that `new-app.sh` substitutes at generate time.

#### Scenario: No raw donor namespace in chassis

- **WHEN** the identity-leak check scans the chassis and preset config files
- **THEN** no raw `synth-d:` namespace literal appears outside the explicit historizing-the-donor files declared in the check's scope

#### Scenario: Un-substituted sentinel token is a leak

- **WHEN** a path that should have been substituted by `new-app.sh` still contains a sentinel token (e.g. `__APP_NAMESPACE__`) in a context other than the preset itself
- **THEN** the identity-leak check fails

### Requirement: The preset is a self-contained buildable unit

A preset SHALL ship its own `package.json`, build configuration (e.g. `vite.config.js`, `svelte.config.js`), build-tool deps, formatter config, and DSP/source — sufficient that `npm ci && npm run build` inside the preset directory produces a working app build without depending on files outside the preset directory.

#### Scenario: Bare preset builds

- **WHEN** `npm ci && npm run build` runs inside `presets/<preset-name>/`
- **THEN** it exits 0 and produces the expected build artifacts (without needing the kernel root's `package.json`, dependencies, or configs)

#### Scenario: Preset's lint/format are scoped to the preset

- **WHEN** the preset's `npm run lint` / `prettier --check` runs
- **THEN** it operates only on files under the preset directory and does not require kernel root deps

### Requirement: The reference instrument exercises the chassis seam minimally

A preset SHALL ship a minimal **reference instrument** as a worked example — a single working instrument that exercises both store-backed descriptor kinds (`knob` and `switch`) and the chassis power-lifecycle. The reference instrument SHALL be small enough to read end-to-end yet complete enough that `new-app.sh` (slice 3) can blank it and the chassis still has a meaningful contract to honor.

#### Scenario: Reference instrument exercises required seams

- **WHEN** the reference instrument is inspected
- **THEN** it declares at least one `knob` and one `switch` descriptor in `param-schema.js`, consumes the `freq` and `gate` universal contract from the keyboard, exposes `outputPeak` so the chassis scope/level-LED light up, and is muted by the chassis power-off lifecycle (verified by powering off and observing engine silence)

#### Scenario: Reference instrument does not entangle the chassis

- **WHEN** the chassis-purity test runs against the preset with the reference instrument's schema
- **THEN** no chassis file references any reference-instrument parameter name as a literal; the chassis remains generic
