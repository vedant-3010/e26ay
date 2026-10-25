import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'

import { enumParam, nullableStringParam, numberParam, stringParam, useUrlState } from './urlState'

const spec = {
  auction: enumParam(['epex', 'n2ex', 'custom'] as const, 'epex'),
  horizon: numberParam(24, { min: 0, max: 48, step: 0.5 }),
  date: stringParam('2026-01-15', (s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
  cutoff: nullableStringParam((s) => /^\d{2}:\d{2}$/.test(s)),
}

function setup(initial: string) {
  let location = { search: '' }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  )
  const { result } = renderHook(
    () => {
      location = useLocation()
      return useUrlState(spec)
    },
    { wrapper },
  )
  return { result, search: () => location.search }
}

describe('useUrlState', () => {
  it('parses valid values and falls back to defaults for invalid ones', () => {
    const { result } = setup('/?auction=n2ex&horizon=36.5&date=nope&cutoff=10:45')
    expect(result.current[0]).toEqual({
      auction: 'n2ex',
      horizon: 36.5,
      date: '2026-01-15',
      cutoff: '10:45',
    })
  })

  it('rejects out-of-range and off-step numbers', () => {
    expect(setup('/?horizon=49').result.current[0].horizon).toBe(24)
    expect(setup('/?horizon=12.3').result.current[0].horizon).toBe(24)
    expect(setup('/?horizon=').result.current[0].horizon).toBe(24)
    expect(setup('/?auction=apx').result.current[0].auction).toBe('epex')
  })

  it('writes changes and leaves defaults out of the URL', () => {
    const { result, search } = setup('/?auction=n2ex')
    act(() => result.current[1]({ horizon: 12, auction: 'epex' }))
    expect(search()).toBe('?horizon=12')
    expect(result.current[0].horizon).toBe(12)
    act(() => result.current[1]({ cutoff: '09:45' }))
    expect(search()).toBe('?horizon=12&cutoff=09%3A45')
    act(() => result.current[1]({ cutoff: null }))
    expect(search()).toBe('?horizon=12')
  })
})
