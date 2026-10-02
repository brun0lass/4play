import { z } from 'zod'

import { SearchModeSchema, type SearchMode } from './search-mode.ts'

/**
 * Catalog contracts.
 *
 * Neither price nor stock belongs to a product. Master Specification sections
 * 12, 14 and 15 — a price belongs to a price LIST and a balance belongs to a
 * BRANCH, and see migration 0004 for why folding either into the product would
 * be expensive.
 *
 * F025 puts both on the list screen anyway, and the shape is the whole of how
 * that stays true: they arrive only when asked for, via `include`, alongside
 * the `priceListId` and `branchId` they came from. A product row does not
 * acquire a price — a request acquires an answer to "what does this cost in
 * that table, and how many are in that shop?".
 *
 * The screen shows those two selectors for the same reason. A price with no
 * table named is not a fact, and a number that will not say where it came from
 * is worse on a screen than absent.
 */

export const UNIT_VALUES = [
  'UN',
  'PC',
  'CX',
  'PAR',
  'KIT',
  'KG',
  'G',
  'L',
  'ML',
  'M',
  'CM',
  'M2',
  'M3',
] as const

export const UnitSchema = z.enum(UNIT_VALUES)

export const CatalogStatusSchema = z.enum(['active', 'archived'])

/**
 * A ficha de anúncio (F108).
 *
 * As listas abaixo são declaradas aqui de novo, e não importadas de
 * `@aeris/catalog`, pelo mesmo motivo que `UNIT_VALUES` e `PARTY_ROLE_VALUES`:
 * o navegador importa os contratos e eles não podem arrastar um pacote de
 * domínio atrás. Quem mantém as cópias honestas é
 * `apps/api/src/listing-vocabulary-parity.test.ts`, que compara as três
 * declarações — domínio, contrato e o CHECK da migração 0056.
 */
export const PRODUCT_CONDITION_VALUES = ['new', 'used', 'refurbished'] as const

export const ProductConditionSchema = z.enum(PRODUCT_CONDITION_VALUES)

export const PROVENANCE_SOURCE_VALUES = [
  'manual',
  'imported',
  'gtin_catalog',
  'marketplace_catalog',
  'ai_estimated',
  'ai_researched',
  'reviewed',
] as const

export const ProvenanceSourceSchema = z.enum(PROVENANCE_SOURCE_VALUES)

/**
 * De onde veio um campo.
 *
 * Viaja até a tela porque é lá que ela vira uma frase — "IA · estimado 0,6" ao
 * lado do peso. Sem isso a pessoa que revisa não teria como saber o que olhar
 * primeiro, e a decisão de publicar sozinho seria invisível para quem responde
 * por ela.
 */
export const ProvenanceEntry = z.object({
  source: ProvenanceSourceSchema,
  /** Zero a um. Só a IA produz; nulo no resto. */
  confidence: z.number().min(0).max(1).nullable(),
  runId: z.string().nullable(),
  at: z.string().nullable(),
})

export type ProvenanceEntry = z.infer<typeof ProvenanceEntry>

/**
 * O mapa de proveniências de um produto, com as quatro chaves possíveis.
 *
 * Um mapa só, embora o banco guarde em duas linhas — as do produto e as da
 * variante. Quem lê é uma tela, e para ela "de onde veio o peso" e "de onde
 * veio a descrição" são a mesma pergunta; a divisão por tabela é detalhe de
 * onde cada fato mora.
 */
export const ListingProvenanceSchema = z.object({
  weightGrams: ProvenanceEntry.optional(),
  dimensions: ProvenanceEntry.optional(),
  listingDescription: ProvenanceEntry.optional(),
  warranty: ProvenanceEntry.optional(),
})

export type ListingProvenanceSchema = z.infer<typeof ListingProvenanceSchema>

/**
 * Medidas em centímetros, como STRING decimal.
 *
 * Pelo mesmo motivo do preço: um número em JSON é um double por especificação,
 * e estas três entram numa cotação de frete que decide dinheiro. O servidor
 * normaliza para duas casas antes de gravar, então o que volta é sempre
 * `"12.50"` e nunca `"12,5"`.
 */
export const PackageDimensionsSchema = z.object({
  lengthCm: z.string(),
  widthCm: z.string(),
  heightCm: z.string(),
})

export type PackageDimensionsSchema = z.infer<typeof PackageDimensionsSchema>

/** O que a tela manda: aceita vírgula, porque é o que o teclado produz. */
const dimensionField = z
  .string()
  .trim()
  .regex(
    /^\d{1,4}([.,]\d{1,2})?$/,
    'Use centímetros, com até duas casas — ex.: 12,5'
  )

export const PackageDimensionsInput = z.object({
  lengthCm: dimensionField,
  widthCm: dimensionField,
  heightCm: dimensionField,
})

export type PackageDimensionsInput = z.infer<typeof PackageDimensionsInput>

export const ProductVariantSummary = z.object({
  id: z.string(),
  sku: z.string(),
  gtin: z.string().nullable(),
  unit: UnitSchema,
  ncm: z.string().nullable(),
  /**
   * A identificação do fornecedor (F141): texto livre, como a loja escreve.
   * Opcional na leitura só para respostas gravadas antes dela.
   */
  supplierReference: z.string().nullable().optional(),
  /** A cor (F176). Nula no produto sem variações. */
  name: z.string().nullable().default(null),
  isDefault: z.boolean(),
  status: CatalogStatusSchema,
})

export type ProductVariantSummary = z.infer<typeof ProductVariantSummary>

/**
 * A photograph, as a client sees it.
 *
 * The URLs are built by the server rather than assembled by the client from
 * an id. That is what keeps ADR-0015's upgrade path — signed URLs or a CDN
 * host — a change to one handler instead of a change to every screen that
 * renders an image.
 *
 * `width` and `height` travel with it so a gallery can reserve the right
 * aspect ratio before any bytes arrive, and the layout does not jump when they
 * do (Master Specification section 27).
 */
export const ProductImageSummary = z.object({
  id: z.string(),
  thumbUrl: z.string(),
  fullUrl: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().nonnegative(),
  /** Null means nobody described it — not the same as "deliberately decorative". */
  altText: z.string().nullable(),
  position: z.number().int().nonnegative(),
  isPrimary: z.boolean(),
})

export type ProductImageSummary = z.infer<typeof ProductImageSummary>

/**
 * The default variant's price in one list, and its balance in one branch.
 *
 * Both null-when-absent rather than optional-when-absent: a product with no
 * price in the chosen table is a real and common state, and the screen shows a
 * dash for it rather than R$ 0,00 — which would be a claim that the shop sells
 * it for nothing.
 *
 * `basePrice` is a decimal STRING. A JSON number is an IEEE-754 double by
 * specification, so `JSON.parse` would round it before any code of ours ran.
 * ADR-0016 and section 40.
 */
export const ProductPriceHint = z.object({
  priceListId: z.string(),
  priceListName: z.string(),
  basePrice: z.string().nullable(),
})

export type ProductPriceHint = z.infer<typeof ProductPriceHint>

export const ProductStockHint = z.object({
  branchId: z.string(),
  onHand: z.string(),
  /** On hand minus reserved: what can actually be sold today. */
  available: z.string(),
})

export type ProductStockHint = z.infer<typeof ProductStockHint>

/**
 * O custo da variante padrão, com `include=cost` (F125).
 *
 * Separado de `price` porque mora em outro lugar (a variante, não a lista) e
 * porque só quem pode EDITAR o produto precisa dele — a rota só o entrega a
 * quem tem `catalog.write`. `lastPurchaseAt` é a última ENTRADA de compra no
 * estoque, que é o que "última compra" quer dizer para quem cola etiqueta.
 */
export const ProductCostHint = z.object({
  averageCost: z.string().nullable(),
  lastPurchaseAt: z.string().nullable(),
})

export type ProductCostHint = z.infer<typeof ProductCostHint>

export const ProductSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  brand: z.string().nullable(),
  /**
   * A família da peça — tela, bateria (F163).
   *
   * `.default(null)`: um servidor mais antigo não manda o campo, e a tela não
   * pode quebrar por causa disso.
   */
  categoryId: z.string().nullable().default(null),
  categoryName: z.string().nullable().default(null),
  /** Whether the shop counts this product at all. F028. */
  tracksStock: z.boolean(),
  /**
   * A ficha de anúncio (F108) — peso, embalagem, condição, garantia.
   *
   * Na LISTA e não só no detalhe, ao contrário de preço e estoque: estes
   * campos moram nas mesmas duas linhas que a listagem já lê (produto e
   * variante padrão), então não custam consulta nenhuma — só bytes. E é da
   * lista que o formulário de produto abre, com os valores já na mão.
   */
  condition: ProductConditionSchema,
  warrantyMonths: z.number().int().nullable(),
  warrantyNote: z.string().nullable(),
  listingDescription: z.string().nullable(),
  weightGrams: z.number().int().nullable(),
  dimensions: PackageDimensionsSchema.nullable(),
  /**
   * O estoque mínimo da variante padrão (F134), com o saldo de cada filial
   * comparado a ele. Nulo é "sem mínimo".
   */
  minimumStock: z.string().nullable(),
  listingProvenance: ListingProvenanceSchema,
  status: CatalogStatusSchema,
  /**
   * Desde quando espera a conferência do estoque (F133). Nulo é o normal;
   * preenchido, o produto não vende até uma entrada, um ajuste ou "Liberar".
   */
  awaitingStockSince: z.string().nullable(),
  /**
   * The optimistic-concurrency token, sent so the client can hand it back on
   * update (ADR-0014). Exposing it is deliberate: a client that cannot see it
   * cannot participate in the check, and the alternative is last-write-wins.
   */
  version: z.number().int(),
  /** Quando o produto foi cadastrado. A ficha mostra; a F125 trouxe para o fio. */
  createdAt: z.string(),
  updatedAt: z.string(),
  variants: z.array(ProductVariantSummary),
  /**
   * The main photograph, and only that one.
   *
   * A list row shows one image, so the list carries one image. Sending the
   * whole gallery for every row would multiply the payload by a dozen to
   * render a single thumbnail.
   */
  primaryImage: ProductImageSummary.nullable(),
  /**
   * Present only when the request asked for it with `include=price`.
   *
   * Null when it was asked for and the variant has no entry in that list.
   * Undefined when it was never asked for — the two are different answers and
   * the screen renders them differently.
   */
  price: ProductPriceHint.nullable().optional(),
  /** Present only when the request asked for it with `include=stock`. */
  stock: ProductStockHint.nullable().optional(),
  /**
   * Onde a peça fica NA FILIAL da sessão (F141). Nula quando não há
   * localização nessa loja, ou quando a sessão não tem filial — a localização
   * de outra loja não serve para quem está nesta.
   */
  location: z.string().nullable().optional(),
  /** Present only with `include=cost`, and only for `catalog.write`. F125. */
  cost: ProductCostHint.nullable().optional(),
  /**
   * Quando o preço de venda mudou pela última vez, com
   * `include=priceChangedAt` e `pricing.read` (F127). Nulo é "nunca mudou
   * desde que o histórico existe"; ausente é "não pedido".
   */
  priceChangedAt: z.string().nullable().optional(),
})

export type ProductSummary = z.infer<typeof ProductSummary>

/** A single product, with its whole gallery. */
export const ProductDetail = ProductSummary.extend({
  images: z.array(ProductImageSummary),
})

export type ProductDetail = z.infer<typeof ProductDetail>

/**
 * Offset pagination.
 *
 * Chosen over keyset because an ERP list is used with sorting and a page
 * number, and keyset cannot answer "go to page 12". The cost is that a deep
 * offset scans everything before it — acceptable while the realistic path to a
 * distant product is the search box rather than page 900, and recorded in the
 * F007 specification as the thing to revisit if that stops being true.
 */
/**
 * Um valor decimal na consulta (F152), com sinal no saldo.
 *
 * O preço é sempre positivo; o SALDO pode ser negativo (migração 0054 deixou),
 * e "de -5 a 0" é justamente o filtro de quem vai acertar o estoque. Dois
 * padrões, e não um frouxo para os dois.
 */
const PRICE_AMOUNT = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, 'O preço deve ser um número, como 19.90')

const QUANTITY_AMOUNT = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,6})?$/, 'A quantidade deve ser um número')

export const ProductListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  /**
   * Onde o texto procurado pode estar (F167; terceiro modo na F190).
   *
   * `anywhere` é o que a tela sempre fez e continua sendo o padrão. `prefix` é
   * o modo do GDOOR — a loja escolhe no próprio campo de busca, como escolhia
   * lá. `exact` é código ou código de barras inteiro; ver `search-mode.ts`.
   */
  searchMode: SearchModeSchema.default('anywhere'),
  status: CatalogStatusSchema.optional(),
  /** Só os que esperam a conferência do estoque (F133). */
  awaitingStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  /**
   * Os filtros de coluna (F152).
   *
   * `brand` e `condition` são do produto e custam um `where` direto. As duas
   * faixas custam um `EXISTS` cada, e só fazem sentido dentro do contexto que a
   * tela já escolhe — `priceListId` para o preço, `branchId` para o saldo.
   * Mandar `priceMin` sem `priceListId` é um filtro que não sabe sobre o quê
   * está falando, e o servidor o ignora em vez de escolher uma tabela por
   * conta própria.
   */
  brand: z.string().trim().max(120).optional(),
  /** A família da peça (F163): um `where` direto pelo índice da migração 0092. */
  categoryId: z.string().min(1).optional(),
  condition: ProductConditionSchema.optional(),
  priceMin: PRICE_AMOUNT.optional(),
  priceMax: PRICE_AMOUNT.optional(),
  stockMin: QUANTITY_AMOUNT.optional(),
  stockMax: QUANTITY_AMOUNT.optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped: an uncapped page size is a way for one request to read the whole
  // table, which is both a performance and a data-exfiltration concern.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /**
   * Por onde a lista se ordena (F185).
   *
   * As seis últimas moram na cor PADRÃO do produto e custam uma junção no
   * servidor; as outras são colunas do próprio produto. Pedir `basePrice` ou
   * `margin` sem tabela de preço resolvida, ou `onHand`/`available` sem filial,
   * volta para o nome — ordenar por um valor que não pôde ser lido daria uma
   * lista em ordem de id, que parece aleatória.
   */
  sort: z
    .enum([
      'name',
      'createdAt',
      'updatedAt',
      'brand',
      'category',
      'condition',
      'status',
      'sku',
      'basePrice',
      'averageCost',
      'margin',
      'onHand',
      'available',
    ])
    .default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),

  /**
   * What to join, as a comma-separated list: `price`, `stock`, or both.
   *
   * Opt-in because the cost is real — each is a join per row against a table
   * that is not the product's — and because the answer is meaningless without
   * saying which list and which branch it came from. A caller that wants
   * neither pays for neither, which is every caller except this one screen.
   */
  include: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? [] : value.split(',').map((part) => part.trim())
    )
    .pipe(z.array(z.enum(['price', 'stock', 'cost', 'priceChangedAt']))),

  /** Absent means the tenant's default price list. */
  priceListId: z.string().optional(),
  /** Absent means the branch on the session. */
  branchId: z.string().optional(),

  /**
   * "Which parts fit this model?" (F031, Master Specification section 13).
   *
   * The counter's question, with the customer holding the thing. Served by
   * `product_application_by_model_idx` rather than by a scan — at the 100.000
   * products of section 27 the difference is between a shop that answers and a
   * shop that says it will call back.
   */
  applicationModelId: z.string().optional(),
})

/**
 * The wire-input type, where `z.coerce` widens numbers to `unknown` because a
 * query string carries them as text. Useful on the server, useless to a
 * client — which gets `ProductListRequest` below instead.
 */
export type ProductListQuery = z.input<typeof ProductListQuery>

/**
 * What a client passes. Numbers are numbers.
 *
 * ## Por que esta lista tem de espelhar o `ProductListQuery` inteiro (F182)
 *
 * Ela ficou sete campos atrás do schema, e o preço foi alto: a tela montava
 * `brand`, `categoryId`, `condition` e as faixas de preço e saldo com spread —
 * que não sofre checagem de propriedade excedente —, o serializador não
 * escrevia nenhum deles, e o compilador não tinha como reclamar. Os filtros de
 * coluna da F152 e o "Serve em…" ficaram mudos por semanas, com a tela
 * desenhando o chip do filtro ao lado de uma lista que não filtrou nada.
 *
 * `catalog-params.test.ts` lê o `shape` do schema e cobra campo por campo, para
 * o próximo filtro novo não poder repetir isto em silêncio.
 */
export type ProductListRequest = {
  applicationModelId?: string | undefined
  awaitingStock?: boolean | undefined
  search?: string | undefined
  searchMode?: SearchMode | undefined
  status?: 'active' | 'archived' | undefined
  brand?: string | undefined
  categoryId?: string | undefined
  condition?: 'new' | 'used' | 'refurbished' | undefined
  /** Decimal em string (ADR-0016). Só valem com `priceListId`. */
  priceMin?: string | undefined
  priceMax?: string | undefined
  /** Só valem com `branchId`. */
  stockMin?: string | undefined
  stockMax?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?:
    | 'name'
    | 'createdAt'
    | 'updatedAt'
    | 'brand'
    | 'category'
    | 'condition'
    | 'status'
    | 'sku'
    | 'basePrice'
    | 'averageCost'
    | 'margin'
    | 'onHand'
    | 'available'
    | undefined
  direction?: 'asc' | 'desc' | undefined
  include?:
    readonly ('price' | 'stock' | 'cost' | 'priceChangedAt')[] | undefined
  priceListId?: string | undefined
  branchId?: string | undefined
}

export const ProductList = z.object({
  items: z.array(ProductSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type ProductList = z.infer<typeof ProductList>

const nameField = z.string().trim().min(1, 'Informe o nome').max(200)
const skuField = z
  .string()
  .trim()
  .min(1, 'Informe o código')
  .max(40)
  // Normalised on the server too, never only in the browser: the uniqueness
  // constraint is on the stored value.
  .transform((value) => value.toUpperCase().replace(/\s+/g, ''))

/**
 * Blank means "no value" rather than an empty string.
 *
 * Two variants, because absence means different things in the two operations
 * and conflating them is how a PATCH silently wipes a field:
 *
 *   creating — absent is simply no value, so it becomes null
 *   updating — absent means "leave this alone"; an explicit null clears it
 */
const optionalOnCreate = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null)

const optionalOnUpdate = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()

/**
 * Os campos da ficha de anúncio, nas duas escritas do produto (F108).
 *
 * Viajam no mesmo corpo do cadastro, e não numa rota própria: são escalares do
 * mesmo agregado, como o NCM. Uma rota separada daria ao diálogo de produto
 * dois botões Salvar com dois `version` — e salvar a aba "Anúncio" faria a aba
 * "Geral", aberta ao lado, ser recusada por concorrência.
 *
 * A ficha TÉCNICA é o contrário: é lista, tem rota própria e grava na hora,
 * como as aplicações (F031) e as fotos.
 */
const listingFields = {
  condition: ProductConditionSchema.optional(),
  /** Nulo é "não declarada"; zero é "sem garantia". Não são a mesma coisa. */
  warrantyMonths: z.number().int().min(0).max(120).nullable().optional(),
  warrantyNote: optionalOnUpdate(200),
  listingDescription: optionalOnUpdate(50000),
  /**
   * Gramas inteiras.
   *
   * O teto recusa o que quase sempre é unidade trocada: 40.000 no campo é
   * alguém digitando gramas onde leu quilos, e o erro só apareceria na fatura
   * do frete.
   */
  weightGrams: z.number().int().positive().max(1_000_000).nullable().optional(),
  dimensions: PackageDimensionsInput.nullable().optional(),
} as const

/**
 * Dinheiro como STRING, e o motivo é o mesmo de `pricing.ts` (ADR-0016).
 *
 * Este pacote só pode depender de `@aeris/domain`, então a forma é conferida
 * por expressão regular aqui e virada ponto fixo por `@aeris/money` do outro
 * lado. Um `z.number()` aqui seria float na rede, e 19.90 não existe em float.
 *
 * Até doze dígitos inteiros e seis casas — `numeric(18, 6)`, não negativo.
 */
const PRODUCT_MONEY_PATTERN = /^\d{1,12}(\.\d{1,6})?$/

const productMoney = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      PRODUCT_MONEY_PATTERN,
      `${label} deve ser um número com ponto decimal, por exemplo 19.90`
    )

/**
 * Custo e preço no cadastro do produto (F123).
 *
 * **Não são colunas do produto.** O custo vira `product_variant.average_cost` e
 * o preço vira uma linha na lista de preço PADRÃO — os dois lugares que já
 * existem e que continuam sendo a fonte de verdade. A Master Spec (seção 12)
 * proíbe o produto ser a única fonte de verdade do preço; ela não proíbe um
 * campo que escreve no módulo de preço, que é o que isto é.
 *
 * Ausente é "não mexa". `null` não é aceito de propósito: apagar um preço é
 * arquivar, e arquivar tem tela própria — fazer isso por omissão num formulário
 * de produto apagaria preço sem querer.
 */
const salePriceField = {
  /** Preço de venda. Vira a faixa base (quantidade 0) da lista padrão. */
  salePrice: productMoney('O preço de venda').optional(),
} as const

/**
 * O custo só existe na CRIAÇÃO, e a assimetria é deliberada.
 *
 * `average_cost` é o custo médio ponderado que as COMPRAS calculam (ADR-0020).
 * Na criação não há compra nenhuma, então o número digitado é o único que
 * existe e serve de ponto de partida. Depois da primeira entrada de estoque ele
 * passa a ser um resultado, e um campo de formulário que o sobrescrevesse
 * apagaria o cálculo de várias notas com um valor digitado de memória — a pessoa
 * editando a marca de um produto zeraria a margem de uma peça que ela nem
 * abriu.
 *
 * A primeira versão da F123 espalhou os dois campos nos dois contratos e ligou
 * só o `POST`: o `PATCH` respondia 200 e não gravava nada. Aceitar e ignorar é
 * pior que recusar, porque a tela diz "salvo".
 */
const priceFields = {
  /** Custo unitário. Vira o custo médio da variante — ver a rota. */
  cost: productMoney('O custo').optional(),
  ...salePriceField,
} as const

/**
 * O estoque do produto que acaba de nascer (F133).
 *
 * `now`: a quantidade que está na mão, lançada como ENTRADA no livro de
 * movimentos — nunca um campo do produto (Master Spec, seção 12). Zero é
 * aceito: "não tenho nenhum" também é saber.
 *
 * `later`: o produto nasce aguardando a conferência e não vende até ela.
 *
 * O mesmo formato de quantidade do estoque: string com ponto, até seis casas.
 */
/**
 * O estoque mínimo (F134): o mesmo formato de quantidade do estoque. `null`
 * tira o mínimo; ausente deixa como está.
 */
const minimumStockField = z
  .string()
  .trim()
  .regex(
    /^\d{1,12}(\.\d{1,6})?$/,
    'Informe o estoque mínimo com até 6 casas decimais, usando ponto.'
  )
  .nullable()
  .optional()

export const OpeningStockInput = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('now'),
    quantity: z
      .string()
      .trim()
      .regex(
        /^\d{1,12}(\.\d{1,6})?$/,
        'Informe uma quantidade com até 6 casas decimais, usando ponto.'
      ),
    branchId: z.string().optional(),
  }),
  z.object({ mode: z.literal('later') }),
])

export type OpeningStockInput = z.infer<typeof OpeningStockInput>

export const CreateProductRequest = z.object({
  name: nameField,
  description: optionalOnCreate(2000),
  brand: optionalOnCreate(120),
  /** A categoria cadastrada (F163). Nula: produto sem família. */
  categoryId: z.string().min(1).nullable().optional(),
  /** Absent inherits the company's default (F028). */
  tracksStock: z.boolean().optional(),
  /**
   * Ausente: o servidor dá o próximo código de seis dígitos da loja (F128).
   * Presente: o código que a pessoa digitou, como sempre.
   */
  sku: skuField.optional(),
  gtin: optionalOnCreate(20),
  /**
   * Gera o código de barras interno da loja, começado por 2 (F133). Não vem
   * junto com `gtin`: ou a embalagem tem código, ou a loja cria um.
   */
  generateGtin: z.boolean().optional(),
  unit: UnitSchema.default('UN'),
  ncm: optionalOnCreate(12),
  /** F141: a identificação do fornecedor, texto livre. */
  supplierReference: optionalOnCreate(80),
  /** F141: a localização da peça NA FILIAL da sessão. */
  location: optionalOnCreate(80),
  ...listingFields,
  ...priceFields,
  /** Ausente: como antes, sem estoque nenhum no cadastro. */
  openingStock: OpeningStockInput.optional(),
  minimumStock: minimumStockField,
})

export type CreateProductRequest = z.input<typeof CreateProductRequest>

/** What the handler receives, after defaults and transforms have been applied. */
export type CreateProductBody = z.output<typeof CreateProductRequest>

export const UpdateProductRequest = z.object({
  /** Required: see ProductSummary.version. */
  version: z.number().int().nonnegative(),
  name: nameField.optional(),
  description: optionalOnUpdate(2000),
  brand: optionalOnUpdate(120),
  categoryId: z.string().min(1).nullable().optional(),
  tracksStock: z.boolean().optional(),
  sku: skuField.optional(),
  gtin: optionalOnUpdate(20),
  unit: UnitSchema.optional(),
  ncm: optionalOnUpdate(12),
  /** F141: ausente não mexe; vazio ou nulo apaga. */
  supplierReference: optionalOnUpdate(80),
  /** F141: a da filial da sessão. Ausente não mexe; vazio ou nulo apaga. */
  location: optionalOnUpdate(80),
  ...listingFields,
  /*
   * Preço E custo, desde a F125 (decisão do dono, 12/09).
   *
   * A F123 tirou o custo da alteração pelo motivo escrito em `priceFields`: um
   * campo que sobrescreve a média das compras com um número de memória. O dono
   * pediu o contrário — o custo aparece preenchido e se corrige ali — e o risco
   * que a F123 temia foi resolvido de outro jeito: toda mudança de custo vira
   * uma linha no histórico do produto, com quem, quando e de quanto para
   * quanto. A formulário abre com o valor atual, então "salvar sem mexer" não
   * muda nada, e a mudança de verdade fica explicada.
   */
  ...priceFields,
  minimumStock: minimumStockField,
})

export type UpdateProductRequest = z.input<typeof UpdateProductRequest>

export type UpdateProductBody = z.output<typeof UpdateProductRequest>

// ---------------------------------------------------------------------------
// As cores do produto (F176)
// ---------------------------------------------------------------------------

const colourNameField = z
  .string()
  .trim()
  .min(1, 'Informe o nome da cor')
  .max(60, 'O nome da cor tem no máximo 60 letras')

/**
 * Uma cor do produto, como a aba Variações a mostra.
 *
 * `ownPrice` nulo é "segue o produto": a cor cobra o `effectivePrice`, que é o
 * preço da variação padrão. A padrão é a primeira cor, e o preço dela É o do
 * produto — por isso ela nunca "segue".
 */
export const ProductColourSummary = z.object({
  id: z.string(),
  name: z.string().nullable(),
  sku: z.string(),
  gtin: z.string().nullable(),
  supplierReference: z.string().nullable(),
  minimumStock: z.string().nullable(),
  isDefault: z.boolean(),
  status: CatalogStatusSchema,
  version: z.number().int(),
  /** A soma do saldo de todas as filiais. */
  onHand: z.string(),
  ownPrice: z.string().nullable(),
  /** O que a cor cobra hoje na lista padrão: o próprio, ou o do produto. */
  effectivePrice: z.string().nullable(),
})

export type ProductColourSummary = z.infer<typeof ProductColourSummary>

export const ProductColourList = z.object({
  colours: z.array(ProductColourSummary),
})

export type ProductColourList = z.infer<typeof ProductColourList>

export const ProductColourResponse = z.object({
  colour: ProductColourSummary,
})

export type ProductColourResponse = z.infer<typeof ProductColourResponse>

export const CreateProductColourRequest = z.object({
  name: colourNameField,
  /**
   * O nome da cor que o produto já tem — obrigatório na PRIMEIRA cor nova:
   * produto com duas cores não tem cor sem nome.
   */
  defaultName: colourNameField.optional(),
  /** Ausente: o código da raiz com `-2`, `-3`… (a padrão fica com o `-1`). */
  sku: skuField.optional(),
  gtin: optionalOnCreate(20),
  /** Ausente: a cor segue o preço do produto. */
  ...salePriceField,
  minimumStock: minimumStockField,
  supplierReference: optionalOnCreate(80),
})

export type CreateProductColourRequest = z.input<
  typeof CreateProductColourRequest
>
export type CreateProductColourBody = z.output<
  typeof CreateProductColourRequest
>

/**
 * Várias cores de uma vez (F191).
 *
 * O dono, duas vezes: *"tivesse algum esquema de criar mais rápido as cor"*.
 * Só os NOMES viajam: código e código de barras são do servidor, como já eram
 * na criação de uma cor. Preço próprio fica de fora de propósito — a cor nasce
 * seguindo o preço do produto (decisão da F176, e o caso comum); preço por cor
 * se edita cor a cor, onde já funciona.
 *
 * O limite não é folclore: o diálogo é para as seis cores de um chassi, não
 * para colar um catálogo. Acima disso, a importação por planilha é o caminho.
 */
export const CreateProductColoursRequest = z.object({
  names: z.array(colourNameField).min(1).max(50),
  defaultName: colourNameField.optional(),
})

export type CreateProductColoursRequest = z.input<
  typeof CreateProductColoursRequest
>
export type CreateProductColoursBody = z.output<
  typeof CreateProductColoursRequest
>

/** Uma linha da prévia do lote: o nome colado e o que ele vai receber (F191). */
export const ProductColourPlanLine = z.object({
  name: z.string(),
  sku: z.string(),
  gtin: z.string(),
})

export type ProductColourPlanLine = z.infer<typeof ProductColourPlanLine>

/**
 * O que o lote faria, antes de fazer (F191) — o molde da F181.
 *
 * `renamesDefaultTo` é a frase que falta em toda tela de cor: ao criar a
 * primeira, o código do PRODUTO deixa de ser `6455` e passa a `6455-1`. Quem
 * não vê isso antes leva um susto depois, com etiqueta impressa na gaveta.
 */
export const ProductColourPlanResponse = z.object({
  renamesDefaultTo: z.string().nullable(),
  lines: z.array(ProductColourPlanLine),
})

export type ProductColourPlanResponse = z.infer<
  typeof ProductColourPlanResponse
>

export const ProductColoursResponse = z.object({
  colours: z.array(ProductColourSummary),
  /** O código que a padrão passou a ter, quando mudou. */
  defaultSku: z.string().nullable(),
})

export type ProductColoursResponse = z.infer<typeof ProductColoursResponse>

export const UpdateProductColourRequest = z.object({
  version: z.number().int().nonnegative(),
  name: colourNameField.optional(),
  sku: skuField.optional(),
  gtin: optionalOnUpdate(20),
  /**
   * O preço próprio da cor. `null` é "voltar a seguir o produto" — aqui sim,
   * porque o preço da cor não é o do produto: tirá-lo não deixa ninguém sem
   * preço. Na cor padrão não se aceita: o preço dela é o do produto.
   */
  salePrice: productMoney('O preço da cor').nullable().optional(),
  minimumStock: minimumStockField,
  supplierReference: optionalOnUpdate(80),
})

export type UpdateProductColourRequest = z.input<
  typeof UpdateProductColourRequest
>
export type UpdateProductColourBody = z.output<
  typeof UpdateProductColourRequest
>

export const ProductColourStatusRequest = z.object({
  version: z.number().int().nonnegative(),
})

export type ProductColourStatusRequest = z.infer<
  typeof ProductColourStatusRequest
>

export type ProductListParams = z.output<typeof ProductListQuery>

/**
 * Os campos do filtro da lista que a ação em massa aceita (F070).
 *
 * Deliberadamente os MESMOS de `ProductListQuery`, menos os que não escolhem
 * linhas — página, ordenação e `include` decidem o que se mostra e como, não
 * quais produtos existem no conjunto.
 *
 * O invariante que sustenta a feature: **o que a lista mostra é exatamente o
 * que muda**. Ele mora aqui e no repositório, onde o `where` é escrito uma vez
 * só e aplicado aos dois. Sem isso, "todos os 5309" na tela e "todos os 5309"
 * no banco podem ser conjuntos diferentes — e a divergência é invisível,
 * porque a tela informa a contagem que o servidor devolveu e não há como
 * conferir.
 */
export const ProductFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  /*
   * Onde a busca procura (F167), e aqui também pelo mesmo invariante.
   *
   * Com "começa com" ligado na tela e ausente daqui, "selecionar todos"
   * mandaria ao servidor o conjunto de "em qualquer parte" — MAIOR que o que a
   * pessoa está vendo.
   */
  searchMode: SearchModeSchema.optional(),
  status: CatalogStatusSchema.optional(),
  /** F133: a ação em massa age sobre o mesmo conjunto que a lista mostra. */
  awaitingStock: z.boolean().optional(),
  applicationModelId: z.string().optional(),
  /*
   * Os filtros de coluna (F152) entram AQUI TAMBÉM, e não é cópia por desencargo.
   *
   * Com a marca filtrada na tela e ausente daqui, "selecionar todos" mandaria
   * ao servidor um conjunto MAIOR que o da frente da pessoa, e ela veria
   * "5309 alterados" sem ter como conferir que não eram os 42 da tela. O teste
   * que protege isso está no teste da rota.
   */
  brand: z.string().trim().max(120).optional(),
  categoryId: z.string().min(1).optional(),
  condition: ProductConditionSchema.optional(),
  priceListId: z.string().optional(),
  priceMin: PRICE_AMOUNT.optional(),
  priceMax: PRICE_AMOUNT.optional(),
  stockBranchId: z.string().optional(),
  stockMin: QUANTITY_AMOUNT.optional(),
  stockMax: QUANTITY_AMOUNT.optional(),
})

export type ProductFilter = z.infer<typeof ProductFilterSchema>

/**
 * Ligar ou desligar o controle de estoque de um conjunto de produtos (F070).
 *
 * A F028 tornou o estoque opcional por produto, com uma caixa no cadastro. A
 * Elite Digital tem 5309 produtos importados do GDOOR sem saldo nenhum, e o
 * caminho de então pedia 5309 aberturas de tela — o sistema certo sobre o
 * próprio registro e errado sobre a loja, que é o defeito que a F028 tinha ido
 * remover e que sobreviveu porque ela resolveu o caso de UM produto.
 */
export const BulkStockTrackingRequest = z.object({
  tracksStock: z.boolean(),
  /**
   * O filtro, e não uma lista de ids.
   *
   * Mandar 5309 ids num corpo de requisição fura por outra porta a mesma
   * parede que `ProductListQuery.pageSize` levanta ao limitar a página a 100
   * ("an uncapped page size is a way for one request to read the whole
   * table"). O filtro descreve o conjunto em duzentos bytes e o banco resolve
   * numa instrução.
   */
  filter: ProductFilterSchema,
  /**
   * "Marcar todos e tirar alguns" — as palavras do dono, e como ele pensa.
   *
   * Exceções, e não inclusões: a seleção que interessa nesta loja tem 5309
   * elementos e a lista de fora tem seis. Guardar o complemento também é o que
   * faz a seleção sobreviver à paginação sem carregar página nenhuma — a
   * alternativa, acumular ids por página, perde as escolhas de quem volta uma
   * página e é onde uma implementação distraída falha.
   *
   * Limitado a 500 para que o corpo não vire um vetor de requisição gigante.
   * Quem precisa tirar mais de 500 está descrevendo outro filtro.
   */
  excludeIds: z.array(z.string()).max(500).default([]),
  /**
   * O outro jeito de nomear um conjunto: estes, e só estes.
   *
   * Existe porque a tabela tem caixa por linha, e marcar três produtos é uma
   * coisa que a pessoa faz sem ter pedido "todos" antes. Sem isto, a caixa de
   * linha só teria efeito depois de marcar o cabeçalho, que é uma tabela onde
   * clicar não faz nada até você clicar noutro lugar.
   *
   * Quando presente, `excludeIds` é ignorado — os dois descrevem o mesmo
   * conjunto por caminhos opostos e aceitar ambos ao mesmo tempo seria
   * inventar uma terceira semântica que ninguém pediu.
   *
   * **Continua cruzado com o filtro no servidor**, e não substituído por ele:
   * um id que não casa o filtro corrente não é tocado. É o que mantém de pé o
   * invariante de que a ação nunca alcança um produto que quem chamou não
   * poderia ver na lista.
   */
  includeIds: z.array(z.string()).max(500).optional(),
})

export type BulkStockTrackingRequest = z.input<typeof BulkStockTrackingRequest>

export type BulkStockTrackingBody = z.output<typeof BulkStockTrackingRequest>

/**
 * Quantos produtos mudaram DE FATO — não quantos casaram o filtro.
 *
 * A diferença é o que permite a tela dizer "Nenhum produto foi alterado"
 * quando os 5309 já estavam desligados, em vez de "pronto" sobre um trabalho
 * que não houve.
 */
export const BulkStockTrackingResponse = z.object({
  changed: z.number().int().nonnegative(),
})

export type BulkStockTrackingResponse = z.infer<
  typeof BulkStockTrackingResponse
>

/**
 * Os códigos que o formulário de Novo produto mostra ao abrir (F133).
 *
 * Previsões: não reservam nada. Quem salva sem mexer recebe o que o servidor
 * gerar naquela hora, que é este mesmo número salvo concorrência.
 */
export const NextProductCodesResponse = z.object({
  sku: z.string(),
  gtin: z.string(),
})

export type NextProductCodesResponse = z.infer<typeof NextProductCodesResponse>

export const ArchiveProductRequest = z.object({
  version: z.number().int().nonnegative(),
})

export type ArchiveProductRequest = z.infer<typeof ArchiveProductRequest>

export const ProductResponse = z.object({
  product: ProductDetail,
})

export type ProductResponse = z.infer<typeof ProductResponse>

// ---------------------------------------------------------------------------
// Ficha técnica (F108)
// ---------------------------------------------------------------------------

/**
 * Uma característica do produto: chave, valor e de onde veio.
 *
 * A chave é NOSSA e em snake_case (`voltage`, `color`, `mpn`) — nunca o id de
 * atributo de um marketplace. Traduzir `voltage` para o `VOLTAGE` que o
 * Mercado Livre espera na categoria X é trabalho do adaptador (ADR-0025);
 * guardar o vocabulário deles no catálogo da loja seria o acoplamento que o
 * CLAUDE.md proíbe.
 */
export const ProductAttributeSummary = z.object({
  key: z.string(),
  value: z.string(),
  /** "V", "kg". Nula quando o valor já se explica ("Preta"). */
  unit: z.string().nullable(),
  source: ProvenanceSourceSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  at: z.string().nullable(),
})

export type ProductAttributeSummary = z.infer<typeof ProductAttributeSummary>

export const ProductAttributeList = z.object({
  attributes: z.array(ProductAttributeSummary),
})

export type ProductAttributeList = z.infer<typeof ProductAttributeList>

/**
 * A ficha técnica inteira, de uma vez.
 *
 * Substituição do conjunto: a tela edita a lista toda, e "estes são os
 * atributos deste produto" é uma afirmação sobre o conjunto. Mandar só os que
 * mudaram obrigaria o cliente a calcular a diferença — e o dia em que ele
 * errasse, uma característica apagada na tela continuaria no banco.
 *
 * Sem `version`, como as etiquetas da F088: a escrita não depende do que foi
 * lido, e recusar por concorrência faria duas pessoas preenchendo a ficha do
 * mesmo produto perderem o trabalho uma da outra por um campo que nem estava
 * aberto.
 */
export const SetProductAttributesRequest = z.object({
  attributes: z
    .array(
      z.object({
        key: z.string().trim().min(1, 'Informe a característica').max(60),
        value: z.string().trim().min(1, 'Informe o valor').max(255),
        unit: z
          .string()
          .trim()
          .max(20)
          .transform((value) => (value.length === 0 ? null : value))
          .nullable()
          .default(null),
      })
    )
    /*
     * Nenhuma categoria de marketplace chega perto de sessenta. O teto existe
     * para que uma proposta de IA malformada — ou um corpo hostil — não vire
     * cinquenta mil linhas numa tabela que a tela mostra sem paginar.
     */
    .max(60),
})

export type SetProductAttributesRequest = z.input<
  typeof SetProductAttributesRequest
>

export type SetProductAttributesBody = z.output<
  typeof SetProductAttributesRequest
>

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * The gallery, after any change to it.
 *
 * Every image mutation answers with the whole list rather than with the one
 * row that moved. Ordering and "which one is the main photograph" are
 * properties of the set, so returning a single row would force the client to
 * reconstruct the rest and get it subtly wrong.
 */
export const ProductImageList = z.object({
  images: z.array(ProductImageSummary),
})

export type ProductImageList = z.infer<typeof ProductImageList>

export const UpdateProductImageRequest = z.object({
  altText: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional(),
  /**
   * Only `true` is meaningful.
   *
   * Setting it promotes this image; there is no way to say "no main
   * photograph", because a product with images always has one — the first
   * upload becomes it and deleting it promotes the next.
   */
  isPrimary: z.literal(true).optional(),
})

export type UpdateProductImageRequest = z.input<
  typeof UpdateProductImageRequest
>

export type UpdateProductImageBody = z.output<typeof UpdateProductImageRequest>

export const ReorderProductImagesRequest = z.object({
  imageIds: z.array(z.string()).min(1).max(50),
})

export type ReorderProductImagesRequest = z.infer<
  typeof ReorderProductImagesRequest
>

/**
 * Trazer as fotos de um catálogo inteiro num arquivo só.
 *
 * O nome do arquivo dentro do ZIP **é** o código do produto no sistema antigo:
 * `1233.jpg` é a foto do 1233. É como a loja já guarda as fotos, e qualquer
 * outra convenção obrigaria alguém a renomear cinco mil arquivos à mão.
 *
 * O relatório volta linha a linha, e não só o total. "Importei 4820 de 5307" é
 * um número que ninguém consegue agir: o que resolve o problema é a lista dos
 * 487 códigos que o sistema não conhece, para conferir contra a planilha.
 */
export const ProductImageImportOutcomeSchema = z.enum([
  'imported',
  /** Nenhum produto com esse código — provavelmente foto de item não importado. */
  'unknown_code',
  /** O produto já tem foto. Importar por cima apagaria a escolha de alguém. */
  'already_has_photo',
  /** Os bytes não são uma imagem que o sistema consiga ler. */
  'unreadable',
  /** Maior que o limite de uma foto avulsa. */
  'too_large',
])

export type ProductImageImportOutcome = z.infer<
  typeof ProductImageImportOutcomeSchema
>

export const ProductImageImportEntry = z.object({
  file: z.string(),
  code: z.string(),
  outcome: ProductImageImportOutcomeSchema,
})

export type ProductImageImportEntry = z.infer<typeof ProductImageImportEntry>

export const ImportProductImagesResponse = z.object({
  /** Quantos arquivos de imagem o arquivo continha. */
  total: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  entries: z.array(ProductImageImportEntry),
})

export type ImportProductImagesResponse = z.infer<
  typeof ImportProductImagesResponse
>

// ---------------------------------------------------------------------------
// Sugestão por IA (F112)
// ---------------------------------------------------------------------------

/**
 * `estimate` responde do que o modelo já sabe; `research` pesquisa antes.
 *
 * Não são dois ajustes do mesmo botão. Medido em 11/09/2026 contra a Groq:
 * estimar custou ~1.000 tokens e 1,7 s e devolveu peso e dimensão **nulos**;
 * pesquisar custou ~77.000 tokens e 15,4 s e devolveu 1.290 g e 210×210×70 mm,
 * citando a fonte. O primeiro cabe no nível gratuito; o segundo não.
 */
export const ENRICHMENT_MODE_VALUES = ['estimate', 'research'] as const

export const EnrichmentModeSchema = z.enum(ENRICHMENT_MODE_VALUES)

export type EnrichmentMode = z.infer<typeof EnrichmentModeSchema>

export const ENRICHMENT_STATUS_VALUES = [
  'queued',
  'running',
  'done',
  'failed',
] as const

export const EnrichmentStatusSchema = z.enum(ENRICHMENT_STATUS_VALUES)

export type EnrichmentStatus = z.infer<typeof EnrichmentStatusSchema>

/**
 * A pergunta: um nome de produto.
 *
 * `productId` é opcional porque a sugestão nasce ENQUANTO se cria o produto —
 * quando ainda não existe produto para apontar. É a diferença entre o que o
 * dono pediu ("sugerir ao digitar o nome") e um botão "Melhorar com IA" numa
 * ficha já salva, que virá depois e usará o mesmo endpoint.
 */
export const StartEnrichmentRequest = z.object({
  query: z
    .string()
    .trim()
    .min(2, 'Digite ao menos duas letras do nome do produto')
    .max(300, 'O nome é longo demais para uma pesquisa'),
  productId: z.uuid().nullish(),
  mode: EnrichmentModeSchema.default('estimate'),
})

export type StartEnrichmentRequest = z.infer<typeof StartEnrichmentRequest>
export type StartEnrichmentBody = z.input<typeof StartEnrichmentRequest>

/** Um valor proposto e o quanto a IA se diz confiante nele. */
const proposed = <T extends z.ZodType>(value: T) =>
  z
    .object({
      value,
      confidence: z.number().min(0).max(1),
    })
    .nullable()

export const ProposedAttributeSchema = z.object({
  key: z.string(),
  value: z.string(),
  unit: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

export type ProposedAttributeSchema = z.infer<typeof ProposedAttributeSchema>

/**
 * O que a IA propôs. Todo campo é anulável: "não sei" é resposta melhor que
 * chute, e o prompt pede exatamente isso.
 */
export const EnrichmentProposalSchema = z.object({
  brand: proposed(z.string()),
  weightGrams: proposed(z.number().int().positive()),
  dimensions: proposed(PackageDimensionsSchema),
  listingDescription: proposed(z.string()),
  attributes: z.array(ProposedAttributeSchema),
})

export type EnrichmentProposalSchema = z.infer<typeof EnrichmentProposalSchema>

/**
 * A corrida como a tela a vê.
 *
 * `source` só existe depois de `done`, e é o que separa "a IA achou" de "a IA
 * foi ver": pedir pesquisa não é ter pesquisado, e um provedor pode responder
 * de memória com a ferramenta na mão. `toolCallCount` é a prova, e a
 * `readiness()` da F110 lê a proveniência daí.
 *
 * `costMicrosUsd` viaja como **string**, o mesmo padrão do custo de mensagem:
 * é dinheiro, e um número em JSON é um double por especificação.
 */
export const EnrichmentRunSummary = z.object({
  id: z.string(),
  query: z.string(),
  productId: z.string().nullable(),
  mode: EnrichmentModeSchema,
  status: EnrichmentStatusSchema,
  source: ProvenanceSourceSchema.nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  costMicrosUsd: z.string(),
  toolCallCount: z.number().int().nonnegative(),
  proposal: EnrichmentProposalSchema.nullable(),
  /** As URLs que a pesquisa consultou. Vazio no modo estimar. */
  sources: z.array(z.string()),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
})

export type EnrichmentRunSummary = z.infer<typeof EnrichmentRunSummary>

export const EnrichmentRunResponse = z.object({
  run: EnrichmentRunSummary,
})

export type EnrichmentRunResponse = z.infer<typeof EnrichmentRunResponse>

/**
 * Uma mudança de preço ou custo, como a ficha do produto a mostra (F125).
 *
 * Decimais como texto — ADR-0016. `marginPercent` é markup sobre o custo
 * (F123), nulo quando não havia custo para calcular.
 */
export const PriceChangeSummary = z.object({
  id: z.string(),
  kind: z.enum(['sale_price', 'cost']),
  priceListName: z.string().nullable(),
  previousAmount: z.string().nullable(),
  newAmount: z.string(),
  costAtChange: z.string().nullable(),
  marginPercent: z.string().nullable(),
  source: z.enum(['product-form', 'price-list', 'purchase', 'import']),
  note: z.string().nullable(),
  actorName: z.string().nullable(),
  occurredAt: z.string(),
})

export type PriceChangeSummary = z.infer<typeof PriceChangeSummary>

export const PriceChangeList = z.object({
  items: z.array(PriceChangeSummary),
})

export type PriceChangeList = z.infer<typeof PriceChangeList>

/**
 * O que uma etiqueta precisa saber de uma variante (F124, origem "entrada de
 * compra").
 *
 * Uma consulta para várias variantes: a linha de compra sabe a variante e a
 * descrição do fornecedor, e não sabe o SKU, o GTIN nem o preço de venda — e
 * alargar a resposta do recebimento (uma rota transacional) por causa de uma
 * tela seria o acoplamento errado. A etiqueta busca no catálogo.
 */
export const VariantLabelInfo = z.object({
  variantId: z.string(),
  productId: z.string(),
  name: z.string(),
  sku: z.string(),
  gtin: z.string().nullable(),
  /** Preço base da tabela padrão. Nulo quando não há — a etiqueta sai sem preço. */
  salePrice: z.string().nullable(),
  /** Marca e unidade, para os campos do editor de etiqueta (F129). */
  brand: z.string().nullable(),
  unit: z.string(),
  /** F141. Opcionais para quem guardou a fila antes deles. */
  supplierReference: z.string().nullable().optional(),
  /** A localização na filial da sessão (F141). */
  location: z.string().nullable().optional(),
})

export type VariantLabelInfo = z.infer<typeof VariantLabelInfo>

export const VariantLabelInfoList = z.object({
  items: z.array(VariantLabelInfo),
})

export type VariantLabelInfoList = z.infer<typeof VariantLabelInfoList>

const idList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
  )
  .pipe(z.array(z.uuid()).min(1).max(100))

/**
 * Códigos lidos pelo leitor: código de barras ou código do produto (F184).
 *
 * Texto, e não uuid: quem bipa não conhece id nenhum. Separados por vírgula
 * como as outras duas listas — um código com vírgula dentro não existe em
 * leitor de código de barras nem no cadastro da loja.
 */
const codeList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
  )
  .pipe(z.array(z.string().min(1).max(64)).min(1).max(100))

export const VariantLabelInfoQuery = z
  .object({
    /** Variantes, separadas por vírgula — o que a linha de compra conhece. */
    ids: idList.optional(),
    /**
     * Produtos, separados por vírgula — o que a seleção do catálogo conhece.
     * Cada um resolve para a sua variante padrão, que é a que tem preço e é a
     * que a etiqueta imprime. Cem, pelo mesmo teto de `ids`.
     */
    productIds: idList.optional(),
    /**
     * Códigos de barras ou códigos de produto — o que o LEITOR conhece (F184).
     *
     * A tela de etiquetas passa a bipar, e quem só etiqueta não tem
     * `sales.write`, que é o que o `/pos/lookup` exige. Aqui a permissão é
     * `catalog.read`, que é o que etiquetar de fato precisa.
     */
    codes: codeList.optional(),
  })
  .refine(
    (query) =>
      [query.ids, query.productIds, query.codes].filter(
        (value) => value !== undefined
      ).length === 1,
    { message: 'Informe ids, productIds OU codes' }
  )

/**
 * O acerto de códigos das cores (F181).
 *
 * Uma linha por cor que muda: o código que ela tem, o que vai ter, e se ganha
 * código de barras. A padrão é a única que troca de código — ela é quem ganha
 * o `-1`.
 */
export const ColourCodeChangeSummary = z.object({
  productName: z.string(),
  colourName: z.string().nullable(),
  sku: z.string(),
  newSku: z.string(),
  generatesGtin: z.boolean(),
})

export type ColourCodeChangeSummary = z.infer<typeof ColourCodeChangeSummary>

export const ColourCodePlanResponse = z.object({
  /** Produtos com algo a acertar. */
  products: z.number().int().nonnegative(),
  /** Cores que mudam de código. */
  renames: z.number().int().nonnegative(),
  /** Cores que ganham código de barras interno. */
  barcodes: z.number().int().nonnegative(),
  /** Quantas linhas o acerto tem ao todo — `changes` mostra as primeiras. */
  total: z.number().int().nonnegative(),
  changes: z.array(ColourCodeChangeSummary),
  /** Produtos cujo `-1` já é de outra peça: ficam como estão. */
  blocked: z.array(
    z.object({
      productName: z.string(),
      sku: z.string(),
      wanted: z.string(),
    })
  ),
})

export type ColourCodePlanResponse = z.infer<typeof ColourCodePlanResponse>
