import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'

import { fetchSession, logout as apiLogout, type Session } from '@/api/auth'
import { UnauthenticatedError, onSessionLost } from '@/lib/http'

type AuthState = {
  status: 'loading' | 'anonymous' | 'authenticated' | 'error'
  session: Session | null
  error: unknown
  setSession: (session: Session | null) => void
  logout: () => Promise<void>
  can: (permission: string) => boolean
  hasFeature: (feature: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export const SESSION_KEY = ['session'] as const

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await fetchSession(signal)
      } catch (error) {
        if (error instanceof UnauthenticatedError) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })

  useEffect(
    () =>
      onSessionLost(() => {
        queryClient.setQueryData(SESSION_KEY, null)
      }),
    [queryClient]
  )

  const value = useMemo<AuthState>(() => {
    const session = query.data ?? null
    const status: AuthState['status'] = query.isPending
      ? 'loading'
      : query.isError
        ? 'error'
        : session
          ? 'authenticated'
          : 'anonymous'
    return {
      status,
      session,
      error: query.error,
      setSession: (next) => {
        queryClient.setQueryData(SESSION_KEY, next)
      },
      logout: async () => {
        try {
          await apiLogout()
        } finally {
          queryClient.clear()
          queryClient.setQueryData(SESSION_KEY, null)
        }
      },
      can: (permission) => session?.permissions.includes(permission) ?? false,
      hasFeature: (feature) => session?.features.includes(feature) ?? false,
    }
  }, [query.data, query.isPending, query.isError, query.error, queryClient])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthState => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth fora do AuthProvider')
  return value
}
