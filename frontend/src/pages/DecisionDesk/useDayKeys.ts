import { useEffect } from 'react'

/** ← / → change the delivery day (UI_SPEC §3.1), except while typing or using a control that
 * owns the arrow keys itself (inputs, sliders, radio groups). */
export function useDayKeys(onPrev: () => void, onNext: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const target = e.target instanceof Element ? e.target : null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="slider"], [role="radiogroup"]',
        )
      ) {
        return
      }
      if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPrev, onNext])
}
