<script>
  import { onMount, onDestroy } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import { QWERTY_MAP, buildNoteOnMessages, midiToFreq } from '../audio/keyboard.js'

  /** @type {{
    onnote?: (msgs: Array<{ param: string, value: number }>) => void,
    triggerNote?: ((midi: number) => void) | null,
    releaseNote?: ((midi: number) => void) | null,
    releaseAll?: (() => void) | null,
    baseMidi?: number,
  }} */
  let {
    onnote,
    triggerNote = $bindable(null), // eslint-disable-line no-useless-assignment
    releaseNote = $bindable(null), // eslint-disable-line no-useless-assignment
    releaseAll = $bindable(null), // eslint-disable-line no-useless-assignment
    baseMidi = 36,
  } = $props()

  const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10])
  const RAIL_H = 1

  const WHITE_W = 28
  const WHITE_H = 100
  const BLACK_W = 18
  const BLACK_H = 60

  /**
   * @param {number} base
   * @param {number} count
   */
  function buildKeys(base, count) {
    let whiteIdx = 0
    return Array.from({ length: count }, (_, i) => {
      const midi = base + i
      const black = BLACK_SEMITONES.has(midi % 12)
      let x
      if (!black) {
        x = whiteIdx * WHITE_W
        whiteIdx++
      } else {
        x = (whiteIdx - 1) * WHITE_W + WHITE_W - BLACK_W / 2
      }
      return { midi, black, x }
    })
  }

  const keys = $derived(buildKeys(baseMidi, 61))

  const whiteKeys = $derived(keys.filter((k) => !k.black))
  const totalWidth = $derived(whiteKeys.length * WHITE_W)

  /** @param {number} midi */
  function midiToNoteName(midi) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`
  }

  const activeKeys = new SvelteSet()
  const pressedQwerty = new SvelteSet()

  function _triggerNote(/** @type {number} */ midi) {
    const freq = midiToFreq(midi)
    const wasActive = activeKeys.size > 0
    activeKeys.add(midi)
    onnote?.(buildNoteOnMessages(freq, wasActive))
  }

  function _releaseNote(/** @type {number} */ midi) {
    activeKeys.delete(midi)
    if (activeKeys.size === 0) {
      onnote?.([{ param: 'gate', value: 0 }])
    }
  }

  function _releaseAll() {
    // Intentionally does NOT clear `pressedQwerty`. The OS still considers any
    // physically-held QWERTY key to be down across a power-cycle, so leaving
    // its entry in `pressedQwerty` makes the keydown short-circuit suppress a
    // stray keydown without an intervening keyup — enforcing the spec's
    // "release + re-press is required to retrigger" requirement
    // (see openspec/changes/clear-key-highlights-on-power-off/design.md).
    for (const midi of Array.from(activeKeys)) {
      _releaseNote(midi)
    }
  }

  // Expose to parent so MIDI callbacks and power-off can call into the shared activeKeys path.
  // eslint-disable-next-line no-useless-assignment
  triggerNote = _triggerNote
  // eslint-disable-next-line no-useless-assignment
  releaseNote = _releaseNote
  // eslint-disable-next-line no-useless-assignment
  releaseAll = _releaseAll

  // Don't treat typing in a text field (e.g. the patch name input) as QWERTY
  // note input.
  /** @param {EventTarget | null} target */
  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
  }

  function onKeyDown(/** @type {KeyboardEvent} */ e) {
    if (e.repeat) return
    if (isEditableTarget(e.target)) return
    const midi = QWERTY_MAP[e.key]
    if (midi === undefined) return
    if (pressedQwerty.has(e.key)) return
    pressedQwerty.add(e.key)
    _triggerNote(midi)
  }

  function onKeyUp(/** @type {KeyboardEvent} */ e) {
    if (isEditableTarget(e.target)) return
    const midi = QWERTY_MAP[e.key]
    if (midi === undefined) return
    pressedQwerty.delete(e.key)
    _releaseNote(midi)
  }

  onMount(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })

  onDestroy(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  })
</script>

<div class="keyboard-wrap">
  <svg width={totalWidth} height={WHITE_H + RAIL_H + 2}>
    <rect x={0} y={0} width={totalWidth} height={RAIL_H} fill="var(--panel-border, #333)" />
    <!-- White keys -->
    {#each whiteKeys as key (key.midi)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <rect
        x={key.x + 1}
        y={RAIL_H}
        width={WHITE_W - 2}
        height={WHITE_H}
        class="white-key"
        class:active={activeKeys.has(key.midi)}
        data-midi={key.midi}
        onpointerdown={() => _triggerNote(key.midi)}
        onpointerup={() => _releaseNote(key.midi)}
        onpointerleave={() => _releaseNote(key.midi)}
      />
    {/each}
    <!-- Black keys (rendered on top) -->
    {#each keys.filter((k) => k.black) as key (key.midi)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <rect
        x={key.x}
        y={RAIL_H}
        width={BLACK_W}
        height={BLACK_H}
        class="black-key"
        class:active={activeKeys.has(key.midi)}
        data-midi={key.midi}
        onpointerdown={() => _triggerNote(key.midi)}
        onpointerup={() => _releaseNote(key.midi)}
        onpointerleave={() => _releaseNote(key.midi)}
      />
    {/each}
    <!-- White key labels -->
    {#each whiteKeys as key (key.midi)}
      <text x={key.x + WHITE_W / 2} y={RAIL_H + WHITE_H - 5} text-anchor="middle" class="key-label"
        >{midiToNoteName(key.midi)}</text
      >
    {/each}
    <!-- Black key labels -->
    {#each keys.filter((k) => k.black) as key (key.midi)}
      <text
        x={key.x + BLACK_W / 2}
        y={RAIL_H + BLACK_H - 4}
        text-anchor="middle"
        class="key-label-black">{midiToNoteName(key.midi)}</text
      >
    {/each}
  </svg>
</div>

<style>
  .keyboard-wrap {
    display: flex;
    justify-content: center;
    padding: 0;
  }

  .white-key {
    fill: var(--key-white-fill, #dddddd);
    stroke: var(--key-white-stroke, #888);
    stroke-width: 1;
    cursor: pointer;
    touch-action: none;
  }

  .white-key.active {
    fill: var(--key-active-fill, #c87941);
  }

  .black-key {
    fill: var(--key-black-fill, #1a1a1a);
    stroke: var(--key-black-stroke, #000);
    stroke-width: 1;
    cursor: pointer;
    touch-action: none;
  }

  .black-key.active {
    fill: var(--key-active-fill, #c87941);
  }

  .key-label {
    font-size: 8px;
    fill: var(--control-label-color, #888);
    pointer-events: none;
    user-select: none;
  }

  .key-label-black {
    font-size: 6px;
    fill: var(--key-label-color, #aaa);
    pointer-events: none;
    user-select: none;
  }
</style>
