# release-automation Specification

## Purpose

Defines how the agent-workflow-kernel repo derives its own version bumps and changelog entries from Conventional Commit history via release-please, and how the single-PR-per-branch discipline in CLAUDE.md feeds that automation (the squash-merged PR title is the release-parse input). Also seeds an explicit starting version so the first release-please run has a deterministic baseline.

## Requirements

### Requirement: Releases derive from Conventional Commit history

The repository SHALL configure release-please (`release-please-config.json` + `.release-please-manifest.json`) with release type `node`, so that version bumps and `CHANGELOG.md` entries for this repo are generated from Conventional Commit history rather than maintained by hand.

#### Scenario: a feature commit produces a minor-bump release PR

- **WHEN** release-please runs after a `feat`-typed change has merged to `main`
- **THEN** it opens or updates a release PR proposing a minor version bump and a corresponding `CHANGELOG.md` entry

#### Scenario: chore/docs commits produce no version bump

- **WHEN** only `chore`/`docs`/`refactor`/`test`-typed changes have merged since the last release
- **THEN** release-please proposes no version bump

### Requirement: The PR title is the release-parse input

The release configuration SHALL treat the squash-merged pull request title as the Conventional Commit that determines the version bump, consistent with the single-PR-per-branch discipline in CLAUDE.md.

#### Scenario: PR title sets the bump

- **WHEN** a feature branch is squash-merged with a Conventional Commit PR title
- **THEN** that title is the commit release-please parses to decide the bump, independent of the per-commit types on the branch

### Requirement: Initial version is seeded

The release manifest SHALL seed an explicit starting version (`0.1.0`) so release-please's first run does not infer a surprising baseline.

#### Scenario: first release PR builds on the seed

- **WHEN** release-please runs for the first time after this slice merges
- **THEN** it computes the next version relative to the seeded `0.1.0` baseline
