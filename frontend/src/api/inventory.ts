import type { z } from 'zod'

import {
  AdjustStockRequest,
  RecordEntryRequest,
  RecordExitRequest,
  StockBalanceList,
  StockMovementList,
  StockMovementResponse,
} from '@/contracts/aeris/inventory.ts'
import { qs, request } from '@/lib/http'

/**
 * `/api/v1/inventory` — o estoque da 4Play: tecido, tinta, papel e peça pronta.
 *
 * O saldo nunca é um campo que se edita: toda mudança é um movimento (entrada,
 * saída ou contagem), com quem e quando. Entrada/saída é de quem tem
 * `inventory.write`; a contagem, `inventory.adjust`.
 */

export type BalancePage = z.infer<typeof StockBalanceList>
export type Balance = BalancePage['items'][number]
export type Movement = z.infer<typeof StockMovementList>['items'][number]

export const listBalances = async (
  query: {
    search?: string
    belowMinimum?: boolean
    onlyWithStock?: boolean
    negative?: boolean
    page?: number
    pageSize?: number
    sort?: 'name' | 'onHand' | 'available' | 'saleValue'
    direction?: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<BalancePage> =>
  StockBalanceList.parse(
    await request(
      `/api/v1/inventory/balances${qs({
        ...query,
        belowMinimum: query.belowMinimum ? 'true' : undefined,
        onlyWithStock: query.onlyWithStock ? 'true' : undefined,
        negative: query.negative ? 'true' : undefined,
      })}`,
      { signal }
    )
  )

export const listMovements = async (variantId: string, signal?: AbortSignal) =>
  StockMovementList.parse(
    await request(`/api/v1/inventory/movements${qs({ variantId, pageSize: 30 })}`, { signal })
  ).items

export const recordEntry = async (input: z.input<typeof RecordEntryRequest>) =>
  StockMovementResponse.parse(
    await request('/api/v1/inventory/entries', { method: 'POST', body: RecordEntryRequest.parse(input) })
  )

export const recordExit = async (input: z.input<typeof RecordExitRequest>) =>
  StockMovementResponse.parse(
    await request('/api/v1/inventory/exits', { method: 'POST', body: RecordExitRequest.parse(input) })
  )

export const adjustStock = async (input: z.input<typeof AdjustStockRequest>) =>
  StockMovementResponse.parse(
    await request('/api/v1/inventory/adjustments', { method: 'POST', body: AdjustStockRequest.parse(input) })
  )
