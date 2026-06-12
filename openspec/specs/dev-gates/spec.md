---
tier: kernel
---

# dev-gates Specification

## Purpose

Defines the local and CI development gates for the agent-workflow-kernel repo: a runnable repo-local formatter, git hooks that activate on install, commit- and push-time formatting/lint gates, the explicit-review posture (no auto-review on commit), and the CI jobs that mirror those local gates. Together these guarantee that any push CI would reject also fails locally first, and that the kernel's own checks are gated from the very first commit.

## Requirements

### Requirement: Repo-local formatter is runnable

The repository SHALL provide a `package.json` declaring `prettier` and the plugin its `.prettierrc` requires (`prettier-plugin-toml`) as devDependencies, such that the STACK.md-documented `npx prettier --write <file>` runs against the committed `.prettierrc` without a `--no-config` workaround. `.prettierrc` SHALL NOT declare plugins or overrides for file types the kernel root does not contain (e.g. Svelte).

#### Scenario: prettier runs with the repo config

- **WHEN** a contributor runs `npm install` and then `npx prettier --check` on a Markdown, JSON, or TOML file
- **THEN** prettier loads `.prettierrc` (including its declared plugins) and reports formatting status without a missing-plugin error

### Requirement: Hooks activate on install

Installing dependencies SHALL activate the repository's committed git hooks so that a fresh checkout is gated after a single `npm install`, and the activation SHALL be resilient to roborev's own hook installation via **tolerate-and-heal**. roborev re-arming its hooks (`install-hook`/`init`, or as a side effect of `roborev review`/`refine`) **does** modify the tracked `.githooks/post-commit` source, so the guarantee is not prevention but recovery: `scripts/install-hooks.sh` SHALL restore the no-op `post-commit` stub on the next `npm install`/setup (post-commit only — `post-rewrite`'s `remap` is left intact), and the re-armed hook SHALL NOT break the push gate. A roborev hook installation can thus neither leave auto-review permanently armed nor block an otherwise-clean push.

#### Scenario: postinstall wires hooks

- **WHEN** `npm install` completes in a git work tree
- **THEN** the committed hooks become the active hooks for subsequent git operations

#### Scenario: no-op outside a work tree

- **WHEN** the install runs where no git work tree is present (e.g. a tarball or CI container without git state)
- **THEN** hook activation is skipped without error

#### Scenario: a roborev hook installation is tolerated and healed

- **WHEN** roborev runs `install-hook`/`init` (or `roborev review`/`refine` re-installs its hooks) after hooks are activated, modifying the tracked `.githooks/post-commit`
- **THEN** the re-armed hook does not cause the push gate (`scripts/checks.sh`) to fail, and `scripts/install-hooks.sh` restores the no-op `post-commit` stub on the next `npm install`/setup

### Requirement: Commits are gated by formatting and lint checks

A `pre-commit` hook SHALL run `shfmt` and `shellcheck` on staged `*.sh` files and `prettier --check` on staged `*.md`/`*.json`/`*.toml` files, and SHALL block the commit when any check fails.

#### Scenario: staged file violates formatting

- **WHEN** a commit is attempted with a staged file that fails its formatter or linter
- **THEN** the commit is rejected and the failing check and file are reported

#### Scenario: missing tool is reported actionably

- **WHEN** a required tool (`prettier`, `shfmt`, or `shellcheck`) is not available at commit time
- **THEN** the hook exits non-zero with an actionable message naming the missing tool rather than a stack trace

### Requirement: Pushes are gated by checks identical to CI

A `pre-push` hook SHALL run the repository's single shared checks script (`scripts/checks.sh`) over the whole repository, and CI SHALL run that **same** script, so that any push CI would reject also fails locally before it is sent. The shared checks SHALL NOT be made to fail by roborev-managed hook files (an installed `post-commit`/`post-rewrite` carrying roborev's own formatting): such files MUST either be kept out of the tracked lint scope or kept out of the tracked tree entirely, so a roborev hook (re)installation cannot block an otherwise-clean push.

#### Scenario: push fails for a repo-wide violation

- **WHEN** `git push` runs while any tracked file fails `scripts/checks.sh`
- **THEN** the push is aborted locally with the same failure CI would report

#### Scenario: hook and CI invoke the same script

- **WHEN** the `pre-push` hook and the CI lint/format job both run
- **THEN** both invoke `scripts/checks.sh`, so the check command cannot drift between them

#### Scenario: vendored files are not inspected

- **WHEN** `scripts/checks.sh` runs in a checkout where `node_modules/` is present
- **THEN** it discovers files via `git ls-files` and inspects no file under `node_modules/` (which `.gitignore` excludes from tracking)

#### Scenario: a roborev-managed hook does not block the push gate

- **WHEN** roborev has installed or re-armed its `post-commit`/`post-rewrite` hook (with its own formatting) and `git push` runs while no kernel-authored file violates the checks
- **THEN** the push is not blocked by the roborev-managed hook file

### Requirement: Commits are not auto-reviewed

The repository SHALL enforce the explicit-gate review posture such that no automatic code review is enqueued by a commit on any branch. Auto-review is **hook-driven** — a review is enqueued only when an armed `post-commit` hook runs `roborev post-commit`; the daemon does **not** poll the repository (registration in `roborev repo list` is a lazy side effect of that enqueue, so it watches nothing on its own). The committed no-op `.githooks/post-commit` stub is therefore the enforcement: it enqueues nothing. The enforcement SHALL be durable via **tolerate-and-heal**: roborev re-arming the hook — through `install-hook`/`init`, **or as a side effect of `roborev review`/`refine`** — SHALL NOT leave auto-review permanently armed (`scripts/install-hooks.sh` restores the no-op stub on the next `npm install`/setup) and SHALL NOT break the push gate. The committed stub SHALL remain the version-controlled statement of the posture, and its in-file documentation MUST describe the actual enforced mechanism (it MUST NOT claim a roborev hook written to `.git/hooks/` is "inert because `core.hooksPath` points at `.githooks`", which is false — roborev follows `core.hooksPath`).

#### Scenario: committing enqueues no review

- **WHEN** a commit is made on any branch
- **THEN** no automatic roborev review is enqueued by the commit, whether via a committed/installed `post-commit` hook or via the daemon observing the repository

#### Scenario: a roborev re-arm is tolerated and healed

- **WHEN** roborev re-arms the `post-commit` (or `post-rewrite`) hook — via `install-hook`/`init`, or as a side effect of running `roborev review`/`refine`
- **THEN** the re-armed hook does not break the push gate (see "Pushes are gated by checks identical to CI"), and `scripts/install-hooks.sh` restores the no-op `post-commit` stub on the next `npm install`/setup, so commits enqueue no automatic review once healed

#### Scenario: posture survives the daemon observing the repository

- **WHEN** the roborev daemon would otherwise auto-register or watch this repository and enqueue a review per `main` commit
- **THEN** the enforced posture keeps the repository out of that auto-review path, so commits to `main` enqueue no automatic review

#### Scenario: documentation matches the enforced posture

- **WHEN** the posture is described in the committed stub, `.roborev.toml`, `CLAUDE.md`, and `WORKFLOW-NOTES.md`
- **THEN** those descriptions agree with the actually-enforced behavior and contain no claim contradicted by roborev's real hook/daemon behavior

### Requirement: CI enforces lint and format on push and pull request

A GitHub Actions workflow SHALL run the shared lint/format checks on push and pull request, using the Node version pinned in `.nvmrc` and provisioning `shfmt` (since it is not preinstalled on the runner).

#### Scenario: CI rejects a formatting violation

- **WHEN** a push or pull request contains a file that fails `scripts/checks.sh`
- **THEN** the CI lint/format job fails

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
