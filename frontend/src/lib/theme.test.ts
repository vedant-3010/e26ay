import { applyTheme, currentTheme } from './theme'

afterEach(() => {
  document.documentElement.classList.remove('dark')
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('theme', () => {
  it('applies and persists the chosen theme', () => {
    applyTheme('dark')
    expect(currentTheme()).toBe('dark')
    expect(localStorage.getItem('winddesk-theme')).toBe('dark')

    applyTheme('light')
    expect(currentTheme()).toBe('light')
    expect(localStorage.getItem('winddesk-theme')).toBe('light')
  })

  it('still switches theme when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => applyTheme('dark')).not.toThrow()
    expect(currentTheme()).toBe('dark')
  })
})
