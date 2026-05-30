---
tier: kernel
---

# app-generation Specification

## Purpose

Defines the kernel-tier contract that `scripts/new-app.sh` honors when emitting a fresh app from this kernel plus a chosen preset: a self-contained, identity-clean app directory with the chassis in place, the instrument blanked from committed stubs, donor identity substituted to the new app's name, package version reset to `0.1.0`, an empty `openspec/changes/`, and `git init` run. The contract is gated by a committed `scripts/generate-assert.sh` that ships with the kernel and to consumers, so the same structural check runs in CI and downstream.

## Requirements

### Requirement: Generator emits a complete, identity-clean fresh app from kernel + preset + name

`scripts/new-app.sh` SHALL, given a `--name <app-name>`, `--output <path>`, and `--preset <name>` (default `svelte-faust-synth`), emit an app directory at the output path containing every kernel-tier and stack-tier file declared in `kernel-manifest.json`, the preset's instrument-tier stub files written at their target paths, donor identity substituted to the app's name, package version reset to `0.1.0`, an empty `openspec/changes/`, and an initialized git repository with a single initial commit.

#### Scenario: Generation produces the expected tree

- **WHEN** `new-app.sh --name smoke-app --output <tempdir>/smoke-app --preset svelte-faust-synth` runs against a clean output path
- **THEN** the output is a directory whose contents include every path listed in `kernel.paths` (minus the `kernel.excludeFromGenerate` set) and every path in the preset's `stack.presets[<preset>].paths` (preset-flattened, with the preset winning for any overlap), every spec listed in `kernel.specs` and in the preset's `specs` exists at the corresponding path under `openspec/specs/`, every `instrumentStubs` target path exists with the corresponding stub's content, every `appTemplates` target path exists with the corresponding template's content, `openspec/changes/` contains only `.gitkeep`, `openspec/changes/archive/` does not exist, and the directory is a git repository

### Requirement: CLI refuses an existing output path

The generator SHALL refuse to write into an `--output` path that already exists, reporting the conflict and exiting non-zero, rather than overwriting or merging into existing content.

#### Scenario: Existing output is refused

- **WHEN** `new-app.sh --name x --output <path>` runs and `<path>` already exists (file or directory)
- **THEN** the command exits non-zero with a message identifying the conflict and naming the action the user should take (remove the path or choose a different one); no files are written or modified

### Requirement: The app name is validated as kebab-case

`--name` SHALL match `^[a-z][a-z0-9-]*$` (the intersection of npm package-name conventions and URL-safe localStorage namespaces). Invalid names SHALL be refused with a clear message before any work begins.

#### Scenario: Invalid app name is rejected

- **WHEN** `--name` is empty, contains uppercase, spaces, dots, colons, or other characters outside `[a-z0-9-]`, or begins with a digit or hyphen
- **THEN** the command exits non-zero before any files are read or written, with a message naming the regex and the offending input

### Requirement: Donor identity is substituted at every site

The emitted tree SHALL contain no donor-identity literal nor any un-substituted sentinel token. Specifically:

- The `'__APP_NAMESPACE__'` literal in the chassis Shell SHALL be replaced with the new app's name as its localStorage namespace.
- The Vite-injected defines `__APP_TITLE__` and `__APP_REPO_URL__` in the generated `vite.config.js` SHALL be set to the values supplied by `--title` and `--repo-url` (or their derived defaults).
- The `package.json` `name` SHALL equal the new app's name, `version` SHALL be `0.1.0`, and `description` SHALL NOT contain the preset's reference-instrument phrasing.
- `.release-please-manifest.json` SHALL be `{".": "0.1.0"}`.

#### Scenario: Identity-leak check passes on the emitted tree

- **WHEN** the emitted tree's own `scripts/check-identity-leak.sh` runs inside the emitted tree
- **THEN** it exits 0 — no donor literal (`synth-d:`, `davidirvine/synth-d`, `SYNTH-D`) and no un-substituted sentinel survives outside the per-preset Shell allowlist (which has been substituted to the new app's namespace)

#### Scenario: Vite identity defines are the app's, not the preset's

- **WHEN** the emitted `vite.config.js` is inspected
- **THEN** `__APP_TITLE__` and `__APP_REPO_URL__` are set to the values from `--title` / `--repo-url`, not the preset's placeholder strings

### Requirement: The generator is stack-agnostic

`scripts/new-app.sh` SHALL determine what to copy, what to stub, and what to substitute by reading `kernel-manifest.json` and the chosen preset's `instrumentStubs` field. It SHALL NOT contain hardcoded knowledge of a specific preset's file names beyond the small fixed set of identity substitutions documented in its source.

#### Scenario: A new preset works without script edits

- **WHEN** a future preset is added with its own `paths` and `instrumentStubs` entries in `kernel-manifest.json`
- **THEN** `new-app.sh --preset <new-preset>` works without modification to `scripts/new-app.sh`, except for any additions to the documented identity-substitution set

### Requirement: `openspec/changes/archive/` does not travel

Generation SHALL NOT copy `openspec/changes/archive/` from the kernel into the emitted app. The emitted app's `openspec/changes/` directory SHALL contain only a `.gitkeep` placeholder.

#### Scenario: Archive is absent from emitted tree

- **WHEN** the emitted tree's `openspec/changes/` is inspected
- **THEN** it contains exactly one file (`.gitkeep`) and no `archive/` subdirectory

### Requirement: The emitted app is a git repository with a single initial commit

The generator SHALL run `git init` inside `--output` and produce a single initial commit whose message is `chore: scaffold <name> from agent-workflow-kernel + <preset>` containing all emitted files.

#### Scenario: Emitted app is a git repository

- **WHEN** the emitted tree is inspected with `git` commands
- **THEN** it is a valid git repository, contains exactly one commit, and that commit's message starts with `chore: scaffold <name>`

### Requirement: A committed `generate-assert.sh` is the slice's gate, shipped to consumers

The kernel SHALL ship `scripts/generate-assert.sh` — a committed script (not workflow YAML) that runs `new-app.sh` into a temporary directory and asserts every requirement above. The script SHALL be runnable locally and in CI, and SHALL leave no temporary state on success.

#### Scenario: generate-assert passes for a clean kernel + preset

- **WHEN** `scripts/generate-assert.sh` runs in a clean checkout
- **THEN** it executes the generator into a tempdir, runs the structural and identity checks above, tears down the tempdir, and exits 0
