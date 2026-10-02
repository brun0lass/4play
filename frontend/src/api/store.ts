import { DashboardNowResponse, DashboardSalesResponse } from '@/contracts/aeris/dashboard.ts'
import { PartyList } from '@/contracts/aeris/party.ts'
import type { z } from 'zod'

import { qs, request } from '@/lib/http'

/** O painel da loja e os clientes — o resto do Aeris que a 4Play usa no dia. */

export type DashboardSales = z.infer<typeof DashboardSalesResponse>
export type DashboardNow = z.infer<typeof DashboardNowResponse>

const TZ = 'America/Sao_Paulo'

export const fetchDashboardSales = async (
  range: { from: string; to: string },
  signal?: AbortSignal
): Promise<DashboardSales> =>
  DashboardSalesResponse.parse(
    await request(`/api/v1/dashboard/sales${qs({ ...range, timeZone: TZ })}`, { signal })
  )

export const fetchDashboardNow = async (signal?: AbortSignal): Promise<DashboardNow> =>
  DashboardNowResponse.parse(await request(`/api/v1/dashboard/now${qs({ timeZone: TZ })}`, { signal }))

export type PartyPage = z.infer<typeof PartyList>

export const fetchCustomers = async (
  query: { search?: string; page?: number; pageSize?: number },
  signal?: AbortSignal
): Promise<PartyPage> =>
  PartyList.parse(
    await request(
      `/api/v1/parties/${qs({ ...query, role: 'customer', status: 'active', include: 'activity' })}`,
      { signal }
    )
  )

/** Qualquer pessoa do cadastro (cliente ou fornecedor) — para os títulos. */
export const fetchParties = async (
  query: { search?: string; role?: 'customer' | 'supplier' | 'courier'; pageSize?: number },
  signal?: AbortSignal
): Promise<PartyPage> =>
  PartyList.parse(
    await request(`/api/v1/parties/${qs({ ...query, status: 'active', page: 1 })}`, { signal })
  )
