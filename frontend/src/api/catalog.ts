import type { z } from 'zod'

import {
  CreateProductRequest,
  ProductList,
  ProductResponse,
  UpdateProductRequest,
} from '@/contracts/aeris/catalog.ts'
import {
  ProductCategoryListResponse,
  ProductCategorySummary,
} from '@/contracts/aeris/product-category.ts'
import { qs, request } from '@/lib/http'

/**
 * `/api/v1/catalog` — a tabela de produtos da 4Play no Aeris.
 *
 * Cada produto tem pelo menos uma variante (no Aeris, a "cor"); estoque e
 * preço moram nela. Cadastrar e mexer é de dono, admin e gerente
 * (`catalog.write`); todo mundo vê.
 */

export type Product = z.infer<typeof ProductList>['items'][number]
export type ProductDetail = z.infer<typeof ProductResponse>['product']
export type Category = z.infer<typeof ProductCategorySummary>

export const listProducts = async (
  query: {
    search?: string
    categoryId?: string
    status?: 'active' | 'archived'
    page?: number
    pageSize?: number
    sort?: 'name' | 'basePrice' | 'onHand' | 'updatedAt'
    direction?: 'asc' | 'desc'
  },
  signal?: AbortSignal
) => ProductList.parse(
    await request(`/api/v1/catalog/products${qs({ ...query, include: 'price,stock,cost' })}`, { signal })
  )

export const createProductFull = async (input: z.input<typeof CreateProductRequest>): Promise<ProductDetail> =>
  ProductResponse.parse(
    await request('/api/v1/catalog/products', { method: 'POST', body: CreateProductRequest.parse(input) })
  ).product

export const updateProduct = async (
  id: string,
  input: z.input<typeof UpdateProductRequest>
): Promise<ProductDetail> =>
  ProductResponse.parse(
    await request(`/api/v1/catalog/products/${id}`, { method: 'PATCH', body: UpdateProductRequest.parse(input) })
  ).product

export const setProductArchived = async (id: string, version: number, archived: boolean) =>
  ProductResponse.parse(
    await request(`/api/v1/catalog/products/${id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
      body: { version },
    })
  ).product

export const listCategories = async (signal?: AbortSignal): Promise<Category[]> =>
  ProductCategoryListResponse.parse(
    await request(`/api/v1/product-categories${qs({ status: 'active' })}`, { signal })
  ).categories

export const createCategory = async (name: string): Promise<Category> =>
  ProductCategorySummary.parse(await request('/api/v1/product-categories', { method: 'POST', body: { name } }))

/*
 * Importar a planilha de produtos (.xlsx).
 *
 * O Aeris reconhece a planilha pelos títulos das colunas: `Descrição` e
 * `Preço Venda` (obrigatórios), `Preço Custo` e `Código` (opcionais). Sem
 * código, a descrição é a identidade: mandar a mesma planilha de novo atualiza
 * os preços em vez de duplicar. Primeiro a prévia, depois a gravação — numa
 * transação só.
 */

export type ImportPreview = {
  profile: { id: string; label: string }
  fileName: string
  rowCount: number
  header: string[]
  identity: 'code' | 'description'
  hasCost: boolean
  counts: { create: number; update: number; replace: number; review: number; skip: number }
  problems: { problem: string; count: number; sample: string[] }[]
  sample: {
    line: number
    externalCode: string
    description: string
    unitPrice: string | null
    cost: string | null
    action: string
    problem: string | null
  }[]
  review: { line: number; description: string; previousDescription: string | null; similarity: number }[]
}

export type ImportResult = {
  created: number
  updated: number
  replaced: number
  priced: number
  costed: number
  skipped: number
  unanswered: number
  problems: { problem: string; count: number }[]
}

export const previewImport = async (file: File): Promise<ImportPreview> => {
  const form = new FormData()
  form.append('file', file)
  return (await request('/api/v1/import/products/preview', { method: 'POST', body: form })) as ImportPreview
}

export const applyImport = async (file: File, reviewLines: number[]): Promise<ImportResult> => {
  const form = new FormData()
  form.append('file', file)
  // Linha "parecida com um produto que já existe": por padrão é o mesmo
  // produto com o nome corrigido (atualiza), não um produto novo.
  form.append(
    'decisions',
    JSON.stringify({ treatAsReused: [], treatAsEdited: reviewLines, priceListId: null, awaitingStock: false })
  )
  return (await request('/api/v1/import/products/apply', { method: 'POST', body: form })) as ImportResult
}
