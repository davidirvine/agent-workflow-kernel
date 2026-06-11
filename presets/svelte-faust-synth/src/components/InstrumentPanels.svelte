<script>
  // InstrumentPanels: the reference instrument's panel layout (Tier 3). Injected
  // into the generic Shell as its `children` snippet and consumes the chassis
  // contract the Shell hands back. Deliberately minimal — one panel with the
  // attack/release envelope knobs and waveform selector, plus the chassis-owned
  // scope — so the chassis seam is visible without instrument detail drowning it
  // out.
  //
  // Every instrument param-name literal lives here, on the instrument side of
  // the seam (chassis-architecture spec): the per-panel midiState calls the
  // Shell's param-name-agnostic midiStateFor with this instrument's own names,
  // so the chassis carries no instrument literals.
  import Knob from './Knob.svelte'
  import { synthParams } from '../state/synth.svelte.js'
  import { WAVEFORMS } from '../param-schema.js'

  let {
    /** @type {(...params: string[]) => Record<string, object>} */
    midiStateFor,
    /** @type {(e: { param: string, value: number }) => void} */
    onParamChange,
    /** @type {(param: string) => void} */
    onKnobContextMenu,
    /** @type {boolean} */
    powered,
    // getMixerPeak and getOutputPeak come from the chassis but this reference
    // instrument has no mixer panel and the chassis already owns the level-LED;
    // they're accepted but not consumed here. A richer instrument would wire
    // them into its own meters.
    /** @type {() => number} */
    getMixerPeak,
    /** @type {() => number} */
    getOutputPeak,
    /** @type {import('svelte').Snippet} */
    scope,
  } = $props()

  // MIDI state for the two ccScalable envelope knobs the schema declares.
  let knobMidiState = $derived(midiStateFor('attack', 'release'))

  function selectWaveform(/** @type {number} */ i) {
    onParamChange?.({ param: 'waveform', value: i })
  }
</script>

<div class="instrument">
  <div class="panel">
    <span class="panel-label">reference oscillator</span>

    <div class="waveform-row">
      <span class="row-label">waveform</span>
      {#each WAVEFORMS as name, i (i)}
        <button
          class="wave-btn"
          class:active={synthParams.waveform === i}
          onclick={() => selectWaveform(i)}
          disabled={!powered}
        >
          {name}
        </button>
      {/each}
    </div>

    <div class="knob-row">
      <Knob
        label="attack"
        min={0.001}
        max={1}
        default={0.01}
        value={synthParams.attack}
        scale="log"
        unit="s"
        bipolar={false}
        externalValue={knobMidiState.attack?.externalValue}
        learningMidi={knobMidiState.attack?.learningMidi}
        assignedCc={knobMidiState.attack?.assignedCc ?? null}
        disabled={!powered}
        onchange={(e) => onParamChange?.({ param: 'attack', value: e.value })}
        oncontextmenu={() => onKnobContextMenu?.('attack')}
      />
      <Knob
        label="release"
        min={0.01}
        max={2}
        default={0.3}
        value={synthParams.release}
        scale="log"
        unit="s"
        bipolar={false}
        externalValue={knobMidiState.release?.externalValue}
        learningMidi={knobMidiState.release?.learningMidi}
        assignedCc={knobMidiState.release?.assignedCc ?? null}
        disabled={!powered}
        onchange={(e) => onParamChange?.({ param: 'release', value: e.value })}
        oncontextmenu={() => onKnobContextMenu?.('release')}
      />
    </div>
  </div>

  <div class="scope-slot">
    {@render scope()}
  </div>
</div>

<style>
  .instrument {
    display: grid;
    grid-template-columns: auto auto;
    gap: 8px;
    justify-content: start;
    align-items: start;
  }

  .panel {
    background: var(--panel-bg, #1c1c1c);
    border: 1px solid var(--panel-border, #333);
    border-radius: 4px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 280px;
  }

  .panel-label {
    color: var(--text-muted, #888);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .waveform-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .row-label {
    color: var(--text-dim, #666);
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    text-transform: uppercase;
    margin-right: 4px;
  }

  .wave-btn {
    background: var(--surface-raised, #2a2a2a);
    color: var(--text-muted, #888);
    border: 1px solid var(--border-strong, #444);
    border-radius: 2px;
    padding: 4px 8px;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    text-transform: lowercase;
    cursor: pointer;
  }

  .wave-btn:hover:not(:disabled) {
    color: var(--text-primary, #e8dcc8);
  }

  .wave-btn.active {
    background: var(--accent-warm, #c87941);
    color: var(--surface-deep, #111);
    border-color: var(--accent-warm, #c87941);
  }

  .wave-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .knob-row {
    display: flex;
    justify-content: center;
    gap: 16px;
    padding: 4px;
  }

  .scope-slot {
    /* The chassis-owned scope renders here; no per-instrument styling. */
  }
</style>
