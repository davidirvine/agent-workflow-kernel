import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import * as realSchema from '../src/param-schema.js'
import * as stubSchema from './param-schema.js'
import InstrumentPanels from './InstrumentPanels.svelte'

// Guards the instrument stubs new-app.sh writes into a generated app against
// drift from the reference instrument the chassis is built around. If the
// chassis grows to import a new schema export, the EXACT-surface assertion
// below fails until the stub adds the corresponding empty export — so a fresh
// app can never be emitted with a stub that fails to satisfy a chassis import.

describe('param-schema stub: export surface matches the reference instrument', () => {
  it('exports exactly the reference instrument param-schema surface', () => {
    // Exact match (not subset): a new reference export must be mirrored in the
    // stub, and a stray stub-only export is flagged too. Per design D3 + the
    // "stubs may go stale" risk mitigation — the FULL surface, not just what
    // Shell.svelte imports today.
    expect(Object.keys(stubSchema).sort()).toEqual(Object.keys(realSchema).sort())
  })

  it('derives empty collections from the empty schema', () => {
    expect(stubSchema.PARAM_SCHEMA).toEqual({})
    expect(stubSchema.WAVEFORMS).toEqual([])
    expect(stubSchema.PARAM_DEFAULTS).toEqual({})
    expect(stubSchema.PARAM_NAMES).toEqual([])
    expect([...stubSchema.AUDIO_PARAMS]).toEqual([])
    expect(stubSchema.KNOB_PARAMS).toEqual({})
    expect([...stubSchema.BIPOLAR_PARAMS]).toEqual([])
    expect(stubSchema.PARAM_RENAMES).toEqual({})
  })

  it('exposes powerOffValue as a function defaulting to 0 for unknown params', () => {
    expect(typeof stubSchema.powerOffValue).toBe('function')
    expect(stubSchema.powerOffValue('anything')).toBe(0)
  })
})

describe('InstrumentPanels stub: instantiates without throwing', () => {
  it('renders given the chassis-contract props the Shell hands its children', () => {
    // The Shell injects this component as its `children` snippet with the full
    // contract; the stub must instantiate with all of them present. `scope` is
    // a snippet the stub renders, so it must be a real snippet.
    const scope = createRawSnippet(() => ({ render: () => '<div class="scope"></div>' }))
    let result
    expect(() => {
      result = render(InstrumentPanels, {
        props: {
          midiStateFor: () => ({}),
          onParamChange: () => {},
          onKnobContextMenu: () => {},
          powered: false,
          getMixerPeak: () => 0,
          getOutputPeak: () => 0,
          scope,
        },
      })
    }).not.toThrow()
    expect(result.container.querySelector('.panel')).not.toBeNull()
    expect(result.container.querySelector('.scope')).not.toBeNull()
  })
})
