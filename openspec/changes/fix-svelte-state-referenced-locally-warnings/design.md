## Context

`WheelsPanel.svelte` and `PatchControl.svelte` receive a storage adapter as a prop (`wheelStorage` and `storage` respectively) and, at the top of `<script>`, alias the adapter's methods into module-scope `const`s so the rest of the component can call `savePatch(...)` instead of `storage.savePatch(...)`. A comment in `PatchControl.svelte` records the intent: "Local aliases keep the call sites unchanged from the pre-refactor shape."

Under the Svelte 5 compiler, reading a `$props()`-derived value to initialise a plain `const` is flagged with `state_referenced_locally`: the binding captures only the prop's initial value and would not track a reassignment of the prop. There are eight such sites (three in `WheelsPanel`, five in `PatchControl`), so each preset build prints eight warnings, and every generated/synced app inherits them.

In this codebase the warning is a false positive — the adapters are constructed once and passed down unchanged; the props are never reassigned. But "we know it never changes" is not something the compiler can see, and the noise erodes confidence in an otherwise clean build.

## Goals / Non-Goals

**Goals:**

- Eliminate the eight `state_referenced_locally` warnings from the bare preset build.
- Keep every call site unchanged — the fix is confined to the eight alias bindings, plus one `$state` initialiser in `WheelsPanel` (see D1) whose one-time read of the now-reactive `loadWheelPhysics` alias must be `untrack`ed.
- Make "the preset build is warning-free" an enforceable spec guarantee rather than an incidental property, so a future regression is caught by a gate.

**Non-Goals:**

- Changing any runtime behavior, prop shape, or storage adapter API.
- Refactoring the components beyond the alias lines.
- Auditing the whole preset for unrelated lint warnings (none are emitted today; the requirement codifies the current clean state plus this fix).

## Decisions

### D1: Wrap each alias in `$derived` rather than removing the aliases or suppressing the warning

The reference becomes reactive-correct: `const savePatch = $derived(storage.savePatch)`. Reading and calling `savePatch(...)` continues to work (a `$derived` holding a function value is callable). For aliases read only inside functions/event handlers (all five in `PatchControl`, and `saveWheelPhysics`/`resetWheelPhysics` in `WheelsPanel`), this fully resolves the warning.

**One init-site exception:** `WheelsPanel` seeds component state from storage at setup time — `let physics = $state(loadWheelPhysics())`. Once `loadWheelPhysics` is a `$derived` (reactive), reading it to initialise a plain `$state` re-trips `state_referenced_locally` at the initialiser — the warning is relocated, not removed. The one-time load is genuinely a snapshot (`physics` is mutated locally thereafter and never re-reads storage), so we wrap the read in Svelte's `untrack`: `let physics = $state(untrack(() => loadWheelPhysics()))`. `untrack` is a real semantic — "read the current value without establishing a dependency" — not a suppression directive, so it is consistent with rejecting `// svelte-ignore` below: it makes the deliberate one-time read explicit rather than hiding the warning.

**Alternatives considered:**

- **Remove the aliases, inline `storage.savePatch(...)` at every call site.** Correct, but it churns many call sites and discards the documented "keep call sites unchanged" intent. Larger diff, more review surface, no benefit over `$derived`.
- **Suppress with `// svelte-ignore state_referenced_locally`.** Hides the warning without making the binding correct, and scatters ignore directives that future readers must trust. `$derived` fixes the underlying reason the compiler warns.
- **Pass the individual methods as separate props.** Changes the component's public prop contract and the Shell wiring for no behavioral gain.

`$derived` is the minimal, idiomatic Svelte 5 fix: smallest diff, call sites untouched, and the binding is now genuinely reactive so the warning is resolved at its cause.

### D2: Codify warning-free build as a `preset-portability` requirement delta, enforced by an `onwarn`-to-error gate

The existing "self-contained buildable unit" requirement asserts only that the bare preset build **exits 0**. But `vite build` exits 0 even when the Svelte compiler prints warnings — exactly today's situation, where eight warnings are printed and ignored. A spec scenario that merely asserts "no warnings are emitted" without an enforcement mechanism is aspirational documentation: a future contributor reintroduces a warning, CI stays green, and the spec claim silently becomes false.

So the delta is backed by a real gate. The preset's `svelte.config.js` is currently an empty `{}`; we add an `onwarn(warning, defaultHandler)` handler that **throws** on any Svelte compiler warning, turning a warning into a non-zero `npm run build`. The existing `preset-build` CI gate (and any consumer's build) then fails on a regressed warning without needing a separate grep step or log-scraping. Because `svelte.config.js` is chassis content listed in the preset's manifest `paths`, the gate travels via `new-app.sh` and `sync-kernel.sh`, so generated and synced apps inherit the same enforcement — the guarantee is portable, not kernel-CI-only.

**Alternatives considered:**

- **No spec change; treat the fix as pure implementation detail.** Rejected — the spec-driven workflow needs the contract recorded, and "clean build" is a real consumer-facing property worth gating.
- **Spec scenario with no enforcement mechanism (manual/review-time only).** Rejected — that is the "aspirational documentation" failure mode above; the spec would claim "enforceable contract" while nothing enforces it.
- **CI-only grep of `npm run build` output in the kernel `preset-build` job.** Workable but brittle (couples to log format) and kernel-CI-only — it would not travel to consuming apps, so a generated app could regress silently. The `onwarn` gate is both more robust and portable.

### D3: Use the `chore` Conventional Commit type, not `fix`

The warnings are false positives with zero runtime impact — the code already behaves correctly. Under Conventional Commits this is build/tooling hygiene (`chore`), not a correction of incorrect runtime behaviour (`fix`). Per `CLAUDE.md`, the PR title's type is the `release-please` parse input, so a `fix` title would cut an unintended patch release for a change with no user-facing runtime delta. Implementation commits use `chore(preset)` and the PR title uses `chore`. The implementation-branch prefix (`feature/`|`bugfix/`) is a separate axis chosen at `/opsx-apply-wt`; `bugfix/` is the natural fit (a defective noisy build) and does not affect the release type, which is driven solely by the PR title.

## Risks / Trade-offs

- **[A `$derived` function value behaves differently from a plain const at a call site] → Mitigation:** semantically it does not — reading the derived yields the same function reference; calling it is unchanged. The power-off-silence and chassis-purity vitest gates plus a manual build confirm no behavioral drift.
- **[The new "no warnings" scenario is asserted against build output text, which is brittle to tooling changes] → Mitigation:** scope the guarantee to Svelte compiler warnings surfaced by the preset's own `npm run build`, the same command the `preset-build` gate already runs; it asserts the property a consumer actually observes rather than a specific log format.
- **[The `onwarn`-to-error gate escalates *all* Svelte warnings, so a future benign warning becomes a hard build failure for chassis or instrument authors] → Mitigation:** this is the intended contract — the chassis is meant to stay warning-clean, and a hard failure forces a deliberate choice (fix the warning, or consciously narrow the handler in a reviewed change) rather than silent drift. The current build emits only these eight warnings; once fixed the build is clean, so enabling the gate is safe at adoption time and the smoke-app/preset-build gates confirm a freshly generated app still builds green.

## Migration Plan

Edit the eight alias lines, add the `onwarn` gate to `svelte.config.js`, run the preset build to confirm it exits 0 with zero warnings, and run the existing preset gates. No data migration, no rollback complexity — reverting the diff fully restores prior behavior (warnings included).

**Downstream sync:** `WheelsPanel.svelte`, `PatchControl.svelte`, and `svelte.config.js` are synced chassis files. A consumer who has locally modified any of them will see `sync-kernel.sh`'s clobber protection refuse the sync and list the conflict (the documented by-design behavior) rather than have local edits overwritten — they merge the change by hand or `--accept-kernel` deliberately. Apps that have not touched those files pick the fix up cleanly on next sync.
