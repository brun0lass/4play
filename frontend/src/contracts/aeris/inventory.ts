import { z } from 'zod'

import { SearchModeSchema, type SearchMode } from './search-mode.ts'

/**
 * Inventory contracts.
 *
 * Every quantity on this wire is a STRING, never a JSON number.
 *
 * That is not a stylistic choice. A JSON number is an IEEE-754 double by
 * specification, so `JSON.parse` would round it before any code of ours ran —
 * including inside a client we do not control. Master Specification sections 9
 * and 40 and ADR-0016 all say the same thing, and this is the boundary where
 * saying it costs something and therefore where it is usually abandoned.
 *
 * The format is the machine one: a point, no thousands separators, at most six
 * decimal places (QUANTITY_SCALE). Human input — `1.234,5` — is parsed in the
 * browser and never sent in that shape.
 */

export const MOVEMENT_KIND_VALUES = [
  'entry',
  'exit',
  'adjustment',
  'transfer_out',
  'transfer_in',
] as const

export const MovementKindSchema = z.enum(MOVEMENT_KIND_VALUES)

export const MovementDirectionSchema = z.enum(['in', 'out'])

export const MOVEMENT_SOURCE_TYPE_VALUES = [
  'manual',
  'adjustment',
  'transfer',
  // Added with F013: a completed sale's exit and a cancelled sale's reversing
  // entry both carry it. Response schemas are compiled from these values, so a
  // movement whose source is missing here would be serialised as an empty
  // string rather than reported.
  'sale',
  // Added with F019: a receipt against a purchase, and the only source that
  // carries a cost worth reading — it is where `average_cost` comes from.
  'purchase',
  // F126: uma troca — a peça que volta ao estoque e a que o cliente leva.
  'exchange',
] as const

export const MovementSourceTypeSchema = z.enum(MOVEMENT_SOURCE_TYPE_VALUES)

/**
 * A quantity as it travels: `"12"`, `"1.5"`, `"0.750000"`.
 *
 * The regular expression is the validation. A `z.number()` with a `.refine()`
 * would already have lost the value by the time the refinement ran.
 */
const QUANTITY_PATTERN = /^\d{1,12}(\.\d{1,6})?$/

const quantityField = (message: string) =>
  z.string().trim().regex(QUANTITY_PATTERN, message)

/**
 * A movement quantity: positive, so a bare zero is refused here as well as in
 * the domain.
 *
 * "Contains a digit other than zero" rather than `parseFloat(value) > 0`,
 * because parsing to a float to check a sign would reintroduce, in the
 * validator, the representation this whole file avoids. The pattern above has
 * already established the shape, so a nonzero digit is exactly nonzero.
 */
const positiveQuantityField = quantityField(
  'Informe uma quantidade com até 6 casas decimais, usando ponto.'
).refine(
  (value) => /[1-9]/.test(value),
  'A quantidade deve ser maior que zero.'
)

/**
 * A counted quantity, which MAY be zero.
 *
 * "I counted the shelf and it is empty" is the single most common adjustment
 * there is, and a schema that refused it would push people into recording a
 * fake exit instead.
 */
const countedQuantityField = quantityField(
  'Informe a quantidade contada com até 6 casas decimais, usando ponto.'
)

const optionalNote = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .default(null)

export const StockBalanceSummary = z.object({
  variantId: z.string(),
  productId: z.string(),
  productName: z.string(),
  sku: z.string(),
  gtin: z.string().nullable(),
  unit: z.string(),
  branchId: z.string(),
  /** What is physically there. */
  onHand: z.string(),
  /**
   * Always `"0"` today, and deliberately present.
   *
   * Sales will populate it. Sending it now means the screen that reads it does
   * not change shape when they do — see docs/features/F010-inventory.md.
   */
  reserved: z.string(),
  /** `onHand - reserved`, computed by the database. */
  available: z.string(),
  /**
   * Null for a product that has never moved in this branch.
   *
   * The list is driven from the catalogue, so a product with no history
   * appears at zero — and there is no balance row to carry a date. Reporting
   * "now" instead would claim a movement that never happened.
   */
  updatedAt: z.string().nullable(),
  /**
   * O estoque mínimo da variante (F134). Nulo é sem mínimo.
   *
   * Presente na LISTA de saldos, que lê a variante; ausente no saldo devolvido
   * por um movimento, que não precisa dele para dizer o que mudou.
   */
  minimumStock: z.string().nullable().optional(),
  /**
   * O que a tela de Estoque mostra nas colunas que a pessoa escolher (F167).
   *
   * Opcionais como `minimumStock` e pela mesma razão: o mesmo objeto volta de
   * um MOVIMENTO, que não lê o produto inteiro — e uma tela nova falando com
   * um servidor velho recebe ausente, não quebrado.
   */
  brand: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  /** Custo médio da variante, texto decimal. Nulo é "ninguém informou". */
  averageCost: z.string().nullable().optional(),
  /** Preço da tabela padrão, texto decimal. Nulo é "sem preço". */
  salePrice: z.string().nullable().optional(),
})

export type StockBalanceSummary = z.infer<typeof StockBalanceSummary>

/**
 * Quanto tem, e quanto vale — F163.
 *
 * O dono abre o Estoque, escolhe "Bateria" e quer os dois números: unidades e
 * dinheiro. São do FILTRO inteiro, não da página, e vêm da mesma janela que
 * conta as linhas — duas consultas poderiam discordar sobre uma peça vendida
 * entre elas.
 *
 * Tudo em texto decimal, nunca `number`: um JSON number é um double, e somar
 * 1.205 telas em ponto flutuante é como o dinheiro do ERP começa a não fechar.
 */
export const StockTotals = z.object({
  /** A soma do que está em mãos, na unidade de cada peça. */
  units: z.string().default('0'),
  /** Unidades × custo médio: o dinheiro parado na prateleira. */
  costValue: z.string().default('0.00'),
  /** Unidades × preço da tabela padrão: quanto daria se vendesse tudo. */
  saleValue: z.string().default('0.00'),
  /** A diferença entre os dois. */
  profitValue: z.string().default('0.00'),
  /** A margem, uma casa decimal. Nula quando não há preço nenhum. */
  marginPercent: z.string().nullable().default(null),
  /**
   * Quantas peças COM saldo não têm custo (ou preço) cadastrado.
   *
   * Sem isto, custo nulo viraria zero e o lucro apareceria como 100% — um
   * número bonito e falso, que é o pior tipo.
   */
  missingCost: z.number().int().nonnegative().default(0),
  missingPrice: z.number().int().nonnegative().default(0),
})

export type StockTotals = z.infer<typeof StockTotals>

export const StockBalanceList = z.object({
  items: z.array(StockBalanceSummary),
  total: z.number().int().nonnegative(),
  /** F163 — do filtro inteiro, não da página. */
  totals: StockTotals.default({
    units: '0',
    costValue: '0.00',
    saleValue: '0.00',
    profitValue: '0.00',
    marginPercent: null,
    missingCost: 0,
    missingPrice: 0,
  }),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  branchId: z.string(),
})

export type StockBalanceList = z.infer<typeof StockBalanceList>

export const StockMovementSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  variantId: z.string(),
  kind: MovementKindSchema,
  direction: MovementDirectionSchema,
  /** Always positive. `direction` carries the sign. */
  quantity: z.string(),
  unitCost: z.string().nullable(),
  sourceType: MovementSourceTypeSchema,
  sourceId: z.string().nullable(),
  note: z.string().nullable(),
  /** Null when the movement carries no identified actor. */
  actorName: z.string().nullable(),
  /** The branch balance immediately after this movement. */
  onHandAfter: z.string(),
  occurredAt: z.string(),
})

export type StockMovementSummary = z.infer<typeof StockMovementSummary>

export const StockMovementList = z.object({
  items: z.array(StockMovementSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type StockMovementList = z.infer<typeof StockMovementList>

export const StockBalanceListQuery = z.object({
  /** Absent means the branch on the session. Stock is always held somewhere. */
  branchId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  /**
   * Só as variantes de um produto (F131): a aba Estoque da ficha. Uma busca
   * pelo código acharia também `CABO-10` quando se procura `CABO-1`.
   */
  productId: z.uuid().optional(),
  /** Hides rows sitting at exactly zero, which is most of a large catalogue. */
  onlyWithStock: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /**
   * Só o que ficou negativo (F044).
   *
   * Saldo negativo é consequência de uma regra do produto, e não de um defeito:
   * quando a mesma peça foi vendida no balcão e no Edge, **nenhuma venda
   * perde** — as duas valem e o saldo vai abaixo de zero, para o sistema
   * reportar em vez de escolher qual cliente ficou sem.
   *
   * Um negativo que ninguém vê não foi reportado, e é isso que este filtro
   * existe para consertar: ele é a lista de trabalho de quem vai acertar a
   * prateleira.
   */
  negative: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /**
   * Só o que tem estoque mínimo e está abaixo dele nesta filial (F134): a
   * lista de reposição.
   */
  belowMinimum: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /** Só uma família de peça (F163): tela, bateria. */
  categoryId: z.string().min(1).optional(),
  /**
   * Só uma marca (F167).
   *
   * Texto, e não id: `product.brand` é texto desde a F158, porque o catálogo
   * já tinha marcas escritas à mão quando o cadastro nasceu. A comparação é
   * `ilike` sem curinga — igualdade que perdoa a caixa —, a mesma de Produtos.
   */
  brand: z.string().trim().min(1).max(120).optional(),
  /**
   * Como a busca procura (F167, terceiro modo na F190).
   *
   * `anywhere` é o de hoje e continua sendo o padrão: quem digita `13` acha
   * `IPHONE 13`. `prefix` é o do GDOOR, que a loja usa há anos. `exact` é o
   * código ou o código de barras inteiro — ver `search-mode.ts`.
   */
  searchMode: SearchModeSchema.default('anywhere'),
  page: z.coerce.number().int().min(1).default(1),
  // Capped: an uncapped page size is one request reading the whole table,
  // which is both a performance and a data-exfiltration concern.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /**
   * Por onde a lista se ordena (F185).
   *
   * Todas estas já saem no SELECT da página — custo médio e preço de venda
   * inclusive —, então cada uma é um ramo de `ORDER BY` e nenhuma custa junção
   * nova. "Valor em custo" e "valor em venda" são a multiplicação que a janela
   * de somas já faz para o rodapé.
   */
  sort: z
    .enum([
      'name',
      'sku',
      'brand',
      'category',
      'onHand',
      'reserved',
      'available',
      'averageCost',
      'salePrice',
      'margin',
      'costValue',
      'saleValue',
      'updatedAt',
    ])
    .default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type StockBalanceListQuery = z.input<typeof StockBalanceListQuery>

export type StockBalanceListParams = z.output<typeof StockBalanceListQuery>

/** What a client passes. Numbers are numbers. */
export type StockBalanceListRequest = {
  branchId?: string | undefined
  search?: string | undefined
  productId?: string | undefined
  onlyWithStock?: boolean | undefined
  negative?: boolean | undefined
  belowMinimum?: boolean | undefined
  categoryId?: string | undefined
  brand?: string | undefined
  searchMode?: SearchMode | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?:
    | 'name'
    | 'sku'
    | 'brand'
    | 'category'
    | 'onHand'
    | 'reserved'
    | 'available'
    | 'averageCost'
    | 'salePrice'
    | 'margin'
    | 'costValue'
    | 'saleValue'
    | 'updatedAt'
    | undefined
  direction?: 'asc' | 'desc' | undefined
}

export const StockMovementListQuery = z.object({
  variantId: z.string(),
  /** Absent means every branch in the tenant. */
  branchId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type StockMovementListQuery = z.input<typeof StockMovementListQuery>

export type StockMovementListParams = z.output<typeof StockMovementListQuery>

export type StockMovementListRequest = {
  variantId: string
  branchId?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

export const RecordEntryRequest = z.object({
  variantId: z.string(),
  branchId: z.string().optional(),
  quantity: positiveQuantityField,
  /**
   * What one unit cost. Optional, and only meaningful on an entry.
   *
   * Carried now although valuation is out of scope, because average cost and
   * FIFO cannot be computed retroactively from movements that never recorded
   * one.
   */
  unitCost: quantityField('Informe um custo válido, usando ponto.')
    .nullable()
    .default(null),
  note: optionalNote,
})

export type RecordEntryRequest = z.input<typeof RecordEntryRequest>
export type RecordEntryBody = z.output<typeof RecordEntryRequest>

export const RecordExitRequest = z.object({
  variantId: z.string(),
  branchId: z.string().optional(),
  quantity: positiveQuantityField,
  note: optionalNote,
})

export type RecordExitRequest = z.input<typeof RecordExitRequest>
export type RecordExitBody = z.output<typeof RecordExitRequest>

/**
 * Setting the balance to what somebody counted.
 *
 * `counted`, not `delta`. The operator knows what is on the shelf, not what
 * the difference is, and asking for the difference makes them do arithmetic
 * against a figure that may already have changed. The server computes the
 * delta from the locked row.
 */
export const AdjustStockRequest = z.object({
  variantId: z.string(),
  branchId: z.string().optional(),
  counted: countedQuantityField,
  note: optionalNote,
})

export type AdjustStockRequest = z.input<typeof AdjustStockRequest>
export type AdjustStockBody = z.output<typeof AdjustStockRequest>

export const TransferStockRequest = z.object({
  variantId: z.string(),
  fromBranchId: z.string(),
  toBranchId: z.string(),
  quantity: positiveQuantityField,
  note: optionalNote,
})

export type TransferStockRequest = z.input<typeof TransferStockRequest>
export type TransferStockBody = z.output<typeof TransferStockRequest>

/**
 * The answer to any write: the movement that was recorded and the balance it
 * produced.
 *
 * Both, because either alone is a half-truth. The movement without the balance
 * makes a screen re-fetch to find out what happened; the balance without the
 * movement is the mutable-field model this feature exists to avoid.
 */
export const StockMovementResponse = z.object({
  movement: StockMovementSummary,
  balance: StockBalanceSummary,
})

export type StockMovementResponse = z.infer<typeof StockMovementResponse>

/** A transfer is two movements and two balances, and says so. */
export const StockTransferResponse = z.object({
  transferId: z.string(),
  out: StockMovementResponse,
  in: StockMovementResponse,
})

export type StockTransferResponse = z.infer<typeof StockTransferResponse>
