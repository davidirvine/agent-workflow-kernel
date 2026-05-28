# Extraction audit run record

This file captures the audit evidence for the one-time chassis-purity
extraction audit (design D6 / slice-2 gate (c)), preserved alongside the
fixture so the verdict is reviewable without re-running.

## Run

- **Date:** 2026-05-28
- **Synth-d source:** `main` at `09c5bf63f16e5b89ed2050fc75def0a4f39c31f6`
- **Fixture:** [`synthd-instrument-params.json`](./synthd-instrument-params.json)
- **Script:** [`scripts/run-extraction-audit.sh`](../../../../scripts/run-extraction-audit.sh)
- **Command:** `scripts/run-extraction-audit.sh`

## Result

**PASS** — 30 chassis files scanned across 1 preset (`presets/svelte-faust-synth/`);
47 forbidden synth-d names checked; 0 violations.

## Output

```
Scanning preset: presets/svelte-faust-synth

run-extraction-audit: PASS (30 chassis file(s) scanned across 1 preset(s); 47 forbidden name(s); 0 allowlisted)
```

## Allowlist

Empty. No common-word collisions or other reviewed exceptions were needed.

## Interpretation

Synth-d's chassis was already Phase-1 instrument-agnostic — every subtractive
literal had been moved into the instrument layer (`Oscillator.svelte`,
`Mixer.svelte`, `SubtractivePanels.svelte`, `param-schema.js`, etc.) before
this slice's copy. Task 2.x carried over exactly the chassis files, leaving
those instrument literals behind. Tasks 4.1 and 4.2 then scrubbed the donor
**identity** literals (`synth-d:` namespace, `davidirvine/synth-d` URL,
narrative comments) that aren't param-name leaks but are equally out of
place. The result is a chassis that scans clean against the full subtractive
vocabulary.

Per design D6, this audit is one-time. The traveling chassis-purity test
(task 9.1) takes over for ongoing chassis-purity verification, deriving its
forbidden set from each downstream app's current schema rather than the
donor's.
