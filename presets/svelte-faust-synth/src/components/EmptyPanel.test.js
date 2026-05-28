import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import EmptyPanel from './EmptyPanel.svelte'

describe('EmptyPanel — rendering', () => {
  it('renders a .panel div', () => {
    const { container } = render(EmptyPanel)
    expect(container.querySelector('.panel')).not.toBeNull()
  })

  it('renders no child elements inside the panel', () => {
    const { container } = render(EmptyPanel)
    expect(/** @type {Element} */ (container.querySelector('.panel')).children).toHaveLength(0)
  })
})
