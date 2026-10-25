import { QueryClient, useQuery } from '@tanstack/react-query'

import { api, type Health } from './client'

export const queryClient = new QueryClient({
  defaultOptions: {
    // The data is a frozen snapshot: a response never goes stale within a session.
    queries: { staleTime: Infinity, retry: 1, refetchOnWindowFocus: false },
  },
})

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health> => {
      const { data, error } = await api.GET('/api/health')
      if (error || !data) throw new Error('API health check failed')
      return data
    },
  })
}
