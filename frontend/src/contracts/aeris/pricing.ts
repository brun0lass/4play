import { z } from 'zod'

/**
 * Pricing contracts.
 *
 * Every monetary value on this wire is a **string**: `"19.90"`, never `19.90`.
 *
 * JSON numbers are IEEE-754 doubles. Declaring a price as `z.number()` here
 * would undo the whole of ADR-0016 at the boundary — including inside
 * `JSON.parse` on a client we do not control, where the damage happens before
 * any of our code runs. The string is the machine format: a point, no
 * thousands separator, up to six decimals. `R$ 1.234,56` is a rendering, done
 * in the interface by `formatMoney` from the same package the server uses.
 *
 * This package may only depend on `@aeris/domain` (see .dependency-cruiser.cjs),
 * so the shape of a money string is enforced here by a regular expression and
 * parsed into fixed-point by `@aeris/pricing` on the far side of it.
 */

/** Up to twelve integer digits and six decimals — `numeric(18, 6)`, non-negative. */
const MONEY_PATTERN = /^\d{1,12}(\.\d{1,6})?$/

const moneyString = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      MONEY_PATTERN,
      `${label} deve ser um número com ponto decimal, por exemplo 19.90`
    )

export const PricingStatusSchema = z.enum(['active', 'archived'])

/** An instant, ISO 8601. Null means "no bound", never "now". */
const instant = z.iso.datetime({ offset: true })

const optionalInstantOnCreate = instant.nullable().default(null)
const optionalInstantOnUpdate = instant.nullable().optional()

export const PriceListSummary = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  /** ISO 4217. `BRL` today; the field exists so it need not be guessed later. */
  currency: z.string(),
  /** Exactly one per tenant. What an unqualified price lookup resolves against. */
  isDefault: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: PricingStatusSchema,
  /**
   * The optimistic-concurrency token, sent so the client can hand it back.
   * ADR-0014. A client that cannot see it cannot participate in the check, and
   * the alternative is last-write-wins.
   */
  version: z.number().int(),
  updatedAt: z.string(),
})

export type PriceListSummary = z.infer<typeof PriceListSummary>

export const PriceListCollection = z.object({
  priceLists: z.array(PriceListSummary),
})

export type PriceListCollection = z.infer<typeof PriceListCollection>

export const PriceListResponse = z.object({ priceList: PriceListSummary })

export type PriceListResponse = z.infer<typeof PriceListResponse>

const codeField = z
  .string()
  .trim()
  .min(1, 'Informe o código')
  .max(40)
  // Normalised on the server too, never only in the browser: the uniqueness
  // constraint is on the stored value.
  .transform((value) => value.toUpperCase().replace(/\s+/g, ''))

const nameField = z.string().trim().min(1, 'Informe o nome').max(120)

export const CreatePriceListRequest = z.object({
  code: codeField,
  name: nameField,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Use um código ISO 4217, por exemplo BRL')
    .default('BRL'),
  isDefault: z.boolean().default(false),
  validFrom: optionalInstantOnCreate,
  validTo: optionalInstantOnCreate,
})

export type CreatePriceListRequest = z.input<typeof CreatePriceListRequest>
export type CreatePriceListBody = z.output<typeof CreatePriceListRequest>

export const UpdatePriceListRequest = z.object({
  version: z.number().int().nonnegative(),
  code: codeField.optional(),
  name: nameField.optional(),
  isDefault: z.boolean().optional(),
  validFrom: optionalInstantOnUpdate,
  validTo: optionalInstantOnUpdate,
})

export type UpdatePriceListRequest = z.input<typeof UpdatePriceListRequest>
export type UpdatePriceListBody = z.output<typeof UpdatePriceListRequest>

export const ArchivePriceListRequest = z.object({
  version: z.number().int().nonnegative(),
})

export type ArchivePriceListRequest = z.infer<typeof ArchivePriceListRequest>

/**
 * One row of the pricing screen: a product, and what it costs in this list.
 *
 * A variant with no price yet appears with `basePrice: null` rather than being
 * absent — "not priced here" is the state the screen exists to fix, so hiding
 * it would hide the work.
 */
export const PriceListEntrySummary = z.object({
  variantId: z.string(),
  productId: z.string(),
  productName: z.string(),
  sku: z.string(),
  unit: z.string(),
  /** A string. Null when this product has no base price in this list. */
  basePrice: z.string().nullable(),
  baseItemId: z.string().nullable(),
  baseVersion: z.number().int().nullable(),
  /** How many tiers this product has here, the base one included. */
  tierCount: z.number().int().nonnegative(),
})

export type PriceListEntrySummary = z.infer<typeof PriceListEntrySummary>

export const PriceListEntryList = z.object({
  items: z.array(PriceListEntrySummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type PriceListEntryList = z.infer<typeof PriceListEntryList>

export const PriceListEntryQuery = z.object({
  search: z.string().trim().max(120).optional(),
  /** Only products that already carry a price in this list. */
  pricedOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped: an uncapped page size is a way for one request to read the whole
  // catalogue.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', 'basePrice']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type PriceListEntryQuery = z.input<typeof PriceListEntryQuery>
export type PriceListEntryParams = z.output<typeof PriceListEntryQuery>

export const PriceTierSummary = z.object({
  id: z.string(),
  variantId: z.string(),
  /** A string, like every number that means money or quantity here. */
  minQuantity: z.string(),
  unitPrice: z.string(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  version: z.number().int(),
})

export type PriceTierSummary = z.infer<typeof PriceTierSummary>

export const PriceTierList = z.object({
  tiers: z.array(PriceTierSummary),
})

export type PriceTierList = z.infer<typeof PriceTierList>

export const SetPriceItemRequest = z.object({
  variantId: z.string().min(1),
  unitPrice: moneyString('O preço'),
  /** Zero is the base tier, which is why it is the default rather than null. */
  minQuantity: moneyString('A quantidade mínima').default('0'),
  validFrom: optionalInstantOnCreate,
  validTo: optionalInstantOnCreate,
  /**
   * Present when changing a price that was read; absent when creating a tier.
   *
   * Absent is not "overwrite whatever is there": a tier already existing at
   * that minimum is reported as a duplicate, because silently replacing a
   * price somebody else set is exactly what optimistic concurrency exists to
   * prevent.
   */
  version: z.number().int().nonnegative().optional(),
})

export type SetPriceItemRequest = z.input<typeof SetPriceItemRequest>
export type SetPriceItemBody = z.output<typeof SetPriceItemRequest>

export const RemovePriceItemRequest = z.object({
  version: z.number().int().nonnegative(),
})

export type RemovePriceItemRequest = z.infer<typeof RemovePriceItemRequest>

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export const PriceTierTrace = z.object({
  itemId: z.string(),
  minQuantity: z.string(),
  unitPrice: z.string(),
  outcome: z.enum([
    'applied',
    'quantity-below-minimum',
    'not-yet-valid',
    'expired',
    'archived',
    'superseded-by-more-specific-tier',
  ]),
  /** Whose validity window governed this tier. See resolution.ts, rule 3. */
  windowSource: z.enum(['item', 'list', 'none']),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
})

export type PriceTierTrace = z.infer<typeof PriceTierTrace>

/**
 * The answer, and why.
 *
 * The trace is not a debug field. A resolver that returns a number with no
 * explanation is one nobody can debug at a till with a queue behind them, and
 * an explanation that has to be switched on is missing exactly when it is
 * needed. Sales and the POS will read this to record the pricing decision each
 * sale was made under, which section 15 requires.
 */
export const PriceResolutionResponse = z.object({
  applies: z.boolean(),
  /** A string, and null when nothing applied — never `"0.00"`. */
  unitPrice: z.string().nullable(),
  currency: z.string().nullable(),
  /** `base-price`, `quantity-tier`, or null when nothing applied. */
  basis: z.enum(['base-price', 'quantity-tier']).nullable(),
  appliedItemId: z.string().nullable(),
  appliedMinQuantity: z.string().nullable(),
  reason: z
    .enum([
      'no-price-list',
      'price-list-archived',
      'no-price-for-variant',
      'no-applicable-tier',
      'invalid-quantity',
    ])
    .nullable(),
  priceList: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      currency: z.string(),
      isDefault: z.boolean(),
    })
    .nullable(),
  variantId: z.string(),
  quantity: z.string(),
  at: z.string(),
  tiers: z.array(PriceTierTrace),
})

export type PriceResolutionResponse = z.infer<typeof PriceResolutionResponse>

export const ResolvePriceQuery = z.object({
  variantId: z.string().min(1),
  quantity: moneyString('A quantidade').default('1'),
  /** Absent means "the tenant's default list", which is what a till does. */
  priceListId: z.string().min(1).optional(),
  /** Absent means now. A sale prices at its own moment, not at the reader's. */
  at: instant.optional(),
})

export type ResolvePriceQuery = z.input<typeof ResolvePriceQuery>
export type ResolvePriceParams = z.output<typeof ResolvePriceQuery>
