import { z } from 'zod'

import { SearchModeSchema } from './search-mode.ts'

/**
 * As preferências de quem usa — F127.
 *
 * O servidor não guarda JSON livre: só as chaves daqui, cada uma com o formato
 * dela, validado na gravação e de novo na leitura. Uma chave nova é uma linha
 * nesta lista e um schema — nunca "qualquer coisa que a tela mandar".
 */

/**
 * As colunas que a lista de Produtos sabe mostrar.
 *
 * Os ids moram no contrato, e não só na tela, porque o servidor recusa id
 * desconhecido: sem isto, uma coluna renomeada na tela deixaria preferências
 * gravadas apontando para o nada, e a lista abriria sem as colunas da pessoa.
 */
export const PRODUCT_COLUMN_IDS = [
  'photo',
  'sku',
  'name',
  'brand',
  // F163: a família da peça — tela, bateria.
  'category',
  'unit',
  'gtin',
  'ncm',
  // F141
  'supplierReference',
  'location',
  'price',
  'cost',
  'margin',
  'stock',
  'available',
  'lastPurchaseAt',
  'priceChangedAt',
  'condition',
  'warranty',
  'weight',
  'status',
  'createdAt',
  'updatedAt',
] as const

export type ProductColumnId = (typeof PRODUCT_COLUMN_IDS)[number]

/** As colunas que a lista de Clientes sabe mostrar. */
export const PARTY_COLUMN_IDS = [
  'code',
  'name',
  'document',
  'roles',
  'kind',
  'phone',
  'email',
  'city',
  'creditLimit',
  'voucherBalance',
  'salesperson',
  /** O vendedor do cliente — a carteira (F210). */
  'portfolio',
  'createdAt',
  'lastPurchaseAt',
  'stateRegistration',
  'status',
] as const

export type PartyColumnId = (typeof PARTY_COLUMN_IDS)[number]

/**
 * As colunas que a lista de Estoque sabe mostrar — F167.
 *
 * `sku`, `name`, `onHand`, `reserved`, `available` e `updatedAt` são as de
 * sempre; as outras nasceram quando o catálogo passou de cinco mil peças e a
 * loja precisou ver a barra da etiqueta e o dinheiro ao lado do saldo.
 */
export const STOCK_COLUMN_IDS = [
  'sku',
  'gtin',
  'name',
  'brand',
  'category',
  'unit',
  'onHand',
  'reserved',
  'available',
  'cost',
  'price',
  'margin',
  'costValue',
  'saleValue',
  'updatedAt',
] as const

export type StockColumnId = (typeof STOCK_COLUMN_IDS)[number]

/**
 * As colunas que a fila de produção sabe mostrar — F170.
 *
 * Na ordem da planilha "FILA DE PRODUÇÃO" da 4Play, que é a ordem em que a
 * loja lê um pedido: quem é, quem desenha, quando sai, do que é feito, quanto
 * vale, em qual máquina, o que falta e em que pé está.
 */
export const PRODUCTION_COLUMN_IDS = [
  'number',
  'customer',
  'city',
  'designer',
  'dispatchDate',
  'fabric',
  'personalized',
  'pieces',
  'total',
  'paymentMark',
  'ticket',
  'salesperson',
  'printers',
  'artReady',
  'productionFileReady',
  'gradeChecked',
  'logistics',
  'event',
  'notes',
  'artStatus',
  'stage',
] as const

export type ProductionColumnId = (typeof PRODUCTION_COLUMN_IDS)[number]

/**
 * Onde a busca procura o texto, por tela — F167.
 *
 * Preferência de pessoa e não da loja, como as colunas: o balconista procura
 * pelo começo do nome, quem confere nota procura pelo pedaço do meio. Guardada
 * no servidor pela mesma razão das colunas — vale em qualquer computador em
 * que ela entrar, inclusive no desktop da loja.
 */
const searchMode = SearchModeSchema

const visibleColumns = <const T extends readonly [string, ...string[]]>(
  ids: T
) =>
  z.object({
    // Ordem de quem marcou não importa aqui: a tela desenha na ordem dela.
    visible: z.array(z.enum(ids)).max(ids.length),
  })

export const PREFERENCE_SCHEMAS = {
  'table.products.columns': visibleColumns(PRODUCT_COLUMN_IDS),
  'table.parties.columns': visibleColumns(PARTY_COLUMN_IDS),
  'table.stock.columns': visibleColumns(STOCK_COLUMN_IDS),
  'table.production.columns': visibleColumns(PRODUCTION_COLUMN_IDS),
  // Tabela (a planilha) ou quadro (as etapas em colunas) — F171.
  'production.view': z.object({ view: z.enum(['table', 'board']) }),
  'search.mode': z.object({
    products: searchMode.default('anywhere'),
    stock: searchMode.default('anywhere'),
  }),
  // O último modelo de etiqueta escolhido. Nulo é "o padrão da loja".
  'labels.lastTemplateId': z.object({ templateId: z.uuid().nullable() }),
  /*
   * O nome que ESTE atendente dá ao contato no Atendimento (01/10).
   *
   * Só dele: o cadastro do cliente, o nome de perfil do WhatsApp e o que os
   * outros atendentes veem não mudam. Por contato (`communication_contact`),
   * com um teto para a preferência não crescer sem fim.
   */
  'inbox.contactNames': z.object({
    names: z
      .record(z.uuid(), z.string().trim().min(1).max(60))
      .refine((names) => Object.keys(names).length <= 2000, {
        message: 'Nomes demais guardados. Apague alguns antes.',
      }),
  }),
} as const

export const PREFERENCE_KEYS = [
  'table.products.columns',
  'table.parties.columns',
  'table.stock.columns',
  'table.production.columns',
  'production.view',
  'search.mode',
  'labels.lastTemplateId',
  'inbox.contactNames',
] as const satisfies readonly (keyof typeof PREFERENCE_SCHEMAS)[]

export const PreferenceKeySchema = z.enum(PREFERENCE_KEYS)
export type PreferenceKey = z.infer<typeof PreferenceKeySchema>

export type PreferenceValue<K extends PreferenceKey> = z.infer<
  (typeof PREFERENCE_SCHEMAS)[K]
>

export const PreferenceSummary = z.object({
  key: PreferenceKeySchema,
  value: z.record(z.string(), z.unknown()),
  version: z.number().int().min(1),
  updatedAt: z.string(),
})
export type PreferenceSummaryType = z.infer<typeof PreferenceSummary>

export const PreferenceList = z.object({
  preferences: z.array(PreferenceSummary),
})
export type PreferenceListType = z.infer<typeof PreferenceList>

export const SetPreferenceRequest = z.object({
  value: z.record(z.string(), z.unknown()),
  /** A versão lida. `0` é "ainda não existe": a primeira gravação. */
  version: z.number().int().min(0),
})
export type SetPreferenceRequestType = z.infer<typeof SetPreferenceRequest>
