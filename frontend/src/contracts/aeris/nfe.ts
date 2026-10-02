import { z } from 'zod'

/**
 * Importing a supplier's NF-e.
 *
 * Two steps, and splitting them is the feature rather than ceremony:
 *
 *   * `/analyze` reads the XML and answers what WOULD happen. Nothing written.
 *   * `/import` does it, in one transaction.
 *
 * An import that just runs is an import whose effect is discovered afterwards,
 * on a live catalogue, by the person least able to undo it. And the effect here
 * is not only new products: it is a **cost**, which every margin in the shop is
 * computed from.
 *
 * Every amount on this wire is a string, for the reason ADR-0016 gives, and it
 * matters more here than anywhere: this is money arriving from outside.
 */

export const NfeMatchBasisSchema = z.enum([
  'gtin',
  'supplier-code',
  'description',
  'none',
])

export const NfeActionSchema = z.enum(['link', 'review', 'create'])

/**
 * Why an invoice cannot be imported as a purchase.
 *
 * `supplier-not-registered` is the product owner's decision of 2026-08-10: the
 * import stops and asks somebody to register the supplier rather than creating
 * one from the invoice. A supplier is a relationship — payment terms, a
 * contact, somebody who decided to buy from them — and creating one silently
 * means discovering later that the shop has four of them from four invoices.
 */
export const NfeRefusalSchema = z.enum([
  'nfce-is-a-sale',
  'issued-by-us',
  'not-addressed-to-us',
  'supplier-not-registered',
  'supplier-not-a-supplier',
])

/** The emitter, as read from the invoice. What a person needs to register them. */
export const NfeIssuerSummary = z.object({
  cnpj: z.string().nullable(),
  cpf: z.string().nullable(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  stateRegistration: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  /** The party this emitter already is, when the tenant has them. */
  partyId: z.string().nullable(),
})

export type NfeIssuerSummary = z.infer<typeof NfeIssuerSummary>

export const NfePlanItem = z.object({
  number: z.number().int(),
  /** `cProd` — theirs, not ours. */
  supplierCode: z.string(),
  description: z.string(),
  gtin: z.string().nullable(),
  ncm: z.string().nullable(),
  unit: z.string(),
  quantity: z.string(),
  /** `vProd ÷ qCom`, per the Manual de Orientação do Contribuinte. */
  unitCost: z.string(),
  lineTotal: z.string(),
  action: NfeActionSchema,
  basis: NfeMatchBasisSchema,
  variantId: z.string().nullable(),
  /** What we call it, when that differs from what the supplier calls it. */
  ourDescription: z.string().nullable(),
  /** 0–1. Only meaningful when the match came from wording. */
  confidence: z.number().nullable(),
})

export type NfePlanItem = z.infer<typeof NfePlanItem>

export const NfeAnalysis = z.object({
  /** Null when the invoice cannot become a purchase. The reason says why. */
  refusal: NfeRefusalSchema.nullable(),
  accessKey: z.string().nullable(),
  model: z.string(),
  series: z.string().nullable(),
  number: z.string().nullable(),
  issuedAt: z.string().nullable(),
  operation: z.string().nullable(),
  issuer: NfeIssuerSummary,
  items: z.array(NfePlanItem),
  counts: z.object({
    link: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    create: z.number().int().nonnegative(),
  }),
  totalProducts: z.string(),
  totalDiscount: z.string(),
  totalFreight: z.string(),
  totalOther: z.string(),
  total: z.string(),
})

export type NfeAnalysis = z.infer<typeof NfeAnalysis>

export const NfeAnalysisResponse = z.object({ analysis: NfeAnalysis })

export type NfeAnalysisResponse = z.infer<typeof NfeAnalysisResponse>

/**
 * One decision per line, as the operator made it.
 *
 * A line the operator did not answer is NOT imported. F018 settled that:
 * defaulting an unanswered question to "yes" makes the review theatre.
 */
export const NfeItemDecision = z.object({
  number: z.number().int(),
  /**
   * `link` to this variant, `create` a new product, or `skip` the line.
   *
   * `skip` is ordinary rather than an escape hatch: an invoice often carries a
   * line the shop does not stock as a product — a delivery fee, a pallet.
   */
  decision: z.enum(['link', 'create', 'skip']),
  /** Required when `link`. The variant the operator confirmed. */
  variantId: z.string().min(1).nullable().default(null),
})

export type NfeItemDecision = z.input<typeof NfeItemDecision>

export const ImportNfeRequest = z.object({
  /** Where the goods will arrive. Absent uses the session's branch. */
  branchId: z.string().min(1).optional(),
  decisions: z.array(NfeItemDecision).max(990),
})

export type ImportNfeRequest = z.input<typeof ImportNfeRequest>
export type ImportNfeBody = z.output<typeof ImportNfeRequest>

export const ImportNfeResponse = z.object({
  /** The draft purchase. Nothing has been received: stock has not moved. */
  purchaseId: z.string(),
  created: z.number().int().nonnegative(),
  linked: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})

export type ImportNfeResponse = z.infer<typeof ImportNfeResponse>
