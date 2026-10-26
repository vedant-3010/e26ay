import { isRouteErrorResponse, useRouteError } from 'react-router'

import { ErrorState } from '@/components/feedback/States'

/** Per-page error boundary (UI_SPEC §6): a crash in one page keeps the shell and navigation. */
export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong while showing this page.'
  return <ErrorState message={message} onRetry={() => window.location.reload()} />
}
