## ADDED Requirements

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

### Requirement: The manifest declares which kernel paths are excluded from generation

`kernel-manifest.json` SHALL declare a `kernel.excludeFromGenerate` array listing file paths or globs that exist in the expansion of `kernel.paths` for the kernel's own use but MUST NOT travel to a generated app (e.g. the kernel's own CI workflow, kernel-only scripts). Each entry is a file path or glob matched against the **expanded** file set produced by `kernel.paths` from the repo root (not against `kernel.paths`'s entries literally — since `kernel.paths` itself contains globs like `scripts/**`, literal-string matching would reject any per-file exclusion). Every entry SHALL resolve to at least one file in that expanded set. The exclusion is honored by `new-app.sh`; `sync-kernel.sh` (slice 4) honors the same set so paths excluded from generation are also not pushed into existing apps.

#### Scenario: Manifest-validate catches an exclusion that matches nothing

- **WHEN** `scripts/check-manifest.sh` runs and an `excludeFromGenerate` entry (after expansion as a file path or glob from the repo root) does not match any file in the expanded `kernel.paths` set
- **THEN** the check fails, naming the offending entry, so a typo in the exclusion list cannot silently produce a "no exclusion" effect

#### Scenario: A per-file exclusion under a kernel glob is valid

- **WHEN** `kernel.paths` contains the glob `scripts/**` and `excludeFromGenerate` contains the literal path `scripts/new-app.sh`
- **THEN** the validator accepts the entry because `scripts/new-app.sh` (treated as a literal path) exists and is matched by the `scripts/**` glob in the expanded kernel-paths set
