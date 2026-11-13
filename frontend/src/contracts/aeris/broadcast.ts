import { z } from 'zod'

import { SaleMessageHours } from './sale-messages.ts'

/**
 * Os disparos pelo número da vendedora (F398) e a cobrança automática (F400).
 *
 * O número é um aparelho vinculado (WuzAPI): só alcança quem já escreveu para
 * ele (ADR-0039, regra 2). Por isso a prévia separa quem será alcançado, e por
 * qual número, de quem fica de fora — com o motivo.
 */

export const BROADCAST_SKIP_REASON_VALUES = [
  'nunca_falou',
  'saiu',
  'recebeu_recente',
  'conversando',
  'pago',
  'sem_texto',
  'fora_do_dia',
  'sem_numero',
  // F404: o PDF do resumo não ficou pronto; o número não manda PDF.
  'sem_pdf',
  'canal_sem_documento',
  // F408: a vendedora do cliente mudou depois do aviso criado.
  'vendedora_mudou',
] as const
export const BroadcastSkipReason = z.enum(BROADCAST_SKIP_REASON_VALUES)
export type BroadcastSkipReason = z.infer<typeof BroadcastSkipReason>

/**
 * O público do anúncio. Os filtros se somam (E); "quem mais compra" corta por
 * último, entre os que passaram nos outros.
 */
export const BroadcastAudience = z.object({
  /** Os N clientes que mais compraram nos últimos `months` meses. */
  topBuyers: z
    .object({
      months: z.number().int().min(1).max(36),
      limit: z.number().int().min(1).max(2000),
      by: z.enum(['valor', 'compras']).default('valor'),
    })
    .nullable()
    .default(null),
  /** Comprou de uma categoria e/ou marca nos últimos `months` meses. */
  bought: z
    .object({
      months: z.number().int().min(1).max(36),
      categoryId: z.uuid().nullable().default(null),
      brand: z.string().trim().min(1).max(120).nullable().default(null),
    })
    .nullable()
    .default(null),
  /** A carteira de uma vendedora (`party.salesperson_user_id`). */
  sellerUserId: z.uuid().nullable().default(null),
  /** Uma etiqueta de cliente. */
  tagId: z.uuid().nullable().default(null),
  /** Sem compra há pelo menos X dias (mas já comprou alguma vez). */
  inactiveDays: z.number().int().min(1).max(1000).nullable().default(null),
  /** Escolhidos à mão: somam ao filtro. */
  include: z.array(z.uuid()).max(2000).default([]),
  /** Tirados à mão da prévia. */
  exclude: z.array(z.uuid()).max(5000).default([]),
})
export type BroadcastAudience = z.infer<typeof BroadcastAudience>
export type BroadcastAudienceInput = z.input<typeof BroadcastAudience>

export const BroadcastPreviewRequest = z.object({ audience: BroadcastAudience })
export type BroadcastPreviewRequest = z.input<typeof BroadcastPreviewRequest>

const PreviewPerson = z.object({
  partyId: z.string(),
  name: z.string(),
  /** Por qual número sai; nulo em quem fica de fora. */
  accountId: z.string().nullable(),
  sellerName: z.string().nullable(),
  skipReason: BroadcastSkipReason.nullable(),
})

export const BroadcastPreviewResponse = z.object({
  /** Quantos passaram no filtro (antes de tirar quem fica de fora). */
  total: z.number().int(),
  reachable: z.number().int(),
  /** Por número: quantos saem por ele. */
  byAccount: z.array(
    z.object({
      accountId: z.string(),
      label: z.string(),
      sellerName: z.string().nullable(),
      connected: z.boolean(),
      count: z.number().int(),
    })
  ),
  skipped: z.array(
    z.object({ reason: BroadcastSkipReason, count: z.number().int() })
  ),
  /** As pessoas, até 500, os alcançados primeiro. */
  people: z.array(PreviewPerson),
})
export type BroadcastPreviewResponse = z.infer<typeof BroadcastPreviewResponse>

export const BroadcastMediaSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive(),
})
export type BroadcastMedia = z.infer<typeof BroadcastMediaSchema>

export const CreateBroadcastRequest = z
  .object({
    name: z.string().trim().min(1).max(120),
    /** De 1 a 3 versões; cada cliente recebe uma, sorteada. */
    texts: z.array(z.string().trim().max(1000)).min(1).max(3),
    media: BroadcastMediaSchema.nullable().default(null),
    addOptout: z.boolean().default(true),
    audience: BroadcastAudience,
    /** Quando começa; nulo é agora. */
    startsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .refine((body) => body.texts.some((text) => text.trim() !== ''), {
    message: 'Escreva a mensagem.',
    path: ['texts'],
  })
export type CreateBroadcastRequest = z.input<typeof CreateBroadcastRequest>

export const BROADCAST_STATUS_VALUES = [
  'scheduled',
  'sending',
  'paused',
  'done',
  'cancelled',
] as const
export const BroadcastStatus = z.enum(BROADCAST_STATUS_VALUES)
export type BroadcastStatus = z.infer<typeof BroadcastStatus>

export const BroadcastSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(['anuncio', 'cobranca', 'apresentacao']),
  name: z.string(),
  status: BroadcastStatus,
  startsAt: z.string(),
  totalRecipients: z.number().int(),
  sentCount: z.number().int(),
  failedCount: z.number().int(),
  skippedCount: z.number().int(),
  pendingCount: z.number().int(),
  /** Escreveram de volta até 7 dias depois do envio. */
  repliedCount: z.number().int(),
  /** Pediram SAIR depois do envio. */
  optedOutCount: z.number().int(),
  /** A apresentação (F402): mandaram o "oi" para a vendedora nova. */
  movedCount: z.number().int().default(0),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  version: z.number().int(),
})
export type BroadcastSummary = z.infer<typeof BroadcastSummarySchema>

export const BroadcastListResponse = z.object({
  broadcasts: z.array(BroadcastSummarySchema),
})
export type BroadcastListResponse = z.infer<typeof BroadcastListResponse>

export const BroadcastDetailResponse = z.object({
  broadcast: BroadcastSummarySchema.extend({
    texts: z.array(z.string()),
    hasMedia: z.boolean(),
    addOptout: z.boolean(),
  }),
  /** Cada número: quantos, o ritmo agora e quando deve terminar. */
  accounts: z.array(
    z.object({
      accountId: z.string(),
      label: z.string(),
      sellerName: z.string().nullable(),
      connected: z.boolean(),
      /** Parado por 3 falhas seguidas: precisa de alguém retomar. */
      pausedReason: z.string().nullable(),
      sent: z.number().int(),
      pending: z.number().int(),
      failed: z.number().int(),
      replied: z.number().int(),
      estimatedFinish: z.string().nullable(),
    })
  ),
  skipped: z.array(
    z.object({ reason: BroadcastSkipReason, count: z.number().int() })
  ),
})
export type BroadcastDetailResponse = z.infer<typeof BroadcastDetailResponse>

export const BroadcastRecipientListQuery = z.object({
  status: z
    .enum(['pending', 'sent', 'failed', 'skipped', 'cancelled', 'replied'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
export type BroadcastRecipientListQuery = z.input<
  typeof BroadcastRecipientListQuery
>

export const BroadcastRecipientListResponse = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      partyId: z.string(),
      name: z.string(),
      sellerName: z.string().nullable(),
      status: z.enum(['pending', 'sent', 'failed', 'skipped', 'cancelled']),
      skipReason: BroadcastSkipReason.nullable(),
      sentAt: z.string().nullable(),
      replied: z.boolean(),
      /** A conversa, para abrir no Atendimento. */
      conversationId: z.string().nullable(),
      body: z.string().nullable(),
    })
  ),
  total: z.number().int(),
})
export type BroadcastRecipientListResponse = z.infer<
  typeof BroadcastRecipientListResponse
>

export const BroadcastActionRequest = z.object({ version: z.number().int() })
export type BroadcastActionRequest = z.infer<typeof BroadcastActionRequest>

/** O ritmo e a cobrança automática — uma configuração por loja. */
export const BroadcastConfigBody = z
  .object({
    hours: SaleMessageHours,
    batchSize: z.number().int().min(1).max(30),
    gapMinSeconds: z.number().int().min(45).max(1800),
    gapMaxSeconds: z.number().int().min(45).max(1800),
    pauseMinMinutes: z.number().int().min(10).max(600),
    pauseMaxMinutes: z.number().int().min(10).max(600),
    batchesPerDay: z.number().int().min(1).max(10),
    repeatDays: z.number().int().min(0).max(90),
    collectionEnabled: z.boolean(),
    collectionDays: z
      .array(z.number().int().min(-7).max(15))
      .max(8)
      .transform((days) => [...new Set(days)].sort((a, b) => b - a)),
    collectionText: z.string().trim().min(1).max(1000),
    /** F404: a cobrança sai como resumo financeiro (texto + PDF). */
    collectionSummary: z.boolean().default(false),
    /** F404: o texto antes do PDF. Ausente: fica o que está gravado. */
    summaryText: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((body) => body.gapMaxSeconds >= body.gapMinSeconds, {
    message: 'O intervalo máximo não pode ser menor que o mínimo.',
    path: ['gapMaxSeconds'],
  })
  .refine((body) => body.pauseMaxMinutes >= body.pauseMinMinutes, {
    message: 'A pausa máxima não pode ser menor que a mínima.',
    path: ['pauseMaxMinutes'],
  })
export type BroadcastConfigBody = z.input<typeof BroadcastConfigBody>

export const BroadcastConfigResponse = z.object({
  config: z.object({
    hours: SaleMessageHours,
    batchSize: z.number().int(),
    gapMinSeconds: z.number().int(),
    gapMaxSeconds: z.number().int(),
    pauseMinMinutes: z.number().int(),
    pauseMaxMinutes: z.number().int(),
    batchesPerDay: z.number().int(),
    repeatDays: z.number().int(),
    collectionEnabled: z.boolean(),
    collectionDays: z.array(z.number().int()),
    collectionText: z.string(),
    collectionSummary: z.boolean(),
    summaryText: z.string(),
  }),
  version: z.number().int().nullable(),
})
export type BroadcastConfigResponse = z.infer<typeof BroadcastConfigResponse>

export const SaveBroadcastConfigRequest = z.object({
  config: BroadcastConfigBody,
  /** Nulo na primeira gravação. */
  version: z.number().int().nullable(),
})
export type SaveBroadcastConfigRequest = z.input<
  typeof SaveBroadcastConfigRequest
>

// ---------------------------------------------------------------------------
// A vendedora nova se apresenta (F402)
// ---------------------------------------------------------------------------

export const PresentationRequest = z.object({
  /** Os clientes que acabaram de mudar de vendedora (a divisão da F401). */
  partyIds: z.array(z.uuid()).min(1).max(5000),
  directText: z.string().trim().min(1).max(1000),
  linkText: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((text) => text.includes('{link}'), {
      message: 'O texto com o link precisa ter {link}.',
    }),
})
export type PresentationRequest = z.infer<typeof PresentationRequest>

export const PresentationPreviewRequest = PresentationRequest.partial({
  directText: true,
  linkText: true,
})
export type PresentationPreviewRequest = z.infer<
  typeof PresentationPreviewRequest
>

export const PresentationPreviewResponse = z.object({
  total: z.number().int(),
  /** Já falam com o número da vendedora: o aviso sai dela. */
  direct: z.number().int(),
  /** Falam com outro número: o aviso sai por ele, com o link dela. */
  link: z.number().int(),
  sellers: z.array(
    z.object({
      userId: z.uuid(),
      name: z.string().nullable(),
      direct: z.number().int(),
      link: z.number().int(),
      skipped: z.number().int(),
    })
  ),
  skipped: z.array(
    z.object({ reason: BroadcastSkipReason, count: z.number().int() })
  ),
  defaults: z.object({ directText: z.string(), linkText: z.string() }),
})
export type PresentationPreviewResponse = z.infer<
  typeof PresentationPreviewResponse
>

// ---------------------------------------------------------------------------
// O resumo financeiro (F404)
// ---------------------------------------------------------------------------

/** Quem tem crediário aberto — para escolher de quem ver o exemplo. */
export const SummaryCandidatesResponse = z.object({
  customers: z.array(
    z.object({
      partyId: z.uuid(),
      name: z.string(),
      /** Decimal em texto. */
      open: z.string(),
      /** `YYYY-MM-DD`: o vencimento mais próximo. */
      nextDue: z.string(),
    })
  ),
})
export type SummaryCandidatesResponse = z.infer<
  typeof SummaryCandidatesResponse
>

/**
 * A fila da próxima cobrança (F413): quem vai receber, por qual número e a
 * que horas — a de hoje, se já nasceu e ainda tem gente esperando; senão, a
 * próxima. As horas são estimativa.
 */
export const BROADCAST_COLLECTION_QUEUE_STATUS_VALUES = [
  'planned',
  'pending',
  'sent',
  'failed',
  'skipped',
  'cancelled',
] as const

export const BroadcastCollectionQueueItemSchema = z.object({
  partyId: z.uuid(),
  name: z.string(),
  amount: z.string().nullable(),
  dueDay: z.string().nullable(),
  days: z.number().int().nullable(),
  recipientId: z.uuid().nullable(),
  status: z.enum(BROADCAST_COLLECTION_QUEUE_STATUS_VALUES),
  skipReason: BroadcastSkipReason.nullable(),
  at: z.iso.datetime().nullable(),
  estimated: z.boolean(),
  overCap: z.boolean(),
  hasDocument: z.boolean(),
})
export type BroadcastCollectionQueueItem = z.infer<
  typeof BroadcastCollectionQueueItemSchema
>

export const BroadcastCollectionQueueResponse = z.object({
  day: z.string().nullable(),
  live: z.boolean(),
  broadcastId: z.uuid().nullable(),
  enabled: z.boolean(),
  summary: z.boolean(),
  dailyCap: z.number().int(),
  groups: z.array(
    z.object({
      accountId: z.uuid(),
      label: z.string(),
      sellerName: z.string().nullable(),
      connected: z.boolean(),
      /** Na ordem em que saem. */
      customers: z.array(BroadcastCollectionQueueItemSchema),
    })
  ),
  outside: z.array(z.object({ partyId: z.uuid(), name: z.string() })),
})
export type BroadcastCollectionQueueResponse = z.infer<
  typeof BroadcastCollectionQueueResponse
>
