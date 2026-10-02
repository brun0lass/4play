import { z } from 'zod'

/**
 * Sales channel contracts (Master Specification section 23).
 *
 * Every quantity and price on this wire is a STRING, for the reason spelled out
 * in `cash.ts`: a JSON number is an IEEE-754 double, so `JSON.parse` rounds it
 * before any code of ours runs.
 *
 * Note what is NOT in any response here: a stored published quantity. The
 * figure a channel should be showing is derived on request by
 * `publishableQuantity` in @aeris/channels, and `ChannelPublishResponse` is the
 * shape that derivation comes back in — with its reasons, so a shopkeeper
 * asking "why does the site say I have two?" gets an answer rather than a
 * number.
 */

export const CHANNEL_KIND_VALUES = [
  'mercado_livre',
  'shopee',
  'ecommerce',
  'bling',
  'other',
] as const

export const ChannelKindSchema = z.enum(CHANNEL_KIND_VALUES)
export const ChannelStatusSchema = z.enum(['active', 'paused', 'archived'])
export const ListingStatusSchema = z.enum([
  'draft',
  'published',
  'paused',
  'unlisted',
])

/** Six decimal places: a quantity, not money on a document (QUANTITY_SCALE). */
const QUANTITY_PATTERN = /^\d{1,14}(\.\d{1,6})?$/

const quantityField = (message: string) =>
  z.string().trim().regex(QUANTITY_PATTERN, message)

/** Um percentual na fiação: string, seis casas, como todo decimal aqui. */
const PERCENT_PATTERN = /^\d{1,4}(\.\d{1,6})?$/

const percentField = (message: string) =>
  z.string().trim().regex(PERCENT_PATTERN, message)

export const PRICE_ROUNDING_VALUES = [
  'cent',
  'tenth',
  'unit',
  'ninety',
] as const

/**
 * Como o preço de um anúncio deste canal sai do preço de balcão (F110).
 *
 * O pedido do dono: o preço do anúncio já com as taxas dentro, e uma margem
 * mínima sobre o custo médio como trava. Os números ficam aqui; a conta fica em
 * `listingPrice`, em @aeris/channels, para que a tela e o servidor não possam
 * discordar sobre quanto custa vender.
 *
 * Os padrões repetem os da migração 0058 de propósito: quem cria um canal pela
 * API sem mandar a política recebe o mesmo canal que quem cria pelo formulário.
 */
export const ChannelPricingPolicySchema = z.object({
  /** De qual lista sai o preço de balcão. Nulo = a lista padrão da conta. */
  priceListId: z.uuid().nullable().default(null),
  minMarginPercent: percentField('A margem mínima deve ser um número.').default(
    '10'
  ),
  passFixedFee: z.boolean().default(true),
  /** 100 = o preço cobre o frete inteiro; 50 = a loja racha; 0 = absorve. */
  shippingSharePercent: percentField(
    'A parte do frete deve ser um número.'
  ).default('100'),
  rounding: z.enum(PRICE_ROUNDING_VALUES).default('cent'),
  defaultWarrantyMonths: z.coerce.number().int().min(0).max(120).default(3),
  allowWithoutCost: z.boolean().default(true),
  trustAiResearch: z.boolean().default(false),
})

export const READINESS_STATE_VALUES = [
  'publishable',
  'needs_review',
  'blocked',
] as const

/**
 * Por que este anúncio ainda não pode ir ao ar sozinho.
 *
 * `blocking` separa as duas filas que não podem se misturar: o que uma pessoa
 * resolve aprovando, e o que ela resolve consertando o produto. `message` é
 * uma frase e não um código, porque quem lê é quem vai consertar.
 */
export const ReadinessReasonSchema = z.object({
  code: z.string(),
  field: z.string().nullable(),
  provenance: z.string().nullable(),
  blocking: z.boolean(),
  message: z.string(),
})

export const SalesChannelSummary = z.object({
  id: z.string(),
  companyId: z.string(),
  kind: ChannelKindSchema,
  code: z.string(),
  name: z.string(),
  status: ChannelStatusSchema,
  branchIds: z.array(z.string()),
  stockBuffer: z.string(),
  maxPublishedQuantity: z.string().nullable(),
  staleAfterHours: z.number().int(),
  autoAcceptOrders: z.boolean(),
  reserveStockAt: z.enum(['order', 'dispatch']),
  fulfilmentPolicy: z.enum(['nearest', 'single']),
  pricing: ChannelPricingPolicySchema,
  version: z.number().int(),
})

export const SalesChannelListResponse = z.object({
  channels: z.array(SalesChannelSummary),
})

export const SalesChannelCreate = z.object({
  companyId: z.uuid(),
  kind: ChannelKindSchema,
  code: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  /**
   * Empty is allowed and means the channel publishes nothing.
   *
   * Refusing an empty list here would push shops to tick a branch they did not
   * mean, and "publishes nothing" is a legible state — the screen says so.
   * What must never happen is empty being read as "all", which is why the rule
   * lives in `publishableQuantity` rather than in a default here.
   */
  branchIds: z.array(z.uuid()).default([]),
  stockBuffer: quantityField('O buffer deve ser um número.').default('0'),
  maxPublishedQuantity: quantityField('O teto deve ser um número.')
    .nullable()
    .default(null),
  staleAfterHours: z.coerce.number().int().min(0).max(8760).default(6),

  /**
   * The product owner's three answers, 2026-08-12.
   *
   * `autoAcceptOrders` starts FALSE: a freshly connected channel that began
   * writing sales by itself would be doing it against a mapping nobody has
   * checked, and the first sign would be the wrong product leaving the shop.
   */
  autoAcceptOrders: z.boolean().default(false),
  reserveStockAt: z.enum(['order', 'dispatch']).default('order'),
  fulfilmentPolicy: z.enum(['nearest', 'single']).default('nearest'),

  /**
   * A política de preço, inteira ou nenhuma.
   *
   * `prefault` e não `default`: um corpo que não menciona preço nenhum recebe
   * os padrões, campo a campo, em vez de ser recusado por faltar um objeto que
   * ninguém sabia que existia. É o que mantém compatível todo cliente que
   * criava canal antes desta feature.
   */
  pricing: ChannelPricingPolicySchema.prefault({}),
})

export const SalesChannelUpdate = SalesChannelCreate.omit({
  companyId: true,
  kind: true,
  code: true,
}).extend({
  status: ChannelStatusSchema,
  version: z.number().int().min(1),
})

/**
 * Um atributo do anúncio, com a chave DO CANAL.
 *
 * `BRAND`, `MODEL` — não "marca" e "modelo". O produto guarda as chaves do
 * Aeris em `product_attribute`; isto guarda o que o marketplace chama delas.
 */
export const ListingAttributeSchema = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(255),
  /** De onde veio o valor. Ausente é "origem desconhecida", nunca confiável. */
  source: z.string().nullable(),
})

export const ChannelListingSummary = z.object({
  id: z.string(),
  channelId: z.string(),
  variantId: z.string(),
  productId: z.string(),
  /** Com a cor (F176): "Capa iPhone — Azul". */
  productName: z.string(),
  sku: z.string(),
  /** Nulo num rascunho, que ainda não tem número no marketplace (F110). */
  externalId: z.string().nullable(),
  /** A variação dentro do anúncio (F177). Nula: o anúncio inteiro. */
  externalVariationId: z.string().nullable(),
  externalSku: z.string().nullable(),
  status: ListingStatusSchema,
  price: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  /**
   * Derivada a cada leitura, nunca gravada.
   *
   * Depende do custo médio (que a compra reescreve), das fotos, da lista de
   * preço e da cotação do canal — quatro coisas que mudam sem passar por
   * aqui. Gravada, ela mentiria em silêncio; é a mesma decisão da ADR-0025
   * sobre a quantidade publicável.
   */
  /* ---- o que o canal pediu, guardado no anúncio (F111) ---- */

  /** O título no canal. Nulo = usar o nome do produto. */
  title: z.string().nullable(),
  /** Opacos: só o adaptador do canal sabe o que significam (ADR-0025). */
  categoryRef: z.string().nullable(),
  categoryLabel: z.string().nullable(),
  listingType: z.string().nullable(),
  attributes: z.array(ListingAttributeSchema),

  readiness: z.enum(READINESS_STATE_VALUES),
  readinessReasons: z.array(ReadinessReasonSchema),
  version: z.number().int(),
})

export const ChannelListingListResponse = z.object({
  listings: z.array(ChannelListingSummary),
})

/* -------------------------------------------------------------------------
 * A ficha do anúncio (F111)
 * ---------------------------------------------------------------------- */

export const CategorySuggestionSchema = z.object({
  ref: z.string(),
  label: z.string(),
  /** O caminho até a raiz, porque marketplaces têm categorias homônimas. */
  path: z.array(z.string()),
})

export const CategorySuggestionList = z.object({
  suggestions: z.array(CategorySuggestionSchema),
})

export const AttributeSpecSchema = z.object({
  id: z.string(),
  label: z.string(),
  required: z.boolean(),
  catalogRequired: z.boolean(),
  valueType: z.enum(['string', 'number', 'number_unit', 'boolean', 'list']),
  allowedValues: z.array(z.string()),
  maxLength: z.number().int().nullable(),
  units: z.array(z.string()),
  defaultUnit: z.string().nullable(),
  hint: z.string().nullable(),
})

export const CategorySpecResponse = z.object({
  ref: z.string(),
  label: z.string(),
  path: z.array(z.string()),
  listingAllowed: z.boolean(),
  maxTitleLength: z.number().int(),
  maxDescriptionLength: z.number().int(),
  maxPictures: z.number().int(),
  conditions: z.array(z.string()),
  attributes: z.array(AttributeSpecSchema),
})

/**
 * A ficha do anúncio, salva inteira.
 *
 * Inteira e não campo a campo: é um formulário, e um `undefined` que
 * significasse "não mexi" daria dois jeitos de apagar uma categoria, um deles
 * invisível na chamada.
 */
export const ChannelListingDraftUpdate = z.object({
  title: z.string().trim().min(1).max(200).nullable().default(null),
  categoryRef: z.string().trim().max(120).nullable().default(null),
  categoryLabel: z.string().trim().max(200).nullable().default(null),
  listingType: z.string().trim().max(60).nullable().default(null),
  attributes: z.array(ListingAttributeSchema.omit({ source: true })).max(120),
  version: z.number().int().min(1),
})

/**
 * A conta do preço do anúncio, inteira.
 *
 * Inclui as faixas que NÃO venceram, porque "por que este anúncio está a
 * R$ 108,03?" só tem resposta com elas: a faixa de baixo se contradiz, e é isso
 * que a tela precisa mostrar.
 */
export const PriceBandSchema = z.object({
  label: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  commissionPercent: z.string(),
  fixedFee: z.string(),
  sellerShippingCost: z.string(),
  /** O preço que esta faixa produziria. */
  price: z.string(),
  /** O que sobraria da venda a esse preço. */
  net: z.string(),
  /** Falso quando o preço calculado cai fora da própria faixa. */
  consistent: z.boolean(),
  chosen: z.boolean(),
})

export const ListingPriceResponse = z.object({
  ok: z.boolean(),
  /** `margin_below_minimum`, `no_cost`, `no_base_price`, `no_consistent_band`. */
  reason: z.string().nullable(),
  message: z.string().nullable(),
  price: z.string().nullable(),
  basePrice: z.string().nullable(),
  commission: z.string().nullable(),
  fixedFee: z.string().nullable(),
  sellerShipping: z.string().nullable(),
  passedThrough: z.string().nullable(),
  net: z.string().nullable(),
  averageCost: z.string().nullable(),
  requiredNet: z.string().nullable(),
  marginPercent: z.string().nullable(),
  /** O preço foi empurrado até o piso de uma faixa, por não haver consistente. */
  pinnedToBand: z.boolean(),
  bands: z.array(PriceBandSchema),
  /** Quando o canal foi cotado, porque o custo do frete envelhece. */
  quotedAt: z.string(),
  feeSource: z.string(),
})

export const ChannelListingCreate = z.object({
  variantId: z.uuid(),
  /**
   * O que o marketplace chama disto: `MLB1234567890`, um item_id, um slug.
   *
   * Nulo cria um RASCUNHO: o produto entra no canal com preço e prontidão, e o
   * número chega quando o anúncio for de fato criado lá fora. Era obrigatório
   * enquanto ligar um produto significava alguém digitar um id que já existia.
   */
  externalId: z.string().trim().min(1).max(120).nullable().default(null),
  /**
   * A variação dentro do anúncio (F177): a cor num anúncio antigo do Mercado
   * Livre, em que um MLB só tem várias cores. Exige `externalId`.
   */
  externalVariationId: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .nullable()
    .default(null),
  externalSku: z.string().trim().max(120).nullable().default(null),
  price: quantityField('O preço deve ser um número.').nullable().default(null),
  status: ListingStatusSchema.default('draft'),
})

/**
 * As variações de um anúncio que já existe no canal (F177), com a cor do
 * produto que parece ser cada uma.
 *
 * A sugestão é só sugestão: casa pelo código do vendedor, pelo código de
 * barras ou pelo nome da cor, e a pessoa confirma antes de vincular.
 */
export const ItemVariationSummary = z.object({
  id: z.string(),
  label: z.string(),
  sellerSku: z.string().nullable(),
  gtin: z.string().nullable(),
  availableQuantity: z.number().int(),
  /** A cor do produto pedido que casa com esta variação, se alguma casa. */
  suggestedVariantId: z.string().nullable(),
  /** Já vinculada neste canal a esta cor, ou nulo. */
  linkedVariantId: z.string().nullable(),
})

export const ItemVariationListResponse = z.object({
  variations: z.array(ItemVariationSummary),
})

export type ItemVariationList = z.infer<typeof ItemVariationListResponse>

export const ChannelListingStatusUpdate = z.object({
  status: ListingStatusSchema,
  version: z.number().int().min(1),
})

/**
 * What a channel may promise for one variant, and what decided it.
 *
 * `limitedBy` is the field that makes this worth an endpoint rather than a
 * number: "sold out" and "the buffer ate it" look identical on a marketplace
 * and have opposite fixes — order more, or lower the buffer.
 */
export const ChannelPublishResponse = z.object({
  quantity: z.string(),
  counted: z.string(),
  staleBranchIds: z.array(z.string()),
  ignoredBranchIds: z.array(z.string()),
  limitedBy: z.enum(['stock', 'buffer', 'ceiling', 'no-branches']),
})

export type ChannelPricingPolicyBody = z.infer<
  typeof ChannelPricingPolicySchema
>
export type ChannelListingDraftBody = z.infer<typeof ChannelListingDraftUpdate>
export type SalesChannelBody = z.infer<typeof SalesChannelCreate>
export type SalesChannelUpdateBody = z.infer<typeof SalesChannelUpdate>
export type ChannelListingBody = z.infer<typeof ChannelListingCreate>
export type ChannelListingStatusBody = z.infer<
  typeof ChannelListingStatusUpdate
>

/* -------------------------------------------------------------------------
 * The marketplace inbox
 * ---------------------------------------------------------------------- */

export const ChannelOrderStatusSchema = z.enum([
  'pending',
  'accepted',
  'failed',
  'ignored',
])

export const ChannelOrderLineSummary = z.object({
  id: z.string(),
  externalId: z.string(),
  externalSku: z.string().nullable(),
  description: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  /** Null means nobody has linked this advert to a product yet. */
  variantId: z.string().nullable(),
})

export const ChannelOrderSummary = z.object({
  id: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  externalOrderId: z.string(),
  status: ChannelOrderStatusSchema,
  buyerName: z.string().nullable(),
  buyerDocument: z.string().nullable(),
  totalAmount: z.string(),
  placedAt: z.string(),
  branchId: z.string().nullable(),
  salesDocumentId: z.string().nullable(),
  /** A sentence, not a code: whoever reads it is who will fix the mapping. */
  failureReason: z.string().nullable(),
  lines: z.array(ChannelOrderLineSummary),
})

export const ChannelOrderList = z.object({
  orders: z.array(ChannelOrderSummary),
})

export const ChannelOrderListQuery = z.object({
  status: ChannelOrderStatusSchema.optional(),
  channelId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

/* -------------------------------------------------------------------------
 * Credentials — never carrying a secret outward
 * ---------------------------------------------------------------------- */

/**
 * What a screen may know about a connection.
 *
 * Deliberately unable to hold a client secret or a token. A summary that could
 * would eventually leak one to every browser with the settings page open, and
 * the defence that works is the type, not the discipline.
 */
export const ChannelCredentialStatus = z.object({
  channelId: z.string(),
  /** Nulo quando a loja usa a aplicação da plataforma (F122) — o caso normal. */
  clientId: z.string().nullable(),
  /**
   * De quem é a aplicação do marketplace (F122).
   *
   * `platform` — a da Aeris, registrada uma vez no servidor: o lojista só
   * autoriza. `tenant` — esta loja colou a própria, a exceção. `missing` — não
   * há nenhuma, e conectar é impossível até quem opera a plataforma configurar.
   *
   * A tela precisa dos três estados: com `platform` ela não mostra campo de
   * chave nenhum, e com `missing` ela precisa dizer que o problema não é do
   * lojista.
   */
  applicationSource: z.enum(['platform', 'tenant', 'missing']),
  connected: z.boolean(),
  externalUserId: z.string().nullable(),
  externalNickname: z.string().nullable(),
  connectedAt: z.string().nullable(),
  accessExpiresAt: z.string().nullable(),
  hasWebhookSecret: z.boolean(),
  lastError: z.string().nullable(),
})

export const ChannelApplicationSave = z.object({
  clientId: z.string().trim().min(1).max(120),
  clientSecret: z.string().trim().min(1).max(200),
  webhookSecret: z.string().trim().max(200).nullable().default(null),
})

export const ChannelConnectResponse = z.object({
  /** Where to send the person to say yes. */
  authorizationUrl: z.string(),
})

/**
 * A resposta de "sincronizar estoque" e de "buscar pedidos" (F109).
 *
 * Deixou de contar anúncios porque deixou de publicar dentro da requisição: o
 * trabalho vai para o worker e a rota devolve 202. Contar aqui exigiria manter
 * o navegador esperando duzentas chamadas ao marketplace — que é exatamente o
 * que esta feature tirou do caminho.
 *
 * O resultado por anúncio não some: passa a ser gravado em
 * `channel_listing.last_synced_at` e `last_error`, que a tela de Canais mostra
 * por linha. Antes desta feature aquelas duas colunas existiam e nunca eram
 * escritas, então "3 falharam" não dizia quais.
 */
export const ChannelQueuedResponse = z.object({
  queued: z.literal(true),
})

export type ChannelOrderListParams = z.infer<typeof ChannelOrderListQuery>
export type ChannelApplicationSaveBody = z.infer<typeof ChannelApplicationSave>
