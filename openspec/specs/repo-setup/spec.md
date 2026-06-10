---
tier: kernel
---

# repo-setup Specification

## Purpose

Defines the contract `scripts/setup.sh` honors: idempotent default-mode per-checkout setup (`npm ci` at the root and inside each present preset, the preset's `prebuild` FAUST compile via the `@grame/faustwasm` npm dep, and git-hook activation through `scripts/install-hooks.sh`); a non-mutating `--check` mode that verifies the kernel's global prereq table at pinned versions with actionable install hints; and layout auto-detection so the one script runs unchanged in both the kernel checkout and any generated app. `--check` is the documented onboarding and downstream-consumer-CI gate; the kernel's own CI provisions prereqs explicitly and adds no `setup-check` job. A narrower `--check --ci` scope verifies only the build-essential prereqs (`node`, `npm`) for Node-only CI runners such as the `smoke-app` job.

## Requirements

### Requirement: `setup.sh` is idempotent in its default mode

`scripts/setup.sh` SHALL, in its default mode (no flags), perform the deterministic per-checkout work needed for the repo to be usable: install Node dependencies (`npm ci` at the root and inside any preset directory present that has its own `package.json`), invoke the preset's `prebuild` npm script (`npm run prebuild` when the relevant `package.json` declares it) which compiles the DSP via the `@grame/faustwasm` npm dep (no separate system FAUST install is required), and run `scripts/install-hooks.sh` to activate git hooks. Re-running the script SHALL be safe and SHALL NOT redo work that is already done.

#### Scenario: Re-running setup is a fast no-op

- **WHEN** `setup.sh` runs in a checkout where every prereq step has already completed (deps installed, hooks active, FAUST artifacts present)
- **THEN** each step short-circuits (or completes near-instantly via npm's lockfile / git config / file presence checks) and the script exits 0 without surprising side effects

### Requirement: `setup.sh --check` verifies global prereqs without performing any work

`scripts/setup.sh --check` SHALL not install, build, or modify any file. It SHALL iterate the kernel's prereq table and verify each tool is present at the required version (where a version is pinned). For each missing or wrong-version tool, the script SHALL emit an actionable install hint naming the tool's conventional package-manager command. The script SHALL exit non-zero if any prereq is unsatisfied.

#### Scenario: Missing tool is reported with install hint

- **WHEN** `setup.sh --check` runs in an environment where `jq` is not on `$PATH`
- **THEN** the script reports `jq` as missing with an install hint (e.g. `brew install jq`) and exits non-zero; no other prereq's report is suppressed by the failure

#### Scenario: Wrong shfmt version is reported

- **WHEN** `setup.sh --check` runs in an environment where `shfmt` is installed at a different major-or-minor version than the kernel's pin (slice 1's `v3.8.0`)
- **THEN** the script reports the version mismatch with the install hint and exits non-zero

#### Scenario: All prereqs present exits 0

- **WHEN** every prereq in the kernel's table is present at its required version
- **THEN** `setup.sh --check` exits 0 with a single summary line confirming the check passed

### Requirement: `setup.sh` auto-detects layout to run in both kernel and generated app

`setup.sh` SHALL detect whether it is running in the kernel layout (a `presets/` directory with subdirectories) or in a generated-app layout (no `presets/`; the chassis is at the repo root) and act accordingly. The default mode's `npm ci` step SHALL run in every relevant location: the root plus each preset subdirectory in kernel layout, or just the root in app layout.

#### Scenario: Kernel layout iterates presets

- **WHEN** `setup.sh` runs in a checkout containing `presets/svelte-faust-synth/package.json`
- **THEN** it runs `npm ci` at the root and inside `presets/svelte-faust-synth/`

#### Scenario: App layout runs at root only

- **WHEN** `setup.sh` runs in a checkout with no `presets/` directory and a root `package.json`
- **THEN** it runs `npm ci` at the root only (the chassis is flattened, the root `package.json` is the app's)

### Requirement: `setup.sh --check` is suitable for human-driven onboarding and downstream-consumer CI

`scripts/setup.sh --check` SHALL be the documented mechanism a developer runs on a fresh machine to verify all global prereqs are installed at the required versions, and SHALL be safe for a downstream-consumer app's CI workflow to invoke as an early step. The kernel's own CI workflow SHALL NOT add a `setup-check` job (the kernel's CI provisions its prereqs explicitly via existing install steps; running a `--check` gate before provisioning would fail every bare runner with hints targeted at humans).

#### Scenario: A developer onboards by running `setup.sh --check`

- **WHEN** a developer runs `scripts/setup.sh --check` on a fresh machine
- **THEN** the script reports each missing prereq with its install hint and exits non-zero, telling the developer exactly which tools to install; once all are installed, a re-run exits 0

#### Scenario: Downstream consumer CI gates on `setup.sh --check`

- **WHEN** a consuming app's CI workflow runs `scripts/setup.sh --check` after its provisioning steps install the required tools
- **THEN** the check verifies the runner matches the prereq table and either passes (proceeding to subsequent jobs) or fails with the specific missing tool, providing actionable failure feedback in CI

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
