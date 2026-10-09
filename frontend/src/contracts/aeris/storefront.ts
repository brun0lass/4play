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

/** Reais em texto, até seis casas — "19.90" (F247). Vírgula não: o site manda ponto. */
const StorefrontPriceSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, 'O preço deve ser um número, como 19.90')

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
  /**
   * A ordem (F247: o preço). Com estoque continua vindo primeiro; a ordem vale
   * dentro de cada metade, como o site sempre mostrou.
   */
  ordenar: z.enum(['az', 'za', 'preco_asc', 'preco_desc']).default('az'),
  /**
   * A faixa de preço, em reais (F247), na tabela padrão da loja — a mesma do
   * preço que a loja mostra. Texto decimal, nunca float: "19.90".
   */
  precoMin: StorefrontPriceSchema.optional(),
  precoMax: StorefrontPriceSchema.optional(),
})

export const StorefrontProduct = z.object({
  id: z.string(),
  /** O código da cor padrão — o que o vendedor procura no balcão. */
  codigoProduto: z.string(),
  nome: z.string(),
  descricao: z.string().nullable(),
  /** A categoria de cima; com subcategoria, a filha vem em `subcategoria` (F243). */
  categoria: z.string().nullable(),
  subcategoria: z.string().nullable().default(null),
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

const StorefrontCategory = z.object({
  id: z.string(),
  nome: z.string(),
  produtos: z.number().int(),
})

/**
 * A árvore do menu (F243): as categorias de cima, cada uma com as filhas.
 * A contagem da de cima inclui as filhas, e `?categoria=<id da de cima>` as
 * traz também. Categoria sem produto ativo não vem.
 */
export const StorefrontCategoriesResponse = z.object({
  data: z.array(
    StorefrontCategory.extend({
      subcategorias: z.array(StorefrontCategory).default([]),
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

// ---------------------------------------------------------------------------
// O pedido da loja — F224
// ---------------------------------------------------------------------------

/** As vendedoras da loja, com a que já atende este cliente marcada. */
export const StorefrontSellersResponse = z.object({
  vendedores: z.array(
    z.object({
      id: z.string(),
      nome: z.string(),
      /** Só dígitos, com o 55, como o `wa.me` pede. */
      telefones: z.array(z.string()),
    })
  ),
  /** A vendedora que vem marcada; nula é ninguém marcado. */
  sugerido: z.string().nullable(),
})

export type StorefrontSellersResponse = z.infer<
  typeof StorefrontSellersResponse
>

/**
 * O carrinho que vira pedido.
 *
 * Só o código e a quantidade: o nome e o preço saem do servidor, da tabela da
 * loja — o site não diz quanto custa. `chave` é a do carrinho: o mesmo clique
 * mandado duas vezes é o mesmo pedido.
 */
export const StorefrontPlaceOrderRequest = z.object({
  chave: z.uuid(),
  vendedorId: z.uuid(),
  itens: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(60),
        quantidade: z.number().int().min(1).max(9999),
      })
    )
    .min(1)
    .max(100),
  observacao: z.string().trim().max(500).optional(),
})

export type StorefrontPlaceOrderRequest = z.infer<
  typeof StorefrontPlaceOrderRequest
>

/**
 * Onde o pedido está, nas palavras do cliente. Vem do pedido da loja e do
 * pedido de venda que a aprovação criou (a saída com o motoboy, a entrega).
 */
export const StorefrontOrderSituation = z.enum([
  'aguardando',
  'aprovado',
  'saiu_para_entrega',
  'entregue',
  'recusado',
  'cancelado',
])

export type StorefrontOrderSituation = z.infer<typeof StorefrontOrderSituation>

export const StorefrontOrder = z.object({
  id: z.string(),
  numero: z.number().int(),
  situacao: StorefrontOrderSituation,
  /** Aprovado com menos do que o pedido (uma linha a menos, ou menos peças). */
  parcial: z.boolean(),
  vendedor: z.object({ nome: z.string() }).nullable(),
  total: z.string(),
  totalAprovado: z.string().nullable(),
  motivoRecusa: z.string().nullable(),
  observacao: z.string().nullable(),
  criadoEm: z.string(),
  decididoEm: z.string().nullable(),
  itens: z.array(
    z.object({
      codigo: z.string(),
      nome: z.string(),
      unidade: z.string(),
      quantidade: z.string(),
      quantidadeAprovada: z.string().nullable(),
      preco: z.string(),
    })
  ),
})

export type StorefrontOrder = z.infer<typeof StorefrontOrder>

/** O pedido gravado, e o WhatsApp da vendedora com o texto pronto. */
export const StorefrontPlaceOrderResponse = z.object({
  pedido: StorefrontOrder,
  whatsapp: z.string(),
  texto: z.string(),
})

export type StorefrontPlaceOrderResponse = z.infer<
  typeof StorefrontPlaceOrderResponse
>

export const StorefrontOrdersResponse = z.object({
  data: z.array(StorefrontOrder),
})

export const StorefrontOrderResponse = z.object({ data: StorefrontOrder })

export const StorefrontOrderParams = StorefrontSlugParams.extend({
  numero: z.coerce.number().int().min(1).max(10_000_000),
})

/** A fila da vendedora no Aeris: `/storefront-orders` (F224). */
export const StoreOrderStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'cancelled',
])

export const StoreOrderSummary = z.object({
  id: z.string(),
  number: z.number().int(),
  status: StoreOrderStatusSchema,
  customerName: z.string(),
  customerCode: z.string().nullable(),
  sellerUserId: z.string().nullable(),
  sellerName: z.string().nullable(),
  totalAmount: z.string(),
  approvedAmount: z.string().nullable(),
  rejectReason: z.string().nullable(),
  note: z.string().nullable(),
  salesDocumentId: z.string().nullable(),
  /** O número do pedido de venda criado — o que Vendas mostra (F248). */
  salesDocumentNumber: z.number().int().nullable().default(null),
  /** O telefone do cliente, para a vendedora chamar quando o aviso não sai (F248). */
  customerPhone: z.string().nullable().default(null),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  customerNotifiedAt: z.string().nullable(),
  notifySkipReason: z.string().nullable(),
  version: z.number().int(),
  lines: z.array(
    z.object({
      id: z.string(),
      lineNumber: z.number().int(),
      code: z.string(),
      description: z.string(),
      unit: z.string(),
      quantity: z.string(),
      approvedQuantity: z.string().nullable(),
      /** O preço que o cliente viu. */
      unitPrice: z.string(),
      /** O disponível agora na filial da loja; nulo é "nunca se moveu". */
      available: z.string().nullable(),
    })
  ),
})

export type StoreOrderSummary = z.infer<typeof StoreOrderSummary>

export const StoreOrderListQuery = z.object({
  state: z.enum(['pending', 'decided']).default('pending'),
  /** Só os da vendedora logada. */
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export const StoreOrderListResponse = z.object({
  orders: z.array(StoreOrderSummary),
})

export type StoreOrderListResponse = z.infer<typeof StoreOrderListResponse>

export const StoreOrderResponse = z.object({ order: StoreOrderSummary })

export type StoreOrderResponse = z.infer<typeof StoreOrderResponse>

export const StoreOrderPendingCountResponse = z.object({
  pending: z.number().int().nonnegative(),
  mine: z.number().int().nonnegative(),
})

export type StoreOrderPendingCountResponse = z.infer<
  typeof StoreOrderPendingCountResponse
>

const QUANTITY = /^\d{1,12}(\.\d{1,6})?$/

/**
 * Aprovar, linha a linha: a quantidade que vai (zero tira a linha; menos que
 * o pedido é o aceite parcial). Com a versão que a vendedora leu.
 */
export const ApproveStoreOrderRequest = z.object({
  version: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        quantity: z.string().trim().regex(QUANTITY, 'Quantidade inválida'),
      })
    )
    .min(1)
    .max(100),
})

export type ApproveStoreOrderRequest = z.infer<typeof ApproveStoreOrderRequest>

export const RejectStoreOrderRequest = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
})

export type RejectStoreOrderRequest = z.infer<typeof RejectStoreOrderRequest>

// ---------------------------------------------------------------------------
// As métricas da loja — F226
// ---------------------------------------------------------------------------

/**
 * Um lote do que aconteceu no site. Vai como TEXTO (`text/plain`, com o JSON
 * dentro) e com o token NO CORPO: assim o navegador manda direto, sem a
 * pergunta de permissão (preflight) do CORS, e o `sendBeacon` da saída da
 * página também consegue mandar. O cliente vem do token, nunca do corpo.
 */
export const StorefrontEventsBody = z.object({
  token: z.string().max(200).optional(),
  /** A sessão do navegador (o `_sid` do site): conta visitantes. */
  sessao: z.string().trim().min(8).max(64),
  eventos: z
    .array(
      z.object({
        tipo: z.enum([
          'visit',
          'page_view',
          'category',
          'product_view',
          'add_to_cart',
          'checkout_start',
        ]),
        caminho: z.string().max(200).optional(),
        termo: z.string().trim().max(120).optional(),
        codigo: z.string().trim().max(60).optional(),
        quantidade: z.number().int().min(1).max(9999).optional(),
      })
    )
    .min(1)
    .max(25),
})

export type StorefrontEventsBody = z.infer<typeof StorefrontEventsBody>

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** O período da aba Métricas, em dias de São Paulo (até 92). */
export const StorefrontMetricsQuery = z.object({
  from: z.string().regex(DAY),
  to: z.string().regex(DAY),
})

const ProductCountSchema = z.object({
  code: z.string(),
  name: z.string().nullable(),
  count: z.number().int(),
  quantity: z.number().int(),
})

export const StorefrontMetricsResponse = z.object({
  from: z.string(),
  to: z.string(),
  visitors: z.number().int(),
  pageViews: z.number().int(),
  logins: z.number().int(),
  customersIn: z.number().int(),
  refusedLogins: z.array(
    z.object({
      phone: z.string(),
      attempts: z.number().int(),
      lastAt: z.string(),
    })
  ),
  searches: z.number().int(),
  topTerms: z.array(
    z.object({
      term: z.string(),
      count: z.number().int(),
      results: z.number().int(),
    })
  ),
  zeroResultTerms: z.array(
    z.object({ term: z.string(), count: z.number().int(), lastAt: z.string() })
  ),
  topViewed: z.array(ProductCountSchema),
  topAdded: z.array(ProductCountSchema),
  checkoutStarts: z.number().int(),
  orders: z.object({
    placed: z.number().int(),
    approved: z.number().int(),
    rejected: z.number().int(),
    cancelled: z.number().int(),
    pending: z.number().int(),
    placedAmount: z.string(),
    approvedAmount: z.string(),
  }),
  bySeller: z.array(
    z.object({
      sellerName: z.string().nullable(),
      placed: z.number().int(),
      approved: z.number().int(),
      approvedAmount: z.string(),
    })
  ),
  customers: z.array(
    z.object({
      partyId: z.string(),
      name: z.string(),
      code: z.string().nullable(),
      logins: z.number().int(),
      lastSeenAt: z.string().nullable(),
      searches: z.number().int(),
      addedToCart: z.number().int(),
      orders: z.number().int(),
      ordersAmount: z.string(),
    })
  ),
})

export type StorefrontMetricsResponse = z.infer<
  typeof StorefrontMetricsResponse
>
