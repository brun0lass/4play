import { z } from 'zod'

/**
 * A loja online — F221, ADR-0041.
 *
 * Duas metades:
 *
 * * **O que o site lê** (`/storefront/:slug/...`), com nomes em português
 *   porque é o vocabulário que o site de atacado já usa (`codigoProduto`,
 *   `nome`, `preco`). Dinheiro em texto decimal, como em todo o Aeris — quem
 *   converte para número de tela é o site.
 * * **O que a loja configura** (`/storefront-admin/...`), no padrão do resto
 *   da API.
 *
 * O lojista entra só com o telefone (decisão do dono, 04/10), e por isso o que
 * volta dele é o mínimo: nome e código. Documento, endereço, saldo, vale e
 * crediário não têm campo aqui onde caberiam.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export const StorefrontSlugParams = z.object({
  slug: z.string().regex(SLUG),
})

export const StorefrontLoginRequest = z.object({
  /** O telefone como a pessoa digitou; o servidor tira o que não é dígito. */
  numero: z.string().trim().min(1).max(40),
})

export const StorefrontShopkeeper = z.object({
  id: z.string(),
  nome: z.string(),
  codigo: z.string().nullable(),
  numero: z.string(),
})

export const StorefrontLoginResponse = z.object({
  token: z.string(),
  usuario: StorefrontShopkeeper,
})

export type StorefrontLoginResponse = z.infer<typeof StorefrontLoginResponse>

export const StorefrontMeResponse = z.object({
  usuario: StorefrontShopkeeper.omit({ numero: true }),
  loja: z.object({ nome: z.string() }),
})

export const StorefrontProductsQuery = z.object({
  termo: z.string().trim().max(120).optional(),
  /** O id de uma categoria de `GET /:slug/categories`. */
  categoria: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  ordenar: z.enum(['az', 'za']).default('az'),
})

export const StorefrontProduct = z.object({
  id: z.string(),
  /** O código da cor padrão — o que o vendedor procura no balcão. */
  codigoProduto: z.string(),
  nome: z.string(),
  descricao: z.string().nullable(),
  categoria: z.string().nullable(),
  /** Preço da tabela padrão, em texto decimal ("12.50"); nulo sem preço. */
  preco: z.string().nullable(),
  /**
   * Tem para vender na filial da loja: o disponível somado das cores ativas.
   * Sem estoque o produto não some — vem no fim, para o "avise-me".
   */
  emEstoque: z.boolean(),
  imagemUrl: z.string().nullable(),
})

export type StorefrontProduct = z.infer<typeof StorefrontProduct>

export const StorefrontProductsResponse = z.object({
  data: z.array(StorefrontProduct),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})

export const StorefrontProductResponse = z.object({
  data: StorefrontProduct,
})

export const StorefrontCategoriesResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      nome: z.string(),
      produtos: z.number().int(),
    })
  ),
})

/* ------------------------------------------------------------------ */
/* A configuração, na tela do Aeris                                    */
/* ------------------------------------------------------------------ */

const ORIGIN = z
  .string()
  .trim()
  .regex(/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i, 'Origem inválida.')

export const StorefrontSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  branchId: z.string(),
  allowedOrigins: z.array(z.string()),
  status: z.enum(['active', 'archived']),
  version: z.number().int(),
})

export type StorefrontSummary = z.infer<typeof StorefrontSummary>

export const StorefrontListResponse = z.object({
  storefronts: z.array(StorefrontSummary),
})

export type StorefrontListResponse = z.infer<typeof StorefrontListResponse>

export const StorefrontResponse = z.object({
  storefront: StorefrontSummary,
})

export type StorefrontResponse = z.infer<typeof StorefrontResponse>

export const CreateStorefrontRequest = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG, 'Use letras, números e hífen.'),
  name: z.string().trim().min(1).max(80),
  branchId: z.uuid(),
  allowedOrigins: z.array(ORIGIN).max(10).default([]),
})

export type CreateStorefrontRequest = z.input<typeof CreateStorefrontRequest>

export const UpdateStorefrontRequest = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(80),
  branchId: z.uuid(),
  allowedOrigins: z.array(ORIGIN).max(10),
  status: z.enum(['active', 'archived']),
})

export type UpdateStorefrontRequest = z.infer<typeof UpdateStorefrontRequest>

export const StorefrontSessionsResponse = z.object({
  sessions: z.array(
    z.object({
      partyId: z.string(),
      name: z.string(),
      code: z.string().nullable(),
      sessions: z.number().int(),
      lastSeenAt: z.string(),
    })
  ),
})

export type StorefrontSessionsResponse = z.infer<
  typeof StorefrontSessionsResponse
>

export const RevokeStorefrontSessionsResponse = z.object({
  revoked: z.number().int(),
})

export type RevokeStorefrontSessionsResponse = z.infer<
  typeof RevokeStorefrontSessionsResponse
>
