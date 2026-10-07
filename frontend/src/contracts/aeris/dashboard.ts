import { z } from 'zod'

/**
 * O painel da loja (F134): o Início de quem dirige.
 *
 * Duas respostas, e não uma, por causa de como a tela é usada:
 *
 * - `/dashboard/sales` depende do PERÍODO escolhido — trocar "Hoje" por "Este
 *   mês" refaz só ela;
 * - `/dashboard/now` é a situação AGORA — quem deve, o que vence, o que ficou
 *   esquecido, o estoque abaixo do mínimo — e se atualiza sozinha a cada
 *   minuto, sem refazer a consulta pesada do período.
 *
 * Dinheiro e quantidade como string, pelo mesmo motivo do resto da API
 * (ADR-0016): um total de mês em float termina em `,0000000001`.
 */

const money = z.string()

const isTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Um fuso IANA de verdade: é ele que diz em que dia caiu a venda das 23:30. */
const TimeZone = z
  .string()
  .trim()
  .max(64)
  .refine(isTimeZone, 'Fuso horário desconhecido.')
  .default('America/Sao_Paulo')

/** O teto do período: um ano e um dia, para "o ano passado inteiro" caber. */
export const DASHBOARD_MAX_PERIOD_DAYS = 366

export const DashboardSalesQuery = z
  .object({
    /** Início do período, inclusivo. */
    from: z.iso.datetime({ offset: true }),
    /** Fim do período, EXCLUSIVO: "hoje" é da meia-noite até a meia-noite seguinte. */
    to: z.iso.datetime({ offset: true }),
    branchId: z.uuid().optional(),
    timeZone: TimeZone,
  })
  .refine((query) => new Date(query.from) < new Date(query.to), {
    message: 'O fim do período tem de vir depois do começo.',
    path: ['to'],
  })
  .refine(
    (query) =>
      new Date(query.to).getTime() - new Date(query.from).getTime() <=
      DASHBOARD_MAX_PERIOD_DAYS * 86_400_000,
    {
      message: `O período vai até ${String(DASHBOARD_MAX_PERIOD_DAYS)} dias.`,
      path: ['to'],
    }
  )

export type DashboardSalesQuery = z.input<typeof DashboardSalesQuery>

export const DashboardNowQuery = z.object({
  branchId: z.uuid().optional(),
  timeZone: TimeZone,
})

export type DashboardNowQuery = z.input<typeof DashboardNowQuery>

const CountAmount = z.object({
  count: z.number().int().nonnegative(),
  amount: money,
})

export type DashboardCountAmount = z.infer<typeof CountAmount>

const SalesTotals = z.object({
  /** Vendas concluídas e pedidos de entrega despachados, sem cancelados. */
  revenue: money,
  count: z.number().int().nonnegative(),
  /** `revenue / count`, arredondado a centavos. Zero sem venda. */
  averageTicket: money,
  /** O que saiu de desconto: soma de `subtotal − total` das vendas. */
  discountTotal: money,
  cancelled: CountAmount,
  /**
   * Custo do que foi vendido, lucro e margem (F161).
   *
   * Com `.default`: a tela desta loja já rodou com servidor mais velho que ela.
   */
  cost: money.default('0.00'),
  profit: money.default('0.00'),
  /** `"50.0"` é 50%. Nulo sem faturamento. */
  marginPercent: z.string().nullable().default(null),
  averageProfit: money.default('0.00'),
  averageCost: money.default('0.00'),
  /** Linhas cujo custo é o médio de HOJE, e não o do dia da venda. */
  costEstimatedLines: z.number().int().nonnegative().default(0),
  /** Linhas sem custo nenhum: ficam fora do custo, e o lucro sai maior. */
  costMissingLines: z.number().int().nonnegative().default(0),
})

export type DashboardSalesTotals = z.infer<typeof SalesTotals>

export const DashboardSalesResponse = z.object({
  period: z.object({
    from: z.string(),
    to: z.string(),
    /** A janela anterior de mesmo tamanho, que é com quem `previous` compara. */
    previousFrom: z.string(),
    bucket: z.enum(['hour', 'day']),
  }),
  sales: SalesTotals,
  previous: SalesTotals,
  /** Um ponto por hora (até 2 dias) ou por dia, inclusive os vazios. */
  series: z.array(
    z.object({
      start: z.string(),
      revenue: money,
      count: z.number().int().nonnegative(),
    })
  ),
  /** O que entrou de fato: pagamentos `settled` das vendas do período. */
  byPaymentMethod: z.array(
    z.object({
      methodKind: z.string(),
      amount: money,
      count: z.number().int().nonnegative(),
    })
  ),
  /**
   * O que ENTROU por forma de pagamento, no dia em que entrou (F214): venda
   * do balcão, baixa do crediário e acerto do motoboy; o troco sai do
   * dinheiro, o estorno subtrai. Pela forma da loja, com o nome dela.
   */
  receivedByMethod: z
    .array(
      z.object({
        paymentMethodId: z.string(),
        name: z.string(),
        kind: z.string(),
        amount: money,
        count: z.number().int().nonnegative(),
      })
    )
    .default([]),
  /** Vendido no crediário no período: entra depois, quando o cliente paga. */
  creditSales: CountAmount.default({ count: 0, amount: '0.00' }),
  bySalesperson: z.array(
    z.object({
      /** Nulo é "sem vendedor": a venda que ninguém assinou também é venda. */
      userId: z.string().nullable(),
      name: z.string().nullable(),
      revenue: money,
      salesCount: z.number().int().nonnegative(),
      averageTicket: money,
      quotesCreated: z.number().int().nonnegative(),
      quotesConverted: z.number().int().nonnegative(),
      /** Convertidos sobre criados, em porcentagem com uma casa. Nulo sem orçamento. */
      conversionRate: z.string().nullable(),
    })
  ),
  /**
   * Os orçamentos FEITOS no período, pelo que aconteceu com cada um até agora.
   *
   * `created` é o total; os demais repartem ele, e `accepted` inclui os que
   * já viraram venda — é o degrau de cima do funil, e não um estado exclusivo.
   */
  quoteFunnel: z.object({
    created: CountAmount,
    open: CountAmount,
    accepted: CountAmount,
    converted: CountAmount,
    rejected: CountAmount,
    expired: CountAmount,
    cancelled: CountAmount,
    conversionRate: z.string().nullable(),
  }),
  topProducts: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      sku: z.string(),
      quantity: z.string(),
      revenue: money,
    })
  ),
  exchanges: z.object({
    completed: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    /** O valor das peças que voltaram nas trocas concluídas (F236). */
    returnedAmount: money.default('0.00'),
    vouchersIssued: CountAmount,
    /** Quanto de vale foi usado para pagar, em valor positivo. */
    vouchersRedeemed: money,
    /**
     * A parte da gestão antiga (F214): troca sem venda do Aeris (F148). O
     * vale antigo é gasto primeiro. Opcionais para uma tela mais velha.
     */
    completedOld: z.number().int().nonnegative().default(0),
    defect: z.number().int().nonnegative().default(0),
    defectOld: z.number().int().nonnegative().default(0),
    vouchersIssuedOld: CountAmount.default({ count: 0, amount: '0.00' }),
    vouchersRedeemedOld: money.default('0.00'),
  }),
  /**
   * O que mais VOLTA em troca (F150): a peça que o cliente devolveu.
   *
   * Não a que ele levou. Esta lista é a que diz de qual produto — e de qual
   * fornecedor — a loja está se arrependendo.
   */
  returnedProducts: z.array(
    z.object({
      /** Nulo na peça de fora digitada (F148), que não tem cadastro. */
      productId: z.string().nullable(),
      name: z.string(),
      sku: z.string().nullable(),
      quantity: z.string(),
      amount: money,
      /** Em quantas trocas distintas ele apareceu. */
      exchanges: z.number().int().nonnegative(),
    })
  ),
})

export type DashboardSalesResponse = z.infer<typeof DashboardSalesResponse>

const DueBuckets = z.object({
  overdue: CountAmount,
  dueToday: CountAmount,
  dueNext7Days: CountAmount,
})

/** O que ficou parado, e com quem. */
export const ForgottenKind = z.enum([
  'quote_stalled',
  'draft_stalled',
  'order_unfulfilled',
  'delivery_open',
  'exchange_requested',
  'channel_order_stuck',
  'till_left_open',
])

export type ForgottenKind = z.infer<typeof ForgottenKind>

export const DashboardNowResponse = z.object({
  receivables: DueBuckets.extend({
    /** Quantos clientes diferentes têm alguma coisa vencida. */
    overdueCustomers: z.number().int().nonnegative(),
    topDebtors: z.array(
      z.object({
        partyId: z.string(),
        name: z.string(),
        outstanding: money,
        /** Nulo quando deve, mas nada venceu ainda. */
        oldestOverdueDays: z.number().int().nullable(),
      })
    ),
  }),
  payables: DueBuckets,
  /** Orçamentos em aberto que expiram nos próximos 3 dias. */
  quotesExpiring: CountAmount,
  vouchers: z.object({
    /** O que a loja deve em vale: a soma dos saldos positivos. */
    outstanding: money,
    customers: z.number().int().nonnegative(),
    /** Quanto disso é vale da gestão antiga (F214), e de quantos clientes. */
    outstandingOld: money.default('0.00'),
    customersOld: z.number().int().nonnegative().default(0),
  }),
  stock: z.object({
    belowMinimum: z.number().int().nonnegative(),
    zero: z.number().int().nonnegative(),
    negative: z.number().int().nonnegative(),
    awaitingStock: z.number().int().nonnegative(),
    /** Os que mais faltam para chegar ao mínimo. */
    belowMinimumItems: z.array(
      z.object({
        variantId: z.string(),
        productId: z.string(),
        name: z.string(),
        sku: z.string(),
        onHand: z.string(),
        minimumStock: z.string(),
      })
    ),
  }),
  forgotten: z.array(
    z.object({
      kind: ForgottenKind,
      count: z.number().int().nonnegative(),
      /** Nulo quando não é dinheiro (troca pedida, caixa esquecido aberto). */
      amount: money.nullable(),
      oldestAt: z.string().nullable(),
      byPerson: z.array(
        z.object({
          id: z.string().nullable(),
          name: z.string().nullable(),
          count: z.number().int().nonnegative(),
        })
      ),
    })
  ),
})

export type DashboardNowResponse = z.infer<typeof DashboardNowResponse>

/**
 * Quem pagou, por forma — F217. Uma linha por venda e forma (o troco já sai
 * do dinheiro) e uma por baixa de título. A soma de cada forma é o total do
 * "Recebido por forma" do mesmo período.
 */
export const DashboardReceivedResponse = z.object({
  entries: z.array(
    z.object({
      paymentMethodId: z.string(),
      methodName: z.string(),
      methodKind: z.string(),
      at: z.string(),
      amount: z.string(),
      source: z.enum(['sale', 'settlement']),
      documentNumber: z.string().nullable(),
      documentKind: z.enum(['quote', 'order', 'sale']).nullable(),
      customerName: z.string().nullable(),
      description: z.string().nullable(),
      instalment: z.string().nullable(),
      courierName: z.string().nullable(),
    })
  ),
})
export type DashboardReceivedResponse = z.infer<
  typeof DashboardReceivedResponse
>
