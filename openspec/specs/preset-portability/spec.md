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

### Requirement: A preset declares its instrument-tier stub mapping in the sync manifest

Each preset entry in `kernel-manifest.json` SHALL declare an `instrumentStubs` field mapping each instrument-tier target path (relative to the generated app's root) to a committed stub file inside the preset (e.g. `"src/param-schema.js": "stubs/param-schema.js"`). Every stub source SHALL exist; no target path SHALL appear in the preset's `paths` list (a target listed in both `paths` and `instrumentStubs` would mean the generator writes a stub then overwrites it with the preset's reference instrument).

#### Scenario: Generator can blank a preset stack-agnostically

- **WHEN** `new-app.sh` runs against a preset
- **THEN** it reads each entry under that preset's `instrumentStubs` field and writes the named stub file's content to the target path in the emitted app, with no preset-specific knowledge required in the generator

#### Scenario: Manifest-validate catches a malformed `instrumentStubs`

- **WHEN** `scripts/check-manifest.sh` runs
- **THEN** it asserts every `instrumentStubs` source path exists in the repo and no `instrumentStubs` target path also appears in the same preset's `paths` list; it fails with a clear message if either rule is violated

### Requirement: A preset declares its app-tier CI template in the sync manifest

Each preset entry in `kernel-manifest.json` SHALL declare an `appTemplates` field mapping each template target path in the generated app to a committed template file inside the preset (e.g. `".github/workflows/ci.yml": "templates/app-ci.yml"`). At minimum the preset SHALL ship an app-tier CI workflow template, because the kernel's own `.github/workflows/ci.yml` references kernel-specific paths the generated app lacks (`presets/<preset>/`, `kernel-manifest.json`, kernel-only scripts) and is excluded from generation via `kernel.excludeFromGenerate`. The preset's app-tier CI template SHALL run the app-tier gates (lint/format plus the app's `npm ci && npm test && npm run build`) and SHALL NOT include the kernel-only jobs (`preset-build`, `preset-leak-check`, `generate-assert`).

#### Scenario: App-tier CI template lands at the right path

- **WHEN** `new-app.sh` runs against a preset that declares `appTemplates`
- **THEN** for each entry, the named template file's content is written to the target path in the generated app (e.g. `presets/<preset>/templates/app-ci.yml` → `<output>/.github/workflows/ci.yml`)

#### Scenario: Manifest-validate catches a malformed `appTemplates`

- **WHEN** `scripts/check-manifest.sh` runs
- **THEN** it asserts every `appTemplates` source path exists in the repo and no `appTemplates` target path also appears in the same preset's `paths` list; it fails with a clear message if either rule is violated

### Requirement: A preset declares its app-tier release-automation workflow template

Each preset entry in `kernel-manifest.json` SHALL declare, in its `appTemplates` field, a release-automation workflow template in addition to the app-tier CI template — mapping the target path `.github/workflows/release-please.yml` in the generated app to a committed template file inside the preset (e.g. `templates/release-please.yml`). This template provides the GitHub Actions **runner** for the release-please **config** that already travels into a generated app (`release-please-config.json` and `.release-please-manifest.json` in `kernel.paths`), so the generated app has working release automation rather than config without a runner. The template SHALL run `googleapis/release-please-action@v4` on push to the `main` branch and SHALL carry no donor-identity literal or un-substituted sentinel (it is copied verbatim, like the CI template). This requirement is additive to and independent of the existing app-tier CI template requirement: it does not modify the CI-template floor; both templates are separately required `appTemplates` entries.

#### Scenario: Release-automation template lands at the right path

- **WHEN** `new-app.sh` runs against a preset whose `appTemplates` declares the release-automation entry
- **THEN** the named template file's content is written to `.github/workflows/release-please.yml` in the generated app (e.g. `presets/<preset>/templates/release-please.yml` → `<output>/.github/workflows/release-please.yml`)

#### Scenario: The release-automation template runs release-please-action@v4 on push to main

- **WHEN** the generated `.github/workflows/release-please.yml` is inspected
- **THEN** it triggers on push to the `main` branch and invokes `googleapis/release-please-action@v4`

#### Scenario: Manifest-validate covers the release-automation template entry

- **WHEN** `scripts/check-manifest.sh` runs
- **THEN** it asserts the release-automation `appTemplates` source path exists in the repo and its target path (`.github/workflows/release-please.yml`) does not also appear in the preset's `paths` list, failing with a clear message if either rule is violated

#### Scenario: The release-automation template re-applies on sync

- **WHEN** the kernel ships or updates the release-automation `appTemplates` source and a consuming app then runs `sync-kernel.sh`
- **THEN** `.github/workflows/release-please.yml` in the consuming app is created or updated to the template content, subject to clobber protection, consistent with the existing `appTemplates`-on-sync behavior

### Requirement: The manifest declares which kernel paths are excluded from generation

`kernel-manifest.json` SHALL declare a `kernel.excludeFromGenerate` array listing file paths or globs that exist in the expansion of `kernel.paths` for the kernel's own use but MUST NOT travel to a generated app (e.g. the kernel's own CI workflow, kernel-only scripts). Each entry is a file path or glob matched against the **expanded** file set produced by `kernel.paths` from the repo root (not against `kernel.paths`'s entries literally — since `kernel.paths` itself contains globs like `scripts/**`, literal-string matching would reject any per-file exclusion). Every entry SHALL resolve to at least one file in that expanded set. The exclusion is honored by `new-app.sh`; `sync-kernel.sh` (slice 4) honors the same set so paths excluded from generation are also not pushed into existing apps.

#### Scenario: Manifest-validate catches an exclusion that matches nothing

- **WHEN** `scripts/check-manifest.sh` runs and an `excludeFromGenerate` entry (after expansion as a file path or glob from the repo root) does not match any file in the expanded `kernel.paths` set
- **THEN** the check fails, naming the offending entry, so a typo in the exclusion list cannot silently produce a "no exclusion" effect

#### Scenario: A per-file exclusion under a kernel glob is valid

- **WHEN** `kernel.paths` contains the glob `scripts/**` and `excludeFromGenerate` contains the literal path `scripts/new-app.sh`
- **THEN** the validator accepts the entry because `scripts/new-app.sh` (treated as a literal path) exists and is matched by the `scripts/**` glob in the expanded kernel-paths set

### Requirement: The manifest declares sync's own app-state files

`kernel-manifest.json` SHALL declare a `kernel.appStateFiles` array listing literal file paths that `sync-kernel.sh` (and `new-app.sh` on generation) writes in the consuming app to record its sync state — at minimum `.kernel-version` (the kernel version the app was last synced from) and `.kernel-sync-hashes.json` (the SHA-256 record used for clobber protection). These paths SHALL NOT appear in `kernel.paths`, any preset's `paths`, or any preset's `instrumentStubs` / `appTemplates` (they originate in the consuming app from sync, not from a copy).

#### Scenario: appStateFiles declares the version stamp and hash record

- **WHEN** `scripts/check-manifest.sh` runs
- **THEN** it asserts `kernel.appStateFiles` exists and contains the literal entries `.kernel-version` and `.kernel-sync-hashes.json`, and that no entry collides with a path in `kernel.paths`, any preset's `paths`, `instrumentStubs`, or `appTemplates`

### Requirement: The manifest declares files that generation customizes and sync must not re-apply

`kernel-manifest.json` SHALL declare a `kernel.appOwnedFiles` array of app-relative target paths that `new-app.sh` customizes at generation (identity substitution, `package.json` mutation, the `.release-please-manifest.json` reset to `0.1.0`) and that `sync-kernel.sh` SHALL NOT re-apply. Each entry SHALL be a literal path that travels at generation (present in the expanded `kernel.paths` or a preset's flattened `paths`) and SHALL NOT also appear as an `appStateFiles`, `instrumentStubs`, or `appTemplates` target.

#### Scenario: appOwnedFiles are validated as real, single-category paths

- **WHEN** `scripts/check-manifest.sh` runs
- **THEN** it asserts every `kernel.appOwnedFiles` entry is a literal path that matches an emitted file (expanded `kernel.paths` or a preset's flattened `paths`) and does not also appear as an `appStateFiles`, `instrumentStubs`, or `appTemplates` target

### Requirement: `excludeFromGenerate` applies to sync as well as generation

The `kernel.excludeFromGenerate` set SHALL be honored by `sync-kernel.sh` on the same terms as `new-app.sh` — paths in the expanded exclusion set are never pushed into a consuming app, whether the consuming app is being generated or being synced. This keeps "what travels from the kernel" a single contract enforced identically by both endpoints.

#### Scenario: A kernel-only path is omitted from sync

- **WHEN** sync runs and the manifest declares a path under `kernel.excludeFromGenerate` (e.g. `.github/workflows/**`, kernel-only scripts)
- **THEN** the consuming app's copy of that path (or absence of it) is unchanged by sync; the kernel's version is not written

### Requirement: `appTemplates` re-applies on sync; `instrumentStubs` does not

`sync-kernel.sh` SHALL re-apply `appTemplates` entries on each sync, with clobber protection (so the kernel can ship a template update and consumers receive it on next sync). It SHALL NOT re-apply `instrumentStubs` entries — those are one-time-at-generation stubs; the instrument-tier files in a consuming app are app-owned content after generation and re-applying a stub would clobber the user's instrument.

#### Scenario: Template update flows through sync

- **WHEN** the kernel updates an `appTemplates` source (e.g. `templates/app-ci.yml`) and a consuming app then runs `sync-kernel.sh`
- **THEN** the target file in the consuming app (e.g. `.github/workflows/ci.yml`) is updated to the new template content, subject to clobber protection

#### Scenario: Sync does not touch the instrument

- **WHEN** sync runs against an app with developed instrument files at the `instrumentStubs` target paths (e.g. a real `src/param-schema.js`)
- **THEN** those paths are excluded from the sync's read, copy, and hash steps; the user's instrument content is unchanged
