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

Installing dependencies SHALL activate the repository's committed git hooks by pointing `core.hooksPath` at `.githooks`, so a fresh checkout is gated after a single `npm install`.

#### Scenario: postinstall wires hooks

- **WHEN** `npm install` completes in a git work tree
- **THEN** `core.hooksPath` is set to `.githooks` and the committed hooks are the active hooks for subsequent git operations

#### Scenario: no-op outside a work tree

- **WHEN** the install runs where no git work tree is present (e.g. a tarball or CI container without git state)
- **THEN** hook activation is skipped without error

### Requirement: Commits are gated by formatting and lint checks

A `pre-commit` hook SHALL run `shfmt` and `shellcheck` on staged `*.sh` files and `prettier --check` on staged `*.md`/`*.json`/`*.toml` files, and SHALL block the commit when any check fails.

#### Scenario: staged file violates formatting

- **WHEN** a commit is attempted with a staged file that fails its formatter or linter
- **THEN** the commit is rejected and the failing check and file are reported

#### Scenario: missing tool is reported actionably

- **WHEN** a required tool (`prettier`, `shfmt`, or `shellcheck`) is not available at commit time
- **THEN** the hook exits non-zero with an actionable message naming the missing tool rather than a stack trace

### Requirement: Pushes are gated by checks identical to CI

A `pre-push` hook SHALL run the repository's single shared checks script (`scripts/checks.sh`) over the whole repository, and CI SHALL run that **same** script, so that any push CI would reject also fails locally before it is sent.

#### Scenario: push fails for a repo-wide violation

- **WHEN** `git push` runs while any tracked file fails `scripts/checks.sh`
- **THEN** the push is aborted locally with the same failure CI would report

#### Scenario: hook and CI invoke the same script

- **WHEN** the `pre-push` hook and the CI lint/format job both run
- **THEN** both invoke `scripts/checks.sh`, so the check command cannot drift between them

#### Scenario: vendored files are not inspected

- **WHEN** `scripts/checks.sh` runs in a checkout where `node_modules/` is present
- **THEN** it discovers files via `git ls-files` and inspects no file under `node_modules/` (which `.gitignore` excludes from tracking)

### Requirement: Commits are not auto-reviewed

The repository SHALL encode the explicit-gate review posture in a committed `.githooks/post-commit` no-op stub, so that committing never enqueues an automatic code review and the posture is version-controlled rather than dependent on ambient roborev configuration.

#### Scenario: committing enqueues no review

- **WHEN** a commit is made on any branch
- **THEN** no automatic roborev review is enqueued by the commit

#### Scenario: posture survives a roborev re-init

- **WHEN** `roborev init` later installs a `post-commit` hook into `.git/hooks/`
- **THEN** it is inert while `core.hooksPath` points at `.githooks`, and any change to the committed stub appears as a reviewable diff

### Requirement: CI enforces lint and format on push and pull request

A GitHub Actions workflow SHALL run the shared lint/format checks on push and pull request, using the Node version pinned in `.nvmrc` and provisioning `shfmt` (since it is not preinstalled on the runner).

#### Scenario: CI rejects a formatting violation

- **WHEN** a push or pull request contains a file that fails `scripts/checks.sh`
- **THEN** the CI lint/format job fails

### Requirement: Smoke-app CI job exists as a pending stub

The CI workflow SHALL define a `smoke-app` job whose body is a single placeholder step that succeeds and announces it is pending until slice 5, so the harness slot is present from the start and later slices fill in pipeline stages by editing this one job.

#### Scenario: smoke-app job is present and green

- **WHEN** CI runs for this slice
- **THEN** a `smoke-app` job appears in the run, succeeds, and its output states it is a pending stub
