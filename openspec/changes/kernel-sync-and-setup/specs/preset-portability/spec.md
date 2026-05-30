## ADDED Requirements

### Requirement: The manifest declares sync's own app-state files

`kernel-manifest.json` SHALL declare a `kernel.appStateFiles` array listing literal file paths that `sync-kernel.sh` (and `new-app.sh` on generation) writes in the consuming app to record its sync state — at minimum `.kernel-version` (the kernel version the app was last synced from) and `.kernel-sync-hashes.json` (the SHA-256 record used for clobber protection). These paths SHALL NOT appear in `kernel.paths`, any preset's `paths`, or any preset's `instrumentStubs` / `appTemplates` (they originate in the consuming app from sync, not from a copy).

#### Scenario: appStateFiles declares the version stamp and hash record

- **WHEN** `scripts/check-manifest.sh` runs
- **THEN** it asserts `kernel.appStateFiles` exists and contains the literal entries `.kernel-version` and `.kernel-sync-hashes.json`, and that no entry collides with a path in `kernel.paths`, any preset's `paths`, `instrumentStubs`, or `appTemplates`

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
