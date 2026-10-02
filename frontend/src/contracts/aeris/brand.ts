import { z } from 'zod'

/**
 * O cadastro de marcas — F158, migração 0085.
 *
 * Vocabulário controlado, como as etiquetas da F088: a loja diz quais marcas
 * existem, e o formulário de produto passa a ESCOLHER em vez de digitar.
 *
 * `product.brand` continua sendo texto no banco, e continua sendo uma `string`
 * neste contrato (`CreateProductRequest.brand`). O que mudou não é o formato do
 * campo — é quem pode escrever nele: a rota de produto recusa 422
 * `brand_not_registered` uma marca que não esteja aqui.
 */

export const BrandStatusSchema = z.enum(['active', 'archived'])

export const BrandSummary = z.object({
  id: z.string(),
  name: z.string(),
  status: BrandStatusSchema,
  /**
   * Quantos produtos usam esta marca hoje.
   *
   * Está na resposta para que arquivar não seja uma decisão às cegas, e para
   * que a tela consiga responder a pergunta que vem antes do relatório: onde
   * está a marca que falta.
   */
  usageCount: z.number().int(),
  version: z.number().int(),
})

export type BrandSummaryType = z.infer<typeof BrandSummary>

export const BrandListQuery = z.object({
  status: BrandStatusSchema.optional(),
})

export const BrandListResponse = z.object({
  brands: z.array(BrandSummary),
})

export type BrandListResponseType = z.infer<typeof BrandListResponse>

export const CreateBrandRequest = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Dê um nome à marca.')
    // O mesmo teto de `product.brand`: os dois guardam a mesma coisa, e um
    // limite maior aqui criaria marcas que nenhum produto consegue receber.
    .max(120, 'Use no máximo 120 caracteres.'),
})

export type CreateBrandBody = z.infer<typeof CreateBrandRequest>

/**
 * Arquivar e desarquivar pela mesma rota, com o estado desejado no corpo.
 *
 * **Os produtos não são tocados.** Arquivar é "pare de oferecer isto no
 * seletor", não "estes 271 produtos perderam a marca" — e salvar um desses
 * produtos continua funcionando, porque a validação só exige marca ativa quando
 * o valor muda.
 *
 * **Não existe renomear**, e a ausência é deliberada: renomear sem reescrever
 * `product.brand` recriaria o buraco que este cadastro fecha. Ver `brand.ts` no
 * repositório.
 */
export const SetBrandStatusRequest = z.object({
  status: BrandStatusSchema,
  version: z.number().int(),
})

export type SetBrandStatusBody = z.infer<typeof SetBrandStatusRequest>

/**
 * Renomear uma marca — e, se o nome novo já existe, juntar as duas (F160).
 *
 * O mesmo nome de `CreateBrandRequest`: o mesmo teto, a mesma recusa de vazio.
 */
export const RenameBrandRequest = z.object({
  name: CreateBrandRequest.shape.name,
  version: z.number().int(),
})

export type RenameBrandBody = z.infer<typeof RenameBrandRequest>

export const RenameBrandResponse = z.object({
  brand: BrandSummary,
  /** O nome de antes — a tela diz "Maxter pro virou Maxter Pro". */
  previousName: z.string(),
  /** O nome novo já era outra marca: as duas viraram uma. */
  merged: z.boolean(),
  /** Quantos produtos passaram a ter o nome novo. */
  productsMoved: z.number().int().nonnegative(),
})

export type RenameBrandResponse = z.infer<typeof RenameBrandResponse>
