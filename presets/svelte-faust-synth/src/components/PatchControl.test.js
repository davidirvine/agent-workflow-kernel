import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import PatchControl from './PatchControl.svelte'
import {
  resetParams,
  setActivePatch,
  writeParam,
  synthParams,
  PARAM_DEFAULTS,
} from '../state/synth.svelte.js'
import { createPatchStorage } from '../patches/storage.js'

// PatchControl now takes a `storage` prop (D4 constructor injection). These
// tests construct a `test:`-namespaced storage in beforeEach and route every
// render through renderControl(). The savePatch/listPatches/loadPatch aliases
// below preserve the pre-refactor call sites unchanged.
const TEST_NAMESPACE = 'test:'
/** @type {ReturnType<typeof createPatchStorage>} */
let storage
let savePatch
let listPatches
let loadPatch

beforeEach(() => {
  localStorage.clear()
  resetParams()
  setActivePatch(null, PARAM_DEFAULTS)
  storage = createPatchStorage(TEST_NAMESPACE)
  savePatch = storage.savePatch
  listPatches = storage.listPatches
  loadPatch = storage.loadPatch
})

/** @param {Record<string, unknown>} [extraProps] */
function renderControl(extraProps = {}) {
  return render(PatchControl, { props: { storage, ...extraProps } })
}

/** @param {HTMLElement} container */
function openPopover(container) {
  return fireEvent.click(/** @type {Element} */ (container.querySelector('.trigger')))
}

/** @param {HTMLElement} container @param {string} value */
async function typeName(container, value) {
  const input = /** @type {HTMLInputElement} */ (container.querySelector('.name-input'))
  await fireEvent.input(input, { target: { value } })
}

describe('PatchControl — trigger and empty state', () => {
  it('shows the active patch name (DEFAULT when none loaded)', () => {
    const { container } = renderControl()
    expect(/** @type {Element} */ (container.querySelector('.patch-name')).textContent).toBe(
      'DEFAULT'
    )
  })

  it('disables the name field and SAVE while powered off, enables them when on', async () => {
    const off = renderControl({ powered: false })
    await openPopover(off.container)
    expect(
      /** @type {HTMLInputElement} */ (off.container.querySelector('.name-input')).disabled
    ).toBe(true)
    expect(
      /** @type {HTMLButtonElement} */ (off.container.querySelector('.save-btn')).disabled
    ).toBe(true)

    const on = renderControl({ powered: true })
    await openPopover(on.container)
    expect(
      /** @type {HTMLInputElement} */ (on.container.querySelector('.name-input')).disabled
    ).toBe(false)
    expect(
      /** @type {HTMLButtonElement} */ (on.container.querySelector('.save-btn')).disabled
    ).toBe(false)
  })

  it('shows an empty-state message when no patches exist', async () => {
    const { container, getByText } = renderControl()
    await openPopover(container)
    expect(getByText('no patches saved yet')).toBeTruthy()
  })

  it('does not render the popover until the trigger is clicked', () => {
    const { container } = renderControl()
    expect(container.querySelector('.popover')).toBeNull()
  })

  it('closes the popover on a press outside the control', async () => {
    const { container } = renderControl()
    await openPopover(container)
    expect(container.querySelector('.popover')).not.toBeNull()
    await fireEvent.pointerDown(document.body)
    expect(container.querySelector('.popover')).toBeNull()
  })

  it('a press inside the popover (on a self-removing control) does not close it', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container } = renderControl()
    await openPopover(container)
    // Starting a rename swaps the row out for an input; the popover must stay open.
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="rename LEAD"]'))
    )
    expect(container.querySelector('.popover')).not.toBeNull()
    expect(container.querySelector('.rename-input')).not.toBeNull()
  })

  it('closes the popover on Escape', async () => {
    const { container } = renderControl()
    await openPopover(container)
    expect(container.querySelector('.popover')).not.toBeNull()
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.popover')).toBeNull()
  })
})

describe('PatchControl — save', () => {
  it('saves a new patch from the current state', async () => {
    const { container } = renderControl()
    await openPopover(container)
    await typeName(container, 'LEAD')
    await fireEvent.click(/** @type {Element} */ (container.querySelector('.save-btn')))
    expect(listPatches()).toContain('LEAD')
  })

  it('normalizes the name field to the trimmed name after a successful save', async () => {
    const { container } = renderControl()
    await openPopover(container)
    await typeName(container, '  PAD  ')
    await fireEvent.click(/** @type {Element} */ (container.querySelector('.save-btn')))
    expect(listPatches()).toEqual(['PAD'])
    expect(/** @type {HTMLInputElement} */ (container.querySelector('.name-input')).value).toBe(
      'PAD'
    )
  })

  it('Enter in the name field triggers save', async () => {
    const { container } = renderControl()
    await openPopover(container)
    const input = /** @type {Element} */ (container.querySelector('.name-input'))
    await fireEvent.input(input, { target: { value: 'LEAD' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(listPatches()).toContain('LEAD')
  })

  it('an empty name shows "name required" and saves nothing', async () => {
    const { container, getByText } = renderControl()
    await openPopover(container)
    await typeName(container, '   ')
    await fireEvent.click(/** @type {Element} */ (container.querySelector('.save-btn')))
    expect(getByText('name required')).toBeTruthy()
    expect(listPatches()).toEqual([])
  })

  it('saving over an existing name requires inline confirmation', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container, getByText, getByLabelText } = renderControl()
    await openPopover(container)
    await typeName(container, 'LEAD')
    await fireEvent.click(/** @type {Element} */ (container.querySelector('.save-btn')))
    // Inline overwrite confirm is shown; nothing written yet beyond the original.
    expect(getByText(/overwrite/i)).toBeTruthy()
    await fireEvent.click(getByLabelText('confirm overwrite'))
    // Still exactly one entry (overwrite, not duplicate).
    expect(listPatches()).toEqual(['LEAD'])
  })

  it('canceling the overwrite confirm does not write', async () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, attack: 0.11 })
    const { container, getByLabelText } = renderControl()
    // Change the live state so a save would differ from the stored slot.
    writeParam('attack', 0.99)
    await openPopover(container)
    await typeName(container, 'LEAD')
    await fireEvent.click(/** @type {Element} */ (container.querySelector('.save-btn')))
    await fireEvent.click(getByLabelText('cancel overwrite'))
    expect(loadPatch('LEAD')?.params.attack).toBe(0.11)
  })
})

describe('PatchControl — update in place', () => {
  it('saving the active patch by its own name updates it with no overwrite confirm', async () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, attack: 0.1 })
    const { container, getByText } = renderControl()
    // Load it so it becomes the active patch (popover stays open), then tweak.
    await openPopover(container)
    await fireEvent.click(getByText('LEAD'))
    writeParam('attack', 0.5)
    await Promise.resolve()
    expect(container.querySelector('.dirty')).not.toBeNull()

    // SAVE under the same (active) name — should update silently, no confirm.
    await fireEvent.click(/** @type {Element} */ (container.querySelector('.save-btn')))
    // No overwrite confirmation was shown.
    expect(container.querySelector('.confirm')).toBeNull()
    expect(loadPatch('LEAD')?.params.attack).toBe(0.5)
    expect(listPatches()).toEqual(['LEAD'])
    await Promise.resolve()
    expect(container.querySelector('.dirty')).toBeNull()
  })
})

describe('PatchControl — rename', () => {
  it('renames a patch to a new name', async () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, attack: 0.8 })
    const { container } = renderControl()
    await openPopover(container)
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="rename LEAD"]'))
    )
    await fireEvent.input(/** @type {Element} */ (container.querySelector('.rename-input')), {
      target: { value: 'LEAD2' },
    })
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="confirm rename"]'))
    )
    expect(listPatches()).toEqual(['LEAD2'])
  })

  it('Enter in the rename field confirms the rename', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container } = renderControl()
    await openPopover(container)
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="rename LEAD"]'))
    )
    const input = /** @type {Element} */ (container.querySelector('.rename-input'))
    await fireEvent.input(input, { target: { value: 'LEAD2' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(listPatches()).toEqual(['LEAD2'])
  })

  it('renaming onto a different existing name requires an inline confirm', async () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, attack: 0.8 })
    savePatch('PAD', { ...PARAM_DEFAULTS, attack: 0.1 })
    const { container, getByText } = renderControl()
    await openPopover(container)
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="rename LEAD"]'))
    )
    await fireEvent.input(/** @type {Element} */ (container.querySelector('.rename-input')), {
      target: { value: 'PAD' },
    })
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="confirm rename"]'))
    )
    // Inline overwrite confirm shown; nothing RENAMED yet.
    expect(getByText(/overwrite/i)).toBeTruthy()
    expect(listPatches()).toEqual(['LEAD', 'PAD'])
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="confirm rename overwrite"]'))
    )
    expect(listPatches()).toEqual(['PAD'])
  })

  it('an empty rename shows "name required" and changes nothing', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container, getByText } = renderControl()
    await openPopover(container)
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="rename LEAD"]'))
    )
    await fireEvent.input(/** @type {Element} */ (container.querySelector('.rename-input')), {
      target: { value: '   ' },
    })
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="confirm rename"]'))
    )
    expect(getByText('name required')).toBeTruthy()
    expect(listPatches()).toEqual(['LEAD'])
  })

  it('canceling a rename leaves the patch unchanged', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container } = renderControl()
    await openPopover(container)
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="rename LEAD"]'))
    )
    await fireEvent.input(/** @type {Element} */ (container.querySelector('.rename-input')), {
      target: { value: 'LEAD2' },
    })
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="cancel rename"]'))
    )
    expect(listPatches()).toEqual(['LEAD'])
  })

  it('loading a different patch closes a stale rename editor', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    savePatch('PAD', PARAM_DEFAULTS)
    const { container, getByText } = renderControl()
    await openPopover(container)
    // Start renaming LEAD, then load PAD instead.
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="rename LEAD"]'))
    )
    expect(container.querySelector('.rename-input')).not.toBeNull()
    await fireEvent.click(getByText('PAD'))
    expect(container.querySelector('.rename-input')).toBeNull()
  })

  it('renaming the active patch updates the trigger name', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container, getByText } = renderControl()
    await openPopover(container)
    await fireEvent.click(getByText('LEAD')) // make active
    expect(/** @type {Element} */ (container.querySelector('.patch-name')).textContent).toBe('LEAD')
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="rename LEAD"]'))
    )
    await fireEvent.input(/** @type {Element} */ (container.querySelector('.rename-input')), {
      target: { value: 'LEAD2' },
    })
    await fireEvent.click(
      /** @type {Element} */ (container.querySelector('[aria-label="confirm rename"]'))
    )
    expect(/** @type {Element} */ (container.querySelector('.patch-name')).textContent).toBe(
      'LEAD2'
    )
  })
})

describe('PatchControl — load', () => {
  it('loading a patch applies its params to the store and marks it active', async () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, attack: 0.8, waveform: 3 })
    const { container, getByText } = renderControl()
    await openPopover(container)
    await fireEvent.click(getByText('LEAD'))
    expect(synthParams.attack).toBe(0.8)
    expect(synthParams.waveform).toBe(3)
    expect(/** @type {Element} */ (container.querySelector('.patch-name')).textContent).toBe('LEAD')
  })

  it('the active patch is marked in the list', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    savePatch('PAD', PARAM_DEFAULTS)
    const { container, getByText } = renderControl()
    await openPopover(container)
    await fireEvent.click(getByText('PAD'))
    const rows = container.querySelectorAll('.patch-row')
    const activeRow = /** @type {Element} */ (container.querySelector('.patch-row.active'))
    expect(rows.length).toBe(2)
    expect(activeRow.textContent).toContain('PAD')
    expect(activeRow.querySelector('.marker')?.textContent).toBe('▸')
  })
})

describe('PatchControl — delete', () => {
  it('delete requires inline confirmation (never one click)', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container, getByLabelText } = renderControl()
    await openPopover(container)
    await fireEvent.click(getByLabelText('delete LEAD'))
    // Still present until confirmed.
    expect(listPatches()).toEqual(['LEAD'])
    await fireEvent.click(getByLabelText('confirm delete'))
    expect(listPatches()).toEqual([])
  })

  it('removes the deleted row from the list without reopening', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    savePatch('PAD', PARAM_DEFAULTS)
    const { container, getByLabelText } = renderControl()
    await openPopover(container)
    expect(container.querySelectorAll('.patch-row').length).toBe(2)
    await fireEvent.click(getByLabelText('delete LEAD'))
    await fireEvent.click(getByLabelText('confirm delete'))
    const rows = Array.from(container.querySelectorAll('.patch-load')).map((b) =>
      b.textContent?.trim()
    )
    expect(container.querySelectorAll('.patch-row').length).toBe(1)
    expect(rows.some((t) => t?.includes('LEAD'))).toBe(false)
    expect(rows.some((t) => t?.includes('PAD'))).toBe(true)
  })

  it('canceling delete leaves the patch intact', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container, getByLabelText } = renderControl()
    await openPopover(container)
    await fireEvent.click(getByLabelText('delete LEAD'))
    await fireEvent.click(getByLabelText('cancel delete'))
    expect(listPatches()).toEqual(['LEAD'])
  })

  it('deleting the active patch clears its name from the trigger', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const { container, getByText, getByLabelText } = renderControl()
    await openPopover(container)
    await fireEvent.click(getByText('LEAD'))
    expect(/** @type {Element} */ (container.querySelector('.patch-name')).textContent).toBe('LEAD')
    await fireEvent.click(getByLabelText('delete LEAD'))
    await fireEvent.click(getByLabelText('confirm delete'))
    expect(/** @type {Element} */ (container.querySelector('.patch-name')).textContent).toBe(
      'DEFAULT'
    )
  })
})

describe('PatchControl — dirty marker', () => {
  it('no dirty marker when state matches the active patch', () => {
    const { container } = renderControl()
    expect(container.querySelector('.dirty')).toBeNull()
  })

  it('shows the dirty marker after an in-scope param changes', async () => {
    const { container } = renderControl()
    writeParam('attack', 0.5)
    await Promise.resolve()
    expect(container.querySelector('.dirty')).not.toBeNull()
  })

  it('saving clears the dirty marker', async () => {
    const { container } = renderControl()
    writeParam('attack', 0.5)
    await openPopover(container)
    await typeName(container, 'LEAD')
    await fireEvent.click(/** @type {Element} */ (container.querySelector('.save-btn')))
    await Promise.resolve()
    expect(container.querySelector('.dirty')).toBeNull()
  })

  it('loading clears the dirty marker', async () => {
    savePatch('LEAD', { ...PARAM_DEFAULTS, attack: 0.8 })
    const { container, getByText } = renderControl()
    writeParam('attack', 0.5)
    await openPopover(container)
    await fireEvent.click(getByText('LEAD'))
    await Promise.resolve()
    expect(container.querySelector('.dirty')).toBeNull()
  })

  it('loading a PARTIAL patch (missing keys) is not falsely dirty', async () => {
    // A patch from before a param existed (or with non-finite values dropped):
    // savePatch stores only the provided in-scope keys, so the slot is PARTIAL.
    savePatch('OLD', { attack: 0.8 })
    const { container, getByText } = renderControl()
    await openPopover(container)
    await fireEvent.click(getByText('OLD'))
    await Promise.resolve()
    expect(synthParams.attack).toBe(0.8)
    // Missing params fell back to defaults, and the baseline has every key, so
    // there are no spurious unsaved-change markers.
    expect(container.querySelector('.dirty')).toBeNull()
  })
})

describe('PatchControl — no OS dialogs', () => {
  it('never calls window.prompt or window.confirm for naming/overwrite/delete', async () => {
    savePatch('LEAD', PARAM_DEFAULTS)
    const promptSpy = vi.spyOn(window, 'prompt')
    const confirmSpy = vi.spyOn(window, 'confirm')
    const { container, getByLabelText } = renderControl()
    await openPopover(container)
    // overwrite flow
    await typeName(container, 'LEAD')
    await fireEvent.click(/** @type {Element} */ (container.querySelector('.save-btn')))
    await fireEvent.click(getByLabelText('confirm overwrite'))
    // rename flow
    await fireEvent.click(getByLabelText('rename LEAD'))
    await fireEvent.input(/** @type {Element} */ (container.querySelector('.rename-input')), {
      target: { value: 'LEAD2' },
    })
    await fireEvent.click(getByLabelText('confirm rename'))
    // delete flow
    await fireEvent.click(getByLabelText('delete LEAD2'))
    await fireEvent.click(getByLabelText('confirm delete'))
    expect(promptSpy).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
