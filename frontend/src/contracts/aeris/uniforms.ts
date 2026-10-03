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
    /** Saiu da arte sem a arte aprovada, por quem gerencia. */
    forced: z.boolean(),
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
   * Tirar da arte sem a arte aprovada (F171). Só quem gerencia a produção, e
   * fica escrito na linha do tempo.
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
