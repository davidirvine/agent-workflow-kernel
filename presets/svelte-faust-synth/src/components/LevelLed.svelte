<script>
  import { onDestroy } from 'svelte'

  /** @type {{ getPeak?: () => number, powered?: boolean }} */
  let { getPeak = () => 0, powered = false } = $props()

  let color = $state('#111111')
  let rafHandle = 0
  let latchHandle = 0

  /** @param {number} peak */
  function computeColor(peak) {
    if (peak <= 0) return '#111111'
    let hue
    if (peak < 0.5) {
      hue = 120 - (peak / 0.5) * 60
    } else if (peak < 0.85) {
      hue = 60 - ((peak - 0.5) / 0.35) * 30
    } else {
      hue = Math.max(0, 30 - ((peak - 0.85) / 0.15) * 30)
    }
    return `hsl(${Math.round(hue)}, 100%, 50%)`
  }

  function tick() {
    if (!powered) {
      color = '#111111'
      rafHandle = 0
      return
    }
    const peak = getPeak()
    if (peak > 1.0) {
      color = 'hsl(0, 100%, 50%)'
      clearTimeout(latchHandle)
      latchHandle = setTimeout(() => {
        latchHandle = 0
      }, 1500)
    } else if (latchHandle === 0) {
      color = computeColor(peak)
    }
    rafHandle = requestAnimationFrame(tick)
  }

  $effect(() => {
    if (powered) {
      if (!rafHandle) rafHandle = requestAnimationFrame(tick)
    } else {
      if (rafHandle) {
        cancelAnimationFrame(rafHandle)
        rafHandle = 0
      }
      clearTimeout(latchHandle)
      latchHandle = 0
      color = '#111111'
    }

    return () => {
      cancelAnimationFrame(rafHandle)
      clearTimeout(latchHandle)
    }
  })

  onDestroy(() => {
    cancelAnimationFrame(rafHandle)
    clearTimeout(latchHandle)
  })
</script>

<div class="level-led" style:--led-color={color}></div>

<style>
  .level-led {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--led-color, var(--led-off-color, #111111));
    transition: background 80ms ease-out;
  }
</style>
