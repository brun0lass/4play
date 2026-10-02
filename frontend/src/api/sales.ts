import { z } from 'zod'

import { ProductList, ProductResponse } from '@/contracts/aeris/catalog.ts'
import { PartyResponse, type CreatePartyRequest } from '@/contracts/aeris/party.ts'
import {
  CreateSalesDocumentRequest,
  SalesDocumentResponse,
  TransitionSalesDocumentRequest,
} from '@/contracts/aeris/sales.ts'
import { qs, request } from '@/lib/http'

/**
 * O que a 4Play cria no dia: cliente, produto e pedido.
 *
 * No Aeris o pedido de uniforme É um pedido de venda (`kind: 'order'`). Ele
 * nasce rascunho e entra na fila de produção quando é confirmado — e o Aeris
 * só confirma um pedido que tenha pelo menos um item.
 */

export type ProductPage = z.infer<typeof ProductList>
export type Product = ProductPage['items'][number]
export type Party = z.infer<typeof PartyResponse>['party']
export type SalesDocument = z.infer<typeof SalesDocumentResponse>['document']

export const searchProducts = async (search: string, signal?: AbortSignal): Promise<ProductPage> =>
  ProductList.parse(
    await request(
      `/api/v1/catalog/products${qs({ search: search || undefined, status: 'active', pageSize: 20, include: 'price' })}`,
      { signal }
    )
  )

export const createProduct = async (input: { name: string; salePrice: string }): Promise<Product> =>
  ProductResponse.parse(
    await request('/api/v1/catalog/products', {
      method: 'POST',
      body: { name: input.name, salePrice: input.salePrice, unit: 'UN', tracksStock: false },
    })
  ).product

export const createCustomer = async (input: CreatePartyRequest): Promise<Party> =>
  PartyResponse.parse(await request('/api/v1/parties/', { method: 'POST', body: input })).party

export type OrderLineInput = {
  variantId: string
  description: string
  unit: string
  unitPrice: string
  quantity: string
}

export const createOrder = async (input: {
  id: string
  customerPartyId: string
  salespersonUserId: string | null
  notes: string | null
  lines: OrderLineInput[]
}): Promise<SalesDocument> =>
  SalesDocumentResponse.parse(
    await request('/api/v1/sales/documents', {
      method: 'POST',
      body: CreateSalesDocumentRequest.parse({
        id: input.id,
        kind: 'order',
        customerPartyId: input.customerPartyId,
        salespersonUserId: input.salespersonUserId,
        notes: input.notes,
        lines: input.lines.map((line) => ({ ...line, priceBasis: 'manual' })),
      }),
    })
  ).document

export const confirmOrder = async (id: string, version: number): Promise<SalesDocument> =>
  SalesDocumentResponse.parse(
    await request(`/api/v1/sales/documents/${id}/transitions`, {
      method: 'POST',
      body: TransitionSalesDocumentRequest.parse({ version, to: 'confirmed' }),
    })
  ).document

/** UUIDv7: o Aeris aceita o id do pedido gerado na tela (o duplo clique não cria dois). */
export const uuidv7 = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const now = BigInt(Date.now())
  for (let i = 0; i < 6; i += 1) bytes[i] = Number((now >> BigInt(8 * (5 - i))) & 0xffn)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/*
 * O detalhe de um pedido de venda — os itens ("29 camisas a R$ 45") e o
 * contato do cliente. A planilha pede isso para muitos pedidos de uma vez,
 * então as chamadas passam por uma fila de 4 por vez: o Aeris tem limite de
 * requisições, e 150 pedidos ao mesmo tempo seria pedir para ser barrado.
 */
let running = 0
const waiting: (() => void)[] = []
const slot = async <T>(task: () => Promise<T>): Promise<T> => {
  if (running >= 4) await new Promise<void>((resolve) => waiting.push(resolve))
  running += 1
  try {
    return await task()
  } finally {
    running -= 1
    waiting.shift()?.()
  }
}

export const fetchSalesDocument = async (id: string, signal?: AbortSignal): Promise<SalesDocument> =>
  slot(async () =>
    SalesDocumentResponse.parse(await request(`/api/v1/sales/documents/${id}`, { signal })).document
  )
