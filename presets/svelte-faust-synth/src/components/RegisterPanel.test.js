import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import RegisterPanel from './RegisterPanel.svelte'

describe('RegisterPanel — rendering', () => {
  it('renders the KEYBOARD RANGE label', () => {
    const { getByText } = render(RegisterPanel)
    expect(getByText(/keyboard range/i)).not.toBeNull()
  })

  it('renders Oct ▼ and Oct ▲ buttons', () => {
    const { getByText } = render(RegisterPanel)
    expect(getByText(/oct ▼/i)).not.toBeNull()
    expect(getByText(/oct ▲/i)).not.toBeNull()
  })
})

describe('RegisterPanel — callbacks', () => {
  it('calls ondown when Oct ▼ is clicked', async () => {
    const ondown = vi.fn()
    const { getByText } = render(RegisterPanel, { props: { ondown } })
    await fireEvent.click(getByText(/oct ▼/i))
    expect(ondown).toHaveBeenCalledOnce()
  })

  it('calls onup when Oct ▲ is clicked', async () => {
    const onup = vi.fn()
    const { getByText } = render(RegisterPanel, { props: { onup } })
    await fireEvent.click(getByText(/oct ▲/i))
    expect(onup).toHaveBeenCalledOnce()
  })
})

describe('RegisterPanel — active state', () => {
  it('Oct ▼ button has active class when activeRegister is bottom', () => {
    const { getByText } = render(RegisterPanel, { props: { activeRegister: 'bottom' } })
    expect(getByText(/oct ▼/i).classList.contains('active')).toBe(true)
    expect(getByText(/oct ▲/i).classList.contains('active')).toBe(false)
  })

  it('Oct ▲ button has active class when activeRegister is top', () => {
    const { getByText } = render(RegisterPanel, { props: { activeRegister: 'top' } })
    expect(getByText(/oct ▲/i).classList.contains('active')).toBe(true)
    expect(getByText(/oct ▼/i).classList.contains('active')).toBe(false)
  })

  it('neither button has active class when activeRegister is mid', () => {
    const { getByText } = render(RegisterPanel, { props: { activeRegister: 'mid' } })
    expect(getByText(/oct ▼/i).classList.contains('active')).toBe(false)
    expect(getByText(/oct ▲/i).classList.contains('active')).toBe(false)
  })
})
