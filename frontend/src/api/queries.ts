import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query'

import {
  api,
  ApiError,
  unwrap,
  type AccuracyData,
  type DecisionData,
  type Health,
  type LiveData,
  type Meta,
  type MonitorData,
} from './client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The data is a frozen snapshot: a response never goes stale within a session.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      // Retry network blips, never validation errors.
      retry: (count, error) => !(error instanceof ApiError && error.status === 422) && count < 1,
    },
  },
})

async function call<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  try {
    return unwrap(await request)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('Could not reach the WindDesk API', null, 'network_error')
  }
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: (): Promise<Health> => call(api.GET('/api/health')),
  })
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: (): Promise<Meta> => call(api.GET('/api/meta')),
  })
}

export interface MonitorArgs {
  start: string
  end: string
  horizon_h: number
}

export function useMonitor(args: MonitorArgs, enabled = true) {
  return useQuery({
    queryKey: ['monitor', args],
    queryFn: (): Promise<MonitorData> => call(api.GET('/api/monitor', { params: { query: args } })),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export interface DecisionArgs {
  delivery_date: string
  auction: 'epex' | 'n2ex' | 'custom'
  cutoff?: string
  confidence: number
}

export function useDecision(args: DecisionArgs, enabled = true) {
  return useQuery({
    queryKey: ['decision', args],
    queryFn: (): Promise<DecisionData> =>
      call(api.GET('/api/decision', { params: { query: args } })),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Live mode (PRD F8): the server re-fetches Elexon every 10 minutes, so an open tab follows. */
export function useLive(confidence: number, enabled = true) {
  return useQuery({
    queryKey: ['live', confidence],
    queryFn: (): Promise<LiveData> =>
      call(api.GET('/api/live', { params: { query: { confidence } } })),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled,
  })
}

export interface AccuracyArgs {
  population: 'decision' | 'horizon'
  auction: 'epex' | 'n2ex'
  horizon_h: number
  start: string
  end: string
  confidence: number
}

export function useAccuracy(args: AccuracyArgs, enabled = true) {
  return useQuery({
    queryKey: ['accuracy', args],
    queryFn: (): Promise<AccuracyData> =>
      call(api.GET('/api/accuracy', { params: { query: args } })),
    placeholderData: keepPreviousData,
    enabled,
  })
}
