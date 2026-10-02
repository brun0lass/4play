import { z } from 'zod'

/**
 * Purchasing contracts.
 *
 * Every amount and quantity on this wire is a **string**: `"19.90"`, never
 * `19.90`. A JSON number is an IEEE-754 double, and declaring a cost as
 * `z.number()` here would undo ADR-0016 at the boundary — inside `JSON.parse`
 * on a client we do not control, where the damage is done before any of our
 * code runs.
 *
 * That matters more here than anywhere else in the product: this is where the
 * shop's money ENTERS the system. A price that drifts by a centavo is a
 * customer complaint; a cost that drifts is a margin nobody can reconcile
 * against the supplier's invoice.
 *
 * The status list is repeated here rather than imported, because this package
 * may depend only on `@aeris/domain` — and the guard against it drifting from
 * `@aeris/purchasing` is a unit test, not an import.
 */

/** Up to twelve integer digits and six decimals — `numeric(18, 6)`, non-negative. */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,6})?$/

const amountString = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      AMOUNT_PATTERN,
      `${label} deve ser um número com ponto decimal, por exemplo 19.90`
    )

export const PurchaseStatusSchema = z.enum([
  'draft',
  'confirmed',
  'received',
  'cancelled',
])

const instant = z.iso.datetime({ offset: true })

export const PurchaseLineSummary = z.object({
  id: z.string(),
  lineNumber: z.number().int().positive(),
  variantId: z.string(),
  /** Captured: renaming a product must not rewrite what a supplier invoiced. */
  description: z.string(),
  unit: z.string(),
  quantity: z.string(),
  /** How much has arrived so far. Less than `quantity` while it is partial. */
  receivedQuantity: z.string(),
  /** What is still owed: `quantity − receivedQuantity`, never below zero. */
  outstandingQuantity: z.string(),
  unitCost: z.string(),
  discountAmount: z.string(),
  lineTotal: z.string(),
  /** The supplier's own code. What an imported NF-e fills from `cProd`. */
  supplierCode: z.string().nullable(),
})

export type PurchaseLineSummary = z.infer<typeof PurchaseLineSummary>

export const PurchaseSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  status: PurchaseStatusSchema,
  /** OURS, allocated on confirmation. Null while a draft. */
  number: z.number().int().nullable(),
  /** THEIRS, printed on their invoice. Two numbers, on purpose. */
  supplierDocumentNumber: z.string().nullable(),
  supplierPartyId: z.string(),
  supplierName: z.string(),
  buyerUserId: z.string().nullable(),
  buyerName: z.string().nullable(),
  issuedAt: z.string(),
  expectedAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  discountAmount: z.string(),
  /** On the header, not spread into the unit costs. ADR-0020 leaves that open. */
  freightAmount: z.string(),
  subtotalAmount: z.string(),
  totalAmount: z.string(),
  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  lineCount: z.number().int().nonnegative(),
  /**
   * What this purchase may do next, from the transition table.
   *
   * `received` never appears here even from `confirmed`: arriving is not a
   * status somebody sets, it is a delivery with quantities. The interface
   * offers "Receber", which opens the receipt, not a status button.
   */
  allowedTransitions: z.array(PurchaseStatusSchema),
  /** The optimistic-concurrency token. ADR-0014. */
  version: z.number().int(),
  updatedAt: z.string(),
})

export type PurchaseSummary = z.infer<typeof PurchaseSummary>

export const PurchaseDetail = PurchaseSummary.extend({
  lines: z.array(PurchaseLineSummary),
})

export type PurchaseDetail = z.infer<typeof PurchaseDetail>

export const PurchaseResponse = z.object({ document: PurchaseDetail })

export type PurchaseResponse = z.infer<typeof PurchaseResponse>

export const PurchaseList = z.object({
  items: z.array(PurchaseSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type PurchaseList = z.infer<typeof PurchaseList>

export const PurchaseListQuery = z.object({
  branchId: z.string().min(1).optional(),
  status: PurchaseStatusSchema.optional(),
  supplierPartyId: z.string().min(1).optional(),
  /** Matches our number, the supplier's number, or the supplier's name. */
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped: an uncapped page size is a way for one request to read every
  // purchase the business has ever made, costs included.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['issued_at', 'number', 'total_amount']).default('issued_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
})

export type PurchaseListQuery = z.input<typeof PurchaseListQuery>

/** What a client passes. Numbers are numbers. */
export type PurchaseListRequest = {
  branchId?: string | undefined
  status?: z.infer<typeof PurchaseStatusSchema> | undefined
  supplierPartyId?: string | undefined
  search?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?: 'issued_at' | 'number' | 'total_amount' | undefined
  direction?: 'asc' | 'desc' | undefined
}

export type PurchaseListParams = z.output<typeof PurchaseListQuery>

export const PurchaseLineRequest = z.object({
  variantId: z.string().min(1),
  description: z.string().trim().min(1).max(300),
  unit: z.string().trim().min(1).max(10),
  quantity: amountString('A quantidade'),
  unitCost: amountString('O custo'),
  discountAmount: amountString('O desconto').default('0'),
  supplierCode: z.string().trim().max(60).nullable().default(null),
})

export type PurchaseLineRequest = z.input<typeof PurchaseLineRequest>

export const CreatePurchaseRequest = z.object({
  id: z.uuid().optional(),
  branchId: z.string().min(1).optional(),
  /** Always identified. A purchase from nobody is an adjustment in a costume. */
  supplierPartyId: z.string().min(1),
  supplierDocumentNumber: z.string().trim().max(60).nullable().default(null),
  expectedAt: instant.nullable().default(null),
  discountAmount: amountString('O desconto').default('0'),
  freightAmount: amountString('O frete').default('0'),
  notes: z.string().trim().max(2000).nullable().default(null),
  lines: z.array(PurchaseLineRequest).default([]),
})

export type CreatePurchaseRequest = z.input<typeof CreatePurchaseRequest>
export type CreatePurchaseBody = z.output<typeof CreatePurchaseRequest>

export const UpdatePurchaseRequest = z.object({
  version: z.number().int().nonnegative(),
  supplierPartyId: z.string().min(1).optional(),
  supplierDocumentNumber: z.string().trim().max(60).nullable().optional(),
  expectedAt: instant.nullable().optional(),
  discountAmount: amountString('O desconto').optional(),
  freightAmount: amountString('O frete').optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Absent leaves the lines alone; present replaces the whole set. */
  lines: z.array(PurchaseLineRequest).optional(),
})

export type UpdatePurchaseRequest = z.input<typeof UpdatePurchaseRequest>
export type UpdatePurchaseBody = z.output<typeof UpdatePurchaseRequest>

/**
 * Confirm or cancel. `received` is deliberately absent.
 *
 * A purchase becomes received by being received — through `/receive`, with the
 * quantities that arrived. Allowing it here would produce a document marked
 * received that moved no stock and wrote no cost, which is the one outcome the
 * whole module exists to prevent.
 */
export const TransitionPurchaseRequest = z.object({
  version: z.number().int().nonnegative(),
  to: z.enum(['confirmed', 'cancelled']),
  reason: z.string().trim().max(500).nullable().default(null),
})

export type TransitionPurchaseRequest = z.input<
  typeof TransitionPurchaseRequest
>
export type TransitionPurchaseBody = z.output<typeof TransitionPurchaseRequest>

export const ReceiptLineRequest = z.object({
  lineId: z.string().min(1),
  /** How much of this line arrived now. Zero is legal and means "not this one". */
  quantity: amountString('A quantidade recebida'),
  /**
   * What the invoice actually charged, when it disagrees with what was ordered.
   *
   * Absent keeps the ordered cost. Present overwrites it — the negotiated
   * number is a plan, the invoice is what happened, and the cost that reaches
   * the shelf has to be the one the shop paid.
   */
  unitCost: amountString('O custo').optional(),
})

export type ReceiptLineRequest = z.input<typeof ReceiptLineRequest>

export const ReceivePurchaseRequest = z.object({
  version: z.number().int().nonnegative(),
  /** Usually filled in here: the invoice is in the receiver's hand. */
  supplierDocumentNumber: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(ReceiptLineRequest).min(1),
  /**
   * How the shop will pay for it.
   *
   * Optional, and only acted on by the delivery that COMPLETES the purchase.
   * Present means the receipt also raises the contas a pagar, in the same
   * transaction as the stock — goods and the debt for them land together or
   * neither does.
   */
  payment: z
    .object({
      instalmentCount: z.number().int().positive().max(360).default(1),
      firstDueAt: z.iso.datetime({ offset: true }),
      interval: z.enum(['monthly', 'days']).default('monthly'),
      intervalDays: z.number().int().positive().max(365).optional(),
      methodId: z.string().nullable().default(null),
    })
    .optional(),
})

export type ReceivePurchaseRequest = z.input<typeof ReceivePurchaseRequest>
export type ReceivePurchaseBody = z.output<typeof ReceivePurchaseRequest>
