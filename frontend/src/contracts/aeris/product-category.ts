import { z } from 'zod'

/**
 * A categoria do produto — F163, migração 0092.
 *
 * Vocabulário controlado, no molde do cadastro de marcas (`brand.ts`), com uma
 * diferença que vem do banco: o produto aponta para a categoria por `id`, e não
 * por nome. Renomear a categoria, por isso, é um `update` numa linha só — não
 * existe aqui o problema que fez `renameBrand` virar uma transação de quatro
 * tabelas.
 *
 * A lista nasce vazia. A loja cria Tela e Bateria; outra loja cria o que ela
 * vende.
 */

export const ProductCategoryStatusSchema = z.enum(['active', 'archived'])

export const ProductCategorySummary = z.object({
  id: z.string(),
  name: z.string(),
  status: ProductCategoryStatusSchema,
  /**
   * Quantos produtos estão nesta categoria hoje.
   *
   * Pela mesma razão do cadastro de marcas: arquivar uma categoria com 1.205
   * telas é uma decisão diferente de arquivar uma que ninguém usa.
   */
  usageCount: z.number().int(),
  version: z.number().int(),
})

export type ProductCategorySummaryType = z.infer<typeof ProductCategorySummary>

export const ProductCategoryListQuery = z.object({
  status: ProductCategoryStatusSchema.optional(),
})

export const ProductCategoryListResponse = z.object({
  categories: z.array(ProductCategorySummary),
})

export type ProductCategoryListResponseType = z.infer<
  typeof ProductCategoryListResponse
>

export const CreateProductCategoryRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Dê um nome à categoria.')
    .max(120, 'Use no máximo 120 caracteres.'),
})

export type CreateProductCategoryBody = z.infer<
  typeof CreateProductCategoryRequest
>

/** Arquivar e reativar pela mesma rota. Os produtos não são tocados. */
export const SetProductCategoryStatusRequest = z.object({
  status: ProductCategoryStatusSchema,
  version: z.number().int(),
})

export type SetProductCategoryStatusBody = z.infer<
  typeof SetProductCategoryStatusRequest
>

/**
 * Renomear: um `update` só, porque o produto aponta por `id`.
 */
export const RenameProductCategoryRequest = z.object({
  name: CreateProductCategoryRequest.shape.name,
  version: z.number().int(),
})

export type RenameProductCategoryBody = z.infer<
  typeof RenameProductCategoryRequest
>

/**
 * Marcar de uma vez os produtos que já existem, pelo começo do nome (F163).
 *
 * Na Elite Digital o nome carrega a família desde o sistema antigo: `f.` é
 * tela, `bat.` é bateria. Em vez de 1.205 cliques, a loja descreve as regras e
 * vê a prévia — `dryRun` — antes de gravar.
 *
 * Só toca em produto SEM categoria: a marcação feita à mão vale mais que uma
 * regra de prefixo, e uma segunda passada não pode desfazer a correção que
 * alguém fez ontem.
 */
export const CategorizeByNameRequest = z.object({
  rules: z
    .array(
      z.object({
        prefix: z.string().trim().min(1, 'Escreva o começo do nome.').max(60),
        categoryId: z.string().min(1),
      })
    )
    .min(1)
    .max(20),
  /** Só conta, não grava. É o que a tela chama de prévia. */
  dryRun: z.boolean().default(false),
})

export type CategorizeByNameBody = z.input<typeof CategorizeByNameRequest>

export const CategorizeByNameResponse = z.object({
  rules: z.array(
    z.object({
      prefix: z.string(),
      categoryId: z.string(),
      categoryName: z.string(),
      /** Quantos produtos sem categoria começam com este prefixo. */
      matched: z.number().int().nonnegative(),
    })
  ),
  /** Quantos produtos continuam sem categoria depois destas regras. */
  remaining: z.number().int().nonnegative(),
  /** Quantos foram gravados — zero na prévia. */
  updated: z.number().int().nonnegative(),
})

export type CategorizeByNameResponseType = z.infer<
  typeof CategorizeByNameResponse
>
