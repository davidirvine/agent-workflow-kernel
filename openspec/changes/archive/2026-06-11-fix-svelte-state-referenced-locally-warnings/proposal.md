## Why

The `svelte-faust-synth` preset's `WheelsPanel.svelte` and `PatchControl.svelte` destructure methods off their `wheelStorage` / `storage` props into module-scope `const` aliases. Under the Svelte 5 compiler this trips eight `state_referenced_locally` warnings on every `npm run build` — and because the preset is chassis content, the noise is inherited verbatim by **every** generated app. A preset whose build is loud with spurious warnings undermines the "clean, self-contained buildable unit" guarantee consumers rely on.

## What Changes

- In `presets/svelte-faust-synth/src/components/WheelsPanel.svelte`, wrap the three `wheelStorage.*` method aliases in `$derived` so the references are reactive-correct and the compiler no longer warns.
- In `presets/svelte-faust-synth/src/components/PatchControl.svelte`, wrap the five `storage.*` method aliases in `$derived` for the same reason.
- All call sites stay unchanged (the stated intent of the existing aliasing comments); the only change is making the alias bindings reactive — with one exception in `WheelsPanel`, where the component seeds local state from storage at setup (`let physics = $state(loadWheelPhysics())`). Once the alias is a `$derived`, that one-time read re-trips the same warning at the initialiser, so it is wrapped in Svelte's `untrack` to record the deliberate snapshot read.
- Add an `onwarn` handler to the preset's `svelte.config.js` (today an empty `{}`) that promotes any Svelte compiler warning to a build error, so a regressed warning **fails** `npm run build` rather than being printed and ignored. Because `svelte.config.js` is chassis content that travels via `new-app.sh` and `sync-kernel.sh`, this gate is inherited by every consuming app.
- Strengthen the preset-portability "self-contained buildable unit" guarantee so the bare preset build is required to emit **no** Svelte compiler warnings, turning warning-free build from an incidental property into an enforceable, portable contract.

No user-facing runtime behavior changes: `wheelStorage` / `storage` are stable props passed once, so the runtime result is identical, and the `onwarn` gate only affects build outcomes. Because nothing in the running app changes, the implementation commits and the PR title use the `chore` type (no release version bump); the `feature/`|`bugfix/` implementation-branch prefix is chosen at `/opsx-apply-wt` time (bugfix is the natural fit, as this corrects a defective noisy build).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `preset-portability`: the "self-contained buildable unit" requirement gains a guarantee that the bare preset build emits no Svelte compiler warnings, enforced by an `onwarn`-to-error gate that travels with the preset.

## Impact

- `presets/svelte-faust-synth/src/components/WheelsPanel.svelte`
- `presets/svelte-faust-synth/src/components/PatchControl.svelte`
- `presets/svelte-faust-synth/svelte.config.js` (new `onwarn` gate)
- `openspec/specs/preset-portability/spec.md` (delta)
- Downstream: every app generated from this preset, and any app that runs `sync-kernel.sh` to pull the updated chassis content, builds without the eight `state_referenced_locally` warnings and inherits the warning-fails-build gate. Because `WheelsPanel.svelte`, `PatchControl.svelte`, and `svelte.config.js` are synced chassis files, a consumer that has locally edited any of them sees `sync-kernel.sh`'s clobber protection flag a conflict (by design) rather than a silent overwrite.
- No dependency, API, or public-interface changes.
