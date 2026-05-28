<script>
  /** @type {{ powered: boolean, loading: boolean, ontoggle: () => void }} */
  let { powered = false, loading = false, ontoggle } = $props()

  const status = $derived(loading ? 'loading' : powered ? 'on' : 'off')
</script>

<div class="power-wrap">
  <button
    class="power-btn"
    class:on={powered}
    disabled={loading}
    onclick={ontoggle}
    aria-pressed={powered}
    aria-label={loading ? 'Starting audio' : powered ? 'Power off' : 'Power on'}
    type="button"
  >
    <svg
      class="power-icon {status}"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke-linecap="round"
      stroke-width="2"
      aria-hidden="true"
    >
      <line x1="10" y1="2" x2="10" y2="8" />
      <path d="M 14.5 4.6 A 7 7 0 1 1 5.5 4.6" />
    </svg>
  </button>
</div>

<style>
  .power-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .power-btn {
    width: 31px;
    height: 31px;
    border-radius: 50%;
    background: var(--panel-bg, #1c1c1c);
    border: 2px solid var(--panel-border, #333);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: border-color 0.15s;
  }

  .power-btn:hover:not(:disabled) {
    border-color: var(--control-faint-color, #555);
  }

  .power-btn:disabled {
    cursor: default;
  }

  .power-icon {
    transition:
      stroke 0.3s,
      filter 0.3s;
  }

  .power-icon.off {
    stroke: var(--power-glow-warn, #e07820);
    filter: drop-shadow(0 0 0px transparent);
  }

  .power-icon.loading {
    stroke: var(--power-glow-ready, #e0c020);
    filter: drop-shadow(0 0 0px transparent);
  }

  .power-icon.on {
    stroke: var(--power-on-color, #20b040);
    filter: drop-shadow(0 0 3px var(--power-on-color, #20b040));
  }
</style>
