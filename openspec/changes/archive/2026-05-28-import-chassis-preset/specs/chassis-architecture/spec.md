---
tier: stack
---

## ADDED Requirements

### Requirement: Single parameter-schema module is the source of truth

The instrument SHALL declare every parameter in one instrument-owned schema module. Each parameter entry SHALL provide its bounds (`min`, `max`), factory `default`, a `bipolar` flag, a `kind` of `knob`, `switch`, or `controller`, and a `ccScalable` flag. No other module SHALL define parameter defaults, ranges, or bipolar flags as independent literals; all such values SHALL be derived from the schema.

#### Scenario: Store membership derives from the schema and excludes controllers

- **WHEN** the parameter store resolves its factory defaults, parameter names, and audio-param set
- **THEN** they are derived from the schema as the descriptors whose `kind` is `knob` or `switch`, and descriptors with `kind: 'controller'` (e.g. `modWheel`) are absent from `PARAM_DEFAULTS`, `PARAM_NAMES`, and `AUDIO_PARAMS`, excluding them from patches and store forwarding by construction

#### Scenario: CC-scalable knob metadata derives from the schema

- **WHEN** the UI resolves knob ranges, the bipolar set, and each parameter's power-off rest value
- **THEN** `KNOB_PARAMS` is derived as the descriptors with `ccScalable === true` — including any CC-mappable switches and the `modWheel` controller — not by a `kind === 'knob'` filter; `powerOffValue` returns the midpoint for a bipolar parameter and the minimum otherwise

#### Scenario: No duplicated parameter literals remain

- **WHEN** the codebase is searched for parameter default, range, or bipolar literals outside the schema module
- **THEN** none are found; the store and the UI reference the schema-derived values only

### Requirement: Chassis couples to the instrument only through the schema and the universal engine contract

The generic chassis SHALL reference instrument parameters only via the schema-derived collections and the universal engine param contract — the names `freq`, `gate`, `modWheel`, `mixerPeak`, and `outputPeak`. Chassis modules SHALL NOT reference any instrument-specific parameter name as a literal.

#### Scenario: Chassis contains no instrument-specific param literals

- **WHEN** the chassis modules (audio engine, MIDI, keyboard, patch storage, store machinery, Shell, and generic components) are inspected
- **THEN** the only literal parameter names they contain are the five universal engine params, and an automated check fails the build if an instrument-specific param name (any schema key that is not one of the five universal names) appears in chassis code

#### Scenario: Universal engine contract is honored

- **WHEN** the chassis sends notes, controller, or reads meters
- **THEN** it uses exactly `freq`/`gate` for notes, `modWheel` for the controller, and `mixerPeak`/`outputPeak` for meter readbacks, independent of which instrument is loaded

### Requirement: Generic Shell is free of instrument knowledge

The application SHALL be split into a generic `Shell` and an instrument-supplied panel layout. The Shell SHALL own the instrument-independent application frame — header, power button and power lifecycle, MIDI wiring and status, keyboard row, scope, store seeding, and the parameter/wheel change chokepoints — and SHALL host the instrument panels through an injected boundary (slot/children) rather than importing them. The Shell SHALL contain no import of any instrument (Tier 3) module, except the parameter-schema module, which is the sanctioned cross-tier contract import.

#### Scenario: Shell hosts instrument panels by injection

- **WHEN** the application renders
- **THEN** the Shell renders the instrument's panel layout through its injected boundary, exposing the chassis callbacks (parameter change, knob context menu, per-knob MIDI state) to the panels, without the Shell importing any instrument panel directly

#### Scenario: Shell imports no instrument module

- **WHEN** the Shell's imports are inspected
- **THEN** none resolve to a Tier-3 instrument module, with the sole exception of the parameter-schema module
