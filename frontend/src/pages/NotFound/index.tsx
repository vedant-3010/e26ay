import { Link } from 'react-router'

import { PageHeader } from '@/components/layout/PageHeader'

export function NotFoundPage() {
  return (
    <PageHeader title="Page not found">
      There is no page at this address.{' '}
      <Link to="/" className="text-foreground underline underline-offset-4">
        Go to the overview
      </Link>
      .
    </PageHeader>
  )
}
