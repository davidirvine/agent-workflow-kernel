<script>
  import { untrack, onDestroy } from 'svelte'
  import { tweened } from 'svelte/motion'
  import { cubicOut } from 'svelte/easing'
  import {
    normalizedToValue,
    valueToNormalized,
    formatValue,
    detectInterval,
  } from '../audio/math.js'

  /** @type {{
    label?: string,
    min?: number,
    max?: number,
    default?: number,
    value?: number,
    scale?: string,
    unit?: string,
    ticks?: Array<{ pos: number, label: string, r?: number }>,
    showLabel?: boolean,
    showValue?: boolean,
    showArc?: boolean,
    bipolar?: boolean,
    intervalIndicator?: boolean,
    step?: number | null,
    fineStep?: number | null,
    externalValue?: number,
    learningMidi?: boolean,
    assignedCc?: number | null,
    disabled?: boolean,
    onchange?: (e: { value: number }) => void,
    oncontextmenu?: () => void
  }} */
  let {
    label = '',
    min = 0,
    max = 1,
    default: defaultValue = 0.5,
    value: initialValue = undefined,
    scale = 'linear',
    unit = '',
    ticks = [],
    showLabel = true,
    showValue = true,
    showArc = true,
    bipolar = false,
    intervalIndicator = false,
    step = null,
    fineStep = null,
    externalValue = undefined,
    learningMidi = false,
    assignedCc = null,
    disabled = false,
    onchange,
    oncontextmenu,
  } = $props()

  let value = $state(untrack(() => (initialValue !== undefined ? initialValue : defaultValue)))

  const SWEEP = 270
  const START_ANGLE = 225
  const CX = 24
  const CY = 24
  const R = 18

  /**
   * @param {number} angleDeg
   * @param {number} r
   */
  function polarToXY(angleDeg, r) {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
  }

  /** @param {{ pos: number, label: string, r?: number }} tick */
  function tickXY(tick) {
    const angle = START_ANGLE + tick.pos * SWEEP
    return polarToXY(angle, tick.r ?? R + 10)
  }

  /** @param {number} pos */
  function arcPath(pos) {
    const startRad = ((START_ANGLE - 90) * Math.PI) / 180
    const endAngle = START_ANGLE + pos * SWEEP
    const endRad = ((endAngle - 90) * Math.PI) / 180
    const sx = CX + R * Math.cos(startRad)
    const sy = CY + R * Math.sin(startRad)
    const ex = CX + R * Math.cos(endRad)
    const ey = CY + R * Math.sin(endRad)
    const large = pos * SWEEP > 180 ? 1 : 0
    return `M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`
  }

  /** @param {number} pos */
  function bipolarArcPath(pos) {
    if (Math.abs(pos - 0.5) < 0.001) return ''
    const centerAngle = START_ANGLE + 0.5 * SWEEP
    const centerRad = ((centerAngle - 90) * Math.PI) / 180
    const cx2 = CX + R * Math.cos(centerRad)
    const cy2 = CY + R * Math.sin(centerRad)
    const endAngle = START_ANGLE + pos * SWEEP
    const endRad = ((endAngle - 90) * Math.PI) / 180
    const ex = CX + R * Math.cos(endRad)
    const ey = CY + R * Math.sin(endRad)
    if (pos > 0.5) {
      // max span = 0.5 × SWEEP = 135° < 180°, so large is always 0 with current SWEEP
      const large = (pos - 0.5) * SWEEP > 180 ? 1 : 0
      return `M ${cx2} ${cy2} A ${R} ${R} 0 ${large} 1 ${ex} ${ey}`
    } else {
      // same reasoning applies for the negative half
      const large = (0.5 - pos) * SWEEP > 180 ? 1 : 0
      return `M ${ex} ${ey} A ${R} ${R} 0 ${large} 1 ${cx2} ${cy2}`
    }
  }

  let pos = $derived(valueToNormalized(value, min, max, scale))

  const animPos = tweened(
    untrack(() =>
      valueToNormalized(initialValue !== undefined ? initialValue : defaultValue, min, max, scale)
    ),
    { duration: 0, easing: cubicOut }
  )

  let indicatorEnd = $derived(polarToXY(START_ANGLE + $animPos * SWEEP, R - 3))
  let activePath = $derived(showArc ? (bipolar ? bipolarArcPath(pos) : arcPath(pos)) : null)

  let dragging = false
  let lastY = 0
  let shiftHeld = false

  // Apply externalValue when not dragging — fires onchange immediately, then animates
  $effect(() => {
    if (externalValue !== undefined && !dragging) {
      const clamped = Math.max(min, Math.min(max, externalValue))
      if (clamped !== value) {
        value = clamped
        onchange?.({ value: clamped })
        animPos.set(valueToNormalized(clamped, min, max, scale), { duration: 100 })
      }
    }
  })

  /** @param {KeyboardEvent} e */
  function onShiftKey(e) {
    if (e.key === 'Shift') shiftHeld = e.type === 'keydown'
  }

  /** @param {PointerEvent & { currentTarget: Element }} e */
  function onPointerDown(e) {
    dragging = true
    lastY = e.clientY
    shiftHeld = e.shiftKey
    e.currentTarget.setPointerCapture(e.pointerId)
    window.addEventListener('keydown', onShiftKey)
    window.addEventListener('keyup', onShiftKey)
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (!dragging) return
    shiftHeld = e.shiftKey
    const delta = -(e.clientY - lastY)
    lastY = e.clientY
    const sensitivity = shiftHeld ? 0.001 : 0.01
    const newPos = Math.max(0, Math.min(1, pos + delta * sensitivity))
    const rawValue = normalizedToValue(newPos, min, max, scale)
    const activeStep = shiftHeld && fineStep !== null ? fineStep : step
    const newValue =
      activeStep !== null && activeStep > 0
        ? Math.max(min, Math.min(max, Math.round(rawValue / activeStep) * activeStep))
        : rawValue
    value = newValue
    animPos.set(valueToNormalized(newValue, min, max, scale), { duration: 0 })
    onchange?.({ value: newValue })
  }

  function onPointerUp() {
    dragging = false
    window.removeEventListener('keydown', onShiftKey)
    window.removeEventListener('keyup', onShiftKey)
  }

  onDestroy(() => {
    window.removeEventListener('keydown', onShiftKey)
    window.removeEventListener('keyup', onShiftKey)
  })

  function onDblClick() {
    value = defaultValue
    animPos.set(valueToNormalized(defaultValue, min, max, scale), { duration: 0 })
    onchange?.({ value: defaultValue })
  }

  /** @param {MouseEvent} e */
  function handleContextMenu(e) {
    e.preventDefault()
    oncontextmenu?.()
  }
</script>

<div class="knob-wrap" class:disabled>
  <span class="knob-label" class:invisible={!showLabel}>{label}</span>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="knob-hit"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    ondblclick={onDblClick}
    oncontextmenu={handleContextMenu}
  >
    <svg
      viewBox="0 0 48 48"
      style="overflow: visible; width: var(--knob-body-size, 48px); height: var(--knob-body-size, 48px);"
    >
      {#if learningMidi}
        <circle cx={CX} cy={CY} r={R + 4} class="learn-ring" fill="none" stroke-width="2" />
      {/if}
      <path d={arcPath(1)} class="track" fill="none" stroke-width="3" />
      {#if activePath}
        <path d={activePath} class="arc" fill="none" stroke-width="3" />
      {/if}
      <circle cx={CX} cy={CY} r="13" class="body" />
      <line
        x1={CX}
        y1={CY}
        x2={indicatorEnd.x}
        y2={indicatorEnd.y}
        class="indicator"
        stroke-width="2"
        stroke-linecap="round"
      />
      {#each ticks as tick (tick.label)}
        {@const xy = tickXY(tick)}
        <text x={xy.x} y={xy.y} class="tick-label" text-anchor="middle" dominant-baseline="middle"
          >{tick.label}</text
        >
      {/each}
    </svg>
  </div>
  {#if intervalIndicator}
    {@const interval = detectInterval(value)}
    <span class="interval-indicator">{interval ?? ' '}</span>
  {/if}
  <span class="knob-value" class:invisible={!showValue}>{formatValue(value, unit)}</span>
  {#if assignedCc !== null}
    <span class="cc-label">CC {assignedCc}</span>
  {/if}
</div>

<style>
  .knob-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    user-select: none;
  }

  .knob-wrap.disabled {
    opacity: 0.35;
    pointer-events: none;
  }

  .knob-label {
    font-size: 10px;
    color: var(--panel-label-color, #e8dcc8);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    margin-bottom: 2px;
  }

  .knob-value {
    font-size: 10px;
    color: var(--control-label-color, #888);
    line-height: 1;
  }

  /* Lock the value-label column width only on knobs that opt into the
     interval indicator, so a leading "-" doesn't widen the column on
     these knobs and ripple the surrounding row. Other knobs keep their
     auto width to avoid changing existing layouts. */
  .knob-wrap:has(.interval-indicator) .knob-value {
    display: inline-block;
    width: 5em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .interval-indicator {
    font-size: 10px;
    color: var(--knob-tick-color, #6a6a6a);
    min-height: 1em;
    line-height: 1;
    letter-spacing: 0.03em;
  }

  /* Pull whatever sits directly under the SVG up against the knob body.
     The SVG's 48px box has empty space below the visible knob; -10px snugs
     the first label right against the bottom of the body. */
  .knob-hit + .interval-indicator,
  .knob-hit + .knob-value {
    margin-top: -10px;
  }

  .cc-label {
    font-size: 9px;
    color: var(--control-hint-color, #666);
    font-family: monospace;
    letter-spacing: 0.03em;
  }

  .invisible {
    visibility: hidden;
  }

  .knob-hit {
    cursor: ns-resize;
    touch-action: none;
  }

  .track {
    stroke: var(--knob-arc-track-color, #333);
  }

  .arc {
    stroke: var(--knob-arc-color, #c87941);
  }

  .body {
    fill: var(--knob-track-color, #2a2a2a);
    stroke: var(--knob-track-stroke, #444);
    stroke-width: 1;
  }

  .indicator {
    stroke: var(--knob-arc-color, #c87941);
  }

  .tick-label {
    font-size: 7px;
    fill: var(--knob-tick-label-color, #e8dcc8);
    font-family: monospace;
    text-transform: uppercase;
    pointer-events: none;
    user-select: none;
  }

  .learn-ring {
    stroke: var(--knob-arc-color, #c87941);
    animation: learn-pulse 0.8s ease-in-out infinite alternate;
  }

  @keyframes learn-pulse {
    from {
      opacity: 0.3;
    }
    to {
      opacity: 1;
    }
  }
</style>
