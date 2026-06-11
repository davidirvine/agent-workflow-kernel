## Context

A generated app inherits `release-please-config.json` (`release-type: node`, `changelog-path: CHANGELOG.md`) and `.release-please-manifest.json` (reset to `{".": "0.1.0"}`) because both are in `kernel.paths`. What it does **not** inherit is a workflow that runs release-please: the kernel's own `.github/workflows/` is listed in `kernel.excludeFromGenerate`, and the kernel ships no release-please workflow at all (only `ci.yml`). So a generated app has the release config but nothing executes it — Conventional Commit history never yields a release PR, version bump, or changelog.

The preset already owns the one mechanism for putting app-tier workflows into a generated app: `appTemplates` in `kernel-manifest.json`. Today it has a single entry (`.github/workflows/ci.yml` → `templates/app-ci.yml`). The generator (`new-app.sh`), sync (`sync-kernel.sh`), and both gates (`generate-assert.sh`, `check-manifest.sh`) all iterate `appTemplates` generically — none hardcodes `ci.yml`. Adding a second entry is therefore a pure data change plus one new template file.

## Goals / Non-Goals

**Goals:**

- Every app generated from `svelte-faust-synth` receives a working `.github/workflows/release-please.yml` that runs `googleapis/release-please-action@v4` and drives release-PR / changelog / tag automation off the release-please config the app already carries.
- Existing consuming apps receive the same workflow on their next `sync-kernel.sh` (appTemplates re-apply on sync, with clobber protection).
- Zero changes to generator, sync, or gate scripts — rely entirely on their existing data-driven `appTemplates` handling.
- The new template and manifest entry are covered by the existing `generate-assert` and `check-manifest` gates with no new gate code.

**Non-Goals:**

- **The kernel's own release automation.** The kernel still has release-please config without a runner; wiring a release-please workflow for the _kernel repo itself_ is a separate change. It is out of scope here both because the user scoped this to the preset's `appTemplates` and because the kernel's `.github/workflows/` is `excludeFromGenerate` (a kernel `release-please.yml` would not travel anyway).
- Changing the release-please **config** that travels (`release-please-config.json`, `.release-please-manifest.json`). The new workflow consumes the existing config unchanged.
- Adding a release/publish step beyond what release-please does (no npm publish, no deploy). The workflow opens release PRs and tags on merge; nothing more.
- Touching the existing `ci.yml` app-tier template.

## Decisions

### D1: The release workflow is a preset `appTemplates` entry, not a kernel file

`appTemplates` is a per-preset concept in `kernel-manifest.json`; the kernel has no `appTemplates` field. Putting the release workflow there (rather than in the kernel's `.github/workflows/`) is both what the request asks and the only path that actually reaches a generated app — kernel workflows are `excludeFromGenerate`. Target path in the generated app: `.github/workflows/release-please.yml`; source: `presets/svelte-faust-synth/templates/release-please.yml`.

_Alternative considered:_ ship it as a kernel workflow and remove `.github/workflows/**` from `excludeFromGenerate`. Rejected — that would also leak the kernel's `ci.yml` (which references `presets/`, `kernel-manifest.json`, and kernel-only scripts the app lacks) into every app. The exclusion exists precisely to prevent that.

### D2: Use `googleapis/release-please-action@v4` in manifest mode, relying on the traveling config

The workflow pins `googleapis/release-please-action@v4` and passes only `token: ${{ secrets.GITHUB_TOKEN }}`. v4 defaults to manifest mode, auto-detecting `release-please-config.json` and `.release-please-manifest.json` at the repo root — exactly the files the generated app already has. The release type (`node`) and changelog path live in that config, so the workflow carries no duplicated release settings and stays in sync with the config automatically.

_Alternative considered:_ pass explicit `release-type: node` inputs on the action. Rejected — it would duplicate the config and risk drift; manifest mode is the single source of truth.

### D3: Trigger on push to `main`, with least-privilege permissions and a concurrency guard

```yaml
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
concurrency:
  group: release-please-${{ github.ref }}
  cancel-in-progress: false
```

`contents: write` lets the action create the release commit/tag; `pull-requests: write` lets it open/update the release PR. `cancel-in-progress: false` (unlike `ci.yml`'s `true`) because a release run mutating tags/PRs should not be cancelled mid-flight by a rapid follow-up push. Identity-free (no app name), so the file is copied verbatim like `app-ci.yml` — no substitution, no identity-leak surface.

### D4: The release-automation template is a new, independent requirement — not a modification of the CI-template requirement

The delta adds a **new** `preset-portability` requirement ("A preset declares its app-tier release-automation workflow template") rather than modifying the existing "A preset declares its app-tier CI template in the sync manifest" requirement. The two are intentionally independent: the CI-template requirement's "at minimum the preset SHALL ship an app-tier CI workflow template" clause stays exactly as written — it sets the CI-template floor and is unchanged by adding a second, separately-required template. Keeping them independent means each can be reasoned about and validated on its own (a preset's CI obligation does not become entangled with its release-automation obligation), and the delta stays a clean ADDED with no risk of losing detail from a partial MODIFIED rewrite.

This change **complements** the existing `release-automation` spec without modifying it. That spec governs the release-please **config** (how releases derive from Conventional Commit history, the seeded baseline, the PR-title-is-the-bump rule) for the kernel repo; this change adds the **runner** that executes that config in a generated app. Config and runner are distinct concerns, so `release-automation` is left untouched and only `preset-portability` (which owns the `appTemplates` contract) gains a requirement.

### D5: No script or other gate changes

`new-app.sh` writes each `appTemplates` target at generation; `sync-kernel.sh` re-applies them on sync; `generate-assert.sh` asserts every `appTemplates` target exists with matching content; `check-manifest.sh` asserts every `appTemplates` source exists and no target collides with a `paths` entry. All four iterate the manifest, so the new entry is handled with no code change. `smoke-app.sh` builds the generated app and never touches workflows, so it is unaffected. This is the crux that keeps the change a two-file edit.

## Risks / Trade-offs

- **`GITHUB_TOKEN`-created release PRs do not trigger the app's `ci.yml`** → Known GitHub behavior (events from the default token don't start further workflow runs). The release PR is still opened/updated and merges/tags correctly; only the _CI run on the release PR itself_ is skipped. Mitigation: documented in the template's header comment; a consumer who wants CI on release PRs can swap in a PAT/app token. Acceptable default — the generated app is a starting point, not a locked policy.
- **Third-party action dependency** (`googleapis/release-please-action@v4`) → Pinned to the major tag `v4` (Google's officially maintained action), matching the project's existing convention of major-tag pins for first-party-ish actions (`actions/checkout@v4`, `actions/setup-node@v4`). Trade-off: `v4` floats within the major; accepted for parity with the existing `ci.yml` pins.
- **`main`-branch assumption** → The trigger hardcodes `main`, consistent with the kernel/app convention that `main` is the release branch. An app that renames its default branch must edit the workflow; this is app-owned content after generation, so that edit is expected.
- **Existing apps only get it on a version-bumping sync** → `sync-kernel.sh` is a deliberate version bump, a no-op when the app is at/ahead of the kernel. The new workflow reaches existing apps only when they sync past the kernel version carrying this change. Acceptable — that's the established sync contract, not a regression.

## Migration Plan

1. Add `presets/svelte-faust-synth/templates/release-please.yml`.
2. Add the `appTemplates` entry to `kernel-manifest.json`.
3. Run `check-manifest.sh` and `generate-assert.sh` locally — both pass without edits, proving the data-driven path. Rollback is reverting the two files; no migration of existing kernel state is required.

## Open Questions

None.
