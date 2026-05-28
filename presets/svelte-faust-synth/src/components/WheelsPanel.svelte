<script>
  // The standalone wheels panel: a MOD and a PITCH spring-loaded wheel side by
  // side, a gear button (visually top-left, last in tab order) opening a popup
  // of per-wheel physics knobs, and localStorage persistence of those physics.
  // Each wheel stays param-agnostic; this panel adds the synth `param` (MOD →
  // `modWheel`) or forwards to the pitch handler before bubbling onchange up.
  import { tick } from 'svelte'
  import Wheel from './Wheel.svelte'
  import Knob from './Knob.svelte'
  import { PHYSICS_RANGES } from '../audio/wheelPhysics.js'
  import { BEND_SEMITONES } from '../audio/pitchbend.js'
  import {
    loadWheelPhysics,
    saveWheelPhysics,
    resetWheelPhysics,
  } from '../audio/wheelPhysicsStore.js'

  /** @type {{
    modExternalValue?: number,
    modExternalNonce?: number,
    pitchExternalValue?: number,
    pitchExternalNonce?: number,
    onModChange?: (e: { param: string, value: number }) => void,
    onPitchChange?: (e: { value: number }) => void,
  }} */
  let {
    modExternalValue,
    modExternalNonce,
    pitchExternalValue,
    pitchExternalNonce,
    onModChange,
    onPitchChange,
  } = $props()

  let physics = $state(loadWheelPhysics())

  let open = $state(false)
  let rootEl = $state(/** @type {HTMLElement | null} */ (null))
  let gearEl = $state(/** @type {HTMLButtonElement | null} */ (null))
  let popupEl = $state(/** @type {HTMLElement | null} */ (null))

  // PITCH cursor maps 0–1 to ±BEND_SEMITONES around 0.5 (no bend). Surfaced to
  // the slider as aria-valuetext so screen readers announce the bend in
  // semitones rather than a bare 0–1 number.
  /** @param {number} v */
  function pitchValueText(v) {
    const semis = (v - 0.5) * 2 * BEND_SEMITONES
    const rounded = Math.round(semis * 100) / 100
    return `${rounded > 0 ? '+' : ''}${rounded} st`
  }

  /** @param {number} v */
  function modValueText(v) {
    return `${Math.round(v * 100)}%`
  }

  async function toggleOpen() {
    open = !open
    if (open) {
      // Move focus into the popup so keyboard users land on the settings.
      await tick()
      popupEl?.focus()
    }
  }

  /**
   * Update one physics field and persist. Bound to each knob's onchange.
   * @param {'mod' | 'pitch'} wheel
   * @param {'mass' | 'spring' | 'damping'} field
   * @param {number} value
   */
  function updatePhysics(wheel, field, value) {
    physics = { ...physics, [wheel]: { ...physics[wheel], [field]: value } }
    saveWheelPhysics(physics)
  }

  function resetPhysics() {
    physics = resetWheelPhysics()
  }

  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    // Listening on the window (rather than rootEl) matches the established
    // popover pattern in PatchControl: the popup can be dismissed by Escape
    // regardless of which descendant holds focus. `stopPropagation` keeps the
    // same Escape from also reaching App's MIDI-learn-cancel handler.
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      open = false
      gearEl?.focus()
    }
  }

  /** @param {PointerEvent} e */
  function onWindowPointerDown(e) {
    // Close on a press outside the panel (pointerdown, not click, so the check
    // runs before an in-popup handler can detach its own target).
    if (open && rootEl && e.target instanceof Node && !rootEl.contains(e.target)) {
      open = false
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} onpointerdown={onWindowPointerDown} />

<div class="wheels-panel" bind:this={rootEl}>
  <div class="wheels">
    <Wheel
      label="MOD"
      externalValue={modExternalValue}
      externalNonce={modExternalNonce}
      mass={physics.mod.mass}
      spring={physics.mod.spring}
      damping={physics.mod.damping}
      formatValueText={modValueText}
      onchange={(e) => onModChange?.({ param: 'modWheel', value: e.value })}
    />
    <Wheel
      label="PITCH"
      externalValue={pitchExternalValue}
      externalNonce={pitchExternalNonce}
      mass={physics.pitch.mass}
      spring={physics.pitch.spring}
      damping={physics.pitch.damping}
      formatValueText={pitchValueText}
      onchange={(e) => onPitchChange?.({ value: e.value })}
    />
  </div>

  <!-- Gear sits visually top-left but comes last in DOM, so tab order is
       MOD → PITCH → gear. -->
  <button
    class="gear"
    bind:this={gearEl}
    onclick={toggleOpen}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label="wheel physics settings"
    title="Wheel physics"
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94 0 .32.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
      />
    </svg>
  </button>

  {#if open}
    <div class="popup" bind:this={popupEl} role="dialog" aria-label="wheel physics" tabindex="-1">
      {#each ['mod', 'pitch'] as wheel, i (wheel)}
        {#if i > 0}
          <div class="section-divider"></div>
        {/if}
        <div class="physics-group">
          <span class="group-label">{wheel === 'mod' ? 'MOD PHYSICS' : 'PITCH PHYSICS'}</span>
          <div class="knobs">
            <Knob
              label="MASS"
              min={PHYSICS_RANGES.mass.min}
              max={PHYSICS_RANGES.mass.max}
              default={PHYSICS_RANGES.mass.default}
              externalValue={physics[wheel].mass}
              showArc={false}
              onchange={(e) => updatePhysics(wheel, 'mass', e.value)}
            />
            <Knob
              label="SPRING"
              min={PHYSICS_RANGES.spring.min}
              max={PHYSICS_RANGES.spring.max}
              default={PHYSICS_RANGES.spring.default}
              externalValue={physics[wheel].spring}
              showArc={false}
              onchange={(e) => updatePhysics(wheel, 'spring', e.value)}
            />
            <Knob
              label="DAMP"
              min={PHYSICS_RANGES.damping.min}
              max={PHYSICS_RANGES.damping.max}
              default={PHYSICS_RANGES.damping.default}
              externalValue={physics[wheel].damping}
              showArc={false}
              onchange={(e) => updatePhysics(wheel, 'damping', e.value)}
            />
          </div>
        </div>
      {/each}
      <button class="reset" onclick={resetPhysics}>reset</button>
    </div>
  {/if}
</div>

<style>
  .wheels-panel {
    position: relative;
    background: var(--panel-bg, #1c1c1c);
    border: 1px solid var(--panel-border, #333);
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .wheels {
    display: flex;
    gap: 16px;
  }

  .gear {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--control-label-color, #888);
    cursor: pointer;
  }

  .gear:hover {
    color: var(--accent-color, #c87941);
  }

  .gear:focus-visible {
    outline: 2px solid var(--accent-color, #c87941);
    outline-offset: 2px;
  }

  .popup {
    position: absolute;
    top: 32px;
    left: 6px;
    z-index: 10;
    max-width: calc(100vw - 24px);
    background: var(--panel-bg, #1c1c1c);
    border: 1px solid var(--control-border, #444);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .popup:focus-visible {
    outline: 2px solid var(--accent-color, #c87941);
    outline-offset: 2px;
  }

  .section-divider {
    height: 1px;
    background: var(--control-bg, #2a2a2a);
  }

  .physics-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-label {
    font-size: 10px;
    color: var(--panel-label-color, #e8dcc8);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .knobs {
    display: flex;
    gap: 10px;
  }

  .reset {
    align-self: flex-start;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--panel-label-color, #e8dcc8);
    background: var(--control-bg, #2a2a2a);
    border: 1px solid var(--control-border, #444);
    padding: 4px 10px;
    cursor: pointer;
  }

  .reset:hover {
    border-color: var(--accent-color, #c87941);
  }

  .reset:focus-visible {
    outline: 2px solid var(--accent-color, #c87941);
    outline-offset: 2px;
  }
</style>
