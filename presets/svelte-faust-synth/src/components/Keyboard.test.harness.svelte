<script>
  import Keyboard from './Keyboard.svelte'

  /** @type {{
    onnote?: (msgs: Array<{ param: string, value: number }>) => void,
    baseMidi?: number,
    onref?: (api: { triggerNote: ((midi: number) => void) | null, releaseNote: ((midi: number) => void) | null, releaseAll: (() => void) | null }) => void,
  }} */
  let { onnote, baseMidi = 36, onref } = $props()

  let triggerNote = $state(/** @type {((midi: number) => void) | null} */ (null))
  let releaseNote = $state(/** @type {((midi: number) => void) | null} */ (null))
  let releaseAll = $state(/** @type {(() => void) | null} */ (null))

  $effect(() => {
    onref?.({ triggerNote, releaseNote, releaseAll })
  })
</script>

<Keyboard {onnote} {baseMidi} bind:triggerNote bind:releaseNote bind:releaseAll />
