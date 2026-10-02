import { z } from 'zod'

import { ExchangeReasonCodeSchema } from './exchanges.ts'

/**
 * Os relatórios — F158.
 *
 * > "quero que tudo do admin consiga virar relatório, exportar métrica, ver top
 * > 1 cliente top 10"
 * > "no de troca, quero saber quais marcas mais tem troca"
 *
 * ## Um envelope genérico, um SQL que não é
 *
 * O **envelope** abaixo serve os quatro relatórios: período, filial, corte,
 * linhas, "Outros", totais, cobertura. É o que permite UMA tela, UM caminho de
 * exportação e UM teste de contrato servirem todos.
 *
 * O **SQL não é genérico** — cada relatório tem `from`/`join`/`where`/`select`
 * escritos à mão em `reports.ts`, e a dimensão da troca é chave de um `Record`
 * de fragmentos pré-escritos. Nada que venha do fio chega ao SQL como texto. Um
 * "monte seu relatório" genérico seria superfície de injeção e um modelo de
 * permissão que não se consegue escrever.
 *
 * ## `values: Record<string, string|null>`, e o preço disso
 *
 * As colunas viajam como mapa, não como campos tipados por relatório. É o que
 * torna possível uma tela só; o preço é que o compilador deixa de conferir que
 * a linha traz exatamente as colunas declaradas.
 *
 * **Esse preço só é aceitável por causa do teste** que trava as chaves de
 * `values` contra `REPORT_DEFINITIONS`, para cada relatório e cada dimensão
 * (`apps/api/src/routes/v1/reports.test.ts`). Sem ele, a decisão certa seria
 * uma resposta tipada por relatório, com quatro telas.
 */

/** Dinheiro e quantidade como texto decimal — ADR-0016. */
const decimal = z.string()

export const REPORT_IDS = [
  'top-clientes',
  'top-produtos',
  'trocas',
  'vendedores',
] as const

export const ReportIdSchema = z.enum(REPORT_IDS)
export type ReportId = z.infer<typeof ReportIdSchema>

/**
 * Por onde o relatório de trocas agrupa.
 *
 * Marca, produto e motivo desde a F158; categoria e vendedor entraram na F164 —
 * a categoria porque ela passou a existir (F163), e o vendedor porque "qual
 * vendedor mais tem peça voltando" é a pergunta que vem depois de "qual marca".
 */
export const EXCHANGE_DIMENSIONS = [
  'marca',
  'categoria',
  'produto',
  'motivo',
  'vendedor',
] as const
export const ExchangeDimensionSchema = z.enum(EXCHANGE_DIMENSIONS)
export type ExchangeDimension = z.infer<typeof ExchangeDimensionSchema>

/**
 * Como cada coluna é lida e desenhada.
 *
 * `additive` **não é derivável de `kind`**, e é a distinção que faz a linha
 * "Outros" e a linha "Total" existirem sem mentir: faturamento soma, ticket
 * médio **não**. Somar tickets daria a média das médias — um número que não
 * corresponde a transação nenhuma. Derivadas são recalculadas em cada linha,
 * inclusive em "Outros" e no "Total".
 */
export const ReportColumnSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['money', 'quantity', 'count', 'percent', 'date', 'text']),
  additive: z.boolean(),
})

export type ReportColumn = z.infer<typeof ReportColumnSchema>

const column = (
  id: string,
  label: string,
  kind: ReportColumn['kind'],
  additive = true
): ReportColumn => ({ id, label, kind, additive })

/**
 * As colunas de cada relatório, **como dado**.
 *
 * Lidas pela tela, pela exportação e pelo teste de contrato. É isto que faz uma
 * tela servir os quatro — e que faz uma coluna nova aparecer nos três lugares
 * ao mesmo tempo, em vez de em dois e meio.
 */
export const REPORT_DEFINITIONS: Readonly<
  Record<
    ReportId,
    {
      readonly label: string
      readonly what: string
      readonly columns: readonly ReportColumn[]
    }
  >
> = {
  'top-clientes': {
    label: 'Top clientes',
    what: 'clientes',
    columns: [
      column('revenue', 'Faturamento', 'money'),
      column('sales', 'Vendas', 'count'),
      column('ticket', 'Ticket médio', 'money', false),
      /*
       * Custo, lucro e margem (F164), pela mesma conta do painel e do Estoque:
       * o custo gravado no dia da venda, ou o médio de hoje quando a venda é
       * anterior à gravação. A margem é DERIVADA — recalculada em cada linha,
       * inclusive em Outros e no Total.
       */
      column('cost', 'Custo', 'money'),
      column('profit', 'Lucro', 'money'),
      column('margin', 'Margem', 'percent', false),
      /* O que este cliente devolveu no período: troca e vale. */
      column('returned', 'Devolvido', 'money'),
      column('lastSale', 'Última compra', 'date', false),
    ],
  },
  'top-produtos': {
    label: 'Top produtos',
    what: 'produtos',
    columns: [
      column('revenue', 'Faturamento', 'money'),
      column('quantity', 'Quantidade', 'quantity'),
      column('sku', 'Código', 'text', false),
      // F161: pelo custo do dia da venda, ou pelo médio de hoje quando a venda
      // é anterior à gravação do custo — a mesma conta do painel.
      column('cost', 'Custo', 'money'),
      column('profit', 'Lucro', 'money'),
      column('margin', 'Margem', 'percent', false),
      column('returned', 'Devolvido', 'money'),
    ],
  },
  trocas: {
    label: 'Trocas e devoluções',
    what: 'linhas',
    columns: [
      column('amount', 'Valor devolvido', 'money'),
      column('pieces', 'Peças', 'quantity'),
      column('exchanges', 'Trocas', 'count'),
      /*
       * O que a peça que voltou custou à loja (F164) — do custo gravado na
       * venda de origem, ou do custo médio da variante. A peça digitada de fora
       * (F148) não tem custo, e entra na contagem de "sem custo", nunca zero.
       */
      column('cost', 'Custo', 'money'),
      /* Voltou para a prateleira, ou virou perda: `restock`/`disposition`. */
      column('restocked', 'Voltou ao estoque', 'quantity'),
      column('writtenOff', 'Perda', 'quantity'),
    ],
  },
  vendedores: {
    label: 'Vendas por vendedor',
    what: 'vendedores',
    columns: [
      column('revenue', 'Faturamento', 'money'),
      column('sales', 'Vendas', 'count'),
      column('ticket', 'Ticket médio', 'money', false),
      column('cost', 'Custo', 'money'),
      column('profit', 'Lucro', 'money'),
      column('margin', 'Margem', 'percent', false),
      column('returned', 'Devolvido', 'money'),
      column('quotes', 'Orçamentos', 'count'),
      column('converted', 'Convertidos', 'count'),
      column('conversion', 'Conversão', 'percent', false),
      /*
       * A comissão (F160). O gerente: "ela vendeu 150, comissão 5% — aparecer
       * aqui também". A % é texto e NÃO soma — "5%" num Total seria mentira, e
       * quando a taxa mudou no período ela sai como "3%–5%". O valor soma.
       */
      column('commissionRate', '% comissão', 'text', false),
      column('commission', 'Comissão', 'money'),
    ],
  },
}

/**
 * O corte, num conjunto fechado.
 *
 * O dono disse "top 1, top 10": os dois têm de ser um clique. Fechado e não um
 * número livre porque um `limit` vindo do fio é o caminho mais curto para
 * alguém pedir 100.000 linhas e derrubar o banco de manhã.
 */
export const REPORT_CUTS = [1, 5, 10, 25, 50, 100] as const
export const ReportCutSchema = z.coerce
  .number()
  .int()
  .refine(
    (value) => (REPORT_CUTS as readonly number[]).includes(value),
    'Corte inválido.'
  )
  .default(10)

/** O teto do período — o mesmo do painel, pelo mesmo motivo. */
export const REPORT_MAX_PERIOD_DAYS = 366

const periodShape = {
  /** Início do período, inclusivo. */
  from: z.iso.datetime({ offset: true }),
  /** Fim do período, EXCLUSIVO — ver `DashboardSalesQuery`. */
  to: z.iso.datetime({ offset: true }),
  branchId: z.uuid().optional(),
  cut: ReportCutSchema,
}

/**
 * As duas regras do período, repetidas nos dois schemas.
 *
 * Uma função genérica que as aplicasse aos dois pareceria mais limpa e
 * custaria a inferência: `z.ZodObject` sem parâmetro não sabe que o objeto tem
 * `from` e `to`, e o `refine` perderia o tipo do argumento. Duas cópias de seis
 * linhas, com o mesmo teto e a mesma mensagem, valem mais que um genérico que
 * obriga um `as`.
 */
const startsBeforeItEnds = {
  message: 'O fim do período tem de vir depois do começo.',
  path: ['to'],
}

const withinCeiling = {
  message: `O período vai até ${String(REPORT_MAX_PERIOD_DAYS)} dias.`,
  path: ['to'],
}

const fits = (query: { from: string; to: string }): boolean =>
  new Date(query.to).getTime() - new Date(query.from).getTime() <=
  REPORT_MAX_PERIOD_DAYS * 86_400_000

const ordered = (query: { from: string; to: string }): boolean =>
  new Date(query.from) < new Date(query.to)

export const ReportQuery = z
  .object(periodShape)
  .refine(ordered, startsBeforeItEnds)
  .refine(fits, withinCeiling)

export type ReportQuery = z.input<typeof ReportQuery>
export type ReportParams = z.output<typeof ReportQuery>

export const ExchangeReportQuery = z
  .object({
    ...periodShape,
    dimension: ExchangeDimensionSchema.default('marca'),
  })
  .refine(ordered, startsBeforeItEnds)
  .refine(fits, withinCeiling)

export type ExchangeReportQuery = z.input<typeof ExchangeReportQuery>
export type ExchangeReportParams = z.output<typeof ExchangeReportQuery>

const values = z.record(z.string(), z.string().nullable())

export const ReportRowSchema = z.object({
  /**
   * O identificador do grupo, quando existe.
   *
   * Nulo é legítimo e frequente: é a linha `(sem marca)`, `(sem motivo)`,
   * `(sem vendedor)`. Elas **nunca são escondidas** — um ranking que omite o
   * grupo vazio é um gráfico enganoso, e a soma deixa de fechar.
   */
  key: z.string().nullable(),
  label: z.string(),
  values,
})

export type ReportRowType = z.infer<typeof ReportRowSchema>

/**
 * Quanto do dado existe de verdade.
 *
 * O relatório de marca e o de motivo são construídos sobre campos que a loja
 * pode não ter preenchido, e o motivo em particular **começa vazio**: nenhuma
 * troca anterior à migração 0086 tem código. Sem esta linha, um ranking de
 * quatro marcas sobre 15% das peças parece o retrato da loja.
 */
export const ReportCoverageSchema = z.object({
  known: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /**
   * O que está sendo contado, para a frase sair certa em português.
   *
   * `itens` é uma LINHA da troca, não a soma das quantidades: "3 capas numa
   * linha" é um item. Contar quantidades daria um decimal, e "127,5 de 340
   * peças têm marca" é uma frase que ninguém consegue ler.
   */
  unit: z.enum(['itens', 'trocas']),
})

export const ReportResponse = z.object({
  report: ReportIdSchema,
  period: z.object({ from: z.string(), to: z.string() }),
  branchId: z.string().nullable(),
  dimension: z.string().nullable(),
  cut: z.number().int(),
  rows: z.array(ReportRowSchema),
  /**
   * Tudo o que ficou abaixo do corte, somado — do PERÍODO, não das linhas
   * mostradas.
   *
   * Nulo só quando não sobrou nada. É o que impede "top 10 = R$ 40 mil" de ser
   * lido como "vendi 40 mil", que é a leitura errada mais cara que um relatório
   * permite.
   */
  others: z.object({ groups: z.number().int(), values }).nullable(),
  totals: z.object({ values }),
  /** Quantos grupos existem no período — não quantas linhas foram mostradas. */
  groupCount: z.number().int().nonnegative(),
  coverage: ReportCoverageSchema.nullable(),
  /**
   * O que o balcão sem cadastro vendeu — só em `top-clientes` (decisão do dono).
   *
   * Fica FORA do ranking, porque "top clientes" existe para dizer a quem ligar,
   * e o balcão não é alguém a quem ligar. Mas o valor vai na resposta e a tela
   * o escreve acima da tabela: sem isso, alguém soma a coluna, compara com o
   * faturamento do painel e conclui que um dos dois está quebrado.
   */
  walkIn: z.object({ sales: z.number().int(), revenue: decimal }).nullable(),
  /**
   * A honestidade sobre o custo (F164).
   *
   * Quantos itens do período entraram com o custo ESTIMADO (o médio de hoje, em
   * venda anterior à gravação do custo) e quantos não têm custo nenhum. O
   * painel já diz isso; sem dizer aqui, um lucro calculado sem metade dos
   * custos passaria por lucro de verdade.
   *
   * `.default(null)`: um servidor mais antigo não manda, e a tela não quebra.
   */
  costQuality: z
    .object({
      estimated: z.number().int().nonnegative(),
      missing: z.number().int().nonnegative(),
    })
    .nullable()
    .default(null),
})

export type ReportResponseType = z.infer<typeof ReportResponse>

/* --- As peças devolvidas, uma por linha (F178) ---------------------------- */

/**
 * O relatório que o Eduardo pediu com as palavras dele:
 *
 * > "quero o relatório de todas as telas que voltaram com o motivo de cada uma,
 * > escrito por extenso: Elias, tela X, defeito: atualização parou o touch"
 *
 * Este NÃO é o envelope agregado de cima, e a diferença é o ponto: ali cada
 * linha é um grupo ("defeito: 37 peças"), aqui cada linha é **uma peça**, com o
 * que o trocador escreveu. Os dois convivem na mesma aba porque respondem
 * perguntas diferentes — o resumo diz onde olhar, a lista diz o que aconteceu.
 *
 * As colunas são dado, como as dos outros: a tela, o Excel e o servidor leem
 * desta lista, e não cada um da sua.
 */
export const RETURNED_PIECES_COLUMNS: readonly ReportColumn[] = [
  column('date', 'Data', 'date', false),
  column('exchange', 'Troca', 'text', false),
  column('customer', 'Cliente', 'text', false),
  column('product', 'Produto', 'text', false),
  column('sku', 'Código', 'text', false),
  /* A marca — F188. É por ela que a conversa com o fornecedor é organizada. */
  column('brand', 'Marca', 'text', false),
  column('quantity', 'Quantidade', 'quantity'),
  column('reason', 'Motivo', 'text', false),
  /* O que o trocador escreveu — a frase inteira, que é o pedido do dono. */
  column('note', 'O que houve', 'text', false),
  column('handledBy', 'Atendeu', 'text', false),
  column('restocked', 'Voltou ao estoque', 'text', false),
  column('amount', 'Valor', 'money'),
]

export const ReturnedPiecesQuery = z
  .object({
    from: z.iso.datetime({ offset: true }),
    /** Fim EXCLUSIVO, como todo período do produto. */
    to: z.iso.datetime({ offset: true }),
    branchId: z.uuid().optional(),
    /** Só as peças que voltaram por este motivo. */
    reasonCode: ExchangeReasonCodeSchema.optional(),
    /**
     * Só as peças desta marca — F188.
     *
     * Separado da busca livre de propósito: uma busca por "Samsung" também
     * casa a descrição de outra peça, e o papel que vai para o fornecedor não
     * pode ter peça de terceiro no meio.
     */
    brand: z.string().trim().min(1).max(120).optional(),
    /** Produto, marca, código ou cliente — o que a pessoa lembra. */
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine(ordered, startsBeforeItEnds)
  .refine(fits, withinCeiling)

export type ReturnedPiecesQuery = z.input<typeof ReturnedPiecesQuery>
export type ReturnedPiecesParams = z.output<typeof ReturnedPiecesQuery>

export const ReturnedPieceRow = z.object({
  id: z.string(),
  values,
})

export type ReturnedPieceRowType = z.infer<typeof ReturnedPieceRow>

export const ReturnedPiecesResponse = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  branchId: z.string().nullable(),
  items: z.array(ReturnedPieceRow),
  total: z.number().int().nonnegative(),
  /** O que as peças do FILTRO somam — não o que a página mostra. */
  totals: z.object({ values }),
})

export type ReturnedPiecesResponseType = z.infer<typeof ReturnedPiecesResponse>
