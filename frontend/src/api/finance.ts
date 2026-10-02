import type { z } from 'zod'

import { CashSessionList } from '@/contracts/aeris/cash.ts'
import {
  AgeingResponse,
  CreateFinanceEntryRequest,
  FinanceEntriesResponse,
  FinanceEntryListResponse,
  FinanceEntryResponse,
  SettleFinanceEntryRequest,
} from '@/contracts/aeris/finance.ts'
import { PaymentMethodList } from '@/contracts/aeris/payments.ts'
import { qs, request } from '@/lib/http'

/**
 * O financeiro do Aeris: títulos a receber e a pagar, baixas e formas de
 * pagamento.
 *
 * O título a receber de um pedido nasce quando o pedido é despachado ou
 * retirado — não quando é confirmado. Baixa em dinheiro precisa de um caixa
 * aberto no Aeris.
 */

export type Direction = 'receivable' | 'payable'
export type EntryPage = z.infer<typeof FinanceEntryListResponse>
export type Entry = EntryPage['items'][number]
export type EntryDetail = z.infer<typeof FinanceEntryResponse>['entry']
export type Ageing = z.infer<typeof AgeingResponse>
export type PaymentMethod = z.infer<typeof PaymentMethodList>['methods'][number]

export const fetchAgeing = async (direction: Direction, signal?: AbortSignal): Promise<Ageing> =>
  AgeingResponse.parse(await request(`/api/v1/finance/ageing${qs({ direction })}`, { signal }))

export const fetchEntries = async (
  query: {
    direction: Direction
    status?: 'open' | 'settled' | 'cancelled'
    overdueOnly?: boolean
    search?: string
    offset?: number
    limit?: number
    order?: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<EntryPage> =>
  FinanceEntryListResponse.parse(
    await request(
      `/api/v1/finance/entries${qs({
        ...query,
        overdueOnly: query.overdueOnly ? 'true' : undefined,
        sort: 'due_at',
      })}`,
      { signal }
    )
  )

export const fetchEntry = async (id: string, signal?: AbortSignal): Promise<EntryDetail> =>
  FinanceEntryResponse.parse(await request(`/api/v1/finance/entries/${id}`, { signal })).entry

export const settleEntry = async (
  id: string,
  input: z.input<typeof SettleFinanceEntryRequest>
): Promise<EntryDetail> =>
  FinanceEntryResponse.parse(
    await request(`/api/v1/finance/entries/${id}/settle`, {
      method: 'POST',
      body: SettleFinanceEntryRequest.parse(input),
    })
  ).entry

export const createEntry = async (input: z.input<typeof CreateFinanceEntryRequest>) =>
  FinanceEntriesResponse.parse(
    await request('/api/v1/finance/entries', {
      method: 'POST',
      body: CreateFinanceEntryRequest.parse(input),
    })
  ).entries

export const fetchPaymentMethods = async (signal?: AbortSignal): Promise<PaymentMethod[]> =>
  PaymentMethodList.parse(await request('/api/v1/payments/methods', { signal })).methods.filter(
    (method) => method.status === 'active'
  )

/** O caixa aberto da filial — só a baixa em dinheiro precisa dele. */
export const fetchOpenCashSession = async (
  branchId: string,
  signal?: AbortSignal
): Promise<string | null> => {
  const list = CashSessionList.parse(
    await request(`/api/v1/cash/sessions${qs({ branchId, status: 'open', pageSize: 5 })}`, { signal })
  )
  return list.items[0]?.id ?? null
}
