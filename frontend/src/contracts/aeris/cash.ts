import { z } from 'zod'

/**
 * Cash session contracts (Master Specification section 18).
 *
 * Every amount on this wire is a STRING, never a JSON number.
 *
 * A JSON number is an IEEE-754 double by specification, so `JSON.parse` would
 * round it before any code of ours ran — including inside a client we do not
 * control. Sections 9 and 40 and ADR-0016 all say the same thing, and this is
 * the boundary where saying it costs something and therefore where it is
 * usually abandoned.
 *
 * **Note what no request schema in this file contains: an expected amount.**
 * There is no field for it, on purpose. The operator sends what they counted;
 * the server derives what should have been there from the ledger. A till where
 * somebody can type the expected figure is a till that never has a difference.
 */

export const CASH_MOVEMENT_KIND_VALUES = [
  'opening',
  'sale',
  'refund',
  'withdrawal',
  'deposit',
  'adjustment',
  /** Um gasto da loja pago com dinheiro da gaveta (F146). */
  'expense',
] as const

export const CashMovementKindSchema = z.enum(CASH_MOVEMENT_KIND_VALUES)

export const CashMovementDirectionSchema = z.enum(['in', 'out'])

export const CASH_SOURCE_TYPE_VALUES = [
  'opening',
  'manual',
  'sales_document',
  'payment',
  /** A baixa de um título — o dinheiro que veio da rua (F034, ADR-0021 d9). */
  'finance_settlement',
  /** Um lançamento do caderno de gastos ou da folha (F146). */
  'expense',
] as const

export const CashSourceTypeSchema = z.enum(CASH_SOURCE_TYPE_VALUES)

export const CashSessionStatusSchema = z.enum(['open', 'closed'])

/**
 * An amount as it travels: `"150"`, `"49.90"`, `"0.01"`.
 *
 * The regular expression is the validation. A `z.number()` with a `.refine()`
 * would already have lost the value by the time the refinement ran. Two decimal
 * places, because this is money on a document (MONEY_SCALE).
 */
const AMOUNT_PATTERN = /^\d{1,14}(\.\d{1,2})?$/

const amountField = (message: string) =>
  z.string().trim().regex(AMOUNT_PATTERN, message)

/**
 * A movement amount: positive, so a bare zero is refused here as well as by the
 * check constraint in migration 0011.
 *
 * "Contains a digit other than zero" rather than `parseFloat(value) > 0`,
 * because parsing to a float to check a sign would reintroduce, in the
 * validator, the representation this whole file avoids. The pattern above has
 * already established the shape, so a nonzero digit is exactly nonzero.
 */
const positiveAmountField = amountField(
  'Informe um valor com até 2 casas decimais, usando ponto.'
).refine((value) => /[1-9]/.test(value), 'O valor deve ser maior que zero.')

/**
 * A counted or opening amount, which MAY be zero.
 *
 * A drawer counted empty is an ordinary fechamento, and a till opened with no
 * fundo de troco is an ordinary abertura. A schema refusing either would push
 * people into typing a centavo they did not have.
 */
const nonNegativeAmountField = amountField(
  'Informe um valor com até 2 casas decimais, usando ponto.'
)

const optionalNote = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .default(null)

/**
 * The till's name, as written on it.
 *
 * Normalised server-side by `normalizeTerminalId` — uppercased, trimmed,
 * internal whitespace collapsed — because the partial unique index that holds
 * "one open session per terminal" is keyed on this string, and "caixa 01" and
 * "CAIXA  01" must not be two tills.
 */
const terminalField = z
  .string()
  .trim()
  .min(1, 'Informe o caixa.')
  .max(40, 'O nome do caixa tem no máximo 40 caracteres.')

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const CashMovementSummary = z.object({
  id: z.string(),
  sessionId: z.string(),
  kind: CashMovementKindSchema,
  direction: CashMovementDirectionSchema,
  /** Always positive. `direction` carries the sign. */
  amount: z.string(),
  sourceType: CashSourceTypeSchema,
  /**
   * The document that caused this, when one did.
   *
   * There is no foreign key behind it: a movement can be caused by a sale
   * document or a payment, and neither table exists yet. See migration 0011 for
   * why that is deliberate.
   */
  sourceId: z.string().nullable(),
  note: z.string().nullable(),
  /** Null when the movement carries no identified actor. */
  actorName: z.string().nullable(),
  /** The expected balance immediately after this movement. */
  balanceAfter: z.string(),
  occurredAt: z.string(),
})

export type CashMovementSummary = z.infer<typeof CashMovementSummary>

export const CashSessionSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  terminalId: z.string(),
  status: CashSessionStatusSchema,
  openedByUserId: z.string(),
  openedByName: z.string().nullable(),
  openedAt: z.string(),
  openingFloat: z.string(),
  closedAt: z.string().nullable(),
  closedByName: z.string().nullable(),
  /** What was counted in the drawer. Null while the session is open. */
  countedAmount: z.string().nullable(),
  /**
   * What the ledger says should be in the drawer, right now.
   *
   * Derived on every read, never stored while open and never accepted as
   * input. For a closed session this equals the frozen snapshot the close wrote
   * — the ledger of a closed session can no longer change.
   */
  expected: z.string(),
  /**
   * `counted - expected`, as the database computed it. Null while open.
   *
   * Positive is a sobra, negative a falta. Visible only to the operator who
   * owns the session and to anybody holding `pos.supervise`.
   */
  differenceAmount: z.string().nullable(),
  movementCount: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  /** Optimistic-concurrency token. A stale one is refused with 409. */
  version: z.number().int().positive(),
})

export type CashSessionSummary = z.infer<typeof CashSessionSummary>

export const CashSessionResponse = z.object({
  session: CashSessionSummary,
})

export type CashSessionResponse = z.infer<typeof CashSessionResponse>

/** Null when no session is open at the terminal. Not a 404: that is a normal state. */
export const CurrentCashSessionResponse = z.object({
  session: CashSessionSummary.nullable(),
})

export type CurrentCashSessionResponse = z.infer<
  typeof CurrentCashSessionResponse
>

export const CashSessionList = z.object({
  items: z.array(CashSessionSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type CashSessionList = z.infer<typeof CashSessionList>

export const CashMovementList = z.object({
  items: z.array(CashMovementSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type CashMovementList = z.infer<typeof CashMovementList>

/**
 * The answer to a recorded movement: the row, and the balance it produced.
 *
 * Both, because either alone is a half-truth. The movement without the balance
 * makes a till re-fetch to find out what happened; the balance without the
 * movement is the mutable-field model this feature exists to avoid.
 */
export const CashMovementResponse = z.object({
  movement: CashMovementSummary,
  session: CashSessionSummary,
})

export type CashMovementResponse = z.infer<typeof CashMovementResponse>

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const OpenCashSessionRequest = z.object({
  /** Absent means the branch on the session. A till is always somewhere. */
  branchId: z.string().optional(),
  terminalId: terminalField,
  /** The fundo de troco. May be zero. */
  openingFloat: nonNegativeAmountField,
  notes: optionalNote,
})

export type OpenCashSessionRequest = z.input<typeof OpenCashSessionRequest>
export type OpenCashSessionBody = z.output<typeof OpenCashSessionRequest>

/**
 * A sangria, a suprimento or an adjustment.
 *
 * `sale` and `refund` are absent from this schema although they exist in the
 * ledger vocabulary: they are written by the sales module in the same
 * transaction as the document that caused them, never by a person typing into
 * a till screen. An endpoint that accepted them would be a way to add cash to a
 * drawer with no sale behind it.
 */
export const RecordCashMovementRequest = z.object({
  kind: z.enum(['withdrawal', 'deposit', 'adjustment']),
  /**
   * Required only for an adjustment, which is the one kind that does not fix a
   * direction. Sent for the others too and checked against the kind, so a
   * client cannot record a sangria that adds cash.
   */
  direction: CashMovementDirectionSchema.optional(),
  amount: positiveAmountField,
  note: optionalNote,
})

export type RecordCashMovementRequest = z.input<
  typeof RecordCashMovementRequest
>
export type RecordCashMovementBody = z.output<typeof RecordCashMovementRequest>

/**
 * Closing a till.
 *
 * `countedAmount` is the ONLY monetary field, and that is the whole design.
 * There is no `expectedAmount` and no `difference`: the server sums the ledger
 * under a row lock and the database computes the difference as a generated
 * column.
 */
export const CloseCashSessionRequest = z.object({
  countedAmount: nonNegativeAmountField,
  notes: optionalNote,
  /** The version the client last saw. A stale one is refused with 409. */
  version: z.number().int().positive(),
})

export type CloseCashSessionRequest = z.input<typeof CloseCashSessionRequest>
export type CloseCashSessionBody = z.output<typeof CloseCashSessionRequest>

export const CashSessionListQuery = z.object({
  branchId: z.string().optional(),
  status: CashSessionStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped: an uncapped page size is one request reading the whole table.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['openedAt', 'terminalId']).default('openedAt'),
  // Newest first: a till list is read to find today's, not 2024's.
  direction: z.enum(['asc', 'desc']).default('desc'),
})

export type CashSessionListQuery = z.input<typeof CashSessionListQuery>
export type CashSessionListParams = z.output<typeof CashSessionListQuery>

/** What a client passes. Numbers are numbers. */
export type CashSessionListRequest = {
  branchId?: string | undefined
  status?: 'open' | 'closed' | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?: 'openedAt' | 'terminalId' | undefined
  direction?: 'asc' | 'desc' | undefined
}

export const CurrentCashSessionQuery = z.object({
  branchId: z.string().optional(),
  terminalId: terminalField,
})

export type CurrentCashSessionQuery = z.input<typeof CurrentCashSessionQuery>
export type CurrentCashSessionParams = z.output<typeof CurrentCashSessionQuery>

export const CashMovementListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['occurredAt', 'amount']).default('occurredAt'),
  // Newest first: the movement somebody is looking for is the one they just
  // made, or the one that made the till stop balancing.
  direction: z.enum(['asc', 'desc']).default('desc'),
})

export type CashMovementListQuery = z.input<typeof CashMovementListQuery>
export type CashMovementListParams = z.output<typeof CashMovementListQuery>

// ---------------------------------------------------------------------------
// The terminal register
// ---------------------------------------------------------------------------
//
// Added by F025. Until then the till was typed, which meant a typo opened a
// second session on one drawer instead of failing — see migration 0022.

export const CashTerminalStatusSchema = z.enum(['active', 'archived'])

export const CashTerminalSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  /** The string written onto every session this till runs. */
  code: z.string(),
  name: z.string(),
  status: CashTerminalStatusSchema,
  version: z.number().int().positive(),
})

export type CashTerminalSummary = z.infer<typeof CashTerminalSummary>

export const CashTerminalList = z.object({
  items: z.array(CashTerminalSummary),
})

export type CashTerminalList = z.infer<typeof CashTerminalList>

export const CashTerminalResponse = z.object({
  terminal: CashTerminalSummary,
})

export type CashTerminalResponse = z.infer<typeof CashTerminalResponse>

export const CashTerminalListQuery = z.object({
  branchId: z.string().optional(),
  status: CashTerminalStatusSchema.optional(),
  sort: z.enum(['code', 'name']).default('code'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type CashTerminalListQuery = z.input<typeof CashTerminalListQuery>
export type CashTerminalListParams = z.output<typeof CashTerminalListQuery>

export const CreateCashTerminalRequest = z.object({
  /** Absent means the branch on the session. A till is always somewhere. */
  branchId: z.string().optional(),
  code: terminalField,
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome do caixa.')
    .max(80, 'O nome tem no máximo 80 caracteres.'),
})

export type CreateCashTerminalRequest = z.input<
  typeof CreateCashTerminalRequest
>
export type CreateCashTerminalBody = z.output<typeof CreateCashTerminalRequest>

/**
 * The name and the status. Not the code.
 *
 * The code is written verbatim onto every session the till ever ran, as text,
 * so editing it here would leave that history naming something that no longer
 * exists. A till whose code is wrong is archived and replaced — which is also
 * what happens to the drawer.
 */
export const UpdateCashTerminalRequest = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: CashTerminalStatusSchema.optional(),
  version: z.number().int().positive(),
})

export type UpdateCashTerminalRequest = z.input<
  typeof UpdateCashTerminalRequest
>
export type UpdateCashTerminalBody = z.output<typeof UpdateCashTerminalRequest>
