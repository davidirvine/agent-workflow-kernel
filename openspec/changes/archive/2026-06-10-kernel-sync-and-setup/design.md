## Context

Slice 3 shipped `new-app.sh` (one-shot generation) and `generate-assert.sh` (the structural gate), built on slice 2's `kernel-manifest.json` + `check-manifest.sh` + `check-identity-leak.sh`. The `expand_entry()` helper is now copy-pasted into three scripts (`new-app.sh`, `generate-assert.sh`, `check-manifest.sh`); slice 4 adds at least two more scripts that need it. There is no kernel-version stamp anywhere yet — slice 1's D5 explicitly defers the decision to this slice ("most likely be this same release-please-managed version"). The kernel's `.release-please-manifest.json` already tracks the kernel's own version (`0.1.0` at slice-3 archive time); slice 4 promotes that into the sync mechanism.

## Goals / Non-Goals

**Goals:**

- Make sync a deliberate, reproducible bump (X.Y.Z → A.B.C) with a clear dry-run upgrade path, not an unbounded HEAD pull.
- Protect locally-modified synced files from silent clobber via a committed hash record; refuse on conflict unless the user opts in.
- Mirror `new-app.sh`'s manifest semantics exactly (`excludeFromGenerate` honored; preset-wins overlap; preset paths flattened; `appTemplates` re-applied) so sync and generation cannot drift in what they consider a synced file.
- Ship one idempotent `setup.sh` that runs in both the kernel checkout and any generated app, with a `--check` mode CI reuses to gate runner readiness.
- Consolidate `expand_entry()` and the manifest-reading patterns into one shared library, sourced by all five (now) kernel scripts.

**Non-Goals:**

- No partial-sync flags (`--only specs`, `--exclude .githooks`) — full sync only; partial sync invites surprise.
- No three-way merge or automatic conflict resolution — `--accept-kernel` is the single escape hatch; manual merge is the user's job.
- No deletion semantics — if the kernel removes a file, sync reports it informationally; it does not delete from the consuming app.
- No `instrumentStubs` re-application on sync — the instrument is app-owned content after generation; sync touching it would clobber the user's work.
- No replacement for slice 5's smoke-app full pipeline — this slice's CI gate is a sync round-trip dry-run on the slice-3 fixture, not a re-build.
- No interactive prompts — `setup.sh` and `sync-kernel.sh` are scripted (CI-friendly); the only "ask the user" is exit-non-zero with an instruction.

## Decisions

### D1 — Kernel-version source-of-truth is `.release-please-manifest.json` `"."`; the stamp file is `.kernel-version`

The kernel's release version (the value release-please bumps from Conventional Commit history) is already maintained in `.release-please-manifest.json` at the kernel root. `sync-kernel.sh` reads `jq -r '."."' "$KERNEL_REPO/.release-please-manifest.json"` to get the kernel's current version, and writes a **single-line text file `.kernel-version`** at the consuming app's root containing that version, after each successful sync. `new-app.sh` writes it on first generation (with the kernel's then-current version).

**Why a separate `.kernel-version` file rather than reading from the app's `.release-please-manifest.json`:** the app's release-please manifest holds the **app's** version (independent of kernel version), reset to `0.1.0` on generation. Conflating them would force every kernel bump to also bump the app, breaking release-please for the app. **Why a plain text file rather than JSON:** `cat .kernel-version` from any shell is the contract; no parser dependency. **Why not stored inside `.kernel-sync-hashes.json` (the next decision):** version and hash state happen to update together, but the version is also read by humans and by other tooling (e.g. `setup.sh --check` could verify the app's `.kernel-version` is consistent with the kernel checkout it sees) — keeping it a one-line file is the lowest-friction interface.

**Pre-bump check:** if the consuming app's `.kernel-version` ≥ the kernel's current version, sync exits 0 with "up to date" — no-op idempotency. If less, sync reports the upgrade path (`X.Y.Z → A.B.C`) and proceeds (or, with `--dry-run`, stops after the report).

**Semver comparison uses `node -e`** (Node is a kernel prereq anyway) to avoid the bash-shell portability traps — `sort -V` is non-POSIX and platform-variable; lexical string comparison fails on multi-digit components (`0.9.0` > `0.10.0`); a hand-rolled bash semver compare is bug-prone. The helper lives in `scripts/lib/manifest.sh` (D6) as `semver_cmp <a> <b>` and uses a **precise three-value exit-code contract**: exit `0` for `a == b`; exit `1` for `a > b`; exit `2` for `a < b`. POSIX-clean (no negative exit codes), unambiguous, callable from shell with simple `if`/`case` branches. **Why not `sort -V`:** macOS `sort` (BSD) and GNU `sort -V` differ; the kernel targets both.

### D2 — Clobber protection: a committed `.kernel-sync-hashes.json` records the last-sync SHA-256 of every synced file

After each successful sync, `sync-kernel.sh` writes `.kernel-sync-hashes.json` at the consuming app's root containing the SHA-256 of every kernel-tier and stack-tier file that was synced. Format:

```json
{
  "version": 1,
  "syncedAt": "0.3.0",
  "hashes": {
    "scripts/checks.sh": "sha256:9f86d…",
    "openspec/specs/dev-gates/spec.md": "sha256:e3b0c…",
    "...": "..."
  }
}
```

`new-app.sh` writes the initial file at generation time. On next sync, for each kernel/stack file the new sync would touch:

- Compute the consuming-app file's current SHA-256.
- If it equals the recorded hash → file is unmodified since last sync → **safe to overwrite** with the kernel's version.
- If it differs → file was **modified locally** → **refuse** the sync (collect every conflicting path; report all at once at the end). User passes `--accept-kernel` to overwrite anyway (their local mods are gone — git history is the safety net).
- If the file does not exist in the consuming app → kernel is adding a new file → copy (no conflict possible).

After a successful sync (clean or `--accept-kernel`), the hash file is rewritten with the new state and `syncedAt: <new kernel version>`.

**Why SHA-256 over content diff:** small, fast, deterministic, language-independent; the only operation is equality. **Why a single committed JSON over per-file checksums in xattrs/git-attrs:** the hash file is the auditable record of what sync expected to find — git-tracked, diff-readable, recoverable. **Why per-file rather than a single tree hash:** a single tree hash answers "did anything change?" but not "which files conflict?"; the user needs the latter to act.

**SHA-256 tool portability:** the implementation provides `sha256_file <path>` in `scripts/lib/manifest.sh` (D6) that delegates to `shasum -a 256` if present (ships with Perl, so universal on macOS / most Linux), falling back to `sha256sum` (Linux coreutils). The lib function fails fast with an install hint if neither is present. **Not addressed** is any non-POSIX OS without Perl — explicitly out of scope (the kernel targets macOS / Linux / WSL).

### D2a — Absent `.kernel-sync-hashes.json` is a first-sync scenario; `--adopt-existing` is the explicit bootstrap

If `.kernel-sync-hashes.json` is absent in the consuming app (the app was generated by a pre-slice-4 `new-app.sh`, was scaffolded by hand, or the file was deliberately removed), sync cannot reason about local modifications — every existing-but-different file would look like a conflict under D2's clobber check, demanding `--accept-kernel` on essentially everything. Silently treating "no recorded baseline" as "assume clean" risks an irrecoverable overwrite of the user's mods. **Resolution: sync refuses with a clear message** when `.kernel-sync-hashes.json` is absent and **`--adopt-existing` is the explicit bootstrap flag** that adopts the consuming app's current file contents as the baseline (computes SHA-256 for every present kernel-tier/stack-tier file, writes the hash record, sets `.kernel-version` to the kernel's current version, exits 0 without touching any file). After `--adopt-existing`, a subsequent `sync-kernel.sh` invocation runs the normal version-bump comparison and clobber check from a real baseline. **Why a separate flag rather than auto-adopting:** the bootstrap is a deliberate "I accept that the current state of these files is my baseline going forward" — silently doing it on first sync of a pre-slice-4 app would lose the user's mods to whichever kernel file the kernel then wants to overwrite. **Why not `--accept-kernel` for the missing-state case:** semantically different — `--accept-kernel` says "I know there are conflicts; overwrite with kernel's"; `--adopt-existing` says "I have no baseline; adopt my current state as one." Conflating them would surprise users in one direction or the other.

### D3 — Sync mirrors generation semantics exactly: same manifest, same exclusions, same overlap rule

`sync-kernel.sh` reads the manifest the same way `new-app.sh` does and applies the same rules:

| | `new-app.sh` | `sync-kernel.sh` |
|---|---|---|
| `kernel.paths` (minus `excludeFromGenerate`) | copy | copy, with clobber check |
| `stack.paths` (flattened: `presets/<preset>/` stripped) | copy | copy, with clobber check |
| `kernel.specs` + `stack.specs` (verbatim paths) | copy | copy, with clobber check |
| `appTemplates` (target ← source) | copy | copy, with clobber check |
| `instrumentStubs` (target ← stub) | copy | **skip** — instrument is app-owned |
| identity substitution | yes | **no** — app already has its identity |
| `git init` | yes | **no** — app is already a repo |
| `.release-please-manifest.json` reset to `0.1.0` | yes | **no** — that is app state, not kernel state |

**Why mirror `new-app.sh` so closely:** sync and generation are two endpoints of the same contract ("what travels from kernel to app"). Any divergence in what they consider a synced file would create files that sync ignores but generate emits (silent staleness) or vice versa. Sourcing the same `scripts/lib/manifest.sh` (D6) makes the iteration loop literally one function, called twice — no drift possible. **Why skip `instrumentStubs` on sync:** the stub is the seed; once an app's instrument exists, the stub is irrelevant — re-applying would destroy real work. **Why no identity substitution on sync:** the app's identity is now its own; substituting again would be either a no-op (identity already substituted) or destructive (re-substituting from the kernel's preset placeholders).

### D3a — Sync-kernel.sh itself is excluded from generation/sync; the user runs it from the kernel checkout

**The self-update bootstrap problem:** if `sync-kernel.sh` traveled to consuming apps via `scripts/**`, the app's old copy would run on the next sync — and its logic would be frozen at the last-sync kernel version. A kernel-level fix to the sync script (e.g. a new manifest field, a clobber-detection bug fix, a new exclusion semantic) would not take effect until the user manually copied the new script over the old one. That is exactly the silent-staleness trap. Resolution: **add `scripts/sync-kernel.sh` to `kernel.excludeFromGenerate`**, alongside the other kernel-only tools that already live there (`scripts/new-app.sh`, `scripts/generate-assert.sh`, `scripts/check-manifest.sh`, `scripts/run-extraction-audit.sh`). The user invokes sync **from the kernel checkout**:

```bash
cd <kernel-repo>
./scripts/sync-kernel.sh --app-repo <app-path>
# or, from anywhere:
<kernel-repo>/scripts/sync-kernel.sh --app-repo <app-path>
```

So the running `sync-kernel.sh` is always the kernel's current version, by construction. **Why this over self-bootstrap (script re-execs from `--kernel-repo`):** simpler — no fork/exec dance, no PATH gymnastics, no chance of an old script's bug being inherited by the bootstrap step. The cost is one extra mental step for the user (run from kernel, not app); STACK.md documents this explicitly. **Why this over "the app's copy is the contract":** rejected, makes every kernel-side sync improvement invisible to consumers until they manually copy the script, defeating the point of having a sync mechanism. **`setup.sh` is different** — it travels (it is meant to run in the app, sets up the app's checkout); it does not have the self-update problem because each kernel-version's `setup.sh` updates the app's `setup.sh` along with everything else, and the next run uses the new one.

### D3b — `appTemplates` sources MUST NOT contain identity sentinels

Sync re-applies `appTemplates` (per D3) but does NOT perform identity substitution (the app already owns its identity). If an `appTemplates` source ever contained a sentinel like `__APP_NAMESPACE__`, sync would copy the literal sentinel into the consuming app — silently breaking whatever the template controls (e.g. `.github/workflows/ci.yml`). The contract: **`appTemplates` source files in any preset SHALL be free of identity sentinels.** Enforcement: **slice 4 extends `scripts/check-identity-leak.sh`'s sentinel scan to include each preset's `templates/` directory** — today's scan covers `src/**/*.{js,svelte,css,ts}` and `faust/**/*.dsp` per preset but not `templates/`; the extension adds `templates/**/*.{yml,yaml,sh,md,toml,json}` so a sentinel sneaking into `templates/app-ci.yml` is caught at the same gate that catches a sentinel in chassis source. **Why extend the existing check rather than add a new one in `check-manifest.sh`:** the rule is the same (no un-substituted sentinels in files that travel to consuming apps); one check, two scope expansions over time, is simpler than parallel checks. **Alternative considered:** make sync substitute sentinels in `appTemplates` too — rejected because sync has no knowledge of the consuming app's identity (the app's name is not recorded in any sync-readable file); requiring `--name` on every sync invocation would burden the typical sync flow (re-applying chassis fixes, not re-branding).

### D3c — Sync derives the preset from the manifest's single stack entry; multi-preset is a deferred follow-up

`sync-kernel.sh` needs to know which preset the consuming app was generated from in order to look up the right preset's `paths`, `specs`, `appTemplates`, and `instrumentStubs` (to skip). Today the manifest has exactly one stack preset (`presets/svelte-faust-synth`) — sync reads `jq -r '.stack | keys[]'` and uses the single entry. If the manifest ever contains zero or multiple stack entries, sync **fails fast** with a clear message: zero → "manifest has no stack preset; nothing to sync"; multiple → "manifest has multiple presets ([list]); sync cannot disambiguate. Add `--preset <name>` (not implemented in this slice — see slice-4 design D3c). Until then, the kernel supports a single preset only." **Why fail fast rather than guess:** silent-wrong-preset would corrupt a consuming app's chassis. **Why no `--preset` flag this slice:** premature — there is exactly one preset, and the multi-preset feature would also need to update `new-app.sh`, the manifest schema, and several downstream specs. Deferred to a future slice if/when a second preset ships. **Why not record the preset name in `.kernel-version` or a sister file:** that file is the sync-state artifact, not generation provenance; conflating them adds a field whose only consumer is sync's preset disambiguation, an issue that does not yet exist.

### D3d — Files `new-app.sh` customizes per-app are `appOwnedFiles`: emitted at generation, never re-synced

**The gap this closes.** D3's table says sync performs no identity substitution and does not reset `.release-please-manifest.json` ("that is app state, not kernel state"). But D3 also says sync copies `kernel.paths` and the preset's flattened paths wholesale (with clobber protection). Those two statements collide for every file `new-app.sh` _customizes_ at generation: `src/components/Shell.svelte` (the `__APP_NAMESPACE__` → app-name substitution), `vite.config.js` (the `__APP_TITLE__` / `__APP_REPO_URL__` substitution), `package.json` (name/version/description/`postinstall`/`prettier-plugin-toml` mutation), and `.release-please-manifest.json` (reset to `0.1.0`). All four are in the copy plan, and their recorded baseline hash is the _post-customization_ content — so an unmodified consuming app classifies them as **clean**, and a version-bump sync would overwrite them with the kernel's preset/placeholder versions. That re-introduces the `__APP_NAMESPACE__` sentinel and the preset title into the app, resets `package.json`'s name and drops its `postinstall`, and overwrites the app's release version with the kernel's. Clobber protection does **not** save them, because clobber compares app-vs-baseline (both customized), not app-vs-kernel.

**Resolution.** Declare a `kernel.appOwnedFiles` array of app-relative target paths that generation customizes and sync must never re-apply. `manifest_copy_plan` (D6, shared by `new-app.sh` and `sync-kernel.sh`) filters these targets out, so they are **excluded from the sync copy plan and from the clobber-tracking hash file** — but still **emitted at generation** (`new-app.sh` copies them via the raw `kernel.paths` / preset-paths queries, then customizes; only the plan-derived _hashing_ skips them). `check-manifest.sh` validates that each entry is a literal path that actually travels (no no-op exclusions) and does not double up with `appStateFiles` / `instrumentStubs` / `appTemplates`. `generate-assert.sh` asserts they are absent from the hash file and that an `--accept-kernel` sync against a bumped kernel leaves Shell.svelte's namespace, `package.json`'s name, the app's release version, and the vite title intact.

**Why exclude rather than re-substitute on sync.** Re-substituting would require sync to know the app's identity values; D3b already rejected requiring `--name` on every sync, and recovering the title/repo by parsing the app's current `vite.config.js` is fragile. Excluding is the same posture the kernel already takes for `instrumentStubs` (app-owned content, not re-synced). **The trade-off:** a consuming app does not auto-receive kernel-side changes to these four files via sync; `sync-kernel.sh` reports them as "app-owned, not re-synced — merge upstream changes by hand if needed" so the omission is visible rather than silent. For `package.json` this is arguably correct anyway — the app manages its own dependencies and lockfile; for the other three the customized content _is_ the app's identity/state. **Alternative considered:** a finer-grained "re-sync the non-identity parts" merge — rejected as far too much machinery (a structured 3-way merge of `package.json`, sentinel-aware patching of Shell.svelte) for slice 4; revisit if real synth-d usage (slice 6) shows chassis updates to these files are frequently needed.

### D4 — Sync is additive-only; kernel-deleted paths are informational

If the kernel removes a file (a `kernel.paths` entry disappears between kernel versions X and Y), the corresponding file in the consuming app is **not** deleted by sync — it is reported in the dry-run output and the final summary as "kernel no longer tracks this file; left in place." **Why never delete on sync:** the consuming app may have come to depend on the file in ways the kernel cannot know; a silent delete is irrecoverable. The user removes it manually if they want to. **Alternative considered:** add a `--prune` flag — rejected for slice 4 (the safety bar is high; partial-prune semantics would also be needed).

### D5 — `--dry-run` is the safe default expectation; the script never makes destructive changes without an explicit "go" run

`sync-kernel.sh` accepts `--dry-run`. In dry-run mode it computes everything — version comparison, paths to copy, conflicts found — and emits a summary report, then exits 0 without writing. **No `--yes` confirmation prompt** is required for the non-dry-run mode (it would break CI); the script's safety bar is clobber protection (D2), not interactivity. Convention to encourage: run `--dry-run` first, then the real sync. Documented in `STACK.md`'s usage section.

### D6 — Extract `scripts/lib/manifest.sh` as the single home of `expand_entry()` and the manifest-reading patterns

The `expand_entry()` function exists verbatim in three scripts today (`new-app.sh`, `generate-assert.sh`, `check-manifest.sh`); slice 4 adds one more consumer (`sync-kernel.sh`) for a total of four. (`setup.sh` does not source the lib — it uses filesystem detection for layout and a hardcoded prereq table for `--check`; no manifest reading needed.) With four copies the drift cost outweighs the lib-pattern friction. Move it (plus the small set of common `jq` queries — read `kernel.paths`, read preset paths, read instrumentStubs, etc.) into `scripts/lib/manifest.sh`. Each script becomes:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
. "$(dirname "$0")/lib/manifest.sh"
# ... script-specific logic using expand_entry, manifest_kernel_paths, etc.
```

**Why one lib over per-script copies:** the function is small but consistency matters; a future change to glob semantics must land in one place. **Why a sourced shell lib rather than a separate JSON-only tool:** the existing scripts are bash; adding a Node-or-Python tool to the kernel toolchain expands prereqs unnecessarily. **Why `scripts/lib/` rather than alongside the scripts:** keeps `scripts/` flat (one directory listing = one inventory of executable commands); the lib is plumbing.

**Migration is mechanical** — each existing script removes its inlined `expand_entry()` and adds the sourcing line. `shfmt`/`shellcheck` clean is verified by the existing checks. Slice-3 behavior is unchanged; tests pass without modification.

### D7 — `setup.sh` is layout-agnostic and idempotent; `--check` is the only non-mutating mode

`setup.sh` runs in either the kernel checkout or a generated app. **Layout detection** uses the same approach as `check-identity-leak.sh` (slice-3 D9): if `presets/` exists with subdirectories, treat as kernel layout (iterate preset subdirs for `npm ci` and `prebuild`); else treat root as app layout (run `npm ci` and `prebuild` at the root).

**Default mode** runs (in order):

1. `npm ci` at the root (always present — root `package.json` exists in both kernel and app).
2. For each preset dir in kernel layout (or the root in app layout) that has its own `package.json`: `npm ci` inside it.
3. If a relevant `package.json` declares a `prebuild` script (the npm convention): `npm run prebuild`. For the `svelte-faust-synth` preset, this invokes the FAUST compilation via the `@grame/faustwasm` npm dep — **no separate system FAUST install is required**, per STACK.md's explicit stance.
4. `scripts/install-hooks.sh` (already idempotent — slice 1).

It is safe to re-run; each step is idempotent or fast-skips.

**`--check` mode** does **none of the above**. Instead it iterates a versioned prereq list:

| Prereq | Version source | Failure hint |
|---|---|---|
| `node` | `.nvmrc` | "install via nvm: `nvm install $(cat .nvmrc)`" |
| `npm` | bundled with node | "install Node, which bundles npm" |
| `shfmt` | `STACK.md`'s pinned `v3.8.0` | "install via `brew install shfmt` or your package manager" |
| `shellcheck` | any | "install via `brew install shellcheck`" |
| `jq` | any | "install via `brew install jq`" |
| `gh` | any | "install via `brew install gh` then `gh auth login`" |
| `openspec` | any | "see openspec docs" |
| `roborev` | any | "see roborev docs" |

**`faust` is deliberately absent from the prereq table.** STACK.md is explicit that FAUST ships as the `@grame/faustwasm` npm dep (preset's `prebuild` step), not as a system tool — checking for `faust` on `$PATH` would produce false-positive failures in standard setups. If a future preset depends on a system FAUST install, that preset adds the check via a per-preset hook (out of scope here).

Each missing/wrong-version tool is reported with its install hint; `--check` exits non-zero on any miss. **Why install hints not auto-install:** the kernel deliberately does no system mutation; the human installs the prereq per the platform's package manager.

**Audience and CI posture:** `setup.sh --check` is primarily a **human + downstream-consumer** tool — a developer setting up a fresh machine runs it to see what they're missing; a consumer's CI workflow may use it. The kernel's own CI already installs its prereqs explicitly (e.g. the existing `shfmt` install step in `.github/workflows/ci.yml`), so adding a `setup-check` CI job that runs before provisioning would fail on every bare runner with a hint targeted at humans. **Decision: do NOT add a kernel-CI `setup-check` job in this slice.** STACK.md documents `setup.sh --check` as the tool for humans and consumers to use; the kernel's own CI continues to provision-then-use without an extra gate.

**Why one script, not two (kernel-setup.sh + app-setup.sh):** the two layouts share the entire prereq list and almost all the default-mode work; the layout check is one filesystem test. One script with auto-detection mirrors slice-3 D9's pattern for `check-identity-leak.sh` — the kernel already encodes "the same script runs in both contexts" as a design value.

### D8 — `kernel-manifest.json` gains `kernel.appStateFiles` for the version stamp + hash record

The two sync-state files (`.kernel-version`, `.kernel-sync-hashes.json`) live in the consuming app, are **written by sync (and `new-app.sh`)**, and are **not subject to clobber protection** (sync owns them). They are not in `kernel.paths` (they don't originate in the kernel; they describe sync's state). Declaring them in a new manifest field makes the inventory complete and lets `check-manifest.sh` validate them (each entry is a literal path; targets do not appear in `kernel.paths` or any preset's `paths`).

```json
"kernel": {
  "paths": [...],
  "excludeFromGenerate": [...],
  "specs": [...],
  "appStateFiles": [
    ".kernel-version",
    ".kernel-sync-hashes.json"
  ]
}
```

**Why a manifest field rather than hardcoding in the scripts:** the same "manifest is the source of truth" principle slice 3 set; a future change (e.g. add a `.kernel-sync.log`) doesn't need a script edit, only a manifest edit. **Alternative considered:** put them inside `kernel.paths` and mark them somehow — rejected, the semantics are different (these are written-by-the-kernel-into-the-app state, not copied-from-the-kernel content), and `kernel.paths` is already overloaded.

### D9 — `generate-assert` is extended with a sync round-trip (positive + negative + accept-kernel)

The existing `generate-assert` job is extended in three steps after the generate-and-assert phase produces a tempdir app:

1. **Positive (round-trip):** `sync-kernel.sh --kernel-repo "$GITHUB_WORKSPACE" --app-repo "$APP" --dry-run` — assert the output contains "up to date" (the consuming app, freshly generated, IS at the kernel's current version, so sync should be a no-op). Generate emits a consistent `.kernel-version` and `.kernel-sync-hashes.json` that sync immediately recognizes as current.
2. **Negative (clobber-refusal):** edit a single synced file in the tempdir app (e.g. append a comment to `STACK.md`), simulate a kernel bump (write a higher version to `--kernel-repo`'s `.release-please-manifest.json` in a copy), then run `sync-kernel.sh` (no `--accept-kernel`) — assert non-zero exit + the modified path appears in the conflict list.
3. **Positive (accept-kernel resolves):** run `sync-kernel.sh --accept-kernel` against the same state — assert zero exit + the modified file is overwritten with the kernel's content + `.kernel-sync-hashes.json`'s recorded hash for that file now matches the kernel's hash.

**Why all three in `generate-assert` rather than a separate `sync-check` job:** the sync round-trip is a property of generation (the app sync produces must be self-consistent), so it belongs with the generation gate; a separate job duplicates the tempdir setup. **No kernel-CI `setup-check` job is added in this slice** (per D7 — `setup.sh --check` is for humans + downstream consumers; the kernel's CI provisions explicitly).

### D10 — Cross-kernel-version compatibility: sync targets the kernel's current version, period

`sync-kernel.sh` does not handle migrations across major versions (e.g. "moving from kernel 0.x to 1.x requires running `migrate.sh`"). The kernel is `0.x.x` and every sync is "match the kernel as-of this checkout." **Why this scope cap:** premature; there is no kernel `1.0` yet. If a future major bump introduces breaking sync semantics, that change will own its migration path — likely as an `appTemplates` entry or a one-off migration script the kernel ships in that release.

## Risks / Trade-offs

- **The hash-file is mis-trusted as a security boundary** → it is not. SHA-256 is collision-resistant against accidental edits, not against an adversary. Document: this is a clobber-protection mechanism (catches the developer who edited `scripts/checks.sh` and forgot), not tamper protection.
- **A consuming app's `git` history is the user's safety net under `--accept-kernel`** → documented in `STACK.md` and in the `--accept-kernel` warning printed before sync overwrites. The script does not try to back up locally-modified files itself (additive complexity, fragile in edge cases).
- **Slice 3's `new-app.sh` requires amending to write `.kernel-version` + `.kernel-sync-hashes.json`** → done in task 6; treated as a small extension, not a refactor. Generate-assert is extended in lock-step to cover the new files.
- **`scripts/lib/manifest.sh` introduces a sourcing pattern** → mitigated by D6's standard prologue (every script uses the same three lines). The lib is sourced, not exec'd; no subshell perf hit.
- **`.kernel-sync-hashes.json` grows linearly with the manifest** → today ~60 entries → ~5–10 KB JSON; tomorrow with more specs and presets maybe 50 KB. Not a problem at this scale; if it ever becomes one, switch to compact-format JSON or a binary stamp.
- **Slice 5's smoke-app needs sync to succeed in its full pipeline** → not relevant to slice 4 (slice 5 owns that wiring); slice-4 CI is the round-trip dry-run only.
- **`setup.sh --check` may drift from STACK.md's pin** → mitigated by reading the pin from `STACK.md` (or, ideally, a dedicated `.tool-versions`-like file). For slice 4 we hardcode the pin in `setup.sh` and add a `check-manifest.sh`-style consistency test that the value matches what `STACK.md` documents. Eliminates drift by construction.
- **Re-applying `appTemplates` could clobber an app's locally-edited `.github/workflows/ci.yml`** → handled by D2's clobber protection; the user must `--accept-kernel` or merge by hand. Sync explicitly does NOT treat `appTemplates` differently from `kernel.paths`.
- **Concurrent sync against the same app checkout could corrupt `.kernel-sync-hashes.json`** → two developers (or a developer + a CI run) running sync simultaneously would race on the hash-file write. Accepted as a low-probability risk for a developer tool; documented. If usage warrants it later, add a `.kernel-sync.lock` advisory lock around the write phase. Mitigation today: don't run two syncs in parallel.
- **`.kernel-version` and `.kernel-sync-hashes.json` are intentionally tracked in git in consuming apps; the kernel itself does not have them** → `new-app.sh` writes both files into the **emitted app's** initial commit; `sync-kernel.sh` rewrites them on each successful sync. They are part of the consuming app's auditable history ("what kernel version we synced, with what hashes"). The kernel repo itself is not a consumer of itself, so neither file exists in the kernel's tree — confirmed by the kernel's `.gitignore` not needing to exclude them and `check-manifest.sh` treating them strictly as `appStateFiles` (D8), not as kernel-tier paths.

## Migration Plan

Additive; rollback is reverting the branch. Sequence (one commit per task):

1. Write `scripts/lib/manifest.sh` extracting `expand_entry()` and the shared `jq`-query patterns; migrate `new-app.sh`, `generate-assert.sh`, `check-manifest.sh` to source it (slice-3 behavior unchanged; existing tests pass).
2. Extend `kernel-manifest.json`: add `kernel.appStateFiles` (`.kernel-version`, `.kernel-sync-hashes.json`); add `scripts/sync-kernel.sh` to `kernel.excludeFromGenerate` (per D3a — sync is kernel-only, runs from kernel checkout). `scripts/lib/**` does NOT need a separate `kernel.paths` entry — the existing `scripts/**` glob already covers it.
3. Update `scripts/check-manifest.sh` to validate the new field.
4. Sync `openspec/specs/preset-portability/spec.md` with the new requirements (per slice-2 D9 early-sync).
5. Write `scripts/sync-kernel.sh` (CLI, manifest read, hash compute, clobber detection, dry-run report, version comparison, write phase, version stamp + hash file rewrite).
6. Amend `scripts/new-app.sh` to write `.kernel-version` + `.kernel-sync-hashes.json` on generation; extend `generate-assert.sh` to assert their presence and a sync round-trip dry-run.
7. Write `scripts/setup.sh` (layout detection, default mode, `--check` mode with the versioned prereq table).
8. Update `.github/workflows/ci.yml`: extend `generate-assert` job with the sync round-trip dry-run + negative + `--accept-kernel` steps (per D9). **No new `setup-check` job** (per D7).
9. Update `STACK.md`: document `sync-kernel.sh` + `setup.sh` usage; add `jq` to the prereq list (and confirm the existing `shfmt v3.8.0` + FAUST pin are mirrored in `setup.sh --check`).
10. Sync the two new specs (`kernel-sync`, `repo-setup`) to `openspec/specs/` during implementation (per slice-2 D9).
11. Verify locally: existing gates pass; new `setup-check` and sync round-trip pass in CI; sync clobber-detection refuses a deliberately-edited file in a tempdir fixture, then accepts it with `--accept-kernel`.

## Open Questions

- Whether `setup.sh --check`'s prereq table should be data (a JSON file in the repo) rather than code (a function in the script). For slice 4 it is code (one script, fewer files); data is a future refactor if more presets need different prereqs.
- Whether the `--accept-kernel` flag should also accept `--accept-local` (record current local hashes as the new baseline, keep app's content). Useful but adds a code path; deferred to a follow-up if real usage demands it.

## Resolved Questions

- ~~Whether the sync round-trip in CI should also test a non-zero case~~ → **Resolved: yes** — D9 prescribes three steps (positive dry-run, negative conflict-refusal, `--accept-kernel` resolution), implemented as tasks 5.2b/5.2c/5.2d.
