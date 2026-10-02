import { z } from 'zod'

/**
 * Application contracts — what a part fits (Master Specification section 13).
 *
 * Two levels, brand and model, and the identity of each is a normalised slug
 * rather than what was typed. The client never sends the slug: it is derived
 * on the server by the same `normalizeApplicationName` the browser uses to warn
 * before a round trip, so the two cannot disagree about whether "Citroën" and
 * "Citroen" are one thing.
 */

export const ApplicationStatusSchema = z.enum(['active', 'archived'])

const nameField = z.string().trim().min(1).max(80)

export const ApplicationBrandSummary = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: ApplicationStatusSchema,
  modelCount: z.number().int(),
  version: z.number().int(),
})

export const ApplicationBrandList = z.object({
  brands: z.array(ApplicationBrandSummary),
})

export const ApplicationBrandCreate = z.object({ name: nameField })

export const ApplicationBrandUpdate = z.object({
  name: nameField,
  status: ApplicationStatusSchema,
  version: z.number().int().min(1),
})

export const ApplicationModelSummary = z.object({
  id: z.string(),
  brandId: z.string(),
  brandName: z.string(),
  name: z.string(),
  slug: z.string(),
  reference: z.string().nullable(),
  status: ApplicationStatusSchema,
  version: z.number().int(),
})

export const ApplicationModelList = z.object({
  models: z.array(ApplicationModelSummary),
})

export const ApplicationModelListQuery = z.object({
  brandId: z.uuid().optional(),
  search: z.string().trim().max(80).optional(),
  status: ApplicationStatusSchema.optional(),
  /** Capped: this feeds a typeahead, not a report. */
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const ApplicationModelCreate = z.object({
  brandId: z.uuid(),
  name: nameField,
  reference: z.string().trim().max(60).nullable().default(null),
})

export const ApplicationModelUpdate = z.object({
  name: nameField,
  reference: z.string().trim().max(60).nullable().default(null),
  status: ApplicationStatusSchema,
  version: z.number().int().min(1),
})

export const ProductApplicationSummary = z.object({
  modelId: z.string(),
  modelName: z.string(),
  brandId: z.string(),
  brandName: z.string(),
  note: z.string().nullable(),
})

export const ProductApplicationList = z.object({
  applications: z.array(ProductApplicationSummary),
})

export const ProductApplicationLink = z.object({
  modelId: z.uuid(),
  /** "Serve, mas precisa trocar o conector." */
  note: z.string().trim().max(200).nullable().default(null),
})

export type ApplicationBrandCreateBody = z.infer<typeof ApplicationBrandCreate>
export type ApplicationBrandUpdateBody = z.infer<typeof ApplicationBrandUpdate>
export type ApplicationModelCreateBody = z.infer<typeof ApplicationModelCreate>
export type ApplicationModelUpdateBody = z.infer<typeof ApplicationModelUpdate>
export type ApplicationModelListParams = z.infer<
  typeof ApplicationModelListQuery
>
export type ProductApplicationLinkBody = z.infer<typeof ProductApplicationLink>
