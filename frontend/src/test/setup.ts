import '@testing-library/jest-dom/vitest'

// jsdom has no ResizeObserver (Radix and the chart wrapper use it).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
