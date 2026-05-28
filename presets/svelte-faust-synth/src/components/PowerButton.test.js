import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import PowerButton from './PowerButton.svelte'

describe('PowerButton', () => {
  it('renders with power OFF by default', () => {
    const { container } = render(PowerButton, {
      props: { powered: false, loading: false, ontoggle: vi.fn() },
    })
    const icon = /** @type {Element} */ (container.querySelector('.power-icon'))
    expect(icon).not.toBeNull()
    expect(icon.classList.contains('on')).toBe(false)
  })

  it('renders without a visible text label', () => {
    const { container } = render(PowerButton, {
      props: { powered: false, loading: false, ontoggle: vi.fn() },
    })
    expect(container.querySelector('.label')).toBeNull()
  })

  it('power icon has class off when powered=false and loading=false', () => {
    const { container } = render(PowerButton, {
      props: { powered: false, loading: false, ontoggle: vi.fn() },
    })
    const icon = /** @type {Element} */ (container.querySelector('.power-icon'))
    expect(icon.classList.contains('off')).toBe(true)
    expect(icon.classList.contains('loading')).toBe(false)
    expect(icon.classList.contains('on')).toBe(false)
  })

  it('power icon has class on when powered=true and loading=false', () => {
    const { container } = render(PowerButton, {
      props: { powered: true, loading: false, ontoggle: vi.fn() },
    })
    const icon = /** @type {Element} */ (container.querySelector('.power-icon'))
    expect(icon.classList.contains('on')).toBe(true)
    expect(icon.classList.contains('off')).toBe(false)
    expect(icon.classList.contains('loading')).toBe(false)
  })

  it('power icon has class loading when loading=true', () => {
    const { container } = render(PowerButton, {
      props: { powered: false, loading: true, ontoggle: vi.fn() },
    })
    const icon = /** @type {Element} */ (container.querySelector('.power-icon'))
    expect(icon.classList.contains('loading')).toBe(true)
    expect(icon.classList.contains('off')).toBe(false)
    expect(icon.classList.contains('on')).toBe(false)
  })

  it('power icon has class loading when loading=true even if powered=true', () => {
    const { container } = render(PowerButton, {
      props: { powered: true, loading: true, ontoggle: vi.fn() },
    })
    const icon = /** @type {Element} */ (container.querySelector('.power-icon'))
    expect(icon.classList.contains('loading')).toBe(true)
    expect(icon.classList.contains('on')).toBe(false)
  })

  // The 0.3 s CSS stroke/filter fade between states is verified visually; jsdom does not run transitions.

  it('calls ontoggle when button is clicked', async () => {
    const ontoggle = vi.fn()
    const { container } = render(PowerButton, {
      props: { powered: false, loading: false, ontoggle },
    })
    await fireEvent.click(/** @type {Element} */ (container.querySelector('button')))
    expect(ontoggle).toHaveBeenCalledOnce()
  })

  it('button is disabled while loading', () => {
    const { container } = render(PowerButton, {
      props: { powered: false, loading: true, ontoggle: vi.fn() },
    })
    expect(/** @type {HTMLButtonElement} */ (container.querySelector('button')).disabled).toBe(true)
  })

  it('button is not disabled when not loading', () => {
    const { container } = render(PowerButton, {
      props: { powered: false, loading: false, ontoggle: vi.fn() },
    })
    expect(/** @type {HTMLButtonElement} */ (container.querySelector('button')).disabled).toBe(
      false
    )
  })
})
