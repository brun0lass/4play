import { z } from 'zod'

/**
 * Comissão dos vendedores (F137).
 *
 * Dinheiro e % como string (ADR-0016). A % viaja com quatro casas —
 * `"2.5000"` — porque é assim que o banco a guarda, e o que volta tem de ser o
 * que foi gravado.
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

const TimeZone = z
  .string()
  .trim()
  .max(64)
  .refine(isTimeZone, 'Fuso horário desconhecido.')
  .default('America/Sao_Paulo')

/** `2026-09`. */
export const CommissionPeriod = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'O mês vem como AAAA-MM.')

/**
 * A % digitada: `3`, `2,5`, `2.75`. Vira `"2.5000"` e fica entre 0 e 100.
 *
 * Validada aqui, no servidor, e não só no campo da tela: é a % que multiplica
 * dinheiro de alguém.
 */
export const CommissionRateInput = z
  .string()
  .trim()
  .regex(/^\d{1,3}([.,]\d{1,4})?$/, 'A % vai de 0 a 100, com até 4 casas.')
  .transform((value) => {
    const [whole = '0', fraction = ''] = value.replace(',', '.').split('.')
    return `${String(Number.parseInt(whole, 10))}.${fraction.padEnd(4, '0')}`
  })
  .refine((value) => {
    const [whole = '0', fraction = '0000'] = value.split('.')
    const units =
      Number.parseInt(whole, 10) * 10_000 + Number.parseInt(fraction, 10)
    return units <= 1_000_000
  }, 'A % vai de 0 a 100.')

export const CommissionSourceType = z.enum(['sale', 'return', 'sale_reversal'])
export type CommissionSourceType = z.infer<typeof CommissionSourceType>

export const CommissionFinanceStatus = z.enum(['open', 'settled', 'cancelled'])

export const CommissionStatementSummary = z.object({
  id: z.string(),
  status: z.enum(['closed', 'voided']),
  salesAmount: money,
  returnsAmount: money,
  reversalsAmount: money,
  baseAmount: money,
  commissionAmount: money,
  financeEntryId: z.string().nullable(),
  financeStatus: CommissionFinanceStatus.nullable(),
  settledAmount: money.nullable(),
  closedAt: z.string(),
  closedByName: z.string().nullable(),
  version: z.number().int(),
})
export type CommissionStatementSummary = z.infer<
  typeof CommissionStatementSummary
>

export const CommissionPayee = z.object({
  partyId: z.string(),
  name: z.string(),
  version: z.number().int(),
})
export type CommissionPayee = z.infer<typeof CommissionPayee>

// ---------------------------------------------------------------------------
// A tela Comissões
// ---------------------------------------------------------------------------

export const CommissionOverviewQuery = z.object({
  period: CommissionPeriod,
  timeZone: TimeZone,
})
export type CommissionOverviewQuery = z.input<typeof CommissionOverviewQuery>

export const CommissionSellerRow = z.object({
  userId: z.string(),
  name: z.string(),
  /** A % em vigor agora. Nula: nunca teve. */
  currentRate: z.string().nullable(),
  /** O que ainda NÃO está fechado e entraria no fechamento deste mês. */
  pending: z.object({
    salesCount: z.number().int().nonnegative(),
    salesAmount: money,
    returnsAmount: money,
    reversalsAmount: money,
    baseAmount: money,
    commissionAmount: money,
    /** Quantas fontes são de mês anterior (entregue ou trocada depois). */
    earlierCount: z.number().int().nonnegative(),
    /** As % aplicadas, sem repetir. */
    rates: z.array(z.string()),
  }),
  statement: CommissionStatementSummary.nullable(),
  payee: CommissionPayee.nullable(),
})
export type CommissionSellerRow = z.infer<typeof CommissionSellerRow>

export const CommissionOverviewResponse = z.object({
  period: CommissionPeriod,
  periodStart: z.string(),
  periodEnd: z.string(),
  /** O mês já acabou no relógio da loja — só então pode ser fechado. */
  periodOver: z.boolean(),
  sellers: z.array(CommissionSellerRow),
  /** Quem vendeu no mês e não tem % — aparece para o admin definir. */
  withoutRate: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      salesCount: z.number().int().nonnegative(),
      salesAmount: money,
    })
  ),
})
export type CommissionOverviewResponse = z.infer<
  typeof CommissionOverviewResponse
>

export const CommissionLine = z.object({
  sourceType: CommissionSourceType,
  sourceId: z.string(),
  salesDocumentId: z.string(),
  saleNumber: z.number().int().nullable(),
  /** Venda ou pedido (F160): o extrato escrevia "Venda nº" para os dois. */
  documentKind: z.enum(['sale', 'order']),
  exchangeNumber: z.number().int().nullable(),
  /** O nome fantasia do cliente, e só na falta dele a razão social (F160). */
  customerName: z.string(),
  /** O que foi vendido — ou o que voltou, numa troca (F160). */
  items: z.array(z.object({ description: z.string(), quantity: z.string() })),
  occurredAt: z.string(),
  baseAmount: money,
  rate: z.string(),
  fromEarlierPeriod: z.boolean(),
})
export type CommissionLine = z.infer<typeof CommissionLine>

export const CommissionSellerDetailResponse = z.object({
  period: CommissionPeriod,
  userId: z.string(),
  name: z.string(),
  /** O extrato vigente do mês, quando fechado; as linhas são as dele. */
  statement: CommissionStatementSummary.nullable(),
  lines: z.array(CommissionLine),
  /** Com o extrato fechado: o que ficou para o próximo fechamento. */
  pendingLines: z.array(CommissionLine),
})
export type CommissionSellerDetailResponse = z.infer<
  typeof CommissionSellerDetailResponse
>

export const MyCommissionResponse = z.object({
  period: CommissionPeriod,
  currentRate: z.string().nullable(),
  salesCount: z.number().int().nonnegative(),
  salesAmount: money,
  returnsAmount: money,
  baseAmount: money,
  commissionAmount: money,
  statement: CommissionStatementSummary.nullable(),
  /**
   * O mês dia a dia, do mais novo ao mais velho (F215). Só os dias com venda
   * ou troca. Um dia de mês anterior aparece quando a venda dele ainda não
   * entrou em extrato — entra no fechamento deste.
   */
  days: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        salesCount: z.number().int().nonnegative(),
        salesAmount: money,
        /** Troca que virou vale e venda cancelada depois do fechamento. */
        returnsAmount: money,
        baseAmount: money,
        commissionAmount: money,
      })
    )
    .default([]),
})
export type MyCommissionResponse = z.infer<typeof MyCommissionResponse>

/** As vendas e trocas de quem está logado no mês, uma a uma (F215). */
export const MyCommissionLinesResponse = z.object({
  period: CommissionPeriod,
  lines: z.array(CommissionLine),
})
export type MyCommissionLinesResponse = z.infer<
  typeof MyCommissionLinesResponse
>

// ---------------------------------------------------------------------------
// A % e quem recebe
// ---------------------------------------------------------------------------

export const CommissionRatesResponse = z.object({
  sellers: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      role: z.string(),
      currentRate: z.string().nullable(),
      history: z.array(
        z.object({
          rate: z.string(),
          validFrom: z.string(),
          /** Quando foi gravada. Difere de `validFrom` na % retroativa (F235). */
          createdAt: z.string(),
          actorName: z.string().nullable(),
        })
      ),
      payee: CommissionPayee.nullable(),
    })
  ),
})
export type CommissionRatesResponse = z.infer<typeof CommissionRatesResponse>

export const SetCommissionRateRequest = z.object({
  userId: z.uuid(),
  rate: CommissionRateInput,
  /**
   * Desde o começo de que mês a % vale (F235). Nulo: a partir de agora.
   *
   * O gerente da Elite pôs a % depois que as vendedoras já vendiam, e as
   * vendas do primeiro dia ficaram sem comissão. Mês com extrato fechado do
   * vendedor é recusado.
   */
  since: CommissionPeriod.nullable().default(null),
  /** O relógio da loja, que diz onde o mês começa. */
  timeZone: TimeZone,
})
export type SetCommissionRateRequest = z.input<typeof SetCommissionRateRequest>
export type SetCommissionRateBody = z.output<typeof SetCommissionRateRequest>

export const SetCommissionRateResponse = z.object({
  userId: z.string(),
  rate: z.string(),
  /** O instante a partir do qual a % vale. */
  validFrom: z.string(),
})
export type SetCommissionRateResponse = z.infer<
  typeof SetCommissionRateResponse
>

export const SetCommissionPayeeRequest = z.object({
  partyId: z.uuid(),
  /** 0 quando ainda não há quem receba. */
  version: z.number().int().nonnegative(),
})
export type SetCommissionPayeeRequest = z.infer<
  typeof SetCommissionPayeeRequest
>

/**
 * Cadastrar a vendedora como Pessoa e já pô-la como quem recebe (F235).
 *
 * Só a versão de quem recebe: o nome vem da conta da equipe, no servidor.
 */
export const RegisterCommissionPayeePartyRequest = z.object({
  /** 0 quando ainda não há quem receba. */
  version: z.number().int().nonnegative(),
})
export type RegisterCommissionPayeePartyRequest = z.infer<
  typeof RegisterCommissionPayeePartyRequest
>

// ---------------------------------------------------------------------------
// Fechar e desfazer
// ---------------------------------------------------------------------------

export const CloseCommissionPeriodRequest = z.object({
  period: CommissionPeriod,
  branchId: z.uuid(),
  /** Vencimento do título: `2026-10-05`. */
  dueOn: z.iso.date(),
  timeZone: TimeZone,
  /**
   * "Já paguei" (F235): quem já recebeu, em que dia e como.
   *
   * O título dessas pessoas nasce pago, com a baixa no dia informado e sem
   * mexer em caixa nenhum. Dinheiro, Pix ou transferência. Exige
   * `finance.settle`, como dar baixa no Financeiro.
   */
  paid: z
    .object({
      paidOn: z.iso.date(),
      paymentMethodId: z.uuid(),
      userIds: z.array(z.uuid()).min(1),
    })
    .nullable()
    .default(null),
})
export type CloseCommissionPeriodRequest = z.input<
  typeof CloseCommissionPeriodRequest
>
export type CloseCommissionPeriodBody = z.output<
  typeof CloseCommissionPeriodRequest
>

export const CloseCommissionPeriodResponse = z.object({
  statements: z.array(
    z.object({
      id: z.string(),
      userId: z.string(),
      name: z.string(),
      commissionAmount: money,
      financeEntryId: z.string(),
      /** O título já nasceu pago ("já paguei", F235). */
      settled: z.boolean(),
    })
  ),
})
export type CloseCommissionPeriodResponse = z.infer<
  typeof CloseCommissionPeriodResponse
>

export const VoidCommissionStatementRequest = z.object({
  version: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(500),
})
export type VoidCommissionStatementRequest = z.infer<
  typeof VoidCommissionStatementRequest
>
