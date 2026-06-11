## 1. Fix the alias bindings

- [ ] 1.1 In `presets/svelte-faust-synth/src/components/WheelsPanel.svelte`, wrap the three `wheelStorage.*` method aliases (`loadWheelPhysics`, `saveWheelPhysics`, `resetWheelPhysics`) in `$derived`; leave every call site unchanged. Format with the preset's prettier and commit (`chore(preset)`).
- [ ] 1.2 In `presets/svelte-faust-synth/src/components/PatchControl.svelte`, wrap the five `storage.*` method aliases (`listPatches`, `savePatch`, `loadPatch`, `deletePatch`, `renamePatch`) in `$derived`; leave every call site unchanged. Format with the preset's prettier and commit (`chore(preset)`).

## 2. Enforce warning-free builds

- [ ] 2.1 In `presets/svelte-faust-synth/svelte.config.js`, add an `onwarn(warning, defaultHandler)` handler that throws on any Svelte compiler warning so a regressed warning fails `npm run build`. Format and commit (`chore(preset)`).

## 3. Verify the build is clean and enforced

- [ ] 3.1 Run `npm run build` inside `presets/svelte-faust-synth/` and confirm it exits 0 with zero `state_referenced_locally` (or any other Svelte compiler) warnings and still produces `dist/` artifacts.
- [ ] 3.2 Confirm the gate bites: temporarily reintroduce one warning (e.g. revert a single alias to a plain `const`), run `npm run build`, observe a non-zero exit, then restore the fix. (Verification only — no commit.)
- [ ] 3.3 Run the preset gates — the power-off-silence and chassis-purity vitest plus the preset prettier check — and confirm they pass, demonstrating no behavioral drift.

## 4. Verify against the artifacts

- [ ] 4.1 Run `/opsx:verify fix-svelte-state-referenced-locally-warnings` to confirm the implementation matches the proposal, design, and the `preset-portability` spec delta (warning-free, gate-enforced bare build). If `verify` reports a mismatch, create follow-up tasks to resolve it before re-verifying — do not bundle corrective edits into this step. The `preset-portability` delta is applied to `openspec/specs/preset-portability/spec.md` at archive time (via the opsx archive/sync flow), not as a manual task here.
