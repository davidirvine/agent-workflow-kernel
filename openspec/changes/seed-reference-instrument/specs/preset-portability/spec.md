## MODIFIED Requirements

### Requirement: The reference instrument exercises the chassis seam minimally

A preset SHALL ship a minimal **reference instrument** as a worked example — a single **playable** instrument that exercises both store-backed descriptor kinds (`knob` and `switch`), the chassis power-lifecycle, and the full `freq`/`gate` note lifecycle. The reference instrument SHALL be small enough to read end-to-end yet complete enough that `new-app.sh` seeds a generated app with it as the app's starting instrument and the chassis still has a meaningful contract to honor.

The reference instrument SHALL be **key-triggered**: `gate` SHALL drive an audible amplitude envelope so that pressing a key starts a note and releasing it ends the note. The instrument SHALL be silent when no key is held (including immediately after power-on), rather than sounding a continuous tone independent of `gate`. The specific envelope shape and oscillator are implementation choices for the preset, but `gate` SHALL have an audible note-on/note-off effect on amplitude, not merely select or switch a parameter.

#### Scenario: Reference instrument exercises required seams

- **WHEN** the reference instrument is inspected
- **THEN** it declares at least one `knob` and one `switch` descriptor in `param-schema.js`, consumes the `freq` and `gate` universal contract from the keyboard, exposes `outputPeak` so the chassis scope/level-LED light up, and is muted by the chassis power-off lifecycle (verified by powering off and observing engine silence)

#### Scenario: Reference instrument is playable via the gate contract

- **WHEN** the reference instrument is powered on with no key held
- **THEN** it is silent (no continuous drone)
- **WHEN** a key is then pressed (the keyboard raises `gate` and sets `freq`)
- **THEN** an audible note sounds at that pitch through an amplitude envelope, and the live signal drives `outputPeak` and the oscilloscope
- **WHEN** the key is released (the keyboard lowers `gate`)
- **THEN** the note's amplitude envelope ends the note

#### Scenario: Reference instrument does not entangle the chassis

- **WHEN** the chassis-purity test runs against the preset with the reference instrument's schema
- **THEN** no chassis file references any reference-instrument parameter name as a literal; the chassis remains generic

### Requirement: A preset declares its instrument-tier stub mapping in the sync manifest

Each preset entry in `kernel-manifest.json` SHALL declare an `instrumentStubs` field mapping each instrument-tier target path (relative to the generated app's root) to a committed source file inside the preset. For the preset's reference instrument, each source SHALL be the reference instrument file itself, so the target and source paths are equal (e.g. `"src/param-schema.js": "src/param-schema.js"`) and the generator seeds a fresh app with the reference instrument. Every source SHALL exist; no target path SHALL appear in the preset's `paths` list (a target listed in both `paths` and `instrumentStubs` would mean the generator writes the instrument-tier file then overwrites it with a `paths` copy).

#### Scenario: Generator can seed a preset stack-agnostically

- **WHEN** `new-app.sh` runs against a preset
- **THEN** it reads each entry under that preset's `instrumentStubs` field and writes the named source file's content — the preset's reference instrument — to the target path in the emitted app, with no preset-specific knowledge required in the generator

#### Scenario: Manifest-validate catches a malformed `instrumentStubs`

- **WHEN** `scripts/check-manifest.sh` runs
- **THEN** it asserts every `instrumentStubs` source path exists in the repo and no `instrumentStubs` target path also appears in the same preset's `paths` list; it fails with a clear message if either rule is violated
