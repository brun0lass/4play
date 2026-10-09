import { z } from 'zod'

/**
 * As mensagens que a venda manda ao cliente (F245/F246): o "saiu para
 * entrega" e o pós-venda "deu certo a instalação?".
 */

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const SaleMessageHours = z.object({
  timezone: z.string().min(1).max(60),
  windows: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        start: Clock,
        end: Clock,
      })
    )
    .max(14),
})

export const SaleMessageConfigBody = z.object({
  dispatchedEnabled: z.boolean(),
  dispatchedText: z.string().trim().min(1).max(1000),
  aftersaleEnabled: z.boolean(),
  aftersaleDelayHours: z.number().int().min(1).max(72),
  aftersaleHours: SaleMessageHours,
  aftersaleCheckText: z.string().trim().min(1).max(1000),
  aftersaleOfferText: z.string().trim().min(1).max(1000),
})

export const SaleMessageConfigSaveRequest = SaleMessageConfigBody.extend({
  /** 0 cria; senão, a versão lida (ADR-0014). */
  version: z.number().int().min(0),
})
export type SaleMessageConfigSaveBody = z.infer<
  typeof SaleMessageConfigSaveRequest
>

export const SaleMessageConfigResponse = SaleMessageConfigBody.extend({
  version: z.number().int(),
})
export type SaleMessageConfigView = z.infer<typeof SaleMessageConfigResponse>

export const SaleMessageEntryResponse = z.object({
  id: z.string(),
  saleId: z.string(),
  saleNumber: z.string().nullable(),
  customerName: z.string(),
  sellerName: z.string().nullable(),
  kind: z.enum(['dispatched', 'aftersale_check', 'aftersale_offer']),
  status: z.enum(['scheduled', 'sent', 'skipped', 'answered', 'cancelled']),
  /** Por que não saiu: `no_conversation`, `outside_window`, `asked_today`… */
  skipReason: z.string().nullable(),
  replyClass: z.enum(['worked', 'problem', 'other']).nullable(),
  dueAt: z.string(),
  sentAt: z.string().nullable(),
  repliedAt: z.string().nullable(),
  conversationId: z.string().nullable(),
})
export type SaleMessageEntry = z.infer<typeof SaleMessageEntryResponse>

export const SaleMessageListResponse = z.object({
  entries: z.array(SaleMessageEntryResponse),
})
