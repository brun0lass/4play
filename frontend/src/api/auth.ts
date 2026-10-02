import { SessionResponse } from '@/contracts/aeris/auth.ts'
import { BrandingResponse } from '@/contracts/aeris/branding.ts'
import type { z } from 'zod'

import { request } from '@/lib/http'

export type Session = z.infer<typeof SessionResponse>

export const login = async (input: { email: string; password: string }): Promise<Session> =>
  SessionResponse.parse(await request('/api/v1/auth/login', { method: 'POST', body: input }))

export const fetchSession = async (signal?: AbortSignal): Promise<Session> =>
  SessionResponse.parse(await request('/api/v1/auth/me', { signal }))

export const logout = async (): Promise<void> => {
  await request('/api/v1/auth/logout', { method: 'POST' })
}

export const switchContext = async (input: {
  tenantId: string
  companyId: string | null
  branchId: string | null
}): Promise<Session> =>
  SessionResponse.parse(await request('/api/v1/auth/context', { method: 'POST', body: input }))

export const changePassword = async (input: {
  currentPassword: string
  newPassword: string
}): Promise<void> => {
  await request('/api/v1/auth/password', { method: 'POST', body: input })
}

export type Branding = z.infer<typeof BrandingResponse>

export const fetchBranding = async (signal?: AbortSignal): Promise<Branding> =>
  BrandingResponse.parse(await request('/api/v1/organization/branding', { signal }))

export const BRANDING_LOGO_URL = '/api/v1/organization/branding/logo'
