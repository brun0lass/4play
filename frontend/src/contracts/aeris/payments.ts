import { z } from 'zod'

/**
 * Payment contracts.
 *
 * Every monetary value on this wire is a **string**: `"150.00"`, never
 * `150.00`. JSON numbers are IEEE-754 doubles, so declaring an amount as
 * `z.number()` here would undo the whole of ADR-0016 at the boundary —
 * including inside `JSON.parse` on a client we do not control, where the
 * damage happens before any of our code runs.
 *
 * This package may only depend on `@aeris/domain` (see
 * .dependency-cruiser.cjs), so the shape of a money string is enforced here by
 * a regular expression and parsed into fixed-point by `@aeris/payments` on the
 * far side of it.
 */

/** Up to twelve integer digits and two decimals — `numeric(18, 2)`, non-negative. */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/

/** A percentage: up to three integer digits and six decimals — `numeric(9, 6)`. */
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,6})?$/

const amountString = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      AMOUNT_PATTERN,
      `${label} deve ser um número com ponto decimal, por exemplo 150.00`
    )

export const PAYMENT_METHOD_KIND_VALUES = [
  'cash',
  'pix',
  'card_credit',
  'card_debit',
  'bank_slip',
  'customer_credit',
  'bank_transfer',
  'tef',
  'gateway',
  /** O vale troca, emitido fora do Aeris (F106). Ver @aeris/payments. */
  'voucher',
] as const

export const PaymentMethodKindSchema = z.enum(PAYMENT_METHOD_KIND_VALUES)

export const PAYMENT_DOCUMENT_TYPE_VALUES = [
  'sale',
  'purchase',
  'receivable',
  'credit_note',
  'standalone',
] as const

export const PaymentDocumentTypeSchema = z.enum(PAYMENT_DOCUMENT_TYPE_VALUES)

export const PaymentStatusSchema = z.enum([
  'pending',
  'settled',
  'refunded',
  'failed',
])

export const PaymentMethodStatusSchema = z.enum(['active', 'archived'])

// ---------------------------------------------------------------------------
// The method catalogue
// ---------------------------------------------------------------------------

export const PaymentMethodSummary = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: PaymentMethodKindSchema,
  settlesImmediately: z.boolean(),
  settlementDays: z.number().int().nonnegative(),
  /** A string, like every number here that is not a count. `"3.490000"` is 3,49%. */
  feePercent: z.string(),
  /** Troco. True for cash and nothing else. */
  allowsChange: z.boolean(),
  maxInstalments: z.number().int().positive(),
  /**
   * Whether a sale paid this way leaves the shop owed money.
   *
   * Configuration, per method, chosen by the admin and editable — ADR-0021
   * offered both scenarios and the product owner asked for both. True by
   * default only for `customer_credit`, which is a receivable from the first
   * second.
   */
  generatesReceivable: z.boolean(),
  /** Days from the payment to the first instalment. The count is on the payment. */
  receivableDueDays: z.number().int().nonnegative(),
  status: PaymentMethodStatusSchema,
  displayOrder: z.number().int(),
  /**
   * The optimistic-concurrency token, sent so the client can hand it back.
   * ADR-0014. A client that cannot see it cannot participate in the check, and
   * the alternative is last-write-wins.
   */
  version: z.number().int(),
  updatedAt: z.string(),
})

export type PaymentMethodSummary = z.infer<typeof PaymentMethodSummary>

export const PaymentMethodList = z.object({
  methods: z.array(PaymentMethodSummary),
})

export type PaymentMethodList = z.infer<typeof PaymentMethodList>

export const PaymentMethodResponse = z.object({ method: PaymentMethodSummary })

export type PaymentMethodResponse = z.infer<typeof PaymentMethodResponse>

const methodCodeField = z
  .string()
  .trim()
  .min(1, 'Informe o código')
  .max(40)
  // Normalised on the server too, never only in the browser: the uniqueness
  // constraint is on the stored value.
  .transform((value) => value.toUpperCase().replace(/\s+/g, ''))

const methodNameField = z.string().trim().min(1, 'Informe o nome').max(60)

const feePercentField = z
  .string()
  .trim()
  .regex(
    PERCENT_PATTERN,
    'A taxa deve ser um número com ponto decimal, por exemplo 3.49'
  )

export const CreatePaymentMethodRequest = z.object({
  code: methodCodeField,
  name: methodNameField,
  kind: PaymentMethodKindSchema,
  /**
   * Optional: absent means "whatever this kind ordinarily does".
   *
   * The defaults live in `@aeris/payments` rather than in a DEFAULT clause,
   * because a default that is only in the schema cannot be shown on the screen
   * that is about to save it.
   */
  settlesImmediately: z.boolean().optional(),
  settlementDays: z.number().int().min(0).max(365).optional(),
  feePercent: feePercentField.default('0'),
  allowsChange: z.boolean().optional(),
  maxInstalments: z.number().int().min(1).max(24).optional(),
  generatesReceivable: z.boolean().optional(),
  receivableDueDays: z.number().int().min(0).max(3650).optional(),
})

export type CreatePaymentMethodRequest = z.input<
  typeof CreatePaymentMethodRequest
>
export type CreatePaymentMethodBody = z.output<
  typeof CreatePaymentMethodRequest
>

export const UpdatePaymentMethodRequest = z.object({
  version: z.number().int().nonnegative(),
  code: methodCodeField.optional(),
  name: methodNameField.optional(),
  settlesImmediately: z.boolean().optional(),
  settlementDays: z.number().int().min(0).max(365).optional(),
  feePercent: feePercentField.optional(),
  allowsChange: z.boolean().optional(),
  maxInstalments: z.number().int().min(1).max(24).optional(),
  generatesReceivable: z.boolean().optional(),
  receivableDueDays: z.number().int().min(0).max(3650).optional(),
})

export type UpdatePaymentMethodRequest = z.input<
  typeof UpdatePaymentMethodRequest
>
export type UpdatePaymentMethodBody = z.output<
  typeof UpdatePaymentMethodRequest
>

export const ArchivePaymentMethodRequest = z.object({
  version: z.number().int().nonnegative(),
})

export type ArchivePaymentMethodRequest = z.infer<
  typeof ArchivePaymentMethodRequest
>

export const ReorderPaymentMethodsRequest = z.object({
  /** Every id, in the order they should appear. Capped so one request cannot be a list scan. */
  methodIds: z.array(z.string().min(1)).min(1).max(100),
})

export type ReorderPaymentMethodsRequest = z.infer<
  typeof ReorderPaymentMethodsRequest
>

export const PaymentMethodQuery = z.object({
  status: PaymentMethodStatusSchema.optional(),
  /**
   * `displayOrder` is the default because it is the meaningful one: it is the
   * order the operator arranged by hand and the order the till offers at the
   * counter. Sorting by name is a way to find a row in a long list, not a way
   * to change what the PDV does — the digit shortcut follows `displayOrder`
   * wherever the admin screen happens to be sorted.
   */
  sort: z.enum(['displayOrder', 'name']).default('displayOrder'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type PaymentMethodQuery = z.input<typeof PaymentMethodQuery>
export type PaymentMethodQueryParams = z.output<typeof PaymentMethodQuery>

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

export const PaymentSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  paymentMethodId: z.string(),
  /** The method's name as it stands now, for a screen. The kind below is the snapshot. */
  methodName: z.string(),
  /** Copied onto the row when it was written: configuration changes, history does not. */
  methodKind: PaymentMethodKindSchema,
  /** `in` is money received, `out` is money returned. `amount` is always positive. */
  direction: z.enum(['in', 'out']),
  amount: z.string(),
  feeAmount: z.string(),
  netAmount: z.string(),
  documentType: PaymentDocumentTypeSchema,
  documentId: z.string().nullable(),
  instalments: z.number().int().positive(),
  authorizationCode: z.string().nullable(),
  nsu: z.string().nullable(),
  transactionId: z.string().nullable(),
  status: PaymentStatusSchema,
  receivedAt: z.string(),
  settledAt: z.string().nullable(),
  expectedSettlementAt: z.string().nullable(),
  /** The receipt this row reverses. Not null exactly when `direction` is `out`. */
  refundsPaymentId: z.string().nullable(),
  note: z.string().nullable(),
})

export type PaymentSummary = z.infer<typeof PaymentSummary>

export const PaymentResponse = z.object({ payment: PaymentSummary })

export type PaymentResponse = z.infer<typeof PaymentResponse>

/**
 * A document's payments and where they leave it.
 *
 * The summary travels with the list rather than being computed by the caller,
 * so a till and a back-office screen cannot disagree about whether a sale is
 * paid. Every figure is a string, including the change.
 */
/**
 * Uma baixa de título deste documento (F159).
 *
 * O dinheiro de uma venda vive em dois livros: a retirada de balcão grava
 * `payment` contra o documento, e a entrega grava `finance_settlement` contra o
 * título — que é onde a forma de pagamento do motoboy aparece. A ficha lia só o
 * primeiro, e um pedido entregue e quitado saía **mudo**, na tela e no papel.
 *
 * Campo separado, e não uma linha a mais em `payments`: uma baixa não é um
 * pagamento de PDV. Ela não tem NSU, não tem parcela, não gera troco, e
 * misturá-las faria `settlementOf` — que decide se a venda está quitada —
 * contar o mesmo dinheiro duas vezes.
 */
export const DocumentSettlementSummary = z.object({
  id: z.string(),
  /** O título que recebeu esta baixa. */
  entryId: z.string(),
  methodName: z.string(),
  /** Principal mais juros e multa, menos desconto: o que entrou. */
  amount: z.string(),
  settledOn: z.string(),
})

export type DocumentSettlementSummary = z.infer<
  typeof DocumentSettlementSummary
>

export const DocumentPaymentList = z.object({
  payments: z.array(PaymentSummary),
  /**
   * O que foi recebido pelos TÍTULOS deste documento, já sem as estornadas.
   *
   * Vazio na venda de balcão paga na hora, que não levanta título nenhum.
   */
  settlements: z.array(DocumentSettlementSummary),
  /** Receipts minus refunds; failed attempts contribute nothing. */
  paid: z.string(),
  /** Echoed from the request, so the answer is legible on its own. */
  total: z.string(),
  outcome: z.enum(['settled', 'short', 'over']),
  outstanding: z.string(),
  excess: z.string(),
  /** Never more than the cash that was handed over. */
  changeDue: z.string(),
  /** Excess that cannot be given as change, because it did not arrive as cash. */
  changeRefused: z.string(),
})

export type DocumentPaymentList = z.infer<typeof DocumentPaymentList>

export const DocumentPaymentQuery = z.object({
  documentType: PaymentDocumentTypeSchema,
  /** Absent lists the `standalone` payments, which have no document. */
  documentId: z.string().min(1).optional(),
  /**
   * The document's total, so the settlement summary can be computed.
   *
   * Supplied by the caller rather than read from a sales table, because this
   * module deliberately does not know what a sale is — see ADR-0018. Defaults
   * to zero, which reports every payment as excess and is the honest answer
   * when nobody said what was owed.
   */
  total: amountString('O total').default('0'),
})

export type DocumentPaymentQuery = z.input<typeof DocumentPaymentQuery>
export type DocumentPaymentQueryParams = z.output<typeof DocumentPaymentQuery>

export const RecordPaymentRequest = z.object({
  branchId: z.string().min(1),
  paymentMethodId: z.string().min(1),
  amount: amountString('O valor'),
  documentType: PaymentDocumentTypeSchema,
  /** Required for every type except `standalone`, which must not carry one. */
  documentId: z.string().min(1).nullable().default(null),
  instalments: z.number().int().min(1).max(24).default(1),
  /** What the operator typed off the card receipt. Cash has none. */
  authorizationCode: z.string().trim().max(40).nullable().default(null),
  nsu: z.string().trim().max(40).nullable().default(null),
  transactionId: z.string().trim().max(64).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
  /**
   * When the money changed hands. Absent means now.
   *
   * Accepted so a payment entered an hour after the fact carries the hour it
   * happened; the server refuses a future date, because a payment that has not
   * happened yet is not a payment.
   */
  receivedAt: z.iso.datetime({ offset: true }).optional(),
})

export type RecordPaymentRequest = z.input<typeof RecordPaymentRequest>
export type RecordPaymentBody = z.output<typeof RecordPaymentRequest>

export const RefundPaymentRequest = z.object({
  /** May be less than the original: a partial refund is ordinary. */
  amount: amountString('O valor'),
  note: z.string().trim().max(500).nullable().default(null),
})

export type RefundPaymentRequest = z.input<typeof RefundPaymentRequest>
export type RefundPaymentBody = z.output<typeof RefundPaymentRequest>
