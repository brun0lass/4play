import { z } from 'zod'

import { PaymentMethodSummary } from './payments.ts'

/**
 * Sales contracts.
 *
 * Every monetary value and every quantity on this wire is a **string**:
 * `"19.90"`, never `19.90`.
 *
 * JSON numbers are IEEE-754 doubles. Declaring a price as `z.number()` here
 * would undo the whole of ADR-0016 at the boundary — including inside
 * `JSON.parse` on a client we do not control, where the damage happens before
 * any of our code runs. The string is the machine format: a point, no thousands
 * separator, up to six decimals. `R$ 1.234,56` is a rendering, done in the
 * interface by `formatMoney` from the same package the server uses.
 *
 * This package may only depend on `@aeris/domain` (see .dependency-cruiser.cjs),
 * so the shape of an amount is enforced here by a regular expression and parsed
 * into fixed-point by `@aeris/sales` on the far side of it. The status and kind
 * lists are repeated here for the same reason, and the guard against them
 * drifting is a unit test rather than an import.
 */

/** Up to twelve integer digits and six decimals — `numeric(18, 6)`, non-negative. */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,6})?$/

const amountString = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      AMOUNT_PATTERN,
      `${label} deve ser um número com ponto decimal, por exemplo 19.90`
    )

/**
 * Zero a cem, com até seis casas — F100.
 *
 * Padrão PRÓPRIO, e não `amountString`: um percentual não é um valor, e os dois
 * viajam em campos diferentes justamente para que ninguém possa mandar "10%"
 * onde se espera reais. `AMOUNT_PATTERN` continua recusando o sinal de
 * porcentagem, como sempre recusou.
 *
 * O teto está aqui E no CHECK da migração 0052. Duas guardas para a mesma
 * regra, porque validação de fronteira é conveniência e o banco é a garantia.
 */
const PERCENT_PATTERN = /^(100(\.0{1,6})?|\d{1,2}(\.\d{1,6})?)$/

export const percentString = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      PERCENT_PATTERN,
      `${label} deve estar entre 0 e 100, por exemplo 10 ou 7.5`
    )

/**
 * Por que esta venda pode, ou não, virar troca (F159).
 *
 * Declarado aqui e não em `exchanges.ts` porque ele descreve um **documento de
 * venda**: é a resposta que viaja em cada linha da lista de Vendas e na ficha.
 */
export const EXCHANGE_SCOPES = [
  'allowed',
  'not-sold',
  'walk-in',
  'delivery-not-settled',
] as const

export const ExchangeScopeSchema = z.enum(EXCHANGE_SCOPES)

export type ExchangeScope = z.infer<typeof ExchangeScopeSchema>

export const SalesDocumentKindSchema = z.enum(['quote', 'order', 'sale'])

export const SalesDocumentStatusSchema = z.enum([
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'confirmed',
  'fulfilled',
  'completed',
  'converted',
  'cancelled',
])

export const StockStateSchema = z.enum([
  'none',
  'reserved',
  'consumed',
  'released',
  'reversed',
])

export const PriceBasisSchema = z.enum([
  'base-price',
  'quantity-tier',
  'manual',
])

/** An instant, ISO 8601. Null means "no deadline", never "now". */
const instant = z.iso.datetime({ offset: true })

export const SalesLineSummary = z.object({
  id: z.string(),
  lineNumber: z.number().int().positive(),
  variantId: z.string(),
  /**
   * CAPTURED when the line was added, and never resolved again.
   *
   * ADR-0017 calls this the most important invariant in the module: a document
   * that re-resolves its prices is a document whose total changes after the
   * customer agreed to it.
   */
  description: z.string(),
  unit: z.string(),
  unitPrice: z.string(),
  priceListId: z.string().nullable(),
  priceBasis: PriceBasisSchema,
  quantity: z.string(),
  discountAmount: z.string(),
  /** This line's share of the header discount, distributed with `allocate`. */
  allocatedDiscount: z.string(),
  lineTotal: z.string(),
  /** O código da peça, para o papel (F161). Nulo quando o servidor é antigo. */
  sku: z.string().nullable().default(null),
  /**
   * Onde a peça fica na filial do documento, para o papel (26/09). A de agora,
   * não a do dia da venda. Nulo sem local cadastrado ou em servidor antigo.
   */
  location: z.string().nullable().default(null),
  /**
   * Quanto desta linha JÁ voltou em trocas concluídas (F178).
   *
   * Só no detalhe, e só onde pode ter voltado. É o que faz a tela da troca
   * riscar a peça já devolvida com "já trocada (1 de 1)", em vez de deixar o
   * trocador marcar, preencher e descobrir no fim que o servidor recusa.
   * `'0'` num servidor anterior, que é a resposta certa para quase toda linha.
   */
  returnedQuantity: z.string().default('0'),
})

export type SalesLineSummary = z.infer<typeof SalesLineSummary>

/**
 * A conferência da venda — estoque e caixa (26/09).
 *
 * A hora é a do servidor, no clique de quem conferiu; só o gerente corrige, e a
 * hora original viaja junto para a tela dizer "corrigido (era 19:05)".
 */
export const SalesCheckStageSchema = z.enum(['stock', 'cashier'])

export type SalesCheckStage = z.infer<typeof SalesCheckStageSchema>

export const SalesCheckSchema = z.object({
  checkedAt: z.string(),
  /** Nulo quando foi o gerente quem registrou uma etapa esquecida. */
  checkedByName: z.string().nullable(),
  correctedAt: z.string().nullable(),
  correctedByName: z.string().nullable(),
  correctionReason: z.string().nullable(),
  originalCheckedAt: z.string().nullable(),
})

export type SalesCheckSummary = z.infer<typeof SalesCheckSchema>

export const SalesChecksSchema = z.object({
  stock: SalesCheckSchema.nullable(),
  cashier: SalesCheckSchema.nullable(),
})

/** Corrigir a hora de uma conferência, ou registrar a esquecida. */
export const CorrectSalesCheckRequest = z.object({
  checkedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1).max(200),
})

export type CorrectSalesCheckBody = z.infer<typeof CorrectSalesCheckRequest>

export const SalesDocumentSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  kind: SalesDocumentKindSchema,
  status: SalesDocumentStatusSchema,
  /** Allocated on confirmation. Null while the document is still a draft. */
  number: z.number().int().nullable(),
  customerPartyId: z.string(),
  customerName: z.string(),
  salespersonUserId: z.string().nullable(),
  salespersonName: z.string().nullable(),
  /** Set by the operator, not implied by the kind. F013, decision 2. */
  reservesStock: z.boolean(),
  stockState: StockStateSchema,
  /** The prazo da proposta. F013, decision 3. */
  validUntil: z.string().nullable(),
  issuedAt: z.string(),
  priceListId: z.string().nullable(),
  discountAmount: z.string(),
  /** O percentual pedido, quando foi assim (F100). Nulo = foi digitado em reais. */
  discountPercent: z.string().nullable(),
  subtotalAmount: z.string(),
  totalAmount: z.string(),
  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  /** Quem levou, e quando saiu. Nulos até a mercadoria sair (F034). */
  courierPartyId: z.string().nullable(),
  courierName: z.string().nullable(),
  dispatchedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  lineCount: z.number().int().nonnegative(),
  /**
   * What this document may do next, computed from the transition table.
   *
   * Sent so an interface offers the moves that exist rather than every button
   * and a refusal. The server checks independently — this only stops the
   * product from advertising something that cannot work.
   */
  allowedTransitions: z.array(SalesDocumentStatusSchema),
  /**
   * O que QUEM PEDIU pode mudar neste documento (F147).
   *
   * `lines` é tudo; `header-only` é cliente, vendedor, observação e motoboy;
   * `none` esconde o Editar. Na lista não se lê o Financeiro, então um pedido
   * com baixa aparece `lines` e o detalhe corrige — o servidor recusa de
   * qualquer jeito.
   */
  editScope: z.enum(['lines', 'header-only', 'none']),
  /**
   * Se deste documento se pode pedir troca ou vale, e por que não (F159).
   *
   * Uma resposta do SERVIDOR, e não uma conta refeita na tela. A regra estava
   * copiada à mão em quatro lugares, e o dono acabou de mudá-la: pedido
   * entregue passa a valer, desde que o acerto já tenha sido feito.
   *
   *   `allowed`               — pode.
   *   `not-sold`              — ainda não saiu da loja, ou foi cancelado.
   *   `walk-in`               — foi para o Consumidor Final; o vale não teria dono.
   *   `delivery-not-settled`  — o entregador ainda não prestou contas.
   *
   * O motivo viaja junto de propósito: "não dá" manda o cliente embora, e
   * "dê baixa no acerto do entregador" resolve o atendimento.
   */
  exchangeScope: ExchangeScopeSchema,
  /** A conferência do estoque e a do caixa (26/09). Servidor antigo: nenhuma. */
  checks: SalesChecksSchema.default({ stock: null, cashier: null }),
  /** The optimistic-concurrency token. ADR-0014. */
  version: z.number().int(),
  updatedAt: z.string(),
})

export type SalesDocumentSummary = z.infer<typeof SalesDocumentSummary>

export const SalesDocumentDetail = SalesDocumentSummary.extend({
  lines: z.array(SalesLineSummary),
  /**
   * Os dados do cliente que o papel pode imprimir — F160.
   *
   * Só no detalhe, e não em cada linha da lista: é o que a ficha e o papel
   * precisam, e trinta endereços numa página de lista seriam trinta leituras
   * que ninguém olha. Nulo para o Consumidor Final. O CPF/CNPJ vem formatado;
   * o telefone, só com dígitos — a tela formata.
   */
  customerContact: z
    .object({
      document: z.string().nullable(),
      phone: z.string().nullable(),
      address: z.string().nullable(),
      email: z.string().nullable(),
      /** O código do cliente no sistema antigo (F161). */
      code: z.string().nullable().default(null),
      /** Todos os telefones, cada um com o tipo (F161). Só dígitos. */
      phones: z
        .array(
          z.object({
            kind: z.enum(['whatsapp', 'mobile', 'phone']),
            value: z.string(),
          })
        )
        .default([]),
      /** O endereço campo a campo (F161). */
      addressParts: z
        .object({
          street: z.string().nullable(),
          number: z.string().nullable(),
          complement: z.string().nullable(),
          district: z.string().nullable(),
          postalCode: z.string().nullable(),
          city: z.string().nullable(),
          state: z.string().nullable(),
        })
        .nullable()
        .default(null),
    })
    .nullable()
    /*
     * Ausente vira nulo, na fronteira. A tela desta loja já rodou com servidor
     * mais velho que ela; sem o padrão, a ficha inteira quebraria por causa de
     * um endereço que o papel nem é obrigado a ter.
     */
    .default(null),
  /**
   * O que já foi pago neste documento, e o que falta (F173).
   *
   * Recebimentos menos estornos, sem os recusados. Num pedido, é o sinal e o
   * que a retirada cobrou. Padrão zero na fronteira, pelo mesmo motivo do
   * contato: a tela já rodou com servidor mais velho que ela.
   */
  paidAmount: z.string().default('0.00'),
  outstandingAmount: z.string().default('0.00'),
})

export type SalesDocumentDetail = z.infer<typeof SalesDocumentDetail>

export const SalesDocumentResponse = z.object({
  document: SalesDocumentDetail,
})

export type SalesDocumentResponse = z.infer<typeof SalesDocumentResponse>

const RevisionItem = z.object({
  description: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
})

/** Uma linha do histórico de um documento (F147). */
export const SalesDocumentRevision = z.object({
  id: z.string(),
  action: z.enum([
    'created',
    'edited',
    'transitioned',
    'dispatched',
    'cancelled',
  ]),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  occurredAt: z.string(),
  reason: z.string().nullable(),
  statusFrom: SalesDocumentStatusSchema.nullable(),
  statusTo: SalesDocumentStatusSchema.nullable(),
  totalBefore: z.string().nullable(),
  totalAfter: z.string().nullable(),
  /** `customer`, `salesperson`, `courier`, `notes`, `validUntil`, `discount`, `priceList`. */
  header: z.record(
    z.string(),
    z.object({ from: z.string().nullable(), to: z.string().nullable() })
  ),
  lines: z.object({
    added: z.array(RevisionItem),
    removed: z.array(RevisionItem),
    changed: z.array(
      z.object({
        description: z.string(),
        quantityFrom: z.string(),
        quantityTo: z.string(),
        unitPriceFrom: z.string(),
        unitPriceTo: z.string(),
      })
    ),
  }),
})

export type SalesDocumentRevision = z.infer<typeof SalesDocumentRevision>

export const SalesDocumentHistoryResponse = z.object({
  revisions: z.array(SalesDocumentRevision),
})

export type SalesDocumentHistoryResponse = z.infer<
  typeof SalesDocumentHistoryResponse
>

export const SalesConversionResponse = z.object({
  quote: SalesDocumentDetail,
  order: SalesDocumentDetail,
})

export type SalesConversionResponse = z.infer<typeof SalesConversionResponse>

export const SalesDocumentList = z.object({
  items: z.array(SalesDocumentSummary),
  total: z.number().int().nonnegative(),
  /**
   * The whole filtered set summed, not this page. Cancelled sales contribute
   * nothing — a cancelled sale is not revenue.
   */
  totalAmount: z.string(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type SalesDocumentList = z.infer<typeof SalesDocumentList>

export const SalesDocumentListQuery = z.object({
  branchId: z.string().min(1).optional(),
  kind: SalesDocumentKindSchema.optional(),
  status: SalesDocumentStatusSchema.optional(),
  customerPartyId: z.string().min(1).optional(),
  /** O que este motoboy levou — a pergunta da tela de acerto (F034). */
  courierPartyId: z.string().min(1).optional(),
  /** O que este vendedor vendeu — o dia dele, no Início (F035). */
  salespersonUserId: z.string().min(1).optional(),
  /**
   * Só o que pode virar troca ou vale (F159).
   *
   * O trocador procura a venda de origem por número ou por nome, e o que ele
   * NÃO pode é encontrar uma que o servidor vai recusar depois — mandar o
   * cliente esperar para ouvir não. O filtro é a mesma regra de
   * `exchangeScope`, aplicada no banco.
   *
   * Um filtro, e não um `kind`+`status` escrito na tela: a regra tem quatro
   * partes e mudou uma vez; a próxima mudança tem de chegar sozinha às telas.
   */
  exchangeable: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  /**
   * Esconde o orçamento que já virou pedido ou venda (F162).
   *
   * Desde a F160 o número acompanha: o orçamento 40 vira o pedido 40. Na lista
   * de Vendas os dois apareciam, com o mesmo número — "uma coisa virou duas" —,
   * e o total do filtro somava os dois. O orçamento convertido continua em
   * Orçamentos, e aparece aqui quando alguém filtra por ele.
   */
  hideConverted: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  /** Matches the document number or the customer's name. */
  search: z.string().trim().max(120).optional(),
  /** Inclusive, on the issue date. What "hoje" and "este mês" are made of. */
  issuedFrom: z.iso.datetime({ offset: true }).optional(),
  issuedTo: z.iso.datetime({ offset: true }).optional(),
  /**
   * A faixa de valor do documento (F152): "vendas acima de R$ 500".
   *
   * Texto decimal, e não número: um JSON number é um double por especificação,
   * e `JSON.parse` arredondaria antes de qualquer código nosso rodar. Comparado
   * em `numeric` no banco (ADR-0016). Os dois lados são independentes — só
   * mínimo e só máximo são filtros legítimos.
   */
  totalMin: amountString('O valor mínimo').optional(),
  totalMax: amountString('O valor máximo').optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped: an uncapped page size is a way for one request to read every sale
  // the business has ever made.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['issued_at', 'number', 'total_amount']).default('issued_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
})

/**
 * The wire-input type, where `z.coerce` widens numbers to `unknown` because a
 * query string carries them as text. Useful on the server, useless to a
 * client — which gets `SalesDocumentListRequest` below instead.
 */
export type SalesDocumentListQuery = z.input<typeof SalesDocumentListQuery>

/** What a client passes. Numbers are numbers. */
export type SalesDocumentListRequest = {
  branchId?: string | undefined
  kind?: z.infer<typeof SalesDocumentKindSchema> | undefined
  status?: z.infer<typeof SalesDocumentStatusSchema> | undefined
  customerPartyId?: string | undefined
  courierPartyId?: string | undefined
  salespersonUserId?: string | undefined
  /** Só o que pode virar troca ou vale (F159). */
  exchangeable?: boolean | undefined
  /** Esconde o orçamento que já virou pedido ou venda (F162). */
  hideConverted?: boolean | undefined
  search?: string | undefined
  issuedFrom?: string | undefined
  issuedTo?: string | undefined
  /** A faixa de valor (F152), em texto decimal — nunca `number`. */
  totalMin?: string | undefined
  totalMax?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?: 'issued_at' | 'number' | 'total_amount' | undefined
  direction?: 'asc' | 'desc' | undefined
}

export type SalesDocumentListParams = z.output<typeof SalesDocumentListQuery>

/**
 * A line as the client sends it.
 *
 * The price is sent by the client because the client captured it — from
 * `/api/v1/pricing/resolve`, or from somebody typing. The server does not
 * silently re-resolve it: that would make the capture invisible and would mean
 * the number on the screen and the number on the document could differ without
 * anybody being told.
 */
export const SalesLineRequest = z.object({
  variantId: z.string().min(1),
  /** Captured. Sent by the client so the document records what was shown. */
  description: z.string().trim().min(1).max(300),
  unit: z.string().trim().min(1).max(10),
  unitPrice: amountString('O preço'),
  priceListId: z.string().min(1).nullable().default(null),
  priceBasis: PriceBasisSchema.default('manual'),
  quantity: amountString('A quantidade'),
  discountAmount: amountString('O desconto').default('0'),
})

export type SalesLineRequest = z.input<typeof SalesLineRequest>

export const CreateSalesDocumentRequest = z.object({
  /**
   * Optional, and a UUIDv7 when present.
   *
   * A till that cannot reach the Cloud must still produce an identifier that
   * will never collide when it syncs — ADR-0014 decides this here rather than
   * leaving it to be discovered when the Edge is built.
   */
  id: z.uuid().optional(),
  branchId: z.string().min(1).optional(),
  kind: SalesDocumentKindSchema,
  /** Never null. A walk-in sale sends the tenant's `Consumidor Final`. */
  customerPartyId: z.string().min(1),
  salespersonUserId: z.string().min(1).nullable().default(null),
  reservesStock: z.boolean().default(false),
  validUntil: instant.nullable().default(null),
  priceListId: z.string().min(1).nullable().default(null),
  discountAmount: amountString('O desconto').default('0'),
  /**
   * O desconto pedido em percentual (F100).
   *
   * Presente IGNORA `discountAmount`: a intenção manda, e o valor é derivado
   * dela sobre as linhas. Os dois preenchidos ao mesmo tempo é recusado pela
   * rota — não aqui, porque a mensagem precisa dizer qual dos dois apagar.
   */
  discountPercent: percentString('O desconto percentual')
    .nullable()
    .default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
  lines: z.array(SalesLineRequest).default([]),
})

export type CreateSalesDocumentRequest = z.input<
  typeof CreateSalesDocumentRequest
>
export type CreateSalesDocumentBody = z.output<
  typeof CreateSalesDocumentRequest
>

export const UpdateSalesDocumentRequest = z.object({
  version: z.number().int().nonnegative(),
  customerPartyId: z.string().min(1).optional(),
  salespersonUserId: z.string().min(1).nullable().optional(),
  /**
   * Por que o vendedor de uma venda que já saiu está mudando (F137).
   *
   * Obrigatório só nesse caso — é quem vai receber a comissão —, e fica na
   * auditoria com o vendedor de antes e o de depois.
   */
  salespersonChangeReason: z.string().trim().max(500).optional(),
  reservesStock: z.boolean().optional(),
  validUntil: instant.nullable().optional(),
  priceListId: z.string().min(1).nullable().optional(),
  discountAmount: amountString('O desconto').optional(),
  /**
   * O percentual (F100). `null` explícito volta o documento para reais.
   *
   * AUSENTE não é "sem percentual": é "não mexa nele". Um documento com 10%
   * guardado que recebe só uma linha nova continua com 10%, e é essa a
   * diferença entre lembrar e não lembrar.
   */
  discountPercent: percentString('O desconto percentual').nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Absent leaves the lines alone; present replaces the whole set. */
  lines: z.array(SalesLineRequest).optional(),
  /** Quem levou (F147). Só num pedido que já saiu com o motoboy. */
  courierPartyId: z.string().min(1).nullable().optional(),
  /**
   * Por que mudou (F147). Obrigatório para alterar um pedido ou uma venda que
   * já saiu; vai para o histórico junto com quem e quando.
   */
  reason: z.string().trim().max(500).optional(),
})

export type UpdateSalesDocumentRequest = z.input<
  typeof UpdateSalesDocumentRequest
>
export type UpdateSalesDocumentBody = z.output<
  typeof UpdateSalesDocumentRequest
>

export const TransitionSalesDocumentRequest = z.object({
  version: z.number().int().nonnegative(),
  to: SalesDocumentStatusSchema,
  /** Recorded on a cancellation. Section 29 wants the reason, not only the fact. */
  reason: z.string().trim().max(500).nullable().default(null),
  /**
   * A autorização de quem deixou (ADR-0026, F034).
   *
   * Exigida para cancelar um documento que está segurando mercadoria. O
   * cliente saiu do balcão com um papel dizendo que a peça é dele, e desfazer
   * essa promessa é uma decisão que alguém toma com nome — não um botão que o
   * operador aperta sozinho.
   *
   * Ausente nos demais casos, que é a maioria: um rascunho que ninguém
   * prometeu a ninguém se cancela sem cerimônia.
   */
  authorisationId: z.string().min(1).nullable().default(null),
  /**
   * O que fazer com o que já foi pago, ao cancelar um PEDIDO pago (F173).
   *
   * `refund` devolve (o dinheiro em espécie sai do caixa informado); `voucher`
   * vira vale do cliente. Obrigatório quando o pedido tem pagamento — sem ele,
   * 409 `paid_resolution_required` e a tela pergunta.
   */
  paidResolution: z.enum(['refund', 'voucher']).nullable().default(null),
  /** O caixa de onde sai o dinheiro devolvido, quando há dinheiro a devolver. */
  cashSessionId: z.string().min(1).nullable().default(null),
})

export type TransitionSalesDocumentRequest = z.input<
  typeof TransitionSalesDocumentRequest
>
export type TransitionSalesDocumentBody = z.output<
  typeof TransitionSalesDocumentRequest
>

export const ConvertQuoteRequest = z.object({
  version: z.number().int().nonnegative(),
  orderId: z.uuid().optional(),
  /** Defaults to the quote's own flag when absent. */
  reservesStock: z.boolean().optional(),
})

/**
 * O acerto do motoboy (F034).
 *
 * *"a caixa depois atualiza e dá baixa de motoboy por motoboy"* — a pergunta
 * da tela é essa e não outra: **o que o Fulano levou e ainda não acertou?**
 *
 * Uma linha é uma entrega: o documento que saiu com ele e o título que nasceu
 * na saída. Os dois juntos numa resposta só porque a pergunta é uma só, e
 * porque a alternativa seria a tela pedir um título por entrega — quinze
 * requisições para montar uma coluna de dinheiro.
 */
export const DeliverySummary = z.object({
  documentId: z.string(),
  number: z.number().int().nullable(),
  customerName: z.string(),
  /** Quem levou. Dito na linha porque a lista pode ser de todos. */
  courierName: z.string().nullable(),
  dispatchedAt: z.string().nullable(),
  totalAmount: z.string(),
  /**
   * A versão do PEDIDO, e não a do título (F159, fatia 4).
   *
   * Viaja porque desta tela também se desfaz a entrega — "o motoboy voltou com
   * a peça porque o cliente cancelou" —, e desfazer é uma escrita sobre o
   * documento. Sem ela o botão teria de buscar o pedido antes de agir, e entre
   * a busca e o clique o documento pode ter mudado (ADR-0014).
   */
  documentVersion: z.number().int(),
  /** O título levantado na saída. Nulo se alguém o cancelou. */
  entryId: z.string().nullable(),
  entryVersion: z.number().int().nullable(),
  entryStatus: z.string().nullable(),
  /** O que falta receber deste título. `0.00` quando já foi acertado. */
  outstanding: z.string(),
  /** O bairro do cliente: é por ele que o caixa reconhece a entrega (F161). */
  customerDistrict: z.string().nullable().default(null),
  courierPartyId: z.string().nullable().default(null),
  /**
   * O cliente, e o que ele tem para pagar com — F179.
   *
   * O dono: *"faltou a opção vale e crédito, caso o cliente tenha"*. "Caso ele
   * tenha" é o ponto: o botão só aparece quando existe saldo que cubra, ou
   * limite livre, e o rótulo carrega o número ("Vale (R$ 80,00)"). Sem isso o
   * caixa clica e descobre no erro.
   *
   * Vêm na MESMA resposta, pelo motivo escrito acima: a alternativa seria a
   * tela perguntar o saldo de cada cliente da lista, uma requisição por linha.
   */
  customerPartyId: z.string().nullable().default(null),
  /** Saldo de vale do cliente. `'0.00'` quando não tem. */
  voucherBalance: z.string().default('0.00'),
  /**
   * Limite de crédito livre. `'0.00'` sem limite, bloqueado ou com atraso — os
   * três casos em que o servidor recusaria, ditos aqui como "não oferece".
   */
  creditAvailable: z.string().default('0.00'),
  /** Quando entrou a última baixa. Nulo sem baixa. */
  settledAt: z.string().nullable().default(null),
  /**
   * A forma que o cliente COMBINOU quando comprou — F189.
   *
   * Mora em `finance_entry.expected_method_id`, consultiva desde a 0019, e
   * estava preenchida em 1 793 títulos de venda sem nunca ter aparecido numa
   * tela. É ela que responde a pergunta do balcão: *"ele disse que ia pagar em
   * pix e pagou em dinheiro"* — e é por isso que fica ao lado do "Como pagou",
   * não no lugar dele.
   */
  expectedMethodName: z.string().nullable().default(null),
  /** Quem vendeu, de qual filial, e o que o pedido pediu por escrito (F189). */
  salespersonName: z.string().nullable().default(null),
  branchName: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  /**
   * Quem pôs a mercadoria na rua — F189.
   *
   * De `sales_document_revision` (`action = 'dispatched'`), gravado desde a
   * 0079 e invisível até aqui: 1 243 linhas no banco de desenvolvimento. Numa
   * loja com três pessoas no balcão, "quem despachou" e "quem acertou" são
   * perguntas diferentes, e só a segunda tinha resposta.
   */
  dispatchedByName: z.string().nullable().default(null),
  /**
   * Quantas baixas desta entrega foram estornadas — F189.
   *
   * Um número, e não uma linha dentro de `settlements`: aquela lista é somada
   * para dizer quanto o cliente pagou, e uma baixa estornada ali dentro seria
   * dinheiro que não existe. São 812 estornos no banco de desenvolvimento, e
   * até aqui a tela não dizia que tinha havido algum.
   */
  reversedCount: z.number().int().nonnegative().default(0),
  /**
   * Como o cliente pagou (F161): uma linha por baixa viva — "50 no cartão e 50
   * em dinheiro" são duas. É o que a aba Acertados mostra.
   */
  settlements: z
    .array(
      z.object({
        methodName: z.string(),
        amount: z.string(),
        at: z.string(),
        byName: z.string().nullable(),
        /**
         * O que o `paid_amount` já embutiu, aberto (F189).
         *
         * `paid_amount` é coluna gerada (`amount + juros + multa − desconto`),
         * então a tela mostrava um valor sem poder dizer de onde ele veio.
         */
        interestAmount: z.string().default('0.00'),
        fineAmount: z.string().default('0.00'),
        discountAmount: z.string().default('0.00'),
        /** A data informada da baixa, que pode não ser a do lançamento. */
        settledOn: z.string().nullable().default(null),
        note: z.string().nullable().default(null),
      })
    )
    .default([]),
})

export type DeliverySummary = z.infer<typeof DeliverySummary>

/** Um cartão do topo da tela do motoboy: quem está na rua e com quanto (F161). */
export const CourierSummary = z.object({
  partyId: z.string(),
  name: z.string(),
  openCount: z.number().int().nonnegative(),
  toCollect: z.string(),
})

export type CourierSummary = z.infer<typeof CourierSummary>

/**
 * A conta do motoboy no recorte — F203.
 *
 * Motoboy, período, busca e forma, mas sem a aba: quantos levou, quanto deu,
 * quanto voltou e quanto falta. Soma o recorte inteiro, não a página.
 */
export const DeliveryRecap = z.object({
  count: z.number().int().nonnegative(),
  totalAmount: z.string(),
  settledAmount: z.string(),
  outstandingAmount: z.string(),
  outstandingCount: z.number().int().nonnegative(),
  /** O que voltou, por forma — para bater a gaveta. */
  byMethod: z.array(
    z.object({
      paymentMethodId: z.string().nullable(),
      name: z.string(),
      amount: z.string(),
    })
  ),
})

export type DeliveryRecap = z.infer<typeof DeliveryRecap>

const EMPTY_RECAP: DeliveryRecap = {
  count: 0,
  totalAmount: '0.00',
  settledAmount: '0.00',
  outstandingAmount: '0.00',
  outstandingCount: 0,
  byMethod: [],
}

export const DeliveryListResponse = z.object({
  /** Nulos quando a pergunta foi sobre todos. */
  courierPartyId: z.string().nullable(),
  courierName: z.string().nullable(),
  items: z.array(DeliverySummary),
  /** A soma do que este motoboy ainda deve prestar contas. */
  outstandingTotal: z.string(),
  /** Quantas entregas o recorte tem — a página é só uma parte (F161). */
  total: z.number().int().nonnegative().default(0),
  /** Qual página o servidor de fato devolveu, e de que tamanho (F189). */
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).default(100),
  /** Todos os motoboys com algo em aberto, sem recorte de data (F161). */
  couriers: z.array(CourierSummary).default([]),
  recap: DeliveryRecap.default(EMPTY_RECAP),
})

export type DeliveryListResponse = z.infer<typeof DeliveryListResponse>

/**
 * Por qual coluna a lista do acerto se ordena — F189.
 *
 * `street` é o tempo na rua: `settled_at − dispatched_at` quando acertou, e
 * "até agora" quando ainda não. É a coluna que responde *"o que está demorando
 * a voltar"*, e não existia porque a ordem era fixa.
 */
export const DELIVERY_SORTS = [
  'dispatchedAt',
  'settledAt',
  'number',
  'customer',
  'courier',
  'street',
  'total',
  'outstanding',
] as const
export const DeliverySortSchema = z.enum(DELIVERY_SORTS)
export type DeliverySort = z.infer<typeof DeliverySortSchema>

export const DeliveryListQuery = z.object({
  /**
   * Ausente é "todos os entregadores" (F035).
   *
   * A tela do acerto pergunta por um; o painel do caixa pergunta quanto ainda
   * está na rua, sem nomear ninguém.
   */
  courierPartyId: z.string().min(1).optional(),
  /**
   * `open` é a tela do acerto; `all` é a conferência do dia seguinte.
   *
   * O padrão é `open` porque quem abre esta tela tem um motoboy na frente
   * esperando para prestar contas, e o que já foi acertado só atrapalha.
   */
  scope: z.enum(['open', 'settled', 'all']).default('open'),
  /** Pelo dia em que saiu (F161). Fim exclusivo. */
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  /** Nº do pedido ou nome do cliente — F189. */
  search: z.string().trim().min(1).max(120).optional(),
  /**
   * Só as entregas acertadas com esta forma — F189.
   *
   * Por `exists`, nunca por junção: uma entrega tem N baixas ("50 no cartão e
   * 50 em dinheiro"), e juntar `finance_settlement` faria a contagem deixar de
   * contar entregas para contar baixas. É o mesmo erro que a F185 documentou e
   * a F188 mediu.
   */
  paymentMethodId: z.uuid().optional(),
  sort: DeliverySortSchema.default('dispatchedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
})

export type DeliveryListQuery = z.input<typeof DeliveryListQuery>
export type DeliveryListParams = z.output<typeof DeliveryListQuery>

/** O que o cliente passa. Número é número — ver `ExpensesRequest`. */
export type DeliveryListRequest = {
  courierPartyId?: string | undefined
  scope?: 'open' | 'settled' | 'all' | undefined
  from?: string | undefined
  to?: string | undefined
  search?: string | undefined
  paymentMethodId?: string | undefined
  sort?: DeliverySort | undefined
  direction?: 'asc' | 'desc' | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

/**
 * Despachar: a mercadoria sai com alguém (F034).
 *
 * *"às vezes o motoboy faz a entrega, o cliente paga na hora tipo 50 no cartão
 * 50 no dinheiro"* — a mercadoria sai ANTES do dinheiro, e é por isso que esta
 * requisição não fala de pagamento nenhum. O que ela produz é uma saída de
 * estoque e um título a receber; o dinheiro chega depois, no acerto.
 */
export const DispatchSalesDocumentRequest = z.object({
  version: z.number().int().nonnegative(),
  /** Nulo é o cliente levando no balcão: ninguém a acertar depois. */
  courierPartyId: z.string().min(1).nullable().default(null),
})

/**
 * Uma forma de pagamento entregue no balcão, com o que a maquininha devolveu.
 *
 * Mora aqui, e não em `pos.ts`, desde a F159: o PDV e a **retirada de um
 * pedido** recebem dinheiro do mesmo jeito, e `pos.ts` já importa deste
 * arquivo — o contrário criaria ciclo. `PosTenderRequest` continua exportado de
 * lá como o mesmo objeto, para não quebrar quem já o importava.
 */
export const TenderRequest = z.object({
  paymentMethodId: z.string().min(1),
  amount: amountString('O valor'),
  instalments: z.number().int().min(1).max(24).default(1),
  /** What the operator read off the card receipt. Cash has none. */
  authorizationCode: z.string().trim().max(40).nullable().default(null),
  nsu: z.string().trim().max(40).nullable().default(null),
  transactionId: z.string().trim().max(64).nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
})

export type TenderRequest = z.input<typeof TenderRequest>

/**
 * A retirada de um PEDIDO, no balcão — F159, fatia 2.
 *
 * O caixa abre um pedido que o vendedor montou e o cliente leva na hora. Três
 * coisas acontecem juntas, e é por isso que é uma rota só: a mercadoria sai, o
 * dinheiro entra, e nenhum título de entrega nasce — não há motoboy para
 * acertar depois.
 *
 * Mesmas formas do PDV (`PosTenderRequest` vive em `pos.ts`, e este pacote não
 * pode importá-lo de lá sem ciclo), então a lista é declarada aqui com os mesmos
 * campos. A guarda contra as duas divergirem é um teste.
 */
export const PickupSalesDocumentRequest = z.object({
  version: z.number().int().nonnegative(),
  /**
   * A gaveta em que o dinheiro entra. Obrigatória na loja que trabalha com
   * caixa (422 `cash_session_required`); ignorada na que não trabalha (F174).
   */
  cashSessionId: z.string().min(1).nullable().default(null),
  /**
   * O que falta pagar (F173). Pode ser vazio quando o sinal já cobriu tudo; o
   * servidor recusa com `payment_short` se ainda faltar alguma coisa.
   */
  payments: z.array(TenderRequest),
})

export type PickupSalesDocumentRequest = z.input<
  typeof PickupSalesDocumentRequest
>

/**
 * Pagar agora e retirar depois (F218).
 *
 * O cliente paga o orçamento no caixa e volta outro dia para buscar. Numa
 * operação só, o orçamento vira pedido confirmado — a mercadoria fica separada
 * para ele — e o pedido é pago por inteiro. A saída do estoque e a hora da
 * retirada ficam para quando ele buscar, pela retirada de pedido (`/pickup`).
 */
export const PayAndHoldRequest = z.object({
  /** A versão do ORÇAMENTO que o caixa abriu. */
  version: z.number().int().nonnegative(),
  /** Como na retirada: obrigatória só na loja que trabalha com caixa (F174). */
  cashSessionId: z.string().min(1).nullable().default(null),
  payments: z.array(TenderRequest).min(1),
})

export type PayAndHoldRequest = z.input<typeof PayAndHoldRequest>

/**
 * Receber o sinal de um pedido confirmado (F173).
 *
 * Parte do total, no caixa aberto da filial. A soma não passa do que falta, e
 * não dá troco: quem paga tudo usa a retirada ou a entrega.
 */
export const DepositSalesDocumentRequest = z.object({
  /** Como na retirada: obrigatória só na loja que trabalha com caixa (F174). */
  cashSessionId: z.string().min(1).nullable().default(null),
  payments: z.array(TenderRequest).min(1),
})

/**
 * O que quem lança o sinal precisa escolher (F173): o caixa aberto da filial
 * e a forma de pagamento.
 *
 * O vendedor tem `sales.deposit` e não `pos.operate` nem `payment.read`: ele
 * não abre caixa nem lê a lista de formas, mas o sinal que ele lança entra num
 * caixa e por uma forma. Só as formas que servem de sinal — nenhuma que gere
 * recebível.
 */
export const DepositOptions = z.object({
  /**
   * Se a loja desta filial trabalha com caixa (F174). Falso: o sinal não
   * pergunta caixa nenhum, e `tills` vem vazio.
   */
  usesTill: z.boolean(),
  methods: z.array(PaymentMethodSummary),
  tills: z.array(
    z.object({
      id: z.string(),
      terminalId: z.string(),
      openedByName: z.string().nullable(),
      openedAt: z.string(),
    })
  ),
})

export type DepositOptions = z.infer<typeof DepositOptions>

export type DepositSalesDocumentRequest = z.input<
  typeof DepositSalesDocumentRequest
>
export type DepositSalesDocumentBody = z.output<
  typeof DepositSalesDocumentRequest
>
export type PickupSalesDocumentBody = z.output<
  typeof PickupSalesDocumentRequest
>
export type PayAndHoldBody = z.output<typeof PayAndHoldRequest>

export type DispatchSalesDocumentRequest = z.input<
  typeof DispatchSalesDocumentRequest
>
export type DispatchSalesDocumentBody = z.output<
  typeof DispatchSalesDocumentRequest
>

export type ConvertQuoteRequest = z.input<typeof ConvertQuoteRequest>
export type ConvertQuoteBody = z.output<typeof ConvertQuoteRequest>
