<script>
  // InstrumentPanels — STUB.
  //
  // new-app.sh writes this file into a freshly generated app at
  // `src/components/InstrumentPanels.svelte`, replacing the preset's reference
  // panel layout with this placeholder. It is injected into the generic Shell
  // as its `children` snippet and receives the chassis contract back (the same
  // props the real panel consumes), so the app boots and renders before you
  // have written a single panel.
  //
  // >>> THIS IS WHERE YOU LAY OUT YOUR INSTRUMENT <<<
  // Add panels, knobs, and switches here, driving them from your
  // param-schema.js. Call the param-name-agnostic `midiStateFor(...)` with your
  // own param names so the chassis carries no instrument literals (the
  // chassis-purity test enforces that). Render the chassis-owned `scope`
  // snippet wherever you want the scope to sit.
  // The stub consumes only `powered` (to dim) and `scope` (to render). The
  // remaining chassis-contract props — midiStateFor, onParamChange,
  // onKnobContextMenu, getMixerPeak, getOutputPeak — are accepted but unused
  // here; a real instrument wires them into its knobs and meters.
  let {
    /** @type {(...params: string[]) => Record<string, object>} */
    midiStateFor,
    /** @type {(e: { param: string, value: number }) => void} */
    onParamChange,
    /** @type {(param: string) => void} */
    onKnobContextMenu,
    /** @type {boolean} */
    powered,
    /** @type {() => number} */
    getMixerPeak,
    /** @type {() => number} */
    getOutputPeak,
    /** @type {import('svelte').Snippet} */
    scope,
  } = $props()
</script>

<div class="instrument">
  <div class="panel" class:dimmed={!powered}>
    <span class="panel-label">build your instrument here</span>
    <p class="hint">
      Edit <code>src/param-schema.js</code> to declare your parameters and this file (<code
        >src/components/InstrumentPanels.svelte</code
      >) to lay out their controls. Then fill in <code>faust/synth.dsp</code> to make it play.
    </p>
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

  .panel.dimmed {
    opacity: 0.4;
  }

  .panel-label {
    color: var(--text-muted, #888);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .hint {
    color: var(--text-dim, #666);
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    line-height: 1.5;
    margin: 0;
  }

  .hint code {
    color: var(--text-primary, #e8dcc8);
  }

  .scope-slot {
    /* The chassis-owned scope renders here; no per-instrument styling. */
  }
</style>
