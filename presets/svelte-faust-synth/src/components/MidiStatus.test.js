import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import MidiStatus from './MidiStatus.svelte'

describe('MidiStatus — status dot', () => {
  it('shows grey dot when status is unavailable', () => {
    const { container } = render(MidiStatus, { props: { status: 'unavailable' } })
    const dot = /** @type {Element} */ (container.querySelector('.dot'))
    expect(dot.classList.contains('unavailable')).toBe(true)
    expect(dot.classList.contains('connected')).toBe(false)
    expect(dot.classList.contains('active')).toBe(false)
  })

  it('shows amber dot when status is connected', () => {
    const { container } = render(MidiStatus, { props: { status: 'connected' } })
    const dot = /** @type {Element} */ (container.querySelector('.dot'))
    expect(dot.classList.contains('connected')).toBe(true)
    expect(dot.classList.contains('active')).toBe(false)
  })

  it('shows green dot when status is active', () => {
    const { container } = render(MidiStatus, { props: { status: 'active' } })
    const dot = /** @type {Element} */ (container.querySelector('.dot'))
    expect(dot.classList.contains('active')).toBe(true)
    expect(dot.classList.contains('connected')).toBe(false)
  })
})

describe('MidiStatus — label', () => {
  it('always shows the MIDI label', () => {
    const { getByText } = render(MidiStatus)
    expect(getByText('MIDI')).toBeTruthy()
  })
})

describe('MidiStatus — device selector', () => {
  it('does not show selector when 0 or 1 device', () => {
    const { container: c0 } = render(MidiStatus, { props: { devices: [] } })
    expect(c0.querySelector('.device-select')).toBeNull()

    const { container: c1 } = render(MidiStatus, {
      props: { devices: [{ id: 'a', name: 'Keyboard' }] },
    })
    expect(c1.querySelector('.device-select')).toBeNull()
  })

  it('shows selector when 2+ devices', () => {
    const { container } = render(MidiStatus, {
      props: {
        devices: [
          { id: 'a', name: 'Keyboard' },
          { id: 'b', name: 'Pad' },
        ],
      },
    })
    expect(container.querySelector('.device-select')).not.toBeNull()
  })

  it('calls ondevicechange with selected device id', async () => {
    const ondevicechange = vi.fn()
    const { container } = render(MidiStatus, {
      props: {
        devices: [
          { id: 'a', name: 'Keyboard' },
          { id: 'b', name: 'Pad' },
        ],
        selectedDeviceId: 'a',
        ondevicechange,
      },
    })
    const select = /** @type {Element} */ (container.querySelector('.device-select'))
    await fireEvent.change(select, { target: { value: 'b' } })
    expect(ondevicechange).toHaveBeenCalledWith('b')
  })
})
