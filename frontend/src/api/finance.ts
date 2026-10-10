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
import { SalesDocumentList } from '@/contracts/aeris/sales.ts'
import type { ProductionOrderSummaryType } from '@/contracts/aeris/uniforms.ts'
import { fetchQueue } from '@/api/uniforms'
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

/** Centavos de um decimal em texto — soma sem erro de vírgula flutuante. */
const toCents = (value: string | null): number => (value === null ? 0 : Math.round(Number(value) * 100))
const fromCents = (value: number): string => (value / 100).toFixed(2)

export type OpenOrder = {
  id: string
  number: number | null
  customerName: string
  stage: ProductionOrderSummaryType['stage']
  dispatchDate: string | null
  total: string
  paid: string
  outstanding: string
}

export type OpenOrders = { orders: OpenOrder[]; outstanding: string; count: number }

/**
 * O que os pedidos AINDA NA FÁBRICA têm para receber: total − o que já foi pago
 * (sinal). No Aeris o título só nasce quando o pedido sai (despacho/retirada);
 * até lá o dinheiro do pedido não está no financeiro, e é isto que o completa.
 *
 * Só os confirmados: o que já saiu virou título e já está em `fetchAgeing`.
 */
export const fetchOpenOrders = async (signal?: AbortSignal): Promise<OpenOrders> => {
  const items: ProductionOrderSummaryType[] = []
  for (let page = 1; ; page += 1) {
    const result = await fetchQueue({ page, pageSize: 500, sort: 'dispatchDate', direction: 'asc' }, signal)
    items.push(...result.items)
    if (items.length >= result.total || result.items.length === 0) break
  }
  const orders = items
    .filter((order) => order.status === 'confirmed' && order.totalAmount !== null)
    .map((order) => {
      const total = toCents(order.totalAmount)
      const paid = toCents(order.paidAmount)
      return {
        id: order.id,
        number: order.number,
        customerName: order.customerName,
        stage: order.stage,
        dispatchDate: order.dispatchDate,
        total: fromCents(total),
        paid: fromCents(paid),
        outstanding: fromCents(Math.max(0, total - paid)),
      }
    })
    .filter((order) => toCents(order.outstanding) > 0)
  return {
    orders,
    count: orders.length,
    outstanding: fromCents(orders.reduce((sum, order) => sum + toCents(order.outstanding), 0)),
  }
}

export type Billed = {
  /** Tudo que foi fechado no período: o que já saiu + o que está na fábrica. */
  total: string
  /** Já saiu da fábrica (despachado, retirado, entregue) ou venda de balcão. */
  shipped: string
  /** Confirmado e ainda na fábrica. */
  inProduction: string
  count: number
}

const salesTotal = async (
  query: { kind: 'order' | 'sale'; status: string; issuedFrom: string; issuedTo: string },
  signal?: AbortSignal
) => SalesDocumentList.parse(await request(`/api/v1/sales/documents${qs({ ...query, page: 1, pageSize: 1 })}`, { signal }))

/**
 * O faturado do período: os pedidos fechados (confirmados em diante) e as
 * vendas, pela data de emissão. Cancelado e rascunho não contam. O Aeris soma o
 * filtro inteiro (`totalAmount`), então uma página de 1 basta.
 */
export const fetchBilled = async (from: Date, to: Date, signal?: AbortSignal): Promise<Billed> => {
  const range = { issuedFrom: from.toISOString(), issuedTo: to.toISOString() }
  const [confirmed, fulfilled, completed, sales] = await Promise.all([
    salesTotal({ kind: 'order', status: 'confirmed', ...range }, signal),
    salesTotal({ kind: 'order', status: 'fulfilled', ...range }, signal),
    salesTotal({ kind: 'order', status: 'completed', ...range }, signal),
    salesTotal({ kind: 'sale', status: 'completed', ...range }, signal),
  ])
  const inProduction = toCents(confirmed.totalAmount)
  const shipped = toCents(fulfilled.totalAmount) + toCents(completed.totalAmount) + toCents(sales.totalAmount)
  return {
    total: fromCents(inProduction + shipped),
    shipped: fromCents(shipped),
    inProduction: fromCents(inProduction),
    count: confirmed.total + fulfilled.total + completed.total + sales.total,
  }
}
