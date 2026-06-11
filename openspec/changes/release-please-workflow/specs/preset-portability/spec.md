## ADDED Requirements

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
