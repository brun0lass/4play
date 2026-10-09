import { z } from 'zod'

/**
 * A fila de produção de uniformes — F170, migração 0098, ADR-0038.
 *
 * Só existe para a conta com a chave `uniformes`: toda rota que usa este
 * contrato responde 403 `feature_not_enabled` para as outras.
 *
 * As listas abaixo repetem as de `@aeris/uniforms` — o contrato só pode
 * depender de `@aeris/domain` — e o CHECK da migração 0098. O teste de paridade
 * em `apps/api` segura as três juntas.
 *
 * Dinheiro como string (ADR-0016). Datas de despacho e de evento como
 * `AAAA-MM-DD`: são um dia, não um instante.
 */

export const UNIFORM_STAGE_VALUES = [
  'atendimento',
  'arte',
  'iniciar-impressao',
  'imprimindo',
  'impresso',
  'cortando',
  'costurando',
  'embalando',
  'pronto',
] as const

export const UNIFORM_SIZE_VALUES = [
  'PP',
  'P',
  'M',
  'G',
  'GG',
  'XG',
  'EXG',
  'ESP',
  'G1',
  'G2',
  'G3',
  'G4',
  '2',
  '4',
  '6',
  '8',
  '10',
  '12',
  '14',
  '16',
] as const

export const UNIFORM_FABRIC_VALUES = [
  'elastano',
  'furadinho',
  'cem-por-cento',
] as const

export const UNIFORM_LOGISTICS_VALUES = [
  'correios',
  'van',
  'uber',
  'retirada',
] as const

export const UNIFORM_PAYMENT_MARK_VALUES = [
  'nao',
  'sinal',
  'total',
  'cortesia',
] as const

/** As funções na produção — F171, migração 0099. */
export const UNIFORM_FUNCTION_VALUES = [
  'atendimento',
  'arte',
  'producao',
] as const

/** O andamento da arte — F171, migração 0099. */
export const UNIFORM_ART_STATUS_VALUES = [
  'aguardando',
  'criando',
  'enviada',
  'ajuste',
  'aprovada',
] as const

/** O que a linha do tempo registra além da etapa — F171, migração 0099. */
export const UNIFORM_EVENT_KIND_VALUES = [
  'ficha',
  'grade',
  'personalizados',
  'arte',
  'imagem-adicionada',
  'imagem-removida',
  'impressoras',
  'repetido',
  'link',
  'ocorrencia',
  'ocorrencia-resolvida',
] as const

export const UniformStageSchema = z.enum(UNIFORM_STAGE_VALUES)
export const UniformFunctionSchema = z.enum(UNIFORM_FUNCTION_VALUES)
export const UniformArtStatusSchema = z.enum(UNIFORM_ART_STATUS_VALUES)
export const UniformEventKindSchema = z.enum(UNIFORM_EVENT_KIND_VALUES)
export const UniformSizeSchema = z.enum(UNIFORM_SIZE_VALUES)
export const UniformFabricSchema = z.enum(UNIFORM_FABRIC_VALUES)
export const UniformLogisticsSchema = z.enum(UNIFORM_LOGISTICS_VALUES)
export const UniformPaymentMarkSchema = z.enum(UNIFORM_PAYMENT_MARK_VALUES)

const DAY = /^\d{4}-\d{2}-\d{2}$/
const Day = z.string().regex(DAY, 'Use a data no formato AAAA-MM-DD.')

const isTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === ''
        ? []
        : value.split(',').map((part) => part.trim())
    )
    .pipe(z.array(item).max(50))

const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')

// ---------------------------------------------------------------------------
// Impressoras
// ---------------------------------------------------------------------------

export const UniformPrinterStatusSchema = z.enum(['active', 'archived'])

export const UniformPrinterSummary = z.object({
  id: z.string(),
  name: z.string(),
  status: UniformPrinterStatusSchema,
  /** Em quantos pedidos foi marcada — arquivar uma máquina usada é outra decisão. */
  usageCount: z.number().int(),
  version: z.number().int(),
})

export type UniformPrinterSummaryType = z.infer<typeof UniformPrinterSummary>

export const UniformPrinterListQuery = z.object({
  status: UniformPrinterStatusSchema.optional(),
})

export const UniformPrinterListResponse = z.object({
  printers: z.array(UniformPrinterSummary),
})

export type UniformPrinterListResponseType = z.infer<
  typeof UniformPrinterListResponse
>

const PrinterName = z
  .string()
  .trim()
  .min(1, 'Dê um nome à impressora.')
  .max(60, 'Use no máximo 60 caracteres.')

export const CreateUniformPrinterRequest = z.object({ name: PrinterName })

export type CreateUniformPrinterBody = z.infer<
  typeof CreateUniformPrinterRequest
>

/** Renomear e arquivar pela mesma rota: o pedido guarda o ID, não o nome. */
export const UpdateUniformPrinterRequest = z
  .object({
    name: PrinterName.optional(),
    status: UniformPrinterStatusSchema.optional(),
    version: z.number().int(),
  })
  .refine(
    (body) => body.name !== undefined || body.status !== undefined,
    'Diga o que mudar: o nome ou a situação.'
  )

export type UpdateUniformPrinterBody = z.infer<
  typeof UpdateUniformPrinterRequest
>

// ---------------------------------------------------------------------------
// A fila
// ---------------------------------------------------------------------------

export const PRODUCTION_SORTS = [
  'dispatchDate',
  'number',
  'customer',
  'total',
  'stage',
  'pieces',
] as const

export const ProductionQueueQuery = z.object({
  /** Número do pedido ou nome do cliente. */
  search: z.string().trim().max(120).optional(),
  stages: csv(UniformStageSchema),
  designerUserIds: csv(z.uuid()),
  salespersonUserIds: csv(z.uuid()),
  printerIds: csv(z.uuid()),
  /** `a-definir` é o tecido em branco — o "?" da planilha. */
  fabrics: csv(z.enum([...UNIFORM_FABRIC_VALUES, 'a-definir'])),
  logistics: csv(UniformLogisticsSchema),
  paymentMarks: csv(UniformPaymentMarkSchema),
  artStatuses: csv(UniformArtStatusSchema),
  /** "Minha fila": o que as funções de quem pede têm para fazer (F171). */
  mine: flag,
  dispatchFrom: Day.optional(),
  dispatchTo: Day.optional(),
  /** Só os que passaram da data de despacho. */
  late: flag,
  /** Os rascunhos, em vez dos confirmados. */
  drafts: flag,
  branchId: z.uuid().optional(),
  /** Decide "hoje" para o atraso — às 22h em São Paulo já é amanhã em UTC. */
  timeZone: z
    .string()
    .trim()
    .max(64)
    .refine(isTimeZone, 'Fuso horário desconhecido.')
    .default('America/Sao_Paulo'),
  sort: z.enum(PRODUCTION_SORTS).default('dispatchDate'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  /** Até 500: o quadro pede a fila inteira de uma vez (F171). */
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
})

/** O que a tela manda: texto, como numa query string. */
export type ProductionQueueQueryInput = z.input<typeof ProductionQueueQuery>

export const ProductionPrinterRef = z.object({
  id: z.string(),
  name: z.string(),
})

/**
 * Um item do pedido de vendas, como a planilha o lê: "29 Camisa dry" (F220).
 *
 * O preço vem nulo para quem não vê dinheiro (`seesMoney`) — a quantidade e o
 * nome continuam, porque é com eles que a fábrica trabalha.
 */
export const ProductionOrderLine = z.object({
  description: z.string(),
  quantity: z.string(),
  unit: z.string(),
  unitPrice: z.string().nullable(),
  lineTotal: z.string().nullable(),
})

export type ProductionOrderLineType = z.infer<typeof ProductionOrderLine>

/** Uma quantidade de uma peça — "100 Camisa" (F230). */
export const ProductionPieceCount = z.object({
  piece: z.string(),
  /** O tamanho da célula (F239). Nulo na leva antiga, que não dizia. */
  size: z.enum(UNIFORM_SIZE_VALUES).nullable().default(null),
  quantity: z.number().int(),
})

export type ProductionPieceCountType = z.infer<typeof ProductionPieceCount>

/**
 * Uma leva separada do pedido — a 2, a 3, … (F230).
 *
 * A leva 1 é o restante: não vem aqui, é a etapa do próprio pedido com as
 * peças de `remainingPieces`.
 */
export const ProductionBatchSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  stage: UniformStageSchema,
  stageChangedAt: z.string(),
  version: z.number().int(),
  pieces: z.array(ProductionPieceCount),
  total: z.number().int(),
  /** As impressoras em que ESTA leva imprimiu. */
  printers: z.array(ProductionPrinterRef),
})

export type ProductionBatchType = z.infer<typeof ProductionBatchSchema>

export const ProductionOrderSummary = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  status: z.enum(['draft', 'confirmed', 'fulfilled', 'cancelled']),
  issuedAt: z.string(),
  customerPartyId: z.string(),
  customerName: z.string(),
  customerCity: z.string().nullable(),
  salespersonUserId: z.string().nullable(),
  salespersonName: z.string().nullable(),
  /** Nulo para quem não vê dinheiro (F220). */
  totalAmount: z.string().nullable(),
  /**
   * O que já foi pago no pedido — o sinal de verdade (F173). Nulo para quem
   * não vê dinheiro (F220).
   */
  paidAmount: z.string().nullable(),
  designerUserId: z.string().nullable(),
  designerName: z.string().nullable(),
  dispatchDate: z.string().nullable(),
  fabric: UniformFabricSchema.nullable(),
  personalized: z.boolean(),
  logistics: z.array(UniformLogisticsSchema),
  eventDate: z.string().nullable(),
  eventNote: z.string().nullable(),
  /** Anotação, não dinheiro. O sinal recebido de verdade é `paidAmount` (F173). */
  paymentMark: UniformPaymentMarkSchema,
  /** O andamento da arte (F171). */
  artStatus: UniformArtStatusSchema,
  artChangedAt: z.string().nullable(),
  /** 0 quando a arte nunca foi mexida. */
  artVersion: z.number().int(),
  artReady: z.boolean(),
  productionFileReady: z.boolean(),
  gradeChecked: z.boolean(),
  notes: z.string().nullable(),
  /** 0 quando o pedido ainda não tem ficha. */
  sheetVersion: z.number().int(),
  stage: UniformStageSchema,
  stageChangedAt: z.string(),
  /** 0 quando a etapa nunca foi trocada. */
  stageVersion: z.number().int(),
  /** Grade + personalizados. */
  pieces: z.number().int(),
  /** Total ÷ peças, no centavo. Nulo sem peça, ou para quem não vê dinheiro. */
  ticketPerPiece: z.string().nullable(),
  /** Os itens do pedido de vendas, na ordem dele (F220). */
  lines: z.array(ProductionOrderLine),
  printers: z.array(ProductionPrinterRef),
  /** A data de despacho passou e o pedido ainda não saiu. */
  late: z.boolean(),
  /**
   * As levas separadas (F230). Vazio no pedido que nunca foi dividido. O
   * `default` deixa a tela nova ler a API de antes.
   */
  batches: z.array(ProductionBatchSchema).default([]),
  /**
   * A leva 1, o restante: o que ainda não foi separado, por peça — está na
   * `stage` do pedido. Sem levas, é a grade inteira por peça.
   */
  remainingPieces: z.array(ProductionPieceCount).default([]),
  /** Quem costura (ou costurou) cada leva, sem as canceladas (F231). */
  sewing: z
    .array(
      z.object({
        jobId: z.string(),
        seamstressId: z.string(),
        seamstressName: z.string(),
        /** 1 é o restante. */
        batchNumber: z.number().int(),
        status: z.enum(['em-andamento', 'entregue']),
        pieces: z.number().int(),
      })
    )
    .default([]),
  /** Ocorrências abertas do pedido: refazer e problemas (F234). */
  openIncidents: z.number().int().default(0),
})

export type ProductionOrderSummaryType = z.infer<typeof ProductionOrderSummary>

/** Quantos pedidos uma pessoa tem no filtro — a carga de cada um (F171). */
export const ProductionWorkloadSchema = z.object({
  userId: z.string(),
  name: z.string(),
  as: z.enum(['designer', 'atendente']),
  count: z.number().int(),
  late: z.number().int(),
})

export type ProductionWorkloadType = z.infer<typeof ProductionWorkloadSchema>

export const ProductionQueueResponse = z.object({
  items: z.array(ProductionOrderSummary),
  total: z.number().int(),
  /** As peças do filtro inteiro, não só desta página. */
  pieces: z.number().int(),
  /** Quantos pedidos em cada etapa, no filtro inteiro (F171). */
  byStage: z.partialRecord(UniformStageSchema, z.number().int()),
  /** Só para quem gerencia a produção; vazio para os outros. */
  workload: z.array(ProductionWorkloadSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export type ProductionQueueResponseType = z.infer<
  typeof ProductionQueueResponse
>

// ---------------------------------------------------------------------------
// A ficha
// ---------------------------------------------------------------------------

export const GradeEntrySchema = z.object({
  /** O modelo: "Camisa e Shorts Masc". */
  block: z.string().trim().min(1, 'Dê um nome ao modelo.').max(60),
  piece: z.string().trim().min(1, 'Diga qual é a peça.').max(40),
  size: UniformSizeSchema,
  quantity: z.number().int().min(1).max(100_000),
  /** A linha na tela. A mesma peça pode estar em duas linhas. */
  position: z.number().int().min(0).max(399),
})

export type GradeEntryType = z.infer<typeof GradeEntrySchema>

export const PersonalizationSchema = z.object({
  name: z.string().trim().min(1, 'Falta o nome.').max(80),
  piece: z.string().trim().max(40),
  /** Texto: "07" não é 7. */
  number: z.string().trim().max(10),
  size: UniformSizeSchema,
  quantity: z.number().int().min(1).max(100_000),
})

export type PersonalizationType = z.infer<typeof PersonalizationSchema>

export const ProductionAttachmentSummary = z.object({
  id: z.string(),
  /** Servida pela API, nunca por URL pré-assinada (ADR-0015). */
  url: z.string(),
  thumbUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  byteSize: z.number().int(),
  caption: z.string().nullable(),
  createdAt: z.string(),
})

export type ProductionAttachmentSummaryType = z.infer<
  typeof ProductionAttachmentSummary
>

/**
 * Uma linha da linha do tempo do pedido (F171): a troca de etapa, o que mudou
 * na ficha, na arte e nas imagens, e o comentário da equipe.
 */
export const ProductionTimelineEntrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stage'),
    id: z.string(),
    from: UniformStageSchema.nullable(),
    to: UniformStageSchema,
    printers: z.array(ProductionPrinterRef),
    /** Foi para a fábrica sem a arte aprovada, por quem gerencia. */
    forced: z.boolean(),
    /** A leva que trocou de etapa; nulo é a leva 1, o restante (F230). */
    batch: z
      .object({ id: z.string(), number: z.number().int() })
      .nullable()
      .default(null),
    /** Quando a troca criou a leva: de qual saiu (1 = o restante) e o que levou. */
    split: z
      .object({
        from: z.number().int(),
        pieces: z.array(ProductionPieceCount),
      })
      .nullable()
      .default(null),
    actorName: z.string().nullable(),
    occurredAt: z.string(),
  }),
  z.object({
    type: z.literal('event'),
    id: z.string(),
    kind: UniformEventKindSchema,
    detail: z.record(z.string(), z.unknown()),
    actorName: z.string().nullable(),
    occurredAt: z.string(),
  }),
  z.object({
    type: z.literal('comment'),
    id: z.string(),
    body: z.string(),
    actorUserId: z.string(),
    actorName: z.string().nullable(),
    occurredAt: z.string(),
  }),
])

export type ProductionTimelineEntryType = z.infer<
  typeof ProductionTimelineEntrySchema
>

export const ProductionOrderResponse = z.object({
  order: ProductionOrderSummary,
  branchId: z.string(),
  grade: z.array(GradeEntrySchema),
  personalization: z.array(PersonalizationSchema),
  attachments: z.array(ProductionAttachmentSummary),
  /** Do mais novo para o mais velho. */
  timeline: z.array(ProductionTimelineEntrySchema),
  /**
   * O pedido de onde este foi repetido, e em quais máquinas ELE saiu.
   *
   * As impressoras não são copiadas para o pedido novo — isso gravaria que ele
   * saiu nelas —, são MOSTRADAS a partir daqui.
   */
  repeatedFrom: z
    .object({
      id: z.string(),
      number: z.number().int().nullable(),
      printers: z.array(ProductionPrinterRef),
    })
    .nullable(),
})

export type ProductionOrderResponseType = z.infer<
  typeof ProductionOrderResponse
>

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value))

/**
 * O cabeçalho da ficha — a parte do ATENDIMENTO (F171).
 *
 * O designer e os checks do arquivo são da arte (`SaveArtRequest`), e as
 * impressoras da produção (`ReplacePrintersRequest`).
 */
export const UpdateProductionSheetRequest = z.object({
  /** 0 = o pedido ainda não tinha ficha. */
  version: z.number().int().min(0),
  dispatchDate: Day.nullable(),
  fabric: UniformFabricSchema.nullable(),
  personalized: z.boolean(),
  logistics: z
    .array(UniformLogisticsSchema)
    .max(UNIFORM_LOGISTICS_VALUES.length)
    .refine(
      (list) => new Set(list).size === list.length,
      'Logística repetida.'
    ),
  eventDate: Day.nullable(),
  eventNote: nullableText(200),
  paymentMark: UniformPaymentMarkSchema,
  gradeChecked: z.boolean(),
  notes: nullableText(2_000),
})

export type UpdateProductionSheetBody = z.input<
  typeof UpdateProductionSheetRequest
>

export const ProductionSheetVersionResponse = z.object({
  version: z.number().int(),
})

export const ReplaceGradeRequest = z.object({
  version: z.number().int().min(0),
  entries: z
    .array(GradeEntrySchema)
    .max(400, 'Uma grade com mais de 400 células não é um pedido.')
    .refine(
      (entries) =>
        new Set(
          entries.map((entry) => `${String(entry.position)}|${entry.size}`)
        ).size === entries.length,
      'A mesma linha tem o mesmo tamanho duas vezes.'
    ),
})

export type ReplaceGradeBody = z.infer<typeof ReplaceGradeRequest>

export const ReplacePersonalizationRequest = z.object({
  version: z.number().int().min(0),
  rows: z.array(PersonalizationSchema).max(2_000),
})

export type ReplacePersonalizationBody = z.infer<
  typeof ReplacePersonalizationRequest
>

export const MoveStageRequest = z.object({
  /** A etapa que a tela mostrava — se mudou, a troca é recusada. */
  from: UniformStageSchema,
  to: UniformStageSchema,
  /** Obrigatório para ir a "imprimindo": em qual máquina. */
  printerIds: z.array(z.uuid()).max(20).default([]),
  /**
   * Mandar para a fábrica sem a arte aprovada (F171, F228). Só quem gerencia
   * a produção, e fica escrito na linha do tempo.
   */
  force: z.boolean().default(false),
})

export type MoveStageBody = z.input<typeof MoveStageRequest>

export const MoveStageResponse = z.object({
  stage: UniformStageSchema,
  stageVersion: z.number().int(),
  stageChangedAt: z.string(),
})

export type MoveStageResponseType = z.infer<typeof MoveStageResponse>

/**
 * Separar uma leva (F230): estas quantidades saem da leva de origem e vão,
 * como uma leva nova, para `to` — que pode ser a mesma etapa (duas
 * costureiras no mesmo pedido).
 *
 * Separar TUDO é recusado (`takes_everything`): isso é mover a leva.
 */
export const SplitBatchRequest = z.object({
  /** A leva de origem; nulo é a leva 1, o restante. */
  sourceBatchId: z.uuid().nullable(),
  /** A etapa que a tela mostrava para a origem. */
  from: UniformStageSchema,
  to: UniformStageSchema,
  pieces: z
    .array(
      z.object({
        piece: z.string().trim().max(40),
        /** O tamanho (F239). Nulo: a peça, saindo na ordem dos tamanhos. */
        size: z.enum(UNIFORM_SIZE_VALUES).nullable().default(null),
        quantity: z.number().int().min(1).max(100_000),
      })
    )
    .min(1, 'Escolha quantas peças vão para a leva nova.')
    .max(50),
  printerIds: z.array(z.uuid()).max(20).default([]),
  force: z.boolean().default(false),
})

export type SplitBatchBody = z.input<typeof SplitBatchRequest>

export const BatchResponse = z.object({ batch: ProductionBatchSchema })

export type BatchResponseType = z.infer<typeof BatchResponse>

/**
 * Os pedidos de um cliente — os abertos e os que já saíram (F229).
 *
 * É o que se procura quando o cliente volta um ano depois: em qual máquina
 * saiu, quais levas, e o botão de repetir. Do mais novo para o mais velho.
 */
export const CustomerProductionHistoryResponse = z.object({
  orders: z.array(ProductionOrderSummary),
})

export type CustomerProductionHistoryResponseType = z.infer<
  typeof CustomerProductionHistoryResponse
>

export const RepeatProductionOrderRequest = z.object({
  /** Gerado na tela: o duplo clique cai no mesmo pedido em vez de criar dois. */
  id: z.uuid().optional(),
  /** Quem vende desta vez. Ausente, o mesmo do pedido original. */
  salespersonUserId: z.uuid().nullable().optional(),
})

export type RepeatProductionOrderBody = z.infer<
  typeof RepeatProductionOrderRequest
>

export const RepeatProductionOrderResponse = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
})

export type RepeatProductionOrderResponseType = z.infer<
  typeof RepeatProductionOrderResponse
>

// ---------------------------------------------------------------------------
// A arte, as impressoras, o comentário (F171)
// ---------------------------------------------------------------------------

/** A parte da ARTE, na versão dela — 0 quando a arte nunca foi mexida. */
export const SaveArtRequest = z.object({
  version: z.number().int().min(0),
  status: UniformArtStatusSchema,
  designerUserId: z.uuid().nullable(),
  artReady: z.boolean(),
  productionFileReady: z.boolean(),
})

export type SaveArtBody = z.infer<typeof SaveArtRequest>

export const SaveArtResponse = z.object({
  artVersion: z.number().int(),
  artChangedAt: z.string(),
})

export type SaveArtResponseType = z.infer<typeof SaveArtResponse>

/** O conjunto inteiro de máquinas do pedido — a correção da PRODUÇÃO. */
export const ReplacePrintersRequest = z.object({
  printerIds: z.array(z.uuid()).max(20),
})

export type ReplacePrintersBody = z.infer<typeof ReplacePrintersRequest>

export const AddCommentRequest = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Escreva o comentário.')
    .max(2_000, 'Use no máximo 2.000 caracteres.'),
})

export type AddCommentBody = z.infer<typeof AddCommentRequest>

// ---------------------------------------------------------------------------
// A equipe e as funções (F171)
// ---------------------------------------------------------------------------

export const UniformMemberSummary = z.object({
  userId: z.string(),
  displayName: z.string(),
  role: z.enum([
    'owner',
    'admin',
    'manager',
    'cashier',
    'trocador',
    'salesperson',
  ]),
  functions: z.array(UniformFunctionSchema),
})

export type UniformMemberSummaryType = z.infer<typeof UniformMemberSummary>

export const UniformMemberListResponse = z.object({
  members: z.array(UniformMemberSummary),
})

export const ReplaceMemberFunctionsRequest = z.object({
  functions: z
    .array(UniformFunctionSchema)
    .max(UNIFORM_FUNCTION_VALUES.length)
    .refine((list) => new Set(list).size === list.length, 'Função repetida.'),
})

export type ReplaceMemberFunctionsBody = z.infer<
  typeof ReplaceMemberFunctionsRequest
>

/** Quem está olhando: é o que a tela usa para saber o que pode mexer. */
export const UniformViewerResponse = z.object({
  userId: z.string(),
  /** `uniforms.manage` efetiva — mexe em tudo sem precisar de função. */
  manages: z.boolean(),
  functions: z.array(UniformFunctionSchema),
  /**
   * Vê o valor, o pago e o preço dos itens (F220). Quem a Equipe da produção
   * pôs só na arte e/ou na fábrica não vê — a fila e a ficha mandam nulo.
   */
  seesMoney: z.boolean(),
})

export type UniformViewerResponseType = z.infer<typeof UniformViewerResponse>

// ---------------------------------------------------------------------------
// As costureiras (F231)
// ---------------------------------------------------------------------------

/** Terceirizada trabalha por peça e gera conta a pagar; CLT é da folha. */
export const SEAMSTRESS_KIND_VALUES = ['terceirizada', 'clt'] as const

/** A costura: entregue gera a conta a pagar da terceirizada. */
export const SEWING_STATUS_VALUES = [
  'em-andamento',
  'entregue',
  'cancelada',
] as const

export const SeamstressKindSchema = z.enum(SEAMSTRESS_KIND_VALUES)
export const SewingStatusSchema = z.enum(SEWING_STATUS_VALUES)

/** Até 10 dígitos e 2 casas — `numeric(18, 2)`, sem sinal. */
const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/
const PriceString = z
  .string()
  .trim()
  .regex(
    PRICE_PATTERN,
    'O preço deve ser um número com ponto, por exemplo 4.50'
  )

const PieceName = z.string().trim().min(1, 'Diga qual é a peça.').max(40)

export const SeamstressPriceSchema = z.object({
  piece: z.string(),
  /** Nulo para quem não vê dinheiro (F220). */
  unitPrice: z.string().nullable(),
})

export const SeamstressSummary = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  kind: SeamstressKindSchema,
  /** Dias depois da entrega para pagar. Nulo para CLT e para quem não vê dinheiro. */
  paymentTermDays: z.number().int().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['active', 'archived']),
  version: z.number().int(),
  /** A tabela dela. Os preços vêm nulos para quem não vê dinheiro. */
  prices: z.array(SeamstressPriceSchema),
  openJobs: z.number().int(),
  openPieces: z.number().int(),
})

export type SeamstressSummaryType = z.infer<typeof SeamstressSummary>

export const SeamstressListQuery = z.object({
  status: z.enum(['active', 'archived']).optional(),
})

export const SeamstressListResponse = z.object({
  seamstresses: z.array(SeamstressSummary),
})

export type SeamstressListResponseType = z.infer<typeof SeamstressListResponse>

const seamstressFields = {
  name: z.string().trim().min(1, 'Diga o nome da costureira.').max(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
  kind: SeamstressKindSchema,
  /** Obrigatório para a terceirizada; ignorado para a CLT. */
  paymentTermDays: z.number().int().min(0).max(180).nullable().default(null),
  notes: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
  prices: z
    .array(z.object({ piece: PieceName, unitPrice: PriceString }))
    .max(60)
    .default([]),
}

const termRequired = (value: {
  kind: 'terceirizada' | 'clt'
  paymentTermDays: number | null
}) => value.kind === 'clt' || value.paymentTermDays !== null

const TERM_MESSAGE = {
  message: 'Diga em quantos dias a terceirizada recebe depois da entrega.',
  path: ['paymentTermDays'],
}

export const CreateSeamstressRequest = z
  .object(seamstressFields)
  .refine(termRequired, TERM_MESSAGE)

export type CreateSeamstressBody = z.input<typeof CreateSeamstressRequest>

export const UpdateSeamstressRequest = z
  .object({
    ...seamstressFields,
    version: z.number().int().positive(),
    status: z.enum(['active', 'archived']).default('active'),
  })
  .refine(termRequired, TERM_MESSAGE)

export type UpdateSeamstressBody = z.input<typeof UpdateSeamstressRequest>

export const SeamstressResponse = z.object({ seamstress: SeamstressSummary })

export const SewingPieceSchema = z.object({
  piece: z.string(),
  quantity: z.number().int(),
  /** Nulo para quem não vê dinheiro (F220). */
  unitPrice: z.string().nullable(),
})

export const SewingJobSummary = z.object({
  id: z.string(),
  salesDocumentId: z.string(),
  orderNumber: z.number().int().nullable(),
  customerName: z.string(),
  batchId: z.string().nullable(),
  /** 1 é o restante. */
  batchNumber: z.number().int(),
  seamstressId: z.string(),
  seamstressName: z.string(),
  seamstressKind: SeamstressKindSchema,
  status: SewingStatusSchema,
  notes: z.string().nullable(),
  assignedAt: z.string(),
  deliveredAt: z.string().nullable(),
  pieces: z.array(SewingPieceSchema),
  quantity: z.number().int(),
  /** Nulo para quem não vê dinheiro. */
  total: z.string().nullable(),
  /** O título a pagar da entrega, quando houve. */
  payable: z
    .object({
      id: z.string(),
      status: z.enum(['open', 'settled', 'cancelled']),
      dueAt: z.string(),
    })
    .nullable(),
  version: z.number().int(),
})

export type SewingJobSummaryType = z.infer<typeof SewingJobSummary>

export const SewingJobListQuery = z.object({
  statuses: csv(SewingStatusSchema),
})

export const SewingJobListResponse = z.object({
  jobs: z.array(SewingJobSummary),
})

export type SewingJobListResponseType = z.infer<typeof SewingJobListResponse>

const sewingPieces = z
  .array(
    z.object({
      piece: PieceName,
      quantity: z.number().int().min(1).max(100_000),
      /**
       * O preço combinado na hora. Ausente, vale a tabela dela (ou zero).
       * Ignorado para quem não vê dinheiro: vale a tabela.
       */
      unitPrice: PriceString.optional(),
    })
  )
  .min(1, 'Escolha quantas peças vão para a costureira.')
  .max(50)

/** Mandar uma leva (ou parte dela) para a costureira. */
export const CreateSewingJobRequest = z.object({
  seamstressId: z.uuid(),
  /** A leva; nulo é a leva 1, o restante. */
  batchId: z.uuid().nullable(),
  pieces: sewingPieces,
  notes: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
})

export type CreateSewingJobBody = z.input<typeof CreateSewingJobRequest>

export const UpdateSewingJobRequest = z.object({
  version: z.number().int().positive(),
  pieces: sewingPieces.optional(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
})

export type UpdateSewingJobBody = z.input<typeof UpdateSewingJobRequest>

/** Costura entregue: quem gerencia marca, e nasce a conta a pagar. */
export const DeliverSewingJobRequest = z.object({
  version: z.number().int().positive(),
  /** O dia da entrega, `AAAA-MM-DD`. Ausente, hoje. */
  deliveredOn: Day.optional(),
})

export type DeliverSewingJobBody = z.input<typeof DeliverSewingJobRequest>

export const CancelSewingJobRequest = z.object({
  version: z.number().int().positive(),
})

export const SewingJobResponse = z.object({ job: SewingJobSummary })

export type SewingJobResponseType = z.infer<typeof SewingJobResponse>

// ---------------------------------------------------------------------------
// O link do cliente (F232)
// ---------------------------------------------------------------------------

export const INTAKE_STATUS_VALUES = [
  'aberto',
  'enviado',
  'convertido',
  'cancelado',
] as const

/** Como a tela vê: o aberto vencido é "expirado". */
export const IntakeViewSchema = z.enum([...INTAKE_STATUS_VALUES, 'expirado'])

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value))

/** Uma linha que o cliente preenche: nome e número opcionais. */
export const IntakeRowSchema = z.object({
  size: UniformSizeSchema,
  quantity: z.number().int().min(1).max(100_000),
  name: optionalText(80),
  number: optionalText(10),
})

/** O cadastro do cliente novo — o mínimo para o pedido nascer com quem é. */
export const IntakeCustomerSchema = z.object({
  kind: z.enum(['person', 'company']).default('person'),
  name: z.string().trim().min(2, 'Diga o seu nome (ou o do time).').max(200),
  tradeName: optionalText(200),
  /** CPF ou CNPJ, com ou sem pontuação. Conferido no servidor. */
  document: optionalText(20),
  phone: z
    .string()
    .trim()
    .min(8, 'Diga um WhatsApp para falarmos com você.')
    .max(30),
  email: optionalText(200),
  address: z
    .object({
      cep: optionalText(9),
      street: z.string().trim().min(1, 'Diga a rua.').max(200),
      number: optionalText(20),
      complement: optionalText(120),
      district: optionalText(120),
      city: z.string().trim().min(1, 'Diga a cidade.').max(120),
      uf: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, 'A UF tem duas letras.'),
    })
    .nullable()
    .default(null),
})

export type IntakeCustomerType = z.infer<typeof IntakeCustomerSchema>

/** O que o cliente envia — e o que fica gravado no link. */
export const IntakeSubmissionSchema = z.object({
  /** Obrigatório quando o link é de cliente novo; ignorado quando não. */
  customer: IntakeCustomerSchema.nullable().default(null),
  items: z
    .array(
      z.object({
        productId: z.uuid(),
        rows: z.array(IntakeRowSchema).min(1).max(2_000),
      })
    )
    .min(1, 'Escolha pelo menos uma peça.')
    .max(30),
  notes: optionalText(1000),
  /**
   * Para um evento: a data e o nome. O despacho fica uma semana antes (F233).
   * Nulo: sem evento, o despacho é o envio mais o prazo do link.
   */
  event: z
    .object({
      date: Day,
      name: optionalText(200),
    })
    .nullable()
    .default(null),
  /** O tecido que o cliente quer; nulo é "não sei, a loja ajuda". */
  fabric: UniformFabricSchema.nullable().default(null),
  /** Sem o logo da loja: a cobrança `sem-logo` por peça (F258). */
  noLogo: z.boolean().default(false),
  /** Quer aprovar a arte antes do pedido: a cobrança `arte` (F258). */
  earlyArt: z.boolean().default(false),
})

export type IntakeSubmissionBody = z.input<typeof IntakeSubmissionSchema>
export type IntakeSubmissionType = z.infer<typeof IntakeSubmissionSchema>

/** Uma faixa da tabela de preço: o preço a partir desta quantidade (F258). */
export const PriceTierSchema = z.object({
  fabric: UniformFabricSchema.nullable(),
  minQuantity: z.number().int(),
  unitPrice: z.string(),
})

export type PriceTierType = z.infer<typeof PriceTierSchema>

/** A tabela de medidas como o cliente vê no link (F259). */
export const PublicSizeChartSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  sections: z.array(
    z.object({
      title: z.string().nullable(),
      rows: z.array(
        z.object({
          size: z.string(),
          width: z.string().nullable(),
          height: z.string().nullable(),
        })
      ),
    })
  ),
})

export type PublicSizeChartType = z.infer<typeof PublicSizeChartSchema>

/** Uma cobrança do pedido no link: o nome e o preço (por peça, ou fixo). */
const ExtraOffer = z.object({
  name: z.string(),
  unitPrice: z.string().nullable(),
})

/** A página pública do link: o que o cliente vê. */
export const PublicIntakeResponse = z.object({
  status: IntakeViewSchema,
  /** "Olá, Maria" — só o primeiro nome do cadastro já existente. */
  customerFirstName: z.string().nullable(),
  /** Cliente novo: a página pede o cadastro. */
  needsRegistration: z.boolean(),
  /** Para já vir preenchido no cadastro do cliente novo. */
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  message: z.string().nullable(),
  showPrices: z.boolean(),
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Nulo quando a atendente escolheu não mostrar o preço. */
      unitPrice: z.string().nullable(),
      /**
       * Os tecidos em que a peça existe (F258); nulo é "qualquer um, pelo
       * mesmo preço".
       */
      fabrics: z.array(UniformFabricSchema).nullable(),
      /**
       * As faixas da tabela: o preço a partir de cada quantidade, por tecido
       * (nulo é a variação padrão — o "não sei"). Vazio quando o preço não
       * aparece.
       */
      tiers: z.array(PriceTierSchema),
      /** As tabelas de medidas da peça (F259), em `sizeCharts`. */
      sizeChartIds: z.array(z.string()),
    })
  ),
  /** As tabelas de medidas das peças do link (F259). */
  sizeCharts: z.array(PublicSizeChartSchema),
  /**
   * As cobranças do pedido (F258). Nula é "esta loja não cobra isso pelo
   * link"; o preço é nulo quando o link não mostra preço.
   */
  extras: z.object({
    personalization: ExtraOffer.nullable(),
    noLogo: ExtraOffer.nullable(),
    earlyArt: ExtraOffer.nullable(),
  }),
  sizes: z.array(UniformSizeSchema),
  /** O prazo de produção do link, em dias depois do envio (F233). */
  leadDays: z.number().int(),
  /** Quantos dias antes do evento o pedido sai. */
  eventLeadDays: z.number().int(),
  fabrics: z.array(UniformFabricSchema),
  /** "Hoje" no fuso da loja, para a página mostrar a previsão. */
  today: z.string(),
  expiresAt: z.string(),
  submittedAt: z.string().nullable(),
})

export type PublicIntakeResponseType = z.infer<typeof PublicIntakeResponse>

export const PublicIntakeSubmitResponse = z.object({
  status: IntakeViewSchema,
  submittedAt: z.string(),
})

/** A atendente gera o link: para um cliente já cadastrado, ou pelo telefone/e-mail. */
export const CreateIntakeRequest = z
  .object({
    customerPartyId: z.uuid().nullable().default(null),
    phone: optionalText(30),
    email: optionalText(200),
    showPrices: z.boolean().default(false),
    /**
     * As peças que o cliente pode escolher. Vazio: as ativas que não estão
     * descontinuadas (F258); escolhida, a descontinuada também entra.
     */
    productIds: z.array(z.uuid()).max(100).default([]),
    /** Os tecidos do link. Vazio: os que não estão descontinuados (F258). */
    fabrics: z.array(UniformFabricSchema).max(3).default([]),
    expiresInDays: z.number().int().min(1).max(60).default(7),
    /** O prazo de produção: o despacho sem evento é o envio mais estes dias (F233). */
    leadDays: z.number().int().min(1).max(180).default(30),
    message: optionalText(500),
  })
  .refine(
    (value) =>
      value.customerPartyId !== null ||
      value.phone !== null ||
      value.email !== null,
    {
      message: 'Escolha o cliente, ou diga o telefone ou o e-mail dele.',
      path: ['phone'],
    }
  )

export type CreateIntakeBody = z.input<typeof CreateIntakeRequest>

export const IntakeSummary = z.object({
  id: z.string(),
  /** O pedaço do endereço do link: `/pedido/<token>` na tela da loja. */
  token: z.string(),
  status: IntakeViewSchema,
  customer: z.object({ id: z.string(), name: z.string() }).nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  showPrices: z.boolean(),
  leadDays: z.number().int(),
  products: z.array(z.object({ id: z.string(), name: z.string() })),
  /** Os tecidos escolhidos; vazio é "os não descontinuados" (F258). */
  fabrics: z.array(UniformFabricSchema),
  message: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  submittedAt: z.string().nullable(),
  /** O nome que o cliente novo escreveu, ou o do cadastro. */
  submittedName: z.string().nullable(),
  /** Quantas peças o cliente pediu. */
  submittedPieces: z.number().int(),
  order: z
    .object({ id: z.string(), number: z.number().int().nullable() })
    .nullable(),
  version: z.number().int(),
})

export type IntakeSummaryType = z.infer<typeof IntakeSummary>

export const IntakeListQuery = z.object({
  statuses: csv(z.enum(INTAKE_STATUS_VALUES)),
})

export const IntakeListResponse = z.object({ intakes: z.array(IntakeSummary) })

export const IntakeResponse = z.object({ intake: IntakeSummary })

/** O cadastro e a linha como a conferência os lê — sem transformação (resposta). */
const IntakeRowOut = z.object({
  size: UniformSizeSchema,
  quantity: z.number().int(),
  name: z.string().nullable(),
  number: z.string().nullable(),
})

const IntakeCustomerOut = z.object({
  kind: z.enum(['person', 'company']),
  name: z.string(),
  tradeName: z.string().nullable(),
  document: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  address: z
    .object({
      cep: z.string().nullable(),
      street: z.string(),
      number: z.string().nullable(),
      complement: z.string().nullable(),
      district: z.string().nullable(),
      city: z.string(),
      uf: z.string(),
    })
    .nullable(),
})

/** A conferência: o link e o que o cliente mandou, com o nome de cada peça. */
export const IntakeDetailResponse = z.object({
  intake: IntakeSummary,
  submission: z
    .object({
      customer: IntakeCustomerOut.nullable(),
      items: z.array(
        z.object({
          productId: z.string(),
          productName: z.string(),
          rows: z.array(IntakeRowOut),
        })
      ),
      notes: z.string().nullable(),
      event: z
        .object({ date: z.string(), name: z.string().nullable() })
        .nullable(),
      fabric: UniformFabricSchema.nullable(),
      noLogo: z.boolean(),
      earlyArt: z.boolean(),
      /** O despacho que o link calcula (F233); a atendente muda na ficha. */
      dispatchDate: z.string().nullable(),
      /** Evento com menos de uma semana: prazo curto. */
      tight: z.boolean(),
    })
    .nullable(),
})

export type IntakeDetailResponseType = z.infer<typeof IntakeDetailResponse>

export const IntakeVersionRequest = z.object({
  version: z.number().int().positive(),
})

export const ConvertIntakeResponse = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
})

// ---------------------------------------------------------------------------
// O andamento da grade e as ocorrências (F234)
// ---------------------------------------------------------------------------

/** Os setores da fábrica, na ordem em que a peça passa (F239). */
export const FACTORY_SECTOR_VALUES = [
  'impressao',
  'corte',
  'costura',
  'embalagem',
] as const

export const INCIDENT_KIND_VALUES = ['refazer', 'problema'] as const

export const INCIDENT_SECTOR_VALUES = [
  'atendimento',
  'arte',
  'impressao',
  'corte',
  'costura',
  'embalagem',
  'expedicao',
] as const

export const INCIDENT_STATUS_VALUES = ['aberta', 'resolvida'] as const

export const FactorySectorSchema = z.enum(FACTORY_SECTOR_VALUES)
export const IncidentKindSchema = z.enum(INCIDENT_KIND_VALUES)
export const IncidentSectorSchema = z.enum(INCIDENT_SECTOR_VALUES)
export const IncidentStatusSchema = z.enum(INCIDENT_STATUS_VALUES)

/** Uma célula da leva no setor: o que tem e quantas o setor já fez (F239). */
export const SectorCellSchema = z.object({
  key: z.string(),
  piece: z.string(),
  size: z.enum(UNIFORM_SIZE_VALUES).nullable(),
  quantity: z.number().int(),
  done: z.number().int(),
})

export type SectorCellType = z.infer<typeof SectorCellSchema>

/** Uma leva na tela do setor: o pedido, a grade dela e o feito (F239). */
export const SectorPartSchema = z.object({
  orderId: z.string(),
  orderNumber: z.number().int().nullable(),
  customerName: z.string(),
  dispatchDate: z.string().nullable(),
  late: z.boolean(),
  eventDate: z.string().nullable(),
  fabric: UniformFabricSchema.nullable(),
  /** Nula é a leva 1, o restante. */
  batchId: z.string().nullable(),
  batchNumber: z.number().int(),
  /** O pedido dividido em levas: mostra "leva N". */
  split: z.boolean(),
  stage: UniformStageSchema,
  stageChangedAt: z.string(),
  cells: z.array(SectorCellSchema),
  total: z.number().int(),
  done: z.number().int(),
  printers: z.array(ProductionPrinterRef),
  /** Quem costura esta leva agora (F231). */
  seamstresses: z.array(z.string()),
  /** Os nomes do pedido, para consulta: a impressão precisa deles. */
  names: z.array(
    z.object({
      name: z.string(),
      number: z.string(),
      piece: z.string(),
      size: UniformSizeSchema,
      quantity: z.number().int(),
    })
  ),
  openIncidents: z.number().int(),
  /** A posição na fila da impressão (F242); nula fora da fila. */
  queuePosition: z.number().int().nullable(),
})

export type SectorPartType = z.infer<typeof SectorPartSchema>

export const SectorResponse = z.object({
  sector: FactorySectorSchema,
  /** As etapas que são deste setor, e para onde ele manda. */
  stages: z.array(UniformStageSchema),
  nextStage: UniformStageSchema,
  parts: z.array(SectorPartSchema),
})

export type SectorResponseType = z.infer<typeof SectorResponse>

/** Marca quantas peças de cada célula da leva o setor já fez. */
export const SetSectorDoneRequest = z.object({
  batchId: z.uuid().nullable().default(null),
  cells: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        done: z.number().int().min(0).max(100_000),
      })
    )
    .min(1)
    .max(500),
})

export type SetSectorDoneBody = z.input<typeof SetSectorDoneRequest>

/**
 * Manda as feitas para a próxima etapa: separa a leva com elas, ou move a leva
 * inteira quando tudo foi feito. A impressão diz em qual máquina.
 */
export const SendSectorRequest = z.object({
  batchId: z.uuid().nullable().default(null),
  /** A etapa que a tela mostrava para a leva. */
  from: UniformStageSchema,
  printerIds: z.array(z.uuid()).max(20).default([]),
})

export type SendSectorBody = z.input<typeof SendSectorRequest>

export const SendSectorResponse = z.object({
  /** `tudo`: a leva inteira andou; `parte`: as feitas viraram uma leva nova. */
  moved: z.enum(['tudo', 'parte']),
  to: UniformStageSchema,
  pieces: z.number().int(),
})

export type SendSectorResponseType = z.infer<typeof SendSectorResponse>

export const IncidentSummary = z.object({
  id: z.string(),
  salesDocumentId: z.string(),
  orderNumber: z.number().int().nullable(),
  customerName: z.string(),
  batchId: z.string().nullable(),
  /** 1 é o restante; nulo quando a ocorrência é do pedido todo. */
  batchNumber: z.number().int().nullable(),
  kind: IncidentKindSchema,
  sector: IncidentSectorSchema,
  description: z.string(),
  lines: z.array(
    z.object({
      lineKey: z.string(),
      label: z.string(),
      quantity: z.number().int(),
    })
  ),
  status: IncidentStatusSchema,
  resolution: z.string().nullable(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolvedByName: z.string().nullable(),
  version: z.number().int(),
})

export type IncidentSummaryType = z.infer<typeof IncidentSummary>

export const IncidentListQuery = z.object({
  statuses: csv(IncidentStatusSchema),
  sectors: csv(IncidentSectorSchema),
})

export const IncidentListResponse = z.object({
  incidents: z.array(IncidentSummary),
})

export type IncidentListResponseType = z.infer<typeof IncidentListResponse>

export const IncidentResponse = z.object({ incident: IncidentSummary })

/** Abrir uma ocorrência: refazer (as linhas voltam) ou um problema qualquer. */
export const CreateIncidentRequest = z.object({
  kind: IncidentKindSchema,
  sector: IncidentSectorSchema,
  /** A leva (F230); nulo é o pedido, ou a leva 1. */
  batchId: z.uuid().nullable().default(null),
  description: z.string().trim().min(1, 'Diga o que aconteceu.').max(1000),
  lines: z
    .array(
      z.object({
        lineKey: z.string().min(1).max(200),
        quantity: z.number().int().min(1).max(100_000),
      })
    )
    .max(500)
    .default([]),
})

export type CreateIncidentBody = z.input<typeof CreateIncidentRequest>

export const ResolveIncidentRequest = z.object({
  version: z.number().int().positive(),
  resolution: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
})

export type ResolveIncidentBody = z.input<typeof ResolveIncidentRequest>

// ---------------------------------------------------------------------------
// A produção por setor (F240)
// ---------------------------------------------------------------------------

/** Os setores com estatística: o atendimento, a arte e os da fábrica. */
export const STATS_SECTOR_VALUES = [
  'atendimento',
  'arte',
  'impressao',
  'corte',
  'costura',
  'embalagem',
] as const

export const StatsSectorSchema = z.enum(STATS_SECTOR_VALUES)

export const STATS_GROUP_VALUES = ['day', 'week', 'month'] as const

const DayText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.')

export const SectorStatsQuery = z.object({
  from: DayText,
  to: DayText,
  group: z.enum(STATS_GROUP_VALUES).default('day'),
})

export type SectorStatsQueryType = z.input<typeof SectorStatsQuery>

const SectorCount = z.object({
  sector: StatsSectorSchema,
  /** As peças que saíram do setor para a frente. */
  pieces: z.number().int(),
  /** Quantas vezes (levas ou pedidos) saíram. */
  moves: z.number().int(),
})

export const SectorStatsResponse = z.object({
  from: z.string(),
  to: z.string(),
  group: z.enum(STATS_GROUP_VALUES),
  /** Um período (dia, semana ou mês) por linha, do mais velho ao mais novo; sem os vazios. */
  buckets: z.array(
    z.object({ start: z.string(), sectors: z.array(SectorCount) })
  ),
  totals: z.array(SectorCount),
  /** Por pessoa — só para quem gerencia. */
  people: z.array(
    SectorCount.extend({
      userId: z.string().nullable(),
      name: z.string().nullable(),
    })
  ),
})

export type SectorStatsResponseType = z.infer<typeof SectorStatsResponse>

// ---------------------------------------------------------------------------
// O consumo por peça e a baixa do dia (F241)
// ---------------------------------------------------------------------------

/** Quantidade de estoque: até 6 casas, com ponto, maior que zero. */
const MaterialQuantity = z
  .string()
  .trim()
  .regex(
    /^\d{1,12}(\.\d{1,6})?$/,
    'Informe uma quantidade com até 6 casas decimais, usando ponto.'
  )
  .refine(
    (value) => /[1-9]/.test(value),
    'A quantidade deve ser maior que zero.'
  )

export const MaterialRateSchema = z.object({
  variantId: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  /** De qual setor são as peças que gastam este material. */
  sector: FactorySectorSchema,
  perPiece: z.string(),
})

export type MaterialRateType = z.infer<typeof MaterialRateSchema>

export const MaterialRatesResponse = z.object({
  rates: z.array(MaterialRateSchema),
})

export const SaveMaterialRatesRequest = z.object({
  rates: z
    .array(
      z.object({
        variantId: z.uuid(),
        sector: FactorySectorSchema,
        perPiece: MaterialQuantity,
      })
    )
    .max(100),
})

export type SaveMaterialRatesBody = z.input<typeof SaveMaterialRatesRequest>

export const DayCloseRequest = z.object({
  day: DayText,
  /** A filial; sem ela, a da sessão. */
  branchId: z.uuid().optional(),
  lines: z
    .array(z.object({ variantId: z.uuid(), quantity: MaterialQuantity }))
    .min(1)
    .max(50),
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
})

export type DayCloseBody = z.input<typeof DayCloseRequest>

export const DayCloseSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  day: z.string(),
  lines: z.array(
    z.object({
      variantId: z.string(),
      name: z.string(),
      unit: z.string().nullable(),
      quantity: z.string(),
      movementId: z.string(),
    })
  ),
  note: z.string().nullable(),
  closedByName: z.string().nullable(),
  closedAt: z.string(),
})

export type DayCloseType = z.infer<typeof DayCloseSchema>

export const DayCloseResponse = z.object({ close: DayCloseSchema })
export const DayCloseListResponse = z.object({
  closes: z.array(DayCloseSchema),
})

// ---------------------------------------------------------------------------
// A fila da impressão (F242)
// ---------------------------------------------------------------------------

/** A fila inteira, na ordem em que vai ser impressa. */
export const SetPrintQueueRequest = z.object({
  parts: z
    .array(
      z.object({
        orderId: z.uuid(),
        batchId: z.uuid().nullable().default(null),
      })
    )
    .max(200),
})

export type SetPrintQueueBody = z.input<typeof SetPrintQueueRequest>

// ---------------------------------------------------------------------------
// A tabela de preços da loja: o tecido, o descontinuado e as cobranças (F258)
// ---------------------------------------------------------------------------

export const UNIFORM_PRODUCT_KIND_VALUES = [
  'peca',
  'personalizacao',
  'sem-logo',
  'arte',
] as const

export const UniformProductKindSchema = z.enum(UNIFORM_PRODUCT_KIND_VALUES)

export const UniformCatalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: UniformProductKindSchema,
  discontinued: z.boolean(),
  variants: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      sku: z.string(),
      isDefault: z.boolean(),
      fabric: UniformFabricSchema.nullable(),
    })
  ),
  /** As tabelas de medidas da peça (F259). */
  sizeChartIds: z.array(z.string()),
})

export type UniformCatalogProductType = z.infer<
  typeof UniformCatalogProductSchema
>

export const UniformCatalogResponse = z.object({
  products: z.array(UniformCatalogProductSchema),
  fabrics: z.array(
    z.object({ fabric: UniformFabricSchema, discontinued: z.boolean() })
  ),
})

export type UniformCatalogResponseType = z.infer<typeof UniformCatalogResponse>

/** O produto todo: o tipo, o descontinuado e o tecido de cada variação. */
export const UpdateUniformProductRequest = z.object({
  kind: UniformProductKindSchema,
  discontinued: z.boolean(),
  fabrics: z
    .array(
      z.object({
        variantId: z.uuid(),
        fabric: UniformFabricSchema.nullable(),
      })
    )
    .max(50)
    .default([]),
  /** As tabelas de medidas da peça (F259); ausente deixa como está. */
  sizeChartIds: z.array(z.uuid()).max(20).optional(),
})

export type UpdateUniformProductBody = z.input<
  typeof UpdateUniformProductRequest
>

export const UpdateUniformFabricRequest = z.object({
  discontinued: z.boolean(),
})

export const UniformFabricParams = z.object({ fabric: UniformFabricSchema })

// ---------------------------------------------------------------------------
// A tabela de medidas (F259)
// ---------------------------------------------------------------------------

/** Centímetros: "52", "52,5" ou "52.5"; gravado com ponto. */
const Measure = z
  .string()
  .trim()
  .regex(/^\d{1,4}([.,]\d{1,2})?$/, 'Use centímetros: 52 ou 52,5.')
  .transform((value) => value.replace(',', '.'))

export const SizeChartRowSchema = z.object({
  /** O tamanho como a tabela escreve: "PP", "10", "1" (a bandeira). */
  size: z.string().trim().min(1, 'Diga o tamanho.').max(10),
  width: Measure.nullable(),
  height: Measure.nullable(),
})

export const SizeChartSectionSchema = z.object({
  /** "Infantil", "Adulto"; nulo na tabela de uma parte só. */
  title: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
  rows: z
    .array(SizeChartRowSchema)
    .min(1, 'Ponha pelo menos um tamanho.')
    .max(30),
})

export const SizeChartSchema = PublicSizeChartSchema.extend({
  /** As peças que mostram esta tabela. */
  productIds: z.array(z.string()),
  version: z.number().int(),
})

export type SizeChartType = z.infer<typeof SizeChartSchema>

export const SizeChartListResponse = z.object({
  charts: z.array(SizeChartSchema),
})

export type SizeChartListResponseType = z.infer<typeof SizeChartListResponse>

export const SizeChartResponse = z.object({ chart: SizeChartSchema })

const sizeChartFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Dê um nome à tabela: "Camiseta masculina".')
    .max(60),
  note: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .default(null)
    .transform((value) => (value === '' ? null : value)),
  sections: z
    .array(SizeChartSectionSchema)
    .min(1, 'Ponha pelo menos uma parte com tamanhos.')
    .max(5),
}

export const CreateSizeChartRequest = z.object(sizeChartFields)

export type CreateSizeChartBody = z.input<typeof CreateSizeChartRequest>

export const UpdateSizeChartRequest = z.object({
  ...sizeChartFields,
  version: z.number().int().positive(),
})

export type UpdateSizeChartBody = z.input<typeof UpdateSizeChartRequest>

export const DeleteSizeChartRequest = z.object({
  version: z.number().int().positive(),
})
