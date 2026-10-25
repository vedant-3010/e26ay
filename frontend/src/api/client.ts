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

export type Health = components['schemas']['HealthResponse']
