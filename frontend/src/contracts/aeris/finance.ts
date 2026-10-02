import { z } from 'zod'

/**
 * Contas a pagar e a receber, on the wire.
 *
 * Every amount is a **string**: `"450.00"`, never `450.00`. A JSON number is an
 * IEEE-754 double, and declaring a debt as `z.number()` here would undo
 * ADR-0016 at the boundary — inside `JSON.parse` on a client we do not control,
 * where the damage is done before any of our code runs.
 *
 * The enums are repeated here rather than imported, because this package may
 * depend only on `@aeris/domain`. A unit test guards them against drifting from
 * `@aeris/finance`.
 */

/** Up to twelve integer digits and two decimals — `numeric(18, 2)`, non-negative. */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/

const amountString = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      AMOUNT_PATTERN,
      `${label} deve ser um número com ponto decimal, por exemplo 450.00`
    )

const instant = z.iso.datetime({ offset: true })

export const FinanceDirectionSchema = z.enum(['receivable', 'payable'])
export const FinanceStatusSchema = z.enum(['open', 'settled', 'cancelled'])
export const FinanceOriginTypeSchema = z.enum([
  'sale',
  'purchase',
  'manual',
  'payroll',
  'tax',
  // F126: a diferença que o cliente deve numa troca.
  'exchange',
  'renegotiation',
  'commission',
])
export const AgeingBucketSchema = z.enum([
  'current',
  '1-30',
  '31-60',
  '61-90',
  'over-90',
])

export const FinanceSettlementSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  paymentMethodId: z.string().nullable(),
  paymentMethodName: z.string().nullable(),
  /** Principal that came off the debt. */
  amount: z.string(),
  interestAmount: z.string(),
  fineAmount: z.string(),
  discountAmount: z.string(),
  /** What actually moved: principal + juros + multa − desconto. */
  paidAmount: z.string(),
  settledOn: z.string(),
  /** Set on a reversal, naming the baixa it undoes. */
  reversesSettlementId: z.string().nullable(),
  /** True when this row has itself been reversed. Derived, never stored. */
  isReversed: z.boolean(),
  note: z.string().nullable(),
  actorUserId: z.string().nullable(),
})

export type FinanceSettlementSummary = z.infer<typeof FinanceSettlementSummary>

export const FinanceEntrySummary = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  direction: FinanceDirectionSchema,
  partyId: z.string(),
  partyName: z.string(),
  description: z.string(),
  originType: FinanceOriginTypeSchema,
  originId: z.string().nullable(),
  documentNumber: z.string().nullable(),
  instalmentNumber: z.number().int().positive(),
  instalmentCount: z.number().int().positive(),
  issuedAt: z.string(),
  dueAt: z.string(),
  amount: z.string(),
  settledAmount: z.string(),
  /** `amount − settledAmount`. Computed once by the server, never on a screen. */
  outstanding: z.string(),
  status: FinanceStatusSchema,
  /**
   * Whether it is late, as of the moment the server answered.
   *
   * Derived, never stored: a column carrying it would be wrong every midnight
   * until a nightly job rewrote it, and that job's failure mode is a screen
   * that quietly under-reports what the shop is owed.
   */
  isOverdue: z.boolean(),
  daysOverdue: z.number().int().nonnegative(),
  ageingBucket: AgeingBucketSchema,
  settledAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  expectedMethodId: z.string().nullable(),
  notes: z.string().nullable(),
  settlementCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
})

export type FinanceEntrySummary = z.infer<typeof FinanceEntrySummary>

export const FinanceEntryDetail = FinanceEntrySummary.extend({
  settlements: z.array(FinanceSettlementSummary),
})

export type FinanceEntryDetail = z.infer<typeof FinanceEntryDetail>

export const FinanceEntryListResponse = z.object({
  items: z.array(FinanceEntrySummary),
  total: z.number().int().nonnegative(),
  /**
   * The whole filtered set, not this page.
   *
   * A total that changes when somebody turns the page is the sort of thing
   * that ends a shopkeeper's trust in a report permanently.
   */
  outstandingTotal: z.string(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
})

export type FinanceEntryListResponse = z.infer<typeof FinanceEntryListResponse>

export const FinanceEntryResponse = z.object({ entry: FinanceEntryDetail })
export type FinanceEntryResponse = z.infer<typeof FinanceEntryResponse>

/** Creating an agreement answers with every instalment it became. */
export const FinanceEntriesResponse = z.object({
  entries: z.array(FinanceEntrySummary),
})
export type FinanceEntriesResponse = z.infer<typeof FinanceEntriesResponse>

export const AgeingResponse = z.object({
  direction: FinanceDirectionSchema,
  asOf: z.string(),
  buckets: z.array(
    z.object({
      bucket: AgeingBucketSchema,
      amount: z.string(),
      count: z.number().int().nonnegative(),
    })
  ),
  total: z.string(),
})

export type AgeingResponse = z.infer<typeof AgeingResponse>

export const FinanceEntryListQuery = z.object({
  direction: FinanceDirectionSchema.optional(),
  branchId: z.string().optional(),
  partyId: z.string().optional(),
  status: FinanceStatusSchema.optional(),
  // The house pattern for a boolean in a query string: a URL carries text, and
  // `z.coerce.boolean()` would read "false" as true.
  overdueOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  dueFrom: instant.optional(),
  dueTo: instant.optional(),
  search: z.string().trim().max(120).optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['due_at', 'amount', 'issued_at']).default('due_at'),
  order: z.enum(['asc', 'desc']).default('asc'),
})

export type FinanceEntryListQuery = z.infer<typeof FinanceEntryListQuery>

export const CreateFinanceEntryRequest = z.object({
  branchId: z.string(),
  direction: FinanceDirectionSchema,
  partyId: z.string(),
  description: z.string().trim().min(1).max(200),
  documentNumber: z.string().trim().max(60).nullable().default(null),
  issuedAt: instant.optional(),
  /** The agreed whole. The server splits it; the client never does. */
  totalAmount: amountString('O valor'),
  instalmentCount: z.number().int().positive().max(360).default(1),
  firstDueAt: instant,
  interval: z.enum(['monthly', 'days']).default('monthly'),
  intervalDays: z.number().int().positive().max(365).optional(),
  expectedMethodId: z.string().nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
})

export type CreateFinanceEntryRequest = z.infer<
  typeof CreateFinanceEntryRequest
>

export const UpdateFinanceEntryRequest = z.object({
  version: z.number().int().positive(),
  description: z.string().trim().min(1).max(200).optional(),
  dueAt: instant.optional(),
  documentNumber: z.string().trim().max(60).nullable().optional(),
  expectedMethodId: z.string().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  /** Refused once anything has been settled — that is a new title, not an edit. */
  amount: amountString('O valor').optional(),
})

export type UpdateFinanceEntryRequest = z.infer<
  typeof UpdateFinanceEntryRequest
>

export const SettleFinanceEntryRequest = z.object({
  version: z.number().int().positive(),
  branchId: z.string(),
  paymentMethodId: z.string(),
  amount: amountString('O valor'),
  interestAmount: amountString('Os juros').default('0.00'),
  fineAmount: amountString('A multa').default('0.00'),
  discountAmount: amountString('O desconto').default('0.00'),
  settledOn: instant.optional(),
  note: z.string().trim().max(500).nullable().default(null),
  /**
   * A gaveta onde este dinheiro entrou (ADR-0021, decisão 9).
   *
   * Exigida quando a forma de pagamento é **dinheiro**, e ignorada em todas as
   * outras: uma baixa em espécie é dinheiro que está fisicamente dentro de um
   * caixa, e um livro de caixa que não a registra faz o fechamento acusar uma
   * sobra que o próprio sistema inventou.
   *
   * Um cartão não entra em gaveta nenhuma e por isso não pede caixa aberto —
   * exigi-lo obrigaria a loja a abrir um turno para receber um PIX.
   */
  cashSessionId: z.string().min(1).nullable().default(null),
})

export type SettleFinanceEntryRequest = z.infer<
  typeof SettleFinanceEntryRequest
>

/**
 * Várias baixas de uma vez, numa transação só (F161).
 *
 * O motoboy volta e diz "esse cliente pagou 50 no cartão e 50 em dinheiro". O
 * caixa marca as duas formas e confirma UMA vez: ou as duas entram, ou nenhuma.
 * Duas chamadas a `/settle` deixariam o título pela metade se a segunda falhasse.
 */
export const SettleSplitRequest = z.object({
  version: z.number().int().positive(),
  branchId: z.string(),
  parts: z
    .array(
      z.object({
        paymentMethodId: z.string(),
        amount: amountString('O valor'),
      })
    )
    .min(1)
    .max(6),
  cashSessionId: z.string().min(1).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
})

export type SettleSplitRequest = z.infer<typeof SettleSplitRequest>

export const ReverseSettlementRequest = z.object({
  version: z.number().int().positive(),
  note: z.string().trim().max(500).nullable().default(null),
})

export type ReverseSettlementRequest = z.infer<typeof ReverseSettlementRequest>

export const CancelFinanceEntryRequest = z.object({
  version: z.number().int().positive(),
  /** Required. "Why is this gone" is the first thing anybody asks. */
  reason: z.string().trim().min(1).max(500),
})

export type CancelFinanceEntryRequest = z.infer<
  typeof CancelFinanceEntryRequest
>

// ---------------------------------------------------------------------------
// Crédito do cliente
// ---------------------------------------------------------------------------

export const CreditStandingResponse = z.object({
  partyId: z.string(),
  partyName: z.string(),
  /** Null means NO credit granted — never unlimited. */
  limit: z.string().nullable(),
  blocked: z.boolean(),
  blockReason: z.string().nullable(),
  /** Everything open against this customer right now. */
  outstanding: z.string(),
  /** `limit − outstanding`, never below zero. `"0.00"` when no limit is set. */
  available: z.string(),
  overdueCount: z.number().int().nonnegative(),
  oldestOverdueDays: z.number().int().nonnegative(),
  /** The party's optimistic-concurrency token, for the next write. */
  version: z.number().int().positive(),
})

export type CreditStandingResponse = z.infer<typeof CreditStandingResponse>

export const SetCreditRequest = z.object({
  version: z.number().int().positive(),
  /** Absent leaves it alone; null revokes credit entirely. */
  limit: amountString('O limite').nullable().optional(),
  blocked: z.boolean().optional(),
  blockReason: z.string().trim().max(500).nullable().optional(),
})

export type SetCreditRequest = z.infer<typeof SetCreditRequest>

export const AgeingQuery = z.object({
  direction: FinanceDirectionSchema,
  branchId: z.string().optional(),
  partyId: z.string().optional(),
})

export type AgeingQuery = z.infer<typeof AgeingQuery>
