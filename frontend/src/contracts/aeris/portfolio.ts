import { z } from 'zod'

/**
 * A base de clientes e a divisão da carteira (F401).
 *
 * O Swat, 07/11: os que compram ele divide entre as três vendedoras; os que
 * não compram nem mandam mensagem ele baixa num relatório para uma menina
 * chamar. Os grupos são contados na hora, num período escolhido na tela.
 */

export const PORTFOLIO_GROUP_VALUES = [
  'compra_conversa',
  'compra_balcao',
  'conversa',
  'parado',
] as const
export const PortfolioGroup = z.enum(PORTFOLIO_GROUP_VALUES)
export type PortfolioGroup = z.infer<typeof PortfolioGroup>

const Money = z.string()

export const PortfolioQuery = z.object({
  days: z.coerce.number().int().min(7).max(365).default(90),
  group: PortfolioGroup.optional(),
  /** Uma vendedora, ou `none` para "sem vendedora". */
  seller: z.union([z.uuid(), z.literal('none')]).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
export type PortfolioQuery = z.infer<typeof PortfolioQuery>

export const PortfolioRow = z.object({
  partyId: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  phone: z.string().nullable(),
  group: PortfolioGroup,
  sellerId: z.uuid().nullable(),
  sellerName: z.string().nullable(),
  lastSaleAt: z.iso.datetime().nullable(),
  salesInPeriod: z.number().int(),
  amountInPeriod: Money,
  amountYear: Money,
  lastInboundAt: z.iso.datetime().nullable(),
  /** O número (a vendedora ou a loja) para o qual ele escreveu por último. */
  lastAccountLabel: z.string().nullable(),
  /** Os donos dos números com que ele já falou: por onde a vendedora alcança. */
  talksToUserIds: z.array(z.uuid()),
})
export type PortfolioRow = z.infer<typeof PortfolioRow>

export const PortfolioSeller = z.object({
  userId: z.uuid(),
  name: z.string(),
  customers: z.number().int(),
})
export type PortfolioSeller = z.infer<typeof PortfolioSeller>

export const PortfolioResponse = z.object({
  days: z.number().int(),
  counts: z.record(PortfolioGroup, z.number().int()),
  total: z.number().int(),
  rows: z.array(PortfolioRow),
  /** Os membros ativos da loja, para dividir e trocar, com o tamanho da carteira. */
  sellers: z.array(PortfolioSeller),
})
export type PortfolioResponse = z.infer<typeof PortfolioResponse>

export const PORTFOLIO_SPLIT_MODE_VALUES = ['equilibrar', 'sortear'] as const
export const PortfolioSplitMode = z.enum(PORTFOLIO_SPLIT_MODE_VALUES)

/** Quem entra na divisão: os ids marcados, ou o filtro da tela inteiro. */
export const PortfolioSplitPreviewRequest = z.object({
  days: z.number().int().min(7).max(365),
  group: PortfolioGroup.nullable(),
  seller: z.union([z.uuid(), z.literal('none')]).nullable(),
  q: z.string().trim().max(120).nullable(),
  partyIds: z.array(z.uuid()).max(5000).nullable(),
  sellerIds: z.array(z.uuid()).min(1).max(20),
  mode: PortfolioSplitMode,
  keepAssigned: z.boolean(),
})
export type PortfolioSplitPreviewRequest = z.infer<
  typeof PortfolioSplitPreviewRequest
>

export const PortfolioSplitPreviewResponse = z.object({
  totals: z.array(
    z.object({
      userId: z.uuid(),
      name: z.string(),
      customers: z.number().int(),
      amount: Money,
      /** Destes, quantos já escreveram para o número dela. */
      reachable: z.number().int(),
    })
  ),
  assignments: z.array(
    z.object({
      partyId: z.uuid(),
      name: z.string(),
      amount: Money,
      fromUserId: z.uuid().nullable(),
      toUserId: z.uuid(),
      unchanged: z.boolean(),
    })
  ),
  kept: z.number().int(),
})
export type PortfolioSplitPreviewResponse = z.infer<
  typeof PortfolioSplitPreviewResponse
>

export const PortfolioSplitRequest = z.object({
  assignments: z
    .array(z.object({ partyId: z.uuid(), toUserId: z.uuid() }))
    .min(1)
    .max(5000),
})
export type PortfolioSplitRequest = z.infer<typeof PortfolioSplitRequest>

export const PortfolioSplitResponse = z.object({
  changed: z.number().int(),
  unchanged: z.number().int(),
})
export type PortfolioSplitResponse = z.infer<typeof PortfolioSplitResponse>

export const SetPartySalespersonRequest = z.object({
  userId: z.uuid().nullable(),
})
export type SetPartySalespersonRequest = z.infer<
  typeof SetPartySalespersonRequest
>

// ---------------------------------------------------------------------------
// O relatório de cada vendedora (F403)
// ---------------------------------------------------------------------------

export const PerformanceQuery = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
})
export type PerformanceQuery = z.infer<typeof PerformanceQuery>

export const SellerPerformance = z.object({
  userId: z.uuid(),
  name: z.string(),
  portfolio: z.object({
    customers: z.number().int(),
    bought: z.number().int(),
    sales: z.number().int(),
    amount: Money,
    stopping: z.number().int(),
    boughtWithOther: z.number().int(),
    amountWithOther: Money,
  }),
  attendance: z.object({
    turns: z.number().int(),
    answered: z.number().int(),
    /** A mediana da 1ª resposta, em minutos de loja aberta. */
    medianOpenMinutes: z.number().int().nullable(),
    vacuum: z.number().int(),
    waitingNow: z.number().int(),
    wroteToOther: z.number().int(),
    messagesSent: z.number().int(),
  }),
  quality: z.object({
    aftersaleAsked: z.number().int(),
    aftersaleWorked: z.number().int(),
    aftersaleProblem: z.number().int(),
    exchanges: z.number().int(),
    exchangesDefect: z.number().int(),
    exchangeAmount: Money,
    cancelled: z.number().int(),
    optedOut: z.number().int(),
  }),
  collection: z.object({
    overdueCustomers: z.number().int(),
    overdueAmount: Money,
    notContacted: z.number().int(),
  }),
})
export type SellerPerformance = z.infer<typeof SellerPerformance>

export const PerformanceResponse = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  previousFrom: z.iso.datetime(),
  /** Mais que isto sem resposta, com a loja aberta, é "vácuo". */
  vacuumMinutes: z.number().int(),
  current: z.array(SellerPerformance),
  previous: z.array(SellerPerformance),
})
export type PerformanceResponse = z.infer<typeof PerformanceResponse>

export const PERFORMANCE_LIST_VALUES = [
  'parando',
  'com_outra',
  'vacuo',
  'problema',
  'trocas',
  'nao_cobrados',
] as const
export const PerformanceList = z.enum(PERFORMANCE_LIST_VALUES)
export type PerformanceList = z.infer<typeof PerformanceList>

export const PerformanceListQuery = PerformanceQuery.extend({
  list: PerformanceList,
})
export type PerformanceListQuery = z.infer<typeof PerformanceListQuery>

export const PerformanceListResponse = z.object({
  rows: z.array(
    z.object({
      partyId: z.uuid(),
      name: z.string(),
      phone: z.string().nullable(),
      at: z.iso.datetime().nullable(),
      amount: Money.nullable(),
      note: z.string().nullable(),
    })
  ),
})
export type PerformanceListResponse = z.infer<typeof PerformanceListResponse>
