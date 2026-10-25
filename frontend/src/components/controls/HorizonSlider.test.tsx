import { act, fireEvent, render, screen } from '@testing-library/react'

import { HorizonSlider, SLIDER_DEBOUNCE_MS } from './HorizonSlider'

function setup(value = 24) {
  const onChange = vi.fn()
  const view = render(
    <HorizonSlider value={value} min={0} max={48} step={0.5} onChange={onChange} />,
  )
  return { onChange, view, thumb: screen.getByRole('slider', { name: 'Forecast horizon' }) }
}

describe('HorizonSlider', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is a labelled slider with a readable value', () => {
    const { thumb } = setup()
    expect(thumb).toHaveAttribute('aria-valuenow', '24')
    expect(thumb).toHaveAttribute('aria-valuetext', '24 h ahead')
    expect(screen.getByText('24 h ahead')).toBeInTheDocument()
    expect(screen.getByText(/about 15–40 h ahead/)).toBeInTheDocument()
  })

  it('moves at once but commits only after the pointer settles', () => {
    const { thumb, onChange } = setup()
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(thumb).toHaveAttribute('aria-valuenow', '25')
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(SLIDER_DEBOUNCE_MS))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(25)
  })

  it('follows outside value changes', () => {
    const { view, onChange } = setup(24)
    view.rerender(<HorizonSlider value={36} min={0} max={48} step={0.5} onChange={onChange} />)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '36')
  })
})
