<script>
  import { onMount, onDestroy } from 'svelte'

  /** @type {{ analyser: AnalyserNode | null, powered: boolean }} */
  let { analyser = null, powered = false } = $props()

  let canvas = $state(/** @type {HTMLCanvasElement | null} */ (null))
  let context = /** @type {CanvasRenderingContext2D | null} */ (null)
  let frameId = 0
  let mounted = false
  let dataArray = /** @type {Uint8Array<ArrayBuffer> | null} */ (null)
  // Resolved once on mount from the --scope-trace-color theme token (D7); the
  // canvas stroke color is JS-driven, so it reads the cascaded custom property
  // rather than carrying a hardcoded literal.
  let traceColor = '#e8dcc8'

  function syncCanvasSize() {
    if (!canvas) return
    const width = canvas.clientWidth || 300
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== 80) canvas.height = 80
  }

  function drawMidline() {
    if (!canvas || !context) return

    syncCanvasSize()

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = traceColor
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(0, canvas.height / 2)
    context.lineTo(canvas.width, canvas.height / 2)
    context.stroke()
  }

  function drawWaveform() {
    if (!canvas || !context || !analyser) return

    syncCanvasSize()

    const bufferLength = analyser.fftSize / 2
    if (!dataArray || dataArray.length !== bufferLength) {
      dataArray = new Uint8Array(bufferLength)
    }

    analyser.getByteTimeDomainData(dataArray)

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = traceColor
    context.lineWidth = 2
    context.beginPath()

    for (let index = 0; index < dataArray.length; index += 1) {
      const x = (index / (dataArray.length - 1)) * canvas.width
      const y = (dataArray[index] / 128) * (canvas.height / 2)

      if (index === 0) {
        context.moveTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    }

    context.stroke()
  }

  function stopAnimation() {
    if (frameId) {
      cancelAnimationFrame(frameId)
      frameId = 0
    }
  }

  function tick() {
    if (!powered || !analyser) {
      frameId = 0
      drawMidline()
      return
    }

    drawWaveform()
    frameId = requestAnimationFrame(tick)
  }

  function startAnimation() {
    if (frameId || !powered || !analyser) return
    frameId = requestAnimationFrame(tick)
  }

  function syncAnimation() {
    if (!mounted) return

    if (powered && analyser) {
      startAnimation()
      return
    }

    stopAnimation()
    drawMidline()
  }

  onMount(() => {
    context = canvas?.getContext('2d') ?? null
    mounted = true
    if (canvas) {
      traceColor =
        getComputedStyle(canvas).getPropertyValue('--scope-trace-color').trim() || '#e8dcc8'
    }
    drawMidline()
    syncAnimation()
  })

  onDestroy(() => {
    stopAnimation()
  })

  $effect(() => {
    powered
    analyser
    syncAnimation()
  })
</script>

<div class="panel">
  <span class="panel-label">OSCILLOSCOPE</span>
  <div class="scope-body">
    <canvas
      bind:this={canvas}
      style="display: block; width: 100%; height: 80px; background: var(--panel-bg, #1c1c1c);"
    ></canvas>
  </div>
</div>

<style>
  .panel {
    background: var(--panel-bg, #1c1c1c);
    border: 1px solid var(--panel-border, #333);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .panel-label {
    font-size: 10px;
    color: var(--panel-label-color, #e8dcc8);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .scope-body {
    display: flex;
    align-items: center;
  }
</style>
