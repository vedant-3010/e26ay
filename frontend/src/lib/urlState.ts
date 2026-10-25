import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

/**
 * View state in the URL (PRD F6): copying the address reproduces the view.
 * Each key declares how to parse (with validation and a default) and how to serialise;
 * values equal to the default are left out to keep links short.
 */
export interface Param<T> {
  parse: (raw: string | null) => T
  serialize: (value: T) => string | null
}

export function enumParam<const T extends string>(values: readonly T[], fallback: T): Param<T> {
  return {
    parse: (raw) => ((values as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback),
    serialize: (v) => (v === fallback ? null : v),
  }
}

export function numberParam(
  fallback: number,
  { min, max, step }: { min: number; max: number; step?: number },
): Param<number> {
  return {
    parse: (raw) => {
      const n = raw === null || raw === '' ? NaN : Number(raw)
      if (!Number.isFinite(n) || n < min || n > max) return fallback
      if (step && !Number.isInteger(Math.round((n / step) * 1e9) / 1e9)) return fallback
      return n
    },
    serialize: (v) => (v === fallback ? null : String(v)),
  }
}

/** Like `numberParam`, but `null` when absent or invalid (the page supplies the default). */
export function nullableNumberParam({
  min,
  max,
  step,
}: {
  min: number
  max: number
  step?: number
}): Param<number | null> {
  const inner = numberParam(Number.NaN, { min, max, step })
  return {
    parse: (raw) => {
      const n = inner.parse(raw)
      return Number.isNaN(n) ? null : n
    },
    serialize: (v) => (v === null ? null : String(v)),
  }
}

/** A value validated by `isValid` (e.g. ISO dates within bounds). */
export function stringParam(fallback: string, isValid: (raw: string) => boolean): Param<string> {
  return {
    parse: (raw) => (raw !== null && isValid(raw) ? raw : fallback),
    serialize: (v) => (v === fallback ? null : v),
  }
}

export function nullableStringParam(isValid: (raw: string) => boolean): Param<string | null> {
  return {
    parse: (raw) => (raw !== null && isValid(raw) ? raw : null),
    serialize: (v) => v,
  }
}

type Spec<S> = { [K in keyof S]: Param<S[K]> }

export function useUrlState<S extends Record<string, unknown>>(
  spec: Spec<S>,
): [S, (patch: Partial<S>) => void] {
  const [params, setParams] = useSearchParams()

  const state = useMemo(() => {
    const out = {} as S
    for (const key of Object.keys(spec) as (keyof S)[]) {
      out[key] = spec[key].parse(params.get(String(key)))
    }
    return out
  }, [params, spec])

  const update = useCallback(
    (patch: Partial<S>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const key of Object.keys(patch) as (keyof S)[]) {
            const serialized = spec[key].serialize(patch[key] as S[keyof S])
            if (serialized === null) next.delete(String(key))
            else next.set(String(key), serialized)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams, spec],
  )

  return [state, update]
}
