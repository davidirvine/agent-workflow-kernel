## Context

Slice 2 produced a self-contained buildable preset at `presets/svelte-faust-synth/` with explicit identity-leak guards (`scripts/check-identity-leak.sh`) and a sync manifest (`kernel-manifest.json`). The chassis↔instrument boundary is authoritative in two places: the manifest's `stack.presets["…"].paths` lists every chassis file (instrument files are absent), and `presets/svelte-faust-synth/src/chassis-purity.test.js`'s `INSTRUMENT_FILES` set names the two instrument files (`src/param-schema.js`, `src/components/InstrumentPanels.svelte`). The donor-identity sentinel `'__APP_NAMESPACE__'` lives only at the Shell instantiation site; Vite-injected `__APP_TITLE__`/`__APP_REPO_URL__` provide branded text. This slice (ROADMAP slice 3) consumes all of that to ship `scripts/new-app.sh` and its committed `generate-assert` check.

## Goals / Non-Goals

**Goals:**

- Emit a fresh app from kernel + preset + name with one CLI invocation.
- Make the generator **stack-agnostic** — it reads what to copy from `kernel-manifest.json`, what to stub from a new manifest field, and what to substitute from a small fixed set of identity tokens. It contains no hardcoded knowledge of `svelte-faust-synth` internals.
- The emitted tree passes the new app's own identity-leak check (the slice-2 check, run inside the generated app).
- A committed `scripts/generate-assert.sh` proves all of the above by running the generator into a tempdir and asserting structurally — it ships to consumers as a reusable smoke test.

**Non-Goals:**

- No `sync-kernel.sh` / `setup.sh` (slice 4) and no full smoke-app pipeline (slice 5). This slice's gate verifies the emitted **tree**; building it is slice 5.
- No support for multiple presets — `svelte-faust-synth` is the only preset that exists. The CLI accepts `--preset` for future extensibility, but the test surface covers the one preset.
- No `--force` to overwrite an existing output directory. Refuse and instruct.
- No content authoring inside the generated app beyond stubs and identity substitution — the user fills in their instrument.

## Decisions

### D1 — CLI shape: explicit flags, no positional surprises

```
scripts/new-app.sh \
  --name <app-name>           # required, kebab-case; npm name + localStorage namespace
  --output <path>             # required, absolute or relative; refuses if it exists
  [--preset <name>]           # default: svelte-faust-synth
  [--title <title>]           # default: title-cased --name (e.g. "My Cool App")
  [--repo-url <url>]          # default: "https://example.com/<name>" placeholder
```

**Why explicit flags over positionals:** the parameter count is high enough (3–5) that positional ordering would be a footgun; flags are self-documenting and order-independent. **Why `--name` is kebab-case-validated:** it doubles as the npm package name (PEP for npm: lowercase, no spaces) and the localStorage namespace (URL-safe, no colons). A `[a-z][a-z0-9-]*` regex catches the common errors loudly. **Why refuse existing `--output`:** generation is destructive — silently overwriting an app directory is the kind of mistake that loses real work. Refuse with a clear message; the user removes or chooses a different path.

### D2 — `kernel-manifest.json` is the source of truth; preset overrides win; some kernel paths are explicitly excluded from generation

The generator reads `kernel-manifest.json` and copies:

- every path in `kernel.paths` **except** those in a documented `excludeFromGenerate` set (see below);
- every path in the chosen preset's `stack.presets[<preset>].paths` (chassis source + preset configs + stack-tier specs), **flattened** — `presets/<preset>/` is stripped from each path so the file lands at the corresponding location in the generated app's root (per D14).

**Overlap set** (resolved by **preset wins**) — files declared in both `kernel.paths` and the preset's `paths` *after flattening to the app root*. Today, by inspection of the manifest, the overlap is **exactly two files**: `.prettierrc` and `package.json` (the kernel's variants are trimmed/minimal for the kernel's own use; the preset's are stack-aware). `.prettierignore` and `.gitignore` are NOT in the overlap (`.prettierignore` is kernel-only, `.gitignore` is preset-only). The overlap set is documented in the script's source as a literal 2-item array, not a heuristic; changes require a deliberate edit and re-review.

**`excludeFromGenerate` paths and semantics** — manifest paths that exist for the kernel's own use but make no sense in a generated app. Documented in `kernel-manifest.json`'s `kernel.excludeFromGenerate` field, and in `new-app.sh`'s source.

**Semantics (resolves the glob-vs-literal mismatch):** `kernel.paths` entries are file paths or **globs** (today: `scripts/**`, `.githooks/**`, `.github/workflows/**`). `excludeFromGenerate` entries are file paths or globs **matched against the expanded file set produced by `kernel.paths`**, not against `kernel.paths`'s entries literally. So `excludeFromGenerate: ["scripts/new-app.sh"]` excludes the file `scripts/new-app.sh` from the set of files that `scripts/**` expanded to in the kernel; `excludeFromGenerate: [".github/workflows/**"]` excludes every file the glob matches. **Validation rule (slice's manifest-validate gate):** "every `excludeFromGenerate` entry, when treated as a file path or glob and matched against the filesystem from the repo root, resolves to at least one file that is also in the expanded `kernel.paths` set." A typo that matches nothing in `kernel.paths` is rejected.

Today's exclusions: (a) **`.github/workflows/**`** — the kernel's CI references kernel-specific jobs (`preset-build`, `preset-leak-check`, `generate-assert`) that depend on paths not present in a generated app (per D11, an app-tier CI template lives in the preset); (b) **kernel-only scripts** — `scripts/new-app.sh`, `scripts/generate-assert.sh`, `scripts/check-manifest.sh`, `scripts/run-extraction-audit.sh` — tools that operate on the kernel structure or that the kernel runs against itself; generated apps consume their behavior via the kernel-tier specs they inherit. The exclusion is documented in the manifest field, not just the script, so it is a reviewable contract and `sync-kernel.sh` (slice 4) can honor the same set.

**Alternative considered:** two manifests (one for sync, one for generation) — rejected, because the substantive content overlaps almost entirely; the per-context exclusion field is a smaller change.

### D3 — Instrument stubs are committed files, declared in the manifest's new `instrumentStubs` field

The two instrument files the generator must produce in the emitted app (`src/param-schema.js` and `src/components/InstrumentPanels.svelte` for `svelte-faust-synth`) come from **committed stub files** under `presets/<preset>/stubs/`, paired with a new per-preset manifest field:

```json
"stack": {
  "presets/svelte-faust-synth": {
    "paths": [...],
    "instrumentStubs": {
      "src/param-schema.js": "stubs/param-schema.js",
      "src/components/InstrumentPanels.svelte": "stubs/InstrumentPanels.svelte",
      "faust/synth.dsp": "stubs/synth.dsp"
    },
    "specs": [...]
  }
}
```

For each entry, the generator reads the committed stub file (`presets/<preset>/stubs/param-schema.js`) and writes it to the generated app at the target path (`src/param-schema.js`). **The FAUST DSP is an instrument-tier stub too:** the preset's `faust/synth.dsp` is the reference oscillator's DSP, and the preset's `prebuild` npm script compiles it (`npm run faust:build`). Without a DSP stub, the first `npm run build` in the generated app would fail at `prebuild`. The stub DSP is minimal — just the universal engine contract surface (`freq`, `gate`, `modWheel` inputs; `outputPeak`, `mixerPeak` outputs) emitting silence — so the generated app's `prebuild` succeeds and the developer's first real change is to fill in real DSP. **Why a manifest field + committed stubs over hardcoding the stub list in `new-app.sh`:** the generator stays stack-agnostic — a future preset adds its own stubs and declares them in the manifest without touching the generator's source. **Why stubs are committed files rather than generated inline in the script:** stubs need to be _valid_ source (the empty schema must export the same surface the chassis imports; the stub panel must be a valid Svelte component) — keeping them as real source files in the repo means they are formatter-checked, prettier-clean, and editable in isolation. **Manifest-validate gate update:** `scripts/check-manifest.sh` now also asserts (a) every `instrumentStubs` source file exists; (b) every `instrumentStubs` target path does **not** appear in the preset's `paths` list (a target appearing in both would mean the generator writes a stub then immediately overwrites it with the preset's reference instrument file).

### D4 — Identity substitution: three categories, each handled by its appropriate mechanism

1. **The `'__APP_NAMESPACE__'` string literal** inside the copied `Shell.svelte` — direct text substitution (`sed -i` style) with a **global flag** (`s/'__APP_NAMESPACE__'/'<name>'/g`), because the literal appears at **three sites** in Shell.svelte: the patch-storage construction, the wheel-physics-store construction, and the `MidiCcMap` construction (per the slice-2 grounding inventory). A single-occurrence replacement would silently miss two of them; `generate-assert`'s identity-leak check would catch it late, but the global flag avoids the round-trip. The replacement value is `--name`, which is kebab-validated (D1) to a tiny safe character class, so sed-injection is impossible. Shell is the only file where the literal appears (the allowlist of `scripts/check-identity-leak.sh`).
2. **Vite build-time defines (`__APP_TITLE__`, `__APP_REPO_URL__`)** — the generator emits the app's `vite.config.js` with the new default values for these defines. **Mechanism: `node -e`** that loads `vite.config.js` as text, replaces the **specific placeholder string literals** programmatically using `JSON.stringify` for the replacement (so a `--title "O'Malley's Synth"` becomes `"O'Malley's Synth"` correctly quoted) and writes the file back. The current preset's placeholder strings (per the slice-2 grounding) are `'svelte-faust-synth'` for `__APP_TITLE__` and `'https://github.com/davidirvine/agent-workflow-kernel'` for `__APP_REPO_URL__` — these are the exact targets to replace; a future preset would have different placeholders. **Why not sed:** `--title` and `--repo-url` are arbitrary user-supplied strings — quotes, slashes, backslashes, or ampersands would break a sed command or, worse, produce invalid JavaScript in the emitted `vite.config.js`. Using `node -e` with `JSON.stringify` is the same "JSON-aware edit using the right tool" principle as category 3.
3. **`package.json` identity + dev deps + scripts** — JSON-aware edit using `node -e` (Node is a build prereq anyway) to mutate the identity fields (`name`, `version`, `description`) **and** add the kernel-tier devDep (`prettier-plugin-toml`) and `scripts.postinstall` per D5, all in one pass. `version` resets to `"0.1.0"`, `name` ← `--name`, `description` ← a generic line ("App scaffolded from agent-workflow-kernel + <preset>"). `.release-please-manifest.json` resets to `{".": "0.1.0"}` the same way.

**Why three mechanisms, not one:** each substitution target has different semantics — a literal string in source, arbitrary string values in a config that Vite parses, and structured JSON fields. Using the right tool per case (sed for source literals safe under D1's input validation, JSON-aware Node edits for config/package files where the replacement value may contain anything) avoids the fragility of trying to text-substitute a JSON field or sed-inject arbitrary user input.

### D5 — One `package.json` at the generated app root, starting from the preset's plus kernel devDeps

The generated app has one `package.json` at its root. The generator starts from the preset's `package.json` (which has the Svelte/Vite/FAUST stack and the preset-aware prettier plugin) and adds the kernel-tier dev dependencies the generated app needs: `prettier-plugin-toml` (the new app inherits `.roborev.toml` and other TOML configs from the kernel set), and a `postinstall` script invoking `scripts/install-hooks.sh` (so the new app's git hooks activate on first `npm install`). The same Node-based `package.json` mutation that resets identity (D4 category 3) also adds these two devDeps and the `postinstall` field; task 4.5 covers both in one pass.

**`scripts/install-hooks.sh` is itself a kernel-tier file in `kernel.paths`** (added in slice 1), so it travels into the generated app along with the rest of `scripts/**` minus the D2 `excludeFromGenerate` set. The `postinstall` reference is therefore resolvable in the generated app from its first `npm install`.

**Lockfile is intentionally stale after generation** — the preset's `package-lock.json` travels verbatim, but the generator mutates `package.json` (identity fields + the two added devDeps). The lockfile is consequently out of sync until the generated app's developer runs `npm install` once; this is by design (the alternative — running `npm install` inside the generator — would add network and runtime to every generation, including `generate-assert`, and would require Node tooling to be active during generation rather than just for the `node -e` JSON mutation). The generated app's chore-commit message includes a note to run `npm install` first. Slice 5's smoke-app runs `npm install` (not `npm ci`) for the same reason.

**Why merge over emit-fresh:** the preset's `package.json` already has stack-aware deps + lockfile-friendly versions; throwing those away and reconstructing risks drift. The merge is small (add two devDeps + one script field) and explicit. **Why one `package.json`, not a kernel-and-preset pair:** the generated app is a single app, not a meta-repo. Donors like synth-d follow the same shape; this is the established pattern.

### D6 — `openspec/changes/` empties to a `.gitkeep`; `openspec/changes/archive/` does not travel

The generator copies `openspec/config.yaml` verbatim and copies kernel-tier + stack-tier specs from the manifest into `openspec/specs/`. It then creates an empty `openspec/changes/` containing only a `.gitkeep`. The donor's archived history (`openspec/changes/archive/2026-05-28-*`) does NOT travel — the Phase-2 design is explicit that archive is project-local history. **Why a `.gitkeep`, not nothing:** git does not track empty directories; the new app should have a visible `changes/` directory for the spec-driven workflow to land into. **Why no archive:** an archive entry would carry the donor's commit-message provenance into a new app's history, which would be misleading. New apps start their own history.

### D7 — Initial commit: single `chore:` commit, conventional message

After all files are emitted, the generator runs `git init` + `git add -A` + `git commit -m "chore: scaffold <name> from agent-workflow-kernel + <preset>"`. **Why a `chore` commit:** the initial scaffold is tooling/scaffolding, not user-visible functionality (per CLAUDE.md's Conventional Commits table); release-please-equivalent automation in the new app sees no version bump from the scaffold. **Why a single commit:** the new app's history starts at one root commit; the developer's first real work is the next commit. **Why `git init` here, not "leave it to the user":** the script's contract is "I emit a clean, working app" — a non-repo emit would force every user to remember the `git init` step and gets the initial commit's author/timestamp inconsistently right.

### D8 — `generate-assert.sh` runs `new-app.sh` into a tempdir and asserts both **structure** and **the emitted app's own check passes**

`scripts/generate-assert.sh` creates a tempdir, runs `new-app.sh --name smoke-app --output <tempdir>/smoke-app`, then asserts:

- Every path the manifest says should travel exists at the right relative path in the emitted tree, and every `instrumentStubs` target exists.
- `package.json` `name === "smoke-app"`, `version === "0.1.0"`, `description` does not contain the donor's reference-instrument phrasing.
- The `Shell.svelte` in the emitted tree contains `'smoke-app'` (the namespace), not `'__APP_NAMESPACE__'`.
- The emitted `vite.config.js` contains the chosen title + repo-url values, not the preset's placeholders.
- `openspec/changes/` contains exactly one file (`.gitkeep`); `openspec/changes/archive/` does not exist.
- The emitted tree's `scripts/check-identity-leak.sh` passes (run **inside** the emitted tree — the same script the preset ships, applied to the new app).
- The emitted tree is a git repo with exactly one commit whose message starts with `chore: scaffold smoke-app`.

It tears down the tempdir on success. **Why run the emitted app's own identity-leak check rather than a separate one:** that's the same check slice 2 wrote; if the generator left a leak the slice-2 check would catch it, and we trust the slice-2 check is the authoritative leak gate. **Why a tempdir, not a fixed path:** generate-assert must be runnable repeatedly and in parallel CI runs without state leak. **Alternative considered:** verify the generator's output by re-running it against a snapshot — rejected, too brittle (any benign change to a chassis file would require updating the snapshot).

### D12 — `check-identity-leak.sh` auto-detects layout (kernel vs. generated app)

The slice-2 `scripts/check-identity-leak.sh` hardcodes `PRESETS=("presets/svelte-faust-synth")`, which means the **same script copied into a flattened generated app would scan nothing** (no `presets/` directory exists in the app), producing a vacuous green that misses any un-substituted sentinels in the app's `Shell.svelte`. The slice's own gate (`generate-assert.sh` step that runs the emitted tree's `check-identity-leak.sh`) would lie.

This slice **refactors `check-identity-leak.sh` to auto-detect its layout**: if the working tree contains a `presets/` directory with subdirectories, it iterates those subdirectories as before (kernel layout); otherwise it treats `.` as the single "preset" (the generated app), looking for the chassis at `./src/`, the preset configs at `./`, and the Shell allowlist at `./src/components/Shell.svelte`. `preset_scan_globs` and `shell_allowlist_paths` already take a preset argument — they only need to handle `"."` as a value. Detection is one filesystem check; no env vars or arguments are needed.

**Why filesystem detection over an env var / CLI flag:** the script is invoked from both the kernel's CI and the generated app's `generate-assert` step transparently; requiring a flag would either burden the caller or risk being forgotten. **Why this is a slice-3 change to a slice-2 file:** slice 2's script worked in its only context (the kernel). Slice 3 is the slice that introduces the second context (generated apps), so it owns the refactor. The refactor preserves all existing slice-2 behavior in the kernel (kernel still has a `presets/` directory, so the kernel-layout branch fires). Slice 2's `dev-gates`/`preset-portability` scenarios are unaffected.

**Dedup in the app-layout branch:** when the preset is `"."`, `preset_scan_globs ".")` produces `./package.json`, `./.prettierrc`, etc., which overlap the `KERNEL_ROOT_CONFIGS` set the script also scans. The refactor SHALL deduplicate (e.g. `awk '!seen[$0]++'` or `sort -u` on the combined file list) before scanning so violations are not double-reported; in the kernel branch the two sets do not overlap so dedup is a no-op.

**Alternative considered:** sed-replace the `PRESETS` array during generation, producing a divergent app-only variant — rejected, because divergent variants of the same kernel script create maintenance drift; auto-detection means one script that works in both layouts.

### D13 — Preset paths are flattened by stripping the `presets/<preset>/` prefix; this is the only path transformation

The generator strips `presets/<preset>/` from every preset-tier path before writing it to the generated app. `presets/svelte-faust-synth/src/App.svelte` → `<output>/src/App.svelte`. Kernel-tier paths are written verbatim (the kernel's `scripts/check-identity-leak.sh` lands at `<output>/scripts/check-identity-leak.sh`). No other path rewriting happens. **Why state this explicitly:** the flattening rule is implicit in the design's "the new app is _not_ a `presets/<name>/` substructure" claim; making it an explicit decision means future presets at different nesting depths (or with non-`presets/<name>/` conventions) must update this rule deliberately, not silently.

### D14 — The kernel's `.github/workflows/**` does NOT travel; the preset ships an app-tier CI template that does

The kernel's `.github/workflows/ci.yml` runs `preset-build`, `preset-leak-check`, and `generate-assert` — jobs that depend on the kernel's `presets/<preset>/` directory, on `kernel-manifest.json`, and on the kernel-only scripts excluded by D2. None of those paths exist in a generated app. Travelling that workflow verbatim would emit a CI file whose jobs all fail.

This slice resolves it by **excluding `.github/workflows/**` from generation** (D2's `excludeFromGenerate`) and adding a new manifest field per preset:

```json
"stack": {
  "presets/svelte-faust-synth": {
    ...
    "appTemplates": {
      ".github/workflows/ci.yml": "templates/app-ci.yml"
    }
  }
}
```

The generator reads each `appTemplates` entry the same way it reads `instrumentStubs`: copy from the source path inside the preset to the target path in the generated app. The preset's `templates/app-ci.yml` is an app-tier CI workflow (per-preset, since different stack presets may want different CI) that runs the **app-tier** gates: at minimum the lint/format check (the slice-1 `scripts/checks.sh` that travels via kernel.paths) and the preset's own build/test/leak-check. It does **not** include `generate-assert` (the generated app isn't itself a generator).

**Why per-preset template, not a single kernel-wide one:** each preset's stack determines the relevant CI jobs (Svelte/FAUST vs. some future React/WASM preset would need different commands); keeping the template with the preset matches the tiering. **Why an `appTemplates` field, not just include the template inside the preset's `paths`:** `paths` are direct copies; templates need to land at a different relative path in the generated app (`templates/app-ci.yml` in the preset → `.github/workflows/ci.yml` in the app). Same mechanism as `instrumentStubs` (D3), generalized — the manifest-validate gate adds an `appTemplates` check analogous to `instrumentStubs`.

**Manifest-validate update:** `scripts/check-manifest.sh` asserts every `appTemplates` source exists; target paths can overlap with `excludeFromGenerate` entries (that's the point — the kernel excludes its own CI, the preset's template provides the app's), but cannot overlap with the preset's own `paths` list (the same direct-vs-template ambiguity as `instrumentStubs`).

### D15 — `openspec/config.yaml` lands in `kernel.paths`

The current manifest does not list `openspec/config.yaml` anywhere; the generator needs it (every OpenSpec project has one). This slice adds `openspec/config.yaml` to `kernel.paths` so the manifest-driven copy emits it. It is kernel-tier because OpenSpec schema selection is a workflow-level decision the kernel owns, not a stack-tier one. **Why a manifest change rather than a hardcoded copy in `new-app.sh`:** keeping the "manifest is the source of truth" principle intact — the generator reads the manifest exhaustively, and `sync-kernel.sh` (slice 4) gets to update `openspec/config.yaml` in existing apps for free when the kernel's version changes.

### D9 — CI gains a `generate-assert` job; `smoke-app` stub still untouched

The CI workflow gets a new `generate-assert` job that runs `scripts/generate-assert.sh`. The slice-1 `lint-format` and slice-2 `preset-build`/`preset-leak-check` jobs are unchanged; the `smoke-app` stub stays as the slice-5 placeholder. **Why a separate job and not extending an existing one:** each slice's gate lives in its own job per ROADMAP gate-decomposition; failures point at the slice responsible. **Why not also build the emitted app:** that is slice 5's value-add — slice 3's contract is "emit correctly," slice 5's is "emitted app builds and runs." Keeping them separate preserves the gate decomposition.

## Risks / Trade-offs

- **The emitted app's blank `param-schema.js` may not satisfy chassis imports at load time** → the stub exports the same surface the chassis imports (an empty `PARAM_SCHEMA`, the five universal-engine names as constants/empty defaults, schema-derived collections deriving empty), so module resolution succeeds. The chassis-purity test against an empty schema is vacuous-but-correct (no instrument param names to forbid). The first time it _really_ exercises is slice 5; until then, generate-assert verifies structure only.
- **The Vite `define` substitution is text-based on `vite.config.js`** → fragile if the file's formatting drifts. Mitigation: the substitution targets specific string literals (the placeholder `'svelte-faust-synth'` and the placeholder URL) that are unlikely to occur outside their declaration. The generate-assert verifies the values actually changed.
- **The manifest's overlap rule (D2) is implicit until you read the script** → mitigation: documented as a comment block in `new-app.sh` listing the exact overlap set; if it grows beyond 3–4 files, escalate to a manifest field.
- **`--output` refusal frustrates the "regenerate after iterating" workflow** → accepted; the user runs `rm -rf <output>` first. A `--force` flag adds enough risk (overwriting an in-progress app) that it should require a follow-up slice with explicit thought, not silently land.
- **The initial `git init` runs inside the user's filesystem at `--output`** → straightforward, but the script must `cd` into `--output` for the git commands rather than running them in the kernel repo's working dir; tested by generate-assert (verifies the emitted dir is a git repo with the expected commit).
- **Stubs may go stale relative to the chassis import surface** → if the chassis adds a new schema export, the stub must add the corresponding empty export. Mitigation: a small test in `presets/<preset>/stubs/stubs.test.js` that imports each stub and asserts it satisfies the same surface as the reference instrument (smoke-tests the stub matches what the chassis expects). The test asserts the **full** export surface, not only what `Shell.svelte` happens to import today.
- **`STACK.md` and `CLAUDE.md` travel verbatim but describe the kernel itself** → known limitation. `STACK.md` opens "These are the stack-specific rules for **agent-workflow-kernel** — the reusable workflow kernel itself" and lists kernel-only gates (`preset-build`, `preset-leak-check`, `generate-assert`); `CLAUDE.md` imports it. A developer in the freshly generated app sees documentation about the kernel, not their app. **Mitigation (this slice):** accepted as a known gap; the generated app developer overrides `STACK.md` for their own stack. **Mitigation (future slice):** add `STACK.md` to the preset's `appTemplates` so the generator emits an app-tier version. Out of scope here to avoid expanding D11's `appTemplates` surface mid-slice.
- **`release-please-config.json` travels verbatim from kernel** → if the kernel's config contains kernel-specific values (e.g. a `package-name` field), the generated app inherits a wrong release config. Task 1.1 (and a preflight read of `release-please-config.json`) confirms whether it is generic-and-reusable (e.g. just `{".": {"release-type": "node"}}`) or carries kernel-specific values. If generic, no action; if kernel-specific, add it to `excludeFromGenerate` and the preset's `appTemplates` in a follow-up edit before this slice merges. Same pattern as `STACK.md`/`CLAUDE.md` if we punt; documented to prevent silent inheritance.
- **First `npm run build` in the generated app needs FAUST locally** → the stub DSP travels via `instrumentStubs` (D3), so the file exists; but the `prebuild` step requires the FAUST compiler on `$PATH` (slice-2 D10 / D6 prerequisite). Without FAUST locally, the build fails at `prebuild`. Documented in the generated app's chore-commit body and in `STACK.md` (task 7.1).

## Migration Plan

Additive; rollback is reverting the branch. Sequence (one commit per task):

1. **Slice-2 file refactor:** make `scripts/check-identity-leak.sh` layout-detecting (D12). Kernel behaviour unchanged.
2. Read chassis import surface to confirm stub exports (closes the param-schema Open Question).
3. Write the two stub files + the template under `presets/svelte-faust-synth/{stubs,templates}/`.
4. Write `stubs.test.js` proving each stub satisfies the chassis import surface.
5. Extend `kernel-manifest.json`: add `openspec/config.yaml` to `kernel.paths` (D15); add `excludeFromGenerate` (D2); add `instrumentStubs` and `appTemplates` per preset (D3, D14).
6. Update `scripts/check-manifest.sh` to validate the new manifest fields.
7. Sync `openspec/specs/preset-portability/spec.md` with the new requirements (per slice 2's D9 early-sync pattern).
8. Write `scripts/new-app.sh`.
9. Write `scripts/generate-assert.sh`.
10. Add a `generate-assert` job to `.github/workflows/ci.yml`.
11. Update `STACK.md`: list `generate-assert` in the completion gate; document `new-app.sh` usage.
12. Verify locally: `scripts/generate-assert.sh` passes; CI shows `generate-assert` green.

## Open Questions

- Whether `--repo-url`'s default `"https://example.com/<name>"` placeholder is sufficient, or whether the generator should refuse to default it (forcing the user to set a real value upfront). Current proposal: placeholder, since the user can fill it in later in `vite.config.js`; refusing would block users who want to try a generation before they have a repo URL ready.
- The exact stub `param-schema.js` export surface is confirmed by task 1.1 reading the chassis (`engine.js` and friends); the provisional list in task 1.2 is the safe starting point but the implementer may adjust based on what the chassis actually imports.
