import { z } from 'zod'

/**
 * O Pix do atendimento pela Monedd — F204.
 *
 * O login é da EMPRESA (decisão do dono) e a senha nunca volta: a resposta das
 * configurações não tem campo onde ela caiba.
 */

const MONEY = /^\d{1,12}(\.\d{1,2})?$/

export const MoneddSettingsResponse = z.object({
  configured: z.boolean(),
  email: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastError: z.string().nullable(),
})

export type MoneddSettingsResponse = z.infer<typeof MoneddSettingsResponse>

export const SaveMoneddRequest = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
})

export type SaveMoneddRequest = z.infer<typeof SaveMoneddRequest>

export const PixChargeStatusSchema = z.enum([
  'pending',
  'paid',
  'failed',
  'cancelled',
  'expired',
])

export type PixChargeStatus = z.infer<typeof PixChargeStatusSchema>

export const CreatePixChargeRequest = z.object({
  conversationId: z.uuid().nullable().default(null),
  partyId: z.uuid().nullable().default(null),
  /** Em reais, com ponto: `'150.00'`. */
  amount: z
    .string()
    .regex(MONEY, 'Valor inválido.')
    .refine((value) => Number(value) > 0, 'O valor tem de ser maior que zero.'),
  payer: z.object({
    name: z.string().trim().min(1).max(50),
    /** CPF ou CNPJ; a rota confere os dígitos. */
    document: z.string().trim().min(11).max(18),
    /**
     * A Monedd exige um e-mail do pagador, e o vendedor quase nunca tem o do
     * cliente. Nulo, vai o e-mail da conta Monedd da loja (06/10).
     */
    email: z.email().max(50).nullable().default(null),
  }),
  description: z.string().trim().max(100).nullable().default(null),
})

export type CreatePixChargeRequest = z.input<typeof CreatePixChargeRequest>

export const PixChargeSummary = z.object({
  id: z.string(),
  /** O link público de pagamento (F207). Nulo sem `PUBLIC_BASE_URL`. */
  paymentUrl: z.string().nullable(),
  conversationId: z.string().nullable(),
  partyId: z.string().nullable(),
  amount: z.string(),
  payerName: z.string(),
  description: z.string().nullable(),
  copyPaste: z.string(),
  status: PixChargeStatusSchema,
  providerStatus: z.string().nullable(),
  createdAt: z.string(),
  checkedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
})

export type PixChargeSummary = z.infer<typeof PixChargeSummary>

export const PixChargeResponse = z.object({ charge: PixChargeSummary })

export type PixChargeResponse = z.infer<typeof PixChargeResponse>

/** Um Pix pago que o caixa ainda não marcou como visto — o sininho (F205). */
export const PixAlertSummary = z.object({
  id: z.string(),
  amount: z.string(),
  payerName: z.string(),
  createdByName: z.string().nullable(),
  branchId: z.string().nullable(),
  conversationId: z.string().nullable(),
  paidAt: z.string(),
})

export type PixAlertSummary = z.infer<typeof PixAlertSummary>

export const PixAlertsResponse = z.object({ items: z.array(PixAlertSummary) })

export type PixAlertsResponse = z.infer<typeof PixAlertsResponse>

/** O que passa no SSE de avisos: magro, só o que invalidar. */
export const AlertStreamEvent = z.object({
  type: z.literal('pix.paid'),
  chargeId: z.string(),
  branchId: z.string().nullable(),
})

export type AlertStreamEvent = z.infer<typeof AlertStreamEvent>

export const PixReportQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  branchId: z.uuid().optional(),
  createdBy: z.uuid().optional(),
  status: PixChargeStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
})

export type PixReportQuery = z.input<typeof PixReportQuery>

const Bucket = z.object({ amount: z.string(), count: z.number().int() })

export const PixReportResponse = z.object({
  paidAmount: z.string(),
  paidCount: z.number().int(),
  averageTicket: z.string(),
  pendingAmount: z.string(),
  pendingCount: z.number().int(),
  expiredAmount: z.string(),
  expiredCount: z.number().int(),
  failedAmount: z.string(),
  unseenCount: z.number().int(),
  byDay: z.array(Bucket.extend({ day: z.string() })),
  bySeller: z.array(
    Bucket.extend({ userId: z.string().nullable(), name: z.string() })
  ),
  byBranch: z.array(
    Bucket.extend({ branchId: z.string().nullable(), name: z.string() })
  ),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  items: z.array(
    z.object({
      id: z.string(),
      createdAt: z.string(),
      paidAt: z.string().nullable(),
      amount: z.string(),
      payerName: z.string(),
      status: PixChargeStatusSchema,
      createdByName: z.string().nullable(),
      branchName: z.string().nullable(),
      conversationId: z.string().nullable(),
      acknowledgedAt: z.string().nullable(),
      acknowledgedByName: z.string().nullable(),
    })
  ),
})

export type PixReportResponse = z.infer<typeof PixReportResponse>

/**
 * O que a página pública de pagamento mostra (F207) — e nada além.
 *
 * Quem abre é o cliente, sem conta. Nada de CPF, e-mail, ids ou quem gerou:
 * o link circula por WhatsApp e pode ser encaminhado.
 */
export const PublicPixResponse = z.object({
  storeName: z.string(),
  hasLogo: z.boolean(),
  amount: z.string(),
  payerName: z.string(),
  copyPaste: z.string(),
  status: PixChargeStatusSchema,
  paidAt: z.string().nullable(),
})

export type PublicPixResponse = z.infer<typeof PublicPixResponse>
