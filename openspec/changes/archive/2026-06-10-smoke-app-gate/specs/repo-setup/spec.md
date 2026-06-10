## ADDED Requirements

### Requirement: `setup.sh --check --ci` verifies only build-essential prereqs

`scripts/setup.sh --check --ci` SHALL verify only the prereqs required to install dependencies and build the app — `node` (pinned to `.nvmrc`) and `npm` — and SHALL NOT require the workflow-authoring tools the full `--check` verifies (`shfmt`, `shellcheck`, `jq`, `gh`, `openspec`, `roborev`), nor the STACK.md shfmt-pin cross-check. Like the full `--check`, `--check --ci` SHALL perform no work and SHALL exit non-zero on any unsatisfied build-essential prereq. This is the scope a Node-only CI runner (such as the kernel's `smoke-app` job, or a consumer's build-only smoke test) can satisfy without provisioning the full toolchain. The `--ci` modifier SHALL be valid only alongside `--check`; supplying `--ci` without `--check` SHALL be a usage error (exit 2).

#### Scenario: Build-essential prereqs present exits 0 despite absent workflow tools

- **WHEN** `setup.sh --check --ci` runs in an environment that has `node` (matching `.nvmrc`) and `npm` but lacks `shfmt`, `openspec`, and `roborev`
- **THEN** the script exits 0 with a summary line confirming the build-essential check passed, and does not report the absent workflow tools

#### Scenario: Missing Node is reported and fails

- **WHEN** `setup.sh --check --ci` runs in an environment where `node` is absent or its version does not match `.nvmrc`
- **THEN** the script reports `node` as missing or outdated with an install hint and exits non-zero

#### Scenario: `--ci` without `--check` is a usage error

- **WHEN** `setup.sh --ci` is invoked without `--check`
- **THEN** the script prints a usage error and exits 2, performing no work
