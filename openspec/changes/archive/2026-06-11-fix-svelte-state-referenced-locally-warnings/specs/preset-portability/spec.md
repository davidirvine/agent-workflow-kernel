## MODIFIED Requirements

### Requirement: The preset is a self-contained buildable unit

A preset SHALL ship its own `package.json`, build configuration (e.g. `vite.config.js`, `svelte.config.js`), build-tool deps, formatter config, and DSP/source — sufficient that `npm ci && npm run build` inside the preset directory produces a working app build without depending on files outside the preset directory. The bare preset build SHALL be free of Svelte compiler warnings, and the preset's build configuration SHALL enforce this by failing the build when the Svelte compiler emits a warning.

#### Scenario: Bare preset builds

- **WHEN** `npm ci && npm run build` runs inside `presets/<preset-name>/`
- **THEN** it exits 0 and produces the expected build artifacts (without needing the kernel root's `package.json`, dependencies, or configs)

#### Scenario: Bare preset build is warning-free

- **WHEN** `npm run build` runs inside `presets/<preset-name>/`
- **THEN** the Svelte compilation completes without emitting any `state_referenced_locally` (or other Svelte compiler) warning, so a consuming app generated or synced from the preset inherits a clean build

#### Scenario: A Svelte compiler warning fails the build

- **WHEN** any chassis or instrument source under the preset would cause the Svelte compiler to emit a warning during `npm run build`
- **THEN** the preset's build configuration promotes that warning to an error and `npm run build` exits non-zero, so a reintroduced warning cannot pass the `preset-build` gate or a consuming app's build silently

#### Scenario: Preset's lint/format are scoped to the preset

- **WHEN** the preset's `npm run lint` / `prettier --check` runs
- **THEN** it operates only on files under the preset directory and does not require kernel root deps
