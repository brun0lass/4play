import { useEffect } from 'react'

import { useAuth } from '@/auth/AuthProvider'
import { syncAnalyticsUser } from '@/lib/analytics'
import { useViewer } from '@/lib/queries'

/** Diz ao PostHog quem está logado, quando a sessão e as funções já são conhecidas. */
export const AnalyticsUser = () => {
  const { status, session } = useAuth()
  const viewer = useViewer()
  const settled = (status === 'authenticated' || status === 'anonymous') && !viewer.isLoading
  const functions = viewer.data?.functions

  useEffect(() => {
    if (settled) syncAnalyticsUser(session, functions ?? [])
  }, [settled, session, functions])

  return null
}
