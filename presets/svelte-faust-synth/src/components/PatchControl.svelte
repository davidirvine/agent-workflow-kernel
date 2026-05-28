<script>
  import {
    synthParams,
    activePatch,
    applyParams,
    setActivePatch,
    serializeParams,
    PARAM_NAMES,
    PARAM_DEFAULTS,
  } from '../state/synth.svelte.js'
  import {
    listPatches,
    savePatch,
    loadPatch,
    deletePatch,
    renamePatch,
    validateName,
    MAX_NAME_LENGTH,
  } from '../patches/storage.js'

  /** @type {{ powered?: boolean }} */
  let { powered = false } = $props()

  let open = $state(false)
  let rootEl = $state(/** @type {HTMLElement | null} */ (null))
  let patches = $state(/** @type {string[]} */ ([]))
  let nameInput = $state('')
  let confirmingOverwrite = $state(false)
  let confirmingDeleteName = $state(/** @type {string | null} */ (null))
  let renamingName = $state(/** @type {string | null} */ (null))
  let renameInput = $state('')
  let confirmingRenameOverwrite = $state(false)
  let error = $state('')

  // Dirty = the live in-scope state differs from the active patch's saved
  // baseline. Compared as a positional signature over PARAM_NAMES so key order
  // never matters. Saving or loading resets the baseline (activePatch.params),
  // which clears this.
  const dirty = $derived.by(() => {
    const cur = PARAM_NAMES.map((p) => synthParams[p]).join('|')
    const base = PARAM_NAMES.map((p) => activePatch.params[p]).join('|')
    return cur !== base
  })

  const displayName = $derived(activePatch.name ?? 'DEFAULT')

  function refresh() {
    patches = listPatches()
  }

  function toggleOpen() {
    open = !open
    if (open) {
      refresh()
      nameInput = activePatch.name ?? ''
      error = ''
      confirmingOverwrite = false
      confirmingDeleteName = null
      renamingName = null
      confirmingRenameOverwrite = false
    }
  }

  function onNameInput() {
    // Editing the name forks a new patch — drop any pending overwrite confirm.
    confirmingOverwrite = false
    error = ''
  }

  /** @param {string} name */
  function handleLoad(name) {
    const patch = loadPatch(name)
    if (!patch) {
      error = `could not load "${name}"`
      return
    }
    // Merge onto factory defaults so a partial patch (a slot from before a param
    // was added, or one with non-finite values filtered out by loadPatch) still
    // produces a complete baseline — otherwise missing keys would read as
    // undefined and falsely report dirty right after load. Missing params reset
    // to their defaults.
    const params = { ...PARAM_DEFAULTS, ...patch.params }
    setActivePatch(patch.name, params)
    // Apply to the store (force=false: only changed params reach the DSP). While
    // powered this drives the DSP immediately; while powered off the worklet
    // doesn't exist yet and the knobs stay at their rest positions, but the store
    // now matches the patch so it is force-reapplied on the next power-on and
    // dirty is cleared.
    applyParams(params, false)
    nameInput = patch.name
    // Clear any in-progress per-row interaction so a stale rename/confirm editor
    // doesn't linger on another row after loading.
    confirmingDeleteName = null
    renamingName = null
    confirmingRenameOverwrite = false
    confirmingOverwrite = false
    error = ''
  }

  function doSave() {
    // Snapshot once so the persisted slot and the dirty-tracking baseline are
    // guaranteed identical, even if the store changes between the two uses.
    const snapshot = serializeParams()
    const res = savePatch(nameInput, snapshot)
    if (!res.ok) {
      error = res.error === 'invalid-name' ? 'name required' : 'storage unavailable'
      return
    }
    // The saved state becomes the active patch's baseline, clearing dirty.
    setActivePatch(res.name, snapshot)
    // Reflect the trimmed/normalized name back into the field.
    nameInput = res.name
    confirmingOverwrite = false
    refresh()
  }

  function handleSave() {
    const clean = validateName(nameInput)
    if (clean === null) {
      error = 'name required'
      return
    }
    // Saving the active patch's own name updates it in place — no confirm.
    // Saving onto a different existing patch requires an inline overwrite confirm.
    if (clean !== activePatch.name && patches.includes(clean) && !confirmingOverwrite) {
      confirmingOverwrite = true
      return
    }
    doSave()
  }

  function cancelOverwrite() {
    confirmingOverwrite = false
  }

  /** @param {KeyboardEvent} e */
  function onNameKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  /** @param {string} name */
  function requestDelete(name) {
    confirmingDeleteName = name
  }

  function cancelDelete() {
    confirmingDeleteName = null
  }

  /** @param {string} name */
  function confirmDelete(name) {
    deletePatch(name)
    // If the active patch was deleted, clear its name (the trigger would
    // otherwise still show a patch that no longer exists). The current params
    // stay applied; they're just no longer associated with a saved patch.
    if (name === activePatch.name) setActivePatch(null, activePatch.params)
    confirmingDeleteName = null
    refresh()
  }

  /** @param {string} name */
  function startRename(name) {
    renamingName = name
    renameInput = name
    confirmingRenameOverwrite = false
    confirmingDeleteName = null
    error = ''
  }

  function cancelRename() {
    renamingName = null
    confirmingRenameOverwrite = false
  }

  function onRenameInput() {
    // Editing the name drops any pending overwrite confirm.
    confirmingRenameOverwrite = false
    error = ''
  }

  /** @param {KeyboardEvent} e */
  function onRenameKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRename()
    }
  }

  function handleRename() {
    const clean = validateName(renameInput)
    if (clean === null) {
      error = 'name required'
      return
    }
    if (clean === renamingName) {
      // Unchanged — just close the inline editor.
      cancelRename()
      return
    }
    // Renaming onto a different existing patch requires an inline confirm.
    if (patches.includes(clean) && !confirmingRenameOverwrite) {
      confirmingRenameOverwrite = true
      return
    }
    doRename()
  }

  function doRename() {
    const from = renamingName
    const res = renamePatch(/** @type {string} */ (from), renameInput)
    if (!res.ok) {
      error =
        res.error === 'invalid-name'
          ? 'name required'
          : res.error === 'not-found'
            ? 'patch not found'
            : 'storage unavailable'
      return
    }
    // If the active patch was renamed, update its displayed name (params and
    // dirty state are unchanged — rename touches the saved slot, not live state).
    if (from === activePatch.name) {
      setActivePatch(res.name, activePatch.params)
      if (nameInput === from) nameInput = res.name
    }
    renamingName = null
    confirmingRenameOverwrite = false
    confirmingDeleteName = null
    refresh()
  }

  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    if (e.key === 'Escape' && open) {
      // Stop the keypress from also reaching App's Escape handler (MIDI-learn
      // cancel) — one Escape should close the popover, not trigger both.
      e.stopPropagation()
      open = false
    }
  }

  /** @param {PointerEvent} e */
  function onWindowPointerDown(e) {
    // Close the popover on a press outside the control. We use pointerdown (not
    // click) so the check runs before any in-popover handler re-renders and
    // detaches its own target — a detached target is not contained by rootEl and
    // would otherwise be misread as an outside click. The trigger's own press is
    // inside rootEl, so toggling still works.
    if (open && rootEl && e.target instanceof Node && !rootEl.contains(e.target)) {
      open = false
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} onpointerdown={onWindowPointerDown} />

<div class="patch-control" bind:this={rootEl}>
  <button
    class="trigger"
    onclick={toggleOpen}
    aria-haspopup="true"
    aria-expanded={open}
    title="Patches"
  >
    PATCH: <span class="patch-name">{displayName}</span>{#if dirty}<span
        class="dirty"
        aria-label="unsaved changes">*</span
      >{/if}
  </button>

  {#if open}
    <div class="popover" role="dialog" aria-label="Patches">
      {#if patches.length === 0}
        <p class="empty">no patches saved yet</p>
      {:else}
        <ul class="patch-list">
          {#each patches as name (name)}
            <li class="patch-row" class:active={name === activePatch.name}>
              {#if renamingName === name}
                <input
                  class="rename-input"
                  type="text"
                  maxlength={MAX_NAME_LENGTH}
                  aria-label={`rename ${name}`}
                  bind:value={renameInput}
                  oninput={onRenameInput}
                  onkeydown={onRenameKeydown}
                />
                {#if confirmingRenameOverwrite}
                  <span class="confirm">
                    overwrite {validateName(renameInput) ?? ''}?
                    <button
                      class="confirm-btn"
                      onclick={doRename}
                      aria-label="confirm rename overwrite">✓</button
                    >
                    <button class="confirm-btn" onclick={cancelRename} aria-label="cancel rename"
                      >✕</button
                    >
                  </span>
                {:else}
                  <button class="confirm-btn" onclick={handleRename} aria-label="confirm rename"
                    >✓</button
                  >
                  <button class="confirm-btn" onclick={cancelRename} aria-label="cancel rename"
                    >✕</button
                  >
                {/if}
              {:else}
                <button class="patch-load" onclick={() => handleLoad(name)} title="Load patch">
                  <span class="marker">{name === activePatch.name ? '▸' : ' '}</span>{name}
                </button>
                <button
                  class="patch-rename"
                  onclick={() => startRename(name)}
                  title="Rename patch"
                  aria-label={`rename ${name}`}>✎</button
                >
                {#if confirmingDeleteName === name}
                  <span class="confirm">
                    delete?
                    <button
                      class="confirm-btn"
                      onclick={() => confirmDelete(name)}
                      aria-label="confirm delete">✓</button
                    >
                    <button class="confirm-btn" onclick={cancelDelete} aria-label="cancel delete"
                      >✕</button
                    >
                  </span>
                {:else}
                  <button
                    class="patch-delete"
                    onclick={() => requestDelete(name)}
                    title="Delete patch"
                    aria-label={`delete ${name}`}>✕</button
                  >
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      <div class="save-row">
        <input
          class="name-input"
          type="text"
          maxlength={MAX_NAME_LENGTH}
          placeholder="patch name"
          aria-label="patch name"
          disabled={!powered}
          bind:value={nameInput}
          oninput={onNameInput}
          onkeydown={onNameKeydown}
        />
        {#if confirmingOverwrite}
          <span class="confirm">
            overwrite {validateName(nameInput) ?? ''}?
            <button class="confirm-btn" onclick={doSave} aria-label="confirm overwrite">✓</button>
            <button class="confirm-btn" onclick={cancelOverwrite} aria-label="cancel overwrite"
              >✕</button
            >
          </span>
        {:else}
          <button class="save-btn" onclick={handleSave} disabled={!powered}>SAVE</button>
        {/if}
      </div>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .patch-control {
    position: relative;
    display: flex;
    align-items: center;
  }

  .trigger {
    font-family: monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    background: var(--control-bg, #2a2a2a);
    color: var(--control-label-color, #888);
    border: 1px solid var(--control-border, #444);
    border-radius: 2px;
    padding: 3px 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .trigger:hover {
    color: var(--panel-label-color, #e8dcc8);
  }

  .patch-name {
    color: var(--accent-color, #c87941);
    text-transform: uppercase;
  }

  .dirty {
    color: var(--accent-color, #c87941);
    margin-left: 1px;
  }

  .popover {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 10;
    min-width: 200px;
    background: var(--panel-bg, #1c1c1c);
    border: 1px solid var(--control-border, #444);
    border-radius: 2px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .empty {
    font-family: monospace;
    font-size: 10px;
    color: var(--control-hint-color, #666);
    margin: 0;
    padding: 4px 0;
    text-align: center;
  }

  .patch-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
  }

  .patch-row {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: space-between;
  }

  .patch-load {
    flex: 1;
    text-align: left;
    font-family: monospace;
    font-size: 11px;
    background: transparent;
    color: var(--panel-label-color, #e8dcc8);
    border: none;
    padding: 3px 4px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .patch-row.active .patch-load {
    color: var(--accent-color, #c87941);
  }

  .patch-load:hover {
    background: var(--control-bg, #2a2a2a);
  }

  .marker {
    display: inline-block;
    width: 0.9em;
    color: var(--accent-color, #c87941);
  }

  .rename-input {
    flex: 1;
    min-width: 0;
    font-family: monospace;
    font-size: 11px;
    background: var(--control-bg, #2a2a2a);
    color: var(--panel-label-color, #e8dcc8);
    border: 1px solid var(--accent-color, #c87941);
    border-radius: 2px;
    padding: 2px 4px;
    text-transform: uppercase;
  }

  .patch-rename,
  .patch-delete,
  .confirm-btn {
    font-family: monospace;
    font-size: 11px;
    background: var(--control-bg, #2a2a2a);
    color: var(--control-label-color, #888);
    border: 1px solid var(--control-border, #444);
    border-radius: 2px;
    padding: 1px 5px;
    cursor: pointer;
  }

  .patch-delete:hover {
    color: var(--danger-color, #c8413a);
    border-color: var(--danger-color, #c8413a);
  }

  .patch-rename:hover {
    color: var(--accent-color, #c87941);
    border-color: var(--accent-color, #c87941);
  }

  .confirm {
    font-family: monospace;
    font-size: 10px;
    color: var(--accent-color, #c87941);
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 10px;
    border-top: 1px solid var(--panel-border, #333);
    padding-top: 6px;
  }

  .name-input {
    flex: 1;
    min-width: 0;
    font-family: monospace;
    font-size: 11px;
    background: var(--control-bg, #2a2a2a);
    color: var(--panel-label-color, #e8dcc8);
    border: 1px solid var(--control-border, #444);
    border-radius: 2px;
    padding: 3px 5px;
    text-transform: uppercase;
  }

  .name-input::placeholder {
    color: var(--control-hint-color, #666);
    /* Placeholder is descriptive text, not an entered name — keep it as-is. */
    text-transform: none;
  }

  .save-btn {
    font-family: monospace;
    font-size: 10px;
    letter-spacing: 0.1em;
    background: var(--accent-active-bg, #3a2a1a);
    color: var(--accent-color, #c87941);
    border: 1px solid var(--accent-color, #c87941);
    border-radius: 2px;
    padding: 3px 8px;
    cursor: pointer;
  }

  .save-btn:hover:not(:disabled) {
    background: var(--accent-active-hover-bg, #4a3424);
  }

  .save-btn:disabled,
  .name-input:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .error {
    font-family: monospace;
    font-size: 10px;
    color: var(--danger-color, #c8413a);
    margin: 0;
  }
</style>
