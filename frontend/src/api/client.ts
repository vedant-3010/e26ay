import createClient from 'openapi-fetch'

import type { components, paths } from './schema'

/**
 * Typed API client. Paths and payloads come from the generated `schema.d.ts` (ADR-0005);
 * never hand-write response types. The API is always same-origin (ADR-0002).
 */
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  // Resolve `fetch` per call (not at import time) so tests can stub it.
  fetch: (request) => globalThis.fetch(request),
})

type Schemas = components['schemas']
export type Health = Schemas['HealthResponse']
export type Meta = Schemas['MetaResponse']
export type MonitorData = Schemas['MonitorResponse']
export type DecisionData = Schemas['DecisionResponse']
export type AccuracyData = Schemas['AccuracyResponse']
export type Metrics = Schemas['Metrics']
export type ErrorBody = Schemas['ErrorResponse']

/** An API failure carrying the server's error envelope (or a network failure). */
export class ApiError extends Error {
  readonly status: number | null
  readonly code: string

  constructor(message: string, status: number | null, code: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object'
  )
}

/** Unwrap an openapi-fetch result: return `data`, or throw an `ApiError`. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data
  const { error, response } = result
  if (isErrorBody(error)) throw new ApiError(error.error.message, response.status, error.error.code)
  throw new ApiError(`Request failed (${response.status})`, response.status, 'http_error')
}
