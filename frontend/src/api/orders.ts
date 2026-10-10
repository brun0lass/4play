import type { z } from 'zod'

import { PosCheckoutResponse } from '@/contracts/aeris/pos.ts'
import {
  DepositOptions,
  DepositSalesDocumentRequest,
  DispatchSalesDocumentRequest,
  PickupSalesDocumentRequest,
  SalesDocumentResponse,
  TransitionSalesDocumentRequest,
  UpdateSalesDocumentRequest,
  type TenderRequest,
} from '@/contracts/aeris/sales.ts'
import { request } from '@/lib/http'

/**
 * As ações de um pedido depois de criado: sinal, despacho, retirada, edição
 * e cancelamento. Todas são do módulo de vendas do Aeris — a produção só
 * enxerga o resultado (o pedido sai da fila ao ser despachado ou retirado).
 */

export type Checkout = z.infer<typeof PosCheckoutResponse>
export type Tender = z.input<typeof TenderRequest>
export type Deposit = z.infer<typeof DepositOptions>

export const fetchDepositOptions = async (signal?: AbortSignal): Promise<Deposit> =>
  DepositOptions.parse(await request('/api/v1/sales/deposit-options', { signal }))

/** Sinal: dinheiro que entra antes de o pedido sair. `cashSessionId` só em loja com caixa. */
export const depositOrder = async (
  id: string,
  input: { payments: Tender[]; cashSessionId: string | null }
): Promise<Checkout> =>
  PosCheckoutResponse.parse(
    await request(`/api/v1/sales/documents/${id}/deposit`, {
      method: 'POST',
      body: DepositSalesDocumentRequest.parse(input),
    })
  )

/** O cliente leva agora e paga o que falta (se faltar). O pedido sai da fila. */
export const pickupOrder = async (
  id: string,
  input: { version: number; payments: Tender[]; cashSessionId: string | null }
): Promise<Checkout> =>
  PosCheckoutResponse.parse(
    await request(`/api/v1/sales/documents/${id}/pickup`, {
      method: 'POST',
      body: PickupSalesDocumentRequest.parse(input),
    })
  )

/** Entrega (Correios, Uber, van): a mercadoria sai, o pedido sai da fila e nasce o título a receber. */
export const dispatchOrder = async (id: string, version: number, courierPartyId: string | null) =>
  SalesDocumentResponse.parse(
    await request(`/api/v1/sales/documents/${id}/dispatch`, {
      method: 'POST',
      body: DispatchSalesDocumentRequest.parse({ version, courierPartyId }),
    })
  ).document

/** Cancelar. Pedido com dinheiro recebido precisa dizer se devolve ou vira vale. */
export const cancelOrder = async (
  id: string,
  input: { version: number; reason: string; paidResolution: 'refund' | 'voucher' | null }
) =>
  SalesDocumentResponse.parse(
    await request(`/api/v1/sales/documents/${id}/transitions`, {
      method: 'POST',
      body: TransitionSalesDocumentRequest.parse({ ...input, to: 'cancelled' }),
    })
  ).document

/** Trocar os itens (quantidade, preço, produto) de um pedido que ainda não saiu. */
export const updateOrderLines = async (
  id: string,
  input: {
    version: number
    lines: {
      variantId: string
      description: string
      unit: string
      unitPrice: string
      quantity: string
      discountAmount?: string
      priceListId?: string | null
      priceBasis?: 'base-price' | 'quantity-tier' | 'manual'
    }[]
  }
) =>
  SalesDocumentResponse.parse(
    await request(`/api/v1/sales/documents/${id}`, {
      method: 'PATCH',
      body: UpdateSalesDocumentRequest.parse(input),
    })
  ).document

/**
 * Troca o vendedor do pedido (F137 do Aeris). Num pedido confirmado o Aeris
 * pede o motivo e o gerente (`sales.amend`), e recusa quando o pedido já
 * entrou numa comissão fechada.
 */
export const changeOrderSalesperson = async (
  id: string,
  input: { version: number; salespersonUserId: string | null; reason: string }
) =>
  SalesDocumentResponse.parse(
    await request(`/api/v1/sales/documents/${id}`, {
      method: 'PATCH',
      body: UpdateSalesDocumentRequest.parse({
        version: input.version,
        salespersonUserId: input.salespersonUserId,
        salespersonChangeReason: input.reason,
        reason: input.reason,
      }),
    })
  )
