<script>
  /** @type {{
    ondown?: () => void,
    onup?: () => void,
    activeRegister?: 'bottom' | 'top' | 'mid',
  }} */
  let { ondown, onup, activeRegister = 'mid' } = $props()
</script>

<div class="panel">
  <span class="panel-label">keyboard range</span>
  <div class="btn-col">
    <button
      class="reg-btn"
      class:active={activeRegister === 'top'}
      onclick={onup}
      aria-pressed={activeRegister === 'top'}
    >
      Oct ▲
    </button>
    <button
      class="reg-btn"
      class:active={activeRegister === 'bottom'}
      onclick={ondown}
      aria-pressed={activeRegister === 'bottom'}
    >
      Oct ▼
    </button>
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
    flex: 1;
  }

  .panel-label {
    font-size: 10px;
    color: var(--panel-label-color, #e8dcc8);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .btn-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .reg-btn {
    font-family: inherit;
    font-size: 9px;
    background: var(--control-bg, #2a2a2a);
    color: var(--control-label-color, #888);
    border: 1px solid var(--control-border, #444);
    padding: 3px 8px;
    cursor: pointer;
    text-transform: uppercase;
    height: 22px;
  }

  .reg-btn.active {
    background: var(--accent-active-bg, #3a2a1a);
    color: var(--accent-color, #c87941);
    border-color: var(--accent-color, #c87941);
  }
</style>
