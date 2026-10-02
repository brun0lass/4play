import { z } from 'zod'

/**
 * A troca e o vale, na fiação (F126).
 *
 * Decimais como texto nos dois sentidos — ADR-0016. As listas repetem as de
 * `@aeris/exchange` em vez de importá-las pelo mesmo motivo de `UNIT_VALUES`:
 * o navegador importa os contratos e eles não arrastam pacote de domínio.
 */

export const ExchangeKindSchema = z.enum(['exchange', 'voucher'])
export const ExchangeStatusSchema = z.enum([
  'requested',
  'accepted',
  'rejected',
  'completed',
  'cancelled',
])

export type ExchangeKind = z.infer<typeof ExchangeKindSchema>
export type ExchangeStatus = z.infer<typeof ExchangeStatusSchema>

/**
 * Por que a peça voltou — F158, migração 0086.
 *
 * Vocabulário fechado, e são **os quatro motivos que a tela do caixa já
 * mostrava** mais `outro`: nenhuma palavra nova para o balcão aprender. Antes
 * eles só preenchiam uma caixa de texto que a pessoa podia reescrever em
 * seguida, e o resultado é que 91% das trocas concluídas não têm motivo
 * nenhum — e as que têm não se agrupam.
 *
 * `outro` existe porque a alternativa a ele não é uma classificação melhor: é o
 * operador escolhendo o código errado de propósito para conseguir salvar.
 */
export const EXCHANGE_REASON_CODES = [
  'defeito',
  'nao_serviu',
  'tamanho_ou_cor',
  'arrependimento',
  'outro',
] as const

export const ExchangeReasonCodeSchema = z.enum(EXCHANGE_REASON_CODES)
export type ExchangeReasonCode = z.infer<typeof ExchangeReasonCodeSchema>

/**
 * Como cada código é dito em voz alta.
 *
 * No contrato, e não na tela, porque quem escreve a frase é a tela, o arquivo
 * exportado **e** o papel do relatório — e um rótulo com três versões é como
 * "Não serviu" e "Nao serviu" acabam no mesmo gráfico.
 */
export const EXCHANGE_REASON_LABELS: Record<ExchangeReasonCode, string> = {
  defeito: 'Veio com defeito',
  nao_serviu: 'Não serviu',
  tamanho_ou_cor: 'Tamanho ou cor errados',
  arrependimento: 'Se arrependeu',
  outro: 'Outro',
}

/**
 * O que a tela escreve quando a peça voltou sem motivo — F188.
 *
 * Um traço seria mudo, e "Outro" seria mentira: "outro" é uma escolha que
 * alguém fez, isto é a falta dela. Metade das peças da Elite está assim, e o
 * relatório do fornecedor precisa dizer isso em voz alta em vez de esconder.
 */
export const NO_REASON_LABEL = 'Sem motivo informado'

/**
 * Por onde a lista de trocas se ordena — F188.
 *
 * Todas saem na consulta que a lista já faz: nenhuma custa junção nova.
 */
export const EXCHANGE_SORTS = [
  'when',
  'number',
  'customer',
  'kind',
  'reason',
  'returnedTotal',
  'voucherCredit',
  'handledBy',
] as const
export const ExchangeSortSchema = z.enum(EXCHANGE_SORTS)
export type ExchangeSort = z.infer<typeof ExchangeSortSchema>

/** Quantidade como texto de máquina: `1`, `2.5`. */
const wireQuantity = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,6})?$/,
    'Quantidade deve ser um número, ex.: 1 ou 2.5'
  )

/** Valor em reais como texto de máquina: `30`, `29.90`. */
const wireMoney = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Valor deve ser um número, ex.: 29.90')

/**
 * O que o admin aprovou com a senha, numa troca sem venda (F148).
 *
 * Vai junto do `POST /auth/authorize` e fica gravado na autorização. A troca
 * só conclui se o pedido for exatamente isto.
 */
export const AuthorisedExchangeDetail = z.object({
  customerPartyId: z.uuid(),
  kind: ExchangeKindSchema,
  returned: z
    .array(
      z
        .object({
          /** O produto do cadastro, quando o trocador achou. */
          variantId: z.uuid().nullable().optional(),
          /** O nome digitado, quando a peça não está no cadastro. */
          description: z.string().trim().min(1).max(200).nullable().optional(),
          quantity: wireQuantity,
          unitValue: wireMoney,
        })
        .refine(
          (line) =>
            ((line.variantId ?? null) !== null) !==
            ((line.description ?? null) !== null),
          { message: 'Cada peça tem o produto ou o nome, um dos dois.' }
        )
    )
    .min(1)
    .max(100),
})

export type AuthorisedExchangeDetail = z.infer<typeof AuthorisedExchangeDetail>

/**
 * O que o gerente liberou ao deixar uma peça voltar DE NOVO (F178).
 *
 * As linhas da venda, e só elas: o "sim" vale para a tela que ele viu na tela,
 * não para a nota inteira. O porquê escrito por ele vai no `reason` da
 * autorização, que é o que a auditoria lê meses depois.
 */
export const AuthorisedRepeatReturnDetail = z.object({
  saleLineIds: z.array(z.uuid()).min(1).max(100),
})

export type AuthorisedRepeatReturnDetail = z.infer<
  typeof AuthorisedRepeatReturnDetail
>

export const ExchangeLineSummary = z.object({
  id: z.string(),
  direction: z.enum(['returned', 'outgoing']),
  saleLineId: z.string().nullable(),
  /** Nulo só na peça de fora digitada, que não está no cadastro. */
  variantId: z.string().nullable(),
  description: z.string(),
  unit: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  lineTotal: z.string(),
  restock: z.boolean().nullable(),
  disposition: z.enum(['restocked', 'written_off']).nullable(),
  note: z.string().nullable(),
  /**
   * Por que ESTA peça voltou (F178). Nulo = o motivo da troca inteira.
   *
   * `.default(null)`: um servidor anterior à 0104 não manda, e a tela não
   * quebra — ela cai no motivo do cabeçalho, que é o que aquela troca tem.
   */
  reasonCode: ExchangeReasonCodeSchema.nullable().default(null),
})

export type ExchangeLineSummary = z.infer<typeof ExchangeLineSummary>

export const ExchangeSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  kind: ExchangeKindSchema,
  status: ExchangeStatusSchema,
  number: z.number().int().nullable(),
  /** Nulo na troca de produto de fora, aprovada com senha (F148). */
  originalSaleId: z.string().nullable(),
  originalSaleNumber: z.number().int().nullable(),
  /**
   * Venda de balcão ou pedido entregue (F160).
   *
   * Desde a F159 a troca aceita pedido, e as duas séries tinham números
   * repetidos: sem o tipo, "Venda nº 16" podia ser o pedido 16.
   */
  originalSaleKind: z.enum(['sale', 'order']).nullable(),
  /** Quem digitou a senha na troca sem venda (F148). Nulo nas outras. */
  authorisedByName: z.string().nullable(),
  customerPartyId: z.string(),
  customerName: z.string(),
  requestedByName: z.string().nullable(),
  handledByName: z.string().nullable(),
  returnedTotal: z.string(),
  outgoingTotal: z.string(),
  differenceAmount: z.string(),
  voucherCreditAmount: z.string(),
  /**
   * Quanto desta devolução foi abatido em parcelas abertas da venda (F159).
   *
   * Decisão do dono: *"se comprou no prazo, devolve no prazo"*. Soma com
   * `voucherCreditAmount` e o total é tudo o que voltou ao cliente — a
   * constraint da migração 0089 garante isso no banco.
   */
  creditAppliedAmount: z.string(),
  receivableEntryId: z.string().nullable(),
  /** O motivo que se CONTA (F158). Nulo nas trocas anteriores à migração 0086. */
  reasonCode: ExchangeReasonCodeSchema.nullable(),
  /** O motivo que se LÊ: a frase do balcão, quando alguém escreveu uma. */
  reason: z.string().nullable(),
  note: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  requestedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int(),
})

export type ExchangeSummary = z.infer<typeof ExchangeSummary>

export const ExchangeDetail = ExchangeSummary.extend({
  lines: z.array(ExchangeLineSummary),
  /** O saldo de vale do cliente agora — o que o comprovante imprime. */
  customerBalance: z.string(),
})

export type ExchangeDetail = z.infer<typeof ExchangeDetail>

export const ExchangeResponse = z.object({ exchange: ExchangeDetail })
export type ExchangeResponse = z.infer<typeof ExchangeResponse>

export const ExchangeList = z.object({
  items: z.array(ExchangeSummary),
  total: z.number().int().nonnegative(),
})

export type ExchangeList = z.infer<typeof ExchangeList>

export const ExchangeListQuery = z.object({
  status: ExchangeStatusSchema.optional(),
  kind: ExchangeKindSchema.optional(),
  originalSaleId: z.uuid().optional(),
  customerPartyId: z.uuid().optional(),
  /**
   * O período em que a troca foi CONCLUÍDA — F158.
   *
   * A lista nasceu sem filtro de data, e o buraco só apareceu quando a
   * exportação chegou: ela levava "todas as concluídas" em vez do que estava na
   * tela. Por `completed_at` e não por `created_at` porque a troca conta no dia
   * em que foi fechada — é o mesmo instante que o painel e os relatórios usam.
   *
   * Fim EXCLUSIVO, como no painel: `to` é o primeiro instante de fora, e é o
   * que faz "setembro inteiro" não depender de quantos milissegundos tem o
   * último dia.
   *
   * Pedido ainda aberto não tem `completed_at`: filtrar por período o exclui,
   * de propósito — quem procura um período quer o que aconteceu, não o que
   * ainda não aconteceu.
   */
  completedFrom: z.iso.datetime({ offset: true }).optional(),
  completedTo: z.iso.datetime({ offset: true }).optional(),
  /**
   * Só as trocas com uma peça que voltou por este motivo — F188.
   *
   * Lido como em todo o sistema: o motivo da PEÇA, ou o da troca quando a peça
   * não tem o seu (`reasonForLine`). Filtrar só pelo cabeçalho esconderia a
   * maioria, porque é ele que a peça herda.
   *
   * **`sem-motivo` é um valor**, não a ausência do filtro. Metade das peças da
   * Elite não tem motivo nenhum, e é justamente essa metade que o dono precisa
   * conseguir pedir para ir atrás.
   */
  reasonCode: z
    .union([ExchangeReasonCodeSchema, z.literal('sem-motivo')])
    .optional(),
  /**
   * A marca da peça devolvida — F188.
   *
   * Igualdade que perdoa a caixa e o espaço, como em Produtos e no Estoque: a
   * marca é texto livre desde a 0004 e a loja já tinha marcas escritas à mão
   * quando o cadastro nasceu.
   */
  brand: z.string().trim().min(1).max(120).optional(),
  sort: ExchangeSortSchema.default('when'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export type ExchangeListParams = z.output<typeof ExchangeListQuery>

/** O que o cliente passa. Número é número — ver `ExpensesRequest`. */
export type ExchangeListRequest = {
  status?: ExchangeStatus | undefined
  kind?: ExchangeKind | undefined
  originalSaleId?: string | undefined
  customerPartyId?: string | undefined
  completedFrom?: string | undefined
  completedTo?: string | undefined
  reasonCode?: ExchangeReasonCode | 'sem-motivo' | undefined
  brand?: string | undefined
  sort?: ExchangeSort | undefined
  direction?: 'asc' | 'desc' | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

/**
 * O trocador cria e conclui, num gesto só (fatia 2b).
 *
 * As peças devolvidas apontam para a LINHA da venda — o preço que vale é o que
 * o cliente pagou, lido no servidor, e nunca um preço mandado pela tela. As
 * peças de saída mandam só a variante e a quantidade: o preço é o da tabela
 * padrão, também lido no servidor (ADR-0017).
 */
export const CreateExchangeRequest = z.object({
  /**
   * O id da troca, gerado pela tela (F148). Obrigatório na troca sem venda: a
   * senha do admin autoriza ESTE id, e uma senha não serve para duas trocas.
   */
  id: z.uuid().optional(),
  kind: ExchangeKindSchema,
  /**
   * Por que a peça voltou — obrigatório (F158).
   *
   * Este é o caminho do TROCADOR, e é ele que explica os 91% sem motivo: a
   * troca criada aqui gravava `NULL` e ninguém nunca foi perguntado. Exigir o
   * código no contrato, e não no formulário, é o que faz a resposta existir
   * também quando a troca chega pela API.
   */
  reasonCode: ExchangeReasonCodeSchema,
  /** Ausente na troca de produto de fora (F148). */
  originalSaleId: z.uuid().optional(),
  /** O cliente da troca sem venda (F148). Com venda, é o da venda. */
  customerPartyId: z.uuid().optional(),
  /** A senha do admin que aprovou a troca sem venda (F148). */
  authorisationId: z.uuid().optional(),
  /**
   * A senha do gerente que liberou devolver de novo uma peça já trocada (F178).
   *
   * Separada da de cima porque são dois "sim" diferentes: aquele aprova peça e
   * valor de fora, este atravessa a trava de repetida desta venda. Sem ela, a
   * peça já devolvida é recusada — e é essa a regra.
   */
  repeatAuthorisationId: z.uuid().optional(),
  returned: z
    .array(
      z.object({
        /** Com venda: a linha de onde a peça saiu. */
        saleLineId: z.uuid().optional(),
        /** Sem venda (F148): o produto que voltou. */
        variantId: z.uuid().optional(),
        /** Sem venda (F148): o valor por unidade que o admin aprovou. */
        unitValue: wireMoney.optional(),
        /** Sem venda, peça fora do cadastro: o nome digitado, no lugar do produto. */
        description: z.string().trim().min(1).max(200).optional(),
        quantity: wireQuantity,
        /** Volta ao estoque, ou "já era". */
        restock: z.boolean(),
        note: z.string().trim().max(500).nullable().optional(),
        /**
         * Por que ESTA peça voltou (F178). Ausente = o motivo da troca.
         *
         * Opcional e não obrigatório porque a troca de uma peça só — a
         * esmagadora maioria — continua respondendo uma vez, no cabeçalho. Na
         * nota com duas telas, uma com defeito e outra que não serviu, é este
         * campo que faz a segunda voltar ao estoque e a primeira não.
         */
        reasonCode: ExchangeReasonCodeSchema.optional(),
      })
    )
    .min(1)
    .max(100),
  outgoing: z
    .array(
      z.object({
        variantId: z.uuid(),
        quantity: wireQuantity,
      })
    )
    .max(100)
    .default([]),
  note: z.string().trim().max(1000).nullable().optional(),
  /** Quando a troca conclui um pedido do caixa (fatia 2d). */
  requestId: z.uuid().optional(),
})

export type CreateExchangeRequest = z.input<typeof CreateExchangeRequest>
export type CreateExchangeBody = z.output<typeof CreateExchangeRequest>

export const CustomerCreditEntrySummary = z.object({
  id: z.string(),
  kind: z.enum(['voucher_issued', 'granted', 'redeemed', 'adjustment']),
  amount: z.string(),
  /*
   * `finance_entry` é o vale pagando um título (F179, migração 0105). Faltar
   * aqui fazia o web recusar o extrato inteiro — e o PDV dizer "escolha o
   * cliente" com o cliente escolhido (F208).
   */
  sourceType: z.enum(['exchange', 'sales_document', 'finance_entry', 'manual']),
  sourceId: z.string().nullable(),
  sourceNumber: z.number().int().nullable(),
  /** A troca que é só vale, sem produto saindo. */
  exchangeKind: z.enum(['exchange', 'voucher']).nullable(),
  /** A venda de onde veio a peça devolvida, quando a origem é uma troca. */
  originSaleId: z.string().nullable(),
  originSaleNumber: z.number().int().nullable(),
  /** A descrição do título pago com vale. */
  entryDescription: z.string().nullable(),
  branchName: z.string().nullable(),
  /** O saldo logo depois desta linha. */
  balanceAfter: z.string(),
  note: z.string().nullable(),
  actorName: z.string().nullable(),
  occurredAt: z.string(),
})

export type CustomerCreditEntrySummary = z.infer<
  typeof CustomerCreditEntrySummary
>

export const CustomerCreditStatement = z.object({
  partyId: z.string(),
  balance: z.string(),
  /** Tudo o que já entrou de vale, e tudo o que já foi usado (F208). */
  totals: z.object({ received: z.string(), used: z.string() }),
  /** Quantas linhas o extrato tem ao todo, para "carregar mais". */
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  entries: z.array(CustomerCreditEntrySummary),
})

/** A página do extrato de vale (F208). */
export const CustomerCreditQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type CustomerCreditQuery = z.infer<typeof CustomerCreditQuery>

export type CustomerCreditStatement = z.infer<typeof CustomerCreditStatement>

/**
 * O caixa (ou o vendedor) pede uma troca ou um vale ao trocador (fatia 2d).
 *
 * Só o que ele sabe no balcão: qual venda, se o cliente quer vale ou outra
 * peça, e por quê. As peças e se voltam ao estoque são decisão do trocador.
 */
export const CreateExchangeRequestRequest = z.object({
  originalSaleId: z.uuid(),
  kind: ExchangeKindSchema,
  /** O motivo que se conta. Um toque, e é o que o relatório agrupa (F158). */
  reasonCode: ExchangeReasonCodeSchema,
  /**
   * O detalhe, agora OPCIONAL (F158).
   *
   * Era obrigatório porque era a única coisa que o caixa deixava para trás.
   * Com o código respondendo "por quê", exigir também a frase transformaria um
   * toque em digitação — e digitação com pressa vira "troca" escrito cinco
   * vezes. Quem tem o que contar ("veio com a tela trincada") continua tendo
   * onde.
   */
  reason: z.string().trim().max(500).optional(),
})

export type CreateExchangeRequestRequest = z.input<
  typeof CreateExchangeRequestRequest
>

export const RejectExchangeRequest = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Diga por que o pedido foi recusado')
    .max(500),
})

export type RejectExchangeRequest = z.input<typeof RejectExchangeRequest>
