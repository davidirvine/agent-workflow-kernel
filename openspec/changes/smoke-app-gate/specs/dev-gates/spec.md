## MODIFIED Requirements

### Requirement: Smoke-app CI job runs the generate-to-build pipeline

The CI workflow SHALL define a `smoke-app` job that, against a freshly generated app, runs the end-to-end pipeline: generate an app with `scripts/new-app.sh` into a throwaway workspace, run the **generated app's** `setup.sh --check --ci` (the build-only prereq scope), then install and build the generated app (`npm install` followed by `npm run build`, whose `prebuild` compiles the FAUST DSP via the `@grame/faustwasm` npm dependency). The job SHALL fail if any stage fails. The pipeline SHALL be encapsulated in a committed script (`scripts/smoke-app.sh`) invoked identically in CI and locally. The build SHALL use `npm install` (not `npm ci`) because the generated app's lockfile is intentionally stale. The job SHALL check out the repository and provision only Node from `.nvmrc`; no FAUST toolchain or workflow-authoring tools SHALL be installed.

#### Scenario: smoke-app builds a freshly generated app

- **WHEN** CI runs the `smoke-app` job
- **THEN** an app is generated with `new-app.sh`, the generated app's `setup.sh --check --ci` succeeds, and `npm install` + `npm run build` produce a build artifact, and the job succeeds

#### Scenario: smoke-app fails when a generated app does not build

- **WHEN** any pipeline stage fails — generation, the generated app's `setup.sh --check --ci`, dependency install, or the build
- **THEN** the `smoke-app` job fails

#### Scenario: smoke-app pipeline is runnable locally

- **WHEN** a developer runs `scripts/smoke-app.sh` locally
- **THEN** it runs the same generate → `setup.sh --check --ci` → build pipeline as CI, tears down its temporary workspace on success, and leaves it in place with a pointer for inspection on failure
