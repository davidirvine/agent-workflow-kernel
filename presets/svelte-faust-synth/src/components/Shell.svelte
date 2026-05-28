<script>
  // Shell: the generic, instrument-agnostic application frame (design.md D3).
  // It owns everything that is not specific to the subtractive instrument —
  // header/title/version, the power button and power lifecycle, MIDI wiring and
  // status, the keyboard row, the scope, store seeding, and the parameter/wheel
  // change chokepoints. The instrument's panel layout is injected through the
  // `children` snippet (inversion of control), so the Shell imports NO Tier-3
  // instrument module. Its one sanctioned cross-tier import is the parameter
  // schema (src/param-schema.js, design.md D1), the contract both tiers share.
  import { onMount, onDestroy } from 'svelte'
  import {
    getAnalyser,
    getMixerPeak,
    getOutputPeak,
    powerOn,
    powerOff,
    setParam,
  } from '../audio/engine.js'
  import { MidiManager } from '../audio/midi.js'
  import { MidiCcMap } from '../audio/midiCcMap.js'
  import { bentFreq, BEND_SEMITONES } from '../audio/pitchbend.js'
  import Keyboard from './Keyboard.svelte'
  import RegisterPanel from './RegisterPanel.svelte'
  import WheelsPanel from './WheelsPanel.svelte'
  import PowerButton from './PowerButton.svelte'
  import MidiStatus from './MidiStatus.svelte'
  import PatchControl from './PatchControl.svelte'
  import Scope from './Scope.svelte'
  import {
    synthParams,
    writeParam,
    applyParams,
    resetParams,
    setActivePatch,
    activePatch,
    PARAM_DEFAULTS,
  } from '../state/synth.svelte.js'
  // CC-scaling bounds, power-off rest values, and the instrument's persisted-CC
  // param renames all come from the instrument-owned schema (design.md D1) — the
  // chassis's sanctioned cross-tier contract import. PARAM_RENAMES is injected
  // into the param-name-agnostic MidiCcMap so the chassis carries no instrument
  // param-name literal (D4).
  import { KNOB_PARAMS, powerOffValue, PARAM_RENAMES } from '../param-schema.js'

  // The instrument panel layout is injected as a snippet (D3). The Shell hands
  // it the chassis contract: the param-name-agnostic midiStateFor helper, the
  // param/knob chokepoints, the powered flag, the meter readbacks, and the
  // Shell-owned scope snippet for the instrument to position in its grid.
  let { children } = $props()

  const branch = __GIT_BRANCH__
  const versionLabel = branch === 'main' ? `v${__APP_VERSION__}` : `v${__APP_VERSION__} (${branch})`

  // The mod/pitch wheels are controller state, not part of the synth store/patch.
  // Both are spring-loaded and rest at 0.5 (center), so power-on and power-off
  // alike snap their cursors to this rest position.
  const WHEEL_REST = 0.5

  // Seed the store to factory defaults for this Shell instance. On page load this
  // shows factory defaults (knobs sit at their power-off rest positions until
  // power-on) and the active patch is the (unsaved) factory defaults. The store
  // is a module singleton, so this also gives tests a clean baseline. No DSP
  // writes happen here — the worklet isn't created yet.
  // NOTE for tests: this runs at instantiation, so a test that wants a specific
  // active patch must call setActivePatch AFTER render(App), not before.
  resetParams()
  setActivePatch(null, PARAM_DEFAULTS)

  let keyboardBase = $state(36)
  const activeRegister = $derived(
    keyboardBase === 21 ? 'bottom' : keyboardBase === 48 ? 'top' : 'mid'
  )

  let powered = $state(false)
  let loading = $state(false)
  let analyser = $state(/** @type {AnalyserNode | null} */ (null))

  // MIDI state
  let midiStatus = $state(/** @type {'unavailable'|'connected'|'active'} */ ('unavailable'))
  let midiDevices = $state(/** @type {Array<{id:string,name:string}>} */ ([]))
  let selectedDeviceId = $state(/** @type {string|null} */ (null))
  let learningParam = $state(/** @type {string|null} */ (null))
  let midiActiveNotes = $state(0)

  // Wheel external (programmatic) values: drive each cursor on power transitions
  // and incoming MIDI (CC 1 → MOD, pitch-bend → PITCH). Both rest at center.
  // Each is paired with a nonce that is bumped on every external write so the
  // wheel re-snaps and cancels its spring even when the new value equals the
  // previous one (Svelte dedupes same-value assignments, which would otherwise
  // let a repeated CC/pitch-bend value silently fail to cancel an in-flight spring).
  let modWheelExternal = $state(WHEEL_REST)
  let modWheelNonce = $state(0)
  let pitchWheelExternal = $state(WHEEL_REST)
  let pitchWheelNonce = $state(0)

  /** @param {number} v */
  function setModWheelExternal(v) {
    modWheelExternal = v
    modWheelNonce++
  }

  /** @param {number} v */
  function setPitchWheelExternal(v) {
    pitchWheelExternal = v
    pitchWheelNonce++
  }

  // The most recent unbent note-on frequency, tracked solely at the
  // onKeyboardNote chokepoint (every note source — on-screen keys, QWERTY, MIDI —
  // routes through it): set from each `freq` message, nulled on the `gate:0` of
  // the last release. Non-null exactly while a note sounds, so the PITCH wheel
  // bends a live note and spring frames with nothing sounding stay inert.
  let currentNoteFreq = $state(/** @type {number | null} */ (null))

  const midiCcMap = new MidiCcMap(PARAM_RENAMES)

  const midiManager = new MidiManager({
    onNoteOn: (/** @type {number} */ note, /** @type {number} */ freq) => {
      midiActiveNotes++
      if (midiStatus === 'connected') midiStatus = 'active'
      keyboardTriggerNote?.(note)
      setParam('freq', freq)
    },
    onNoteOff: (/** @type {number} */ note) => {
      midiActiveNotes = Math.max(0, midiActiveNotes - 1)
      if (midiActiveNotes === 0 && midiStatus === 'active') midiStatus = 'connected'
      keyboardReleaseNote?.(note)
    },
    onPitchBend: (/** @type {number} */ freq, /** @type {number} */ bendSemitones) => {
      setParam('freq', freq)
      // Snap the on-screen PITCH cursor to the incoming bend and cancel any
      // active spring-back (external input wins); value 0.5 = no bend.
      setPitchWheelExternal(WHEEL_REST + bendSemitones / (2 * BEND_SEMITONES))
    },
    onCc: (/** @type {{cc: number, value: number}} */ { cc, value }) => {
      if (learningParam !== null) {
        const knob = KNOB_PARAMS[learningParam]
        if (knob) {
          midiCcMap.assign(cc, learningParam, knob.min, knob.max)
          learningParam = null
          return
        }
      }
      // CC 1 always routes to modWheel (controller state, not the store). It
      // fires regardless of power state; setParam is a safe no-op while off.
      if (cc === 1) {
        const scaled = value / 127
        setModWheelExternal(scaled)
        setParam('modWheel', scaled)
        return
      }
      // While powered off the synth is reset to the active patch on power-on,
      // so a store write here would be discarded — skip it, matching the
      // `!powered` guard in onParamChange.
      if (!powered) return
      const mapping = midiCcMap.resolve(cc)
      if (!mapping) return
      const scaled = midiCcMap.scale(cc, value)
      if (scaled === null) return
      // MIDI CC writes the store, which drives both the DSP and the knob.
      writeParam(mapping.param, scaled)
    },
    onStatusChange: (/** @type {'unavailable'|'connected'|'active'} */ status) => {
      midiStatus = status
    },
    onDevicesChange: (/** @type {Array<{id: string, name: string}>} */ devices) => {
      midiDevices = devices
      if (devices.length > 0 && selectedDeviceId === null) {
        selectedDeviceId = devices[0].id
      }
    },
  })

  // Bindable functions exposed by Keyboard
  let keyboardTriggerNote = $state(/** @type {((midi: number) => void) | null} */ (null))
  let keyboardReleaseNote = $state(/** @type {((midi: number) => void) | null} */ (null))
  let keyboardReleaseAll = $state(/** @type {(() => void) | null} */ (null))

  async function handleToggle() {
    if (powered) {
      keyboardReleaseAll?.()
      await powerOff()
      powered = false
      setModWheelExternal(WHEEL_REST)
      setPitchWheelExternal(WHEEL_REST)
      currentNoteFreq = null
    } else {
      loading = true
      try {
        await powerOn()
        analyser = getAnalyser()
        powered = true
        // Apply the active patch to the store, which drives both UI and DSP.
        // The active patch is the most recently loaded patch, or the factory
        // defaults when none has been loaded. `force` re-sends every param to
        // the freshly created worklet node so the DSP and UI agree from the
        // first sample.
        applyParams(activePatch.params, true)
        setModWheelExternal(WHEEL_REST)
        setPitchWheelExternal(WHEEL_REST)
        // modWheel is controller state (not in synthParams), so applyParams does
        // not re-send it — set the DSP to the 0.5 rest explicitly on power-on.
        setParam('modWheel', WHEEL_REST)
      } catch (err) {
        console.error('Power on failed:', err)
      } finally {
        loading = false
      }
    }
  }

  /** @param {{ param: string, value: number }} e */
  function onParamChange(e) {
    // Only user interaction while powered should write the store. When powered
    // off, the knobs' externalValue animates to rest positions, which fires
    // their onchange — that must NOT be written back to the store.
    if (!powered) return
    writeParam(e.param, e.value)
  }

  /** @param {{ param: string, value: number }} e */
  function onModWheelChange(e) {
    // Guard on power state to match onParamChange: only act while powered (the
    // cursor still springs visually when off, but no DSP/store write occurs).
    if (!powered) return
    // Do NOT write back to modWheelExternal here: that prop is the programmatic
    // override (CC 1 / power), and feeding the wheel's own per-frame spring
    // values into it would cancel the spring-back on the very next frame.
    setParam(e.param, e.value)
  }

  /** @param {{ value: number }} e */
  function onPitchWheelChange(e) {
    if (!powered) return
    // Inert when no note sounds: skip the write so spring frames after a release
    // (and bends with nothing playing) cannot stomp the next note-on's freq.
    if (currentNoteFreq === null) return
    // Last-note-wins: if a legato note arrives while the PITCH wheel is still
    // springing home, currentNoteFreq is already the new note, so the in-flight
    // spring bends the new note. This is intended (the bend tracks the live
    // note), consistent with the existing MidiManager.#lastNote pitch-bend path.
    const semitones = (e.value - 0.5) * 2 * BEND_SEMITONES
    setParam('freq', bentFreq(currentNoteFreq, semitones))
  }

  /** @param {Array<{ param: string, value: number }>} messages */
  function onKeyboardNote(messages) {
    for (const msg of messages) {
      setParam(msg.param, msg.value)
    }
    // Track the unbent base note frequency for the PITCH wheel. This chokepoint
    // sees every note source (on-screen, QWERTY, MIDI all route through here).
    // Resolved over the whole batch (not positionally): a note-off batch carries
    // a lone `gate:0` and clears the base; a note-on or legato batch carries
    // `freq` (with `gate:1` only on the first note) and sets it. A `gate:0` takes
    // precedence, so the base can never outlive a release — going inert is the
    // safe default. (Today's contract never mixes `freq` and `gate:0` in one
    // batch, so this is a defensive choice, not an observable one.)
    const endsNote = messages.some((m) => m.param === 'gate' && m.value === 0)
    // Last freq in the batch (matches the DSP loop's last-write-wins above),
    // found with a reverse scan rather than Array.findLast to avoid the ES2023
    // dependency. Today's batch carries at most one freq.
    let lastFreq = /** @type {number | null} */ (null)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].param === 'freq') {
        lastFreq = messages[i].value
        break
      }
    }
    if (endsNote) {
      currentNoteFreq = null
    } else if (lastFreq !== null) {
      currentNoteFreq = lastFreq
    }
  }

  /** @param {string} param */
  function onKnobContextMenu(param) {
    learningParam = learningParam === param ? null : param
  }

  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    if (e.key === 'Escape' && learningParam !== null) {
      learningParam = null
    }
  }

  onMount(() => {
    window.addEventListener('keydown', onKeyDown)
    // MIDI is independent of the audio path: connect on mount so the status
    // indicator and incoming-event wiring work even before the synth is
    // powered on (and in CI, where AudioWorklet init fails for lack of audio
    // hardware). MIDI events while powered-off are safe — engine.setParam
    // and friends are no-ops when the worklet node hasn't been created yet.
    midiManager.connect()
  })
  onDestroy(() => {
    window.removeEventListener('keydown', onKeyDown)
    midiManager.destroy()
  })

  // The param-name-AGNOSTIC MIDI-state helper (D3/D4). The Shell exposes it as a
  // function, not pre-computed per-panel state: the instrument layout calls it
  // with its own param names, keeping every instrument param-name literal on the
  // instrument side of the seam. Reactivity is preserved because this closure
  // reads the Shell-owned reactive sources (powered, synthParams, learningParam,
  // midiCcMap) at call time, inside the instrument layout's reactive context.
  /** @param {...string} params */
  function midiStateFor(...params) {
    return Object.fromEntries(
      params.map((p) => [
        p,
        {
          // The store feeds each knob's externalValue while powered; when
          // powered off, knobs sit at their power-off rest positions.
          externalValue: powered ? synthParams[p] : powerOffValue(p),
          learningMidi: learningParam === p,
          assignedCc: midiCcMap.getAssignedCc(p),
        },
      ])
    )
  }
</script>

<div class="app">
  <header class="header">
    <a
      class="github-link"
      href="https://github.com/davidirvine/synth-d"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GitHub repository"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    </a>
    <div class="title-block">
      <span class="title">SYNTH-D</span>
      <span class="version-label">{versionLabel}</span>
    </div>
    <div class="header-right">
      <div class="status-stack">
        <MidiStatus
          status={midiStatus}
          devices={midiDevices}
          {selectedDeviceId}
          ondevicechange={(id) => {
            selectedDeviceId = id
            midiManager.selectDevice(id)
          }}
        />
        <PatchControl {powered} />
      </div>
      <PowerButton {powered} {loading} ontoggle={handleToggle} />
    </div>
  </header>

  <main inert={!powered || undefined}>
    <div class="synth" class:dimmed={!powered}>
      {@render children({
        midiStateFor,
        onParamChange,
        onKnobContextMenu,
        powered,
        getMixerPeak,
        getOutputPeak,
        scope,
      })}
      <div class="keyboard-row">
        <WheelsPanel
          modExternalValue={modWheelExternal}
          modExternalNonce={modWheelNonce}
          pitchExternalValue={pitchWheelExternal}
          pitchExternalNonce={pitchWheelNonce}
          onModChange={onModWheelChange}
          onPitchChange={onPitchWheelChange}
        />
        <Keyboard
          onnote={onKeyboardNote}
          bind:triggerNote={keyboardTriggerNote}
          bind:releaseNote={keyboardReleaseNote}
          bind:releaseAll={keyboardReleaseAll}
          baseMidi={keyboardBase}
        />
        <RegisterPanel
          ondown={() => (keyboardBase = 21)}
          onup={() => (keyboardBase = 48)}
          {activeRegister}
        />
      </div>
    </div>
  </main>
</div>

<!-- The scope is Shell-owned (it reads the chassis analyser and power state),
     but the instrument layout positions it within its own grid. It is therefore
     passed to `children` as a snippet rather than pre-rendered here. -->
{#snippet scope()}
  <Scope {analyser} {powered} />
{/snippet}

<style>
  .app {
    --knob-body-size: 48px;
    display: flex;
    flex-direction: column;
    gap: 0;
    width: fit-content;
  }

  .header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px 12px 8px;
    margin: 0 8px;
    background: var(--panel-bg, #1c1c1c);
    border-bottom: 1px solid var(--panel-border, #333);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }

  /* Stack the MIDI status and patch control vertically, right-aligned, so the
     patch button sits under the MIDI indicator row. */
  .status-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .github-link {
    color: var(--control-faint-color, #555);
    text-decoration: none;
    line-height: 0;
    transition: color 0.15s;
  }

  .github-link:hover {
    color: var(--control-label-color, #888);
  }

  .github-link:focus:not(:focus-visible) {
    outline: none;
  }

  .title-block {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    justify-content: space-between;
  }

  .title {
    font-family: monospace;
    font-size: 16px;
    font-weight: bold;
    color: var(--panel-label-color, #e8dcc8);
    letter-spacing: 0.2em;
  }

  .version-label {
    font-size: 9px;
    color: var(--control-hint-color, #666);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  main {
    padding: 8px;
  }

  .synth {
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: opacity 0.2s;
  }

  .synth.dimmed {
    opacity: 0.4;
  }

  .keyboard-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
</style>
