## 1. Add the release-automation workflow template

- [x] 1.1 Create `presets/svelte-faust-synth/templates/release-please.yml`: a header comment explaining it runs the release-please runner for the app's traveling release-please config (and noting the `GITHUB_TOKEN`/PAT caveat from design D3/Risks); `name: release-please`; `on: push: branches: [main]`; `permissions: contents: write` + `pull-requests: write`; a `concurrency` group with `cancel-in-progress: false`; a single job running `googleapis/release-please-action@v4` with `token: ${{ secrets.GITHUB_TOKEN }}` (manifest mode — no `release-type` input, per design D2). Carry no app-identity literal or sentinel.
- [x] 1.2 Validate and format the new template by running `npx prettier --write presets/svelte-faust-synth/templates/release-please.yml`: prettier parses YAML, so a successful write both formats the file and proves it is syntactically valid YAML (the step-3 gates only check file existence/content equality, not YAML validity, so this is the validating step).

## 2. Wire the template into the preset's appTemplates

- [ ] 2.1 In `kernel-manifest.json`, add to `stack.presets["presets/svelte-faust-synth"].appTemplates` the entry `".github/workflows/release-please.yml": "templates/release-please.yml"` (alongside the existing `ci.yml` entry).
- [ ] 2.2 Run `npx prettier --write kernel-manifest.json`.

## 3. Verify against the existing data-driven gates (no script edits)

- [ ] 3.1 Run `scripts/check-manifest.sh` — confirm it asserts the new `appTemplates` source exists and the target does not collide with `paths`, and exits 0.
- [ ] 3.2 Run `scripts/check-identity-leak.sh` — confirm the new template introduces no donor literal or sentinel; exits 0.
- [ ] 3.3 Run `scripts/generate-assert.sh` — confirm the emitted app contains `.github/workflows/release-please.yml` with the template's content (the generic `appTemplates` assertion), the sync round-trip still passes, and the script exits 0 and tears down its tempdir.
- [ ] 3.4 Run `scripts/smoke-app.sh` — confirm a freshly generated app still builds (the new workflow file does not affect the build) and the script exits 0.

## 4. Document the generated workflow

- [ ] 4.1 Add a note to the "Using new-app.sh" section of `STACK.md` stating that the generated app also receives `.github/workflows/release-please.yml` (sourced from the preset's `appTemplates`), providing the runner for the release-please config that already travels.
- [ ] 4.2 Lint/format any edited Markdown (`npx prettier --write <file>`).
