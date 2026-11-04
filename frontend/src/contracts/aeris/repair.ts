import { z } from 'zod'

/**
 * A ordem de serviço da assistência técnica (F321, ADR-0048). As listas
 * repetem `@aeris/repair` e o CHECK da 0167; o teste de paridade confere.
 */

export const REPAIR_STAGE_VALUES = [
  'recebida',
  'em_analise',
  'aguardando_aprovacao',
  'aprovada',
  'aguardando_peca',
  'em_manutencao',
  'pronta',
  'entregue',
  'sem_conserto',
  'cancelada',
] as const
export const REPAIR_FUNCTION_VALUES = ['atendente', 'tecnico'] as const
export const REPAIR_CHECK_ITEM_VALUES = [
  'tela',
  'touch',
  'camera_frontal',
  'camera_traseira',
  'audio',
  'microfone',
  'carregamento',
  'bateria',
  'botoes',
  'biometria',
  'wifi',
  'bluetooth',
  'sinal',
] as const
export const REPAIR_CHECK_STATE_VALUES = ['ok', 'falha', 'nao_testado'] as const
export const REPAIR_CHECK_PHASE_VALUES = ['entrada', 'saida'] as const
export const REPAIR_DAMAGE_REGION_VALUES = [
  'frente',
  'traseira',
  'lateral_esquerda',
  'lateral_direita',
  'superior',
  'inferior',
] as const
export const REPAIR_TEST_MODE_VALUES = ['cliente_acompanha', 'modo_manutencao', 'outro'] as const
export const REPAIR_PART_QUALITY_VALUES = ['original', 'oled', 'incell', 'paralela', 'recondicionada', 'outra'] as const
export const REPAIR_QUOTE_LINE_KIND_VALUES = ['peca', 'servico'] as const
export const REPAIR_APPROVAL_CHANNEL_VALUES = ['balcao', 'link', 'whatsapp'] as const
/**
 * Os itens genéricos do orçamento rápido (F322): a linha aponta pra eles e a
 * descrição é livre ("Tela Redmi Note 13"). Nascem no catálogo na primeira vez.
 */
export const REPAIR_QUICK_ITEM_VALUES = ['Tela', 'Bateria', 'Conector de carga', 'Tampa traseira', 'Câmera', 'Peça avulsa', 'Mão de obra'] as const

const Decimal = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/u, 'Valor inválido')
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)
/**
 * A previsão de pronto (F323): data e hora com fuso, ou só a data — a de um
 * front anterior, que a rota lê como 18h de São Paulo.
 */
const ReadyAt = z.union([z.iso.datetime({ offset: true }), IsoDate])
const Text = (max: number) => z.string().trim().min(1).max(max)

export const RepairStage = z.enum(REPAIR_STAGE_VALUES)

export const CreateRepairOrderRequest = z.object({
  partyId: z.uuid(),
  device: z.object({
    modelId: z.uuid().nullable().default(null),
    brand: Text(80),
    model: Text(120),
    color: Text(60).nullable().default(null),
    imei: z.string().trim().max(30).nullable().default(null),
    serial: Text(60).nullable().default(null),
  }),
  reportedDefect: Text(2000),
  accessories: z.array(Text(60)).max(20).default([]),
  testMode: z.enum(REPAIR_TEST_MODE_VALUES).default('cliente_acompanha'),
  testNote: Text(500).nullable().default(null),
  technicianUserId: z.uuid().nullable().default(null),
  expectedReady: ReadyAt.nullable().default(null),
  warrantyOfOrderId: z.uuid().nullable().default(null),
  checks: z
    .array(z.object({ item: z.enum(REPAIR_CHECK_ITEM_VALUES), state: z.enum(REPAIR_CHECK_STATE_VALUES), note: Text(300).nullable().default(null) }))
    .max(20)
    .default([]),
})

export const UpdateRepairOrderRequest = z.object({
  version: z.number().int(),
  diagnosis: Text(4000).nullable().optional(),
  recommendedService: Text(500).nullable().optional(),
  technicianUserId: z.uuid().nullable().optional(),
  expectedStart: IsoDate.nullable().optional(),
  expectedReady: ReadyAt.nullable().optional(),
  testMode: z.enum(REPAIR_TEST_MODE_VALUES).optional(),
  testNote: Text(500).nullable().optional(),
  accessories: z.array(Text(60)).max(20).optional(),
  /** Corrigir o cliente (F322): só antes do pedido nascer, que leva o cliente junto. */
  partyId: z.uuid().optional(),
  /** Corrigir o aparelho digitado errado (F322). */
  device: z
    .object({
      brand: Text(80),
      model: Text(120),
      color: Text(60).nullable(),
      imei: z.string().trim().max(30).nullable(),
      serial: Text(60).nullable(),
    })
    .optional(),
})

export const MoveRepairStageRequest = z.object({
  version: z.number().int(),
  to: RepairStage,
  note: Text(500).nullable().default(null),
})

export const SaveRepairChecksRequest = z.object({
  phase: z.enum(REPAIR_CHECK_PHASE_VALUES),
  items: z
    .array(z.object({ item: z.enum(REPAIR_CHECK_ITEM_VALUES), state: z.enum(REPAIR_CHECK_STATE_VALUES), note: Text(300).nullable().default(null) }))
    .min(1)
    .max(20),
})

export const AddRepairDamageRequest = z.object({
  region: z.enum(REPAIR_DAMAGE_REGION_VALUES),
  note: Text(300),
})

export const AddRepairEventRequest = z.object({
  text: Text(2000),
  internal: z.boolean().default(true),
})

export const RepairQuoteLineSchema = z.object({
  kind: z.enum(REPAIR_QUOTE_LINE_KIND_VALUES),
  /** O item do catálogo: o pedido do núcleo só aceita item de catálogo, mão de obra inclusive. */
  variantId: z.uuid(),
  description: Text(200),
  quantity: z.number().int().min(1).max(999),
  unitPrice: Decimal,
  quality: z.enum(REPAIR_PART_QUALITY_VALUES).nullable().default(null),
})

export const CreateRepairQuoteRequest = z.object({
  lines: z.array(RepairQuoteLineSchema).min(1).max(50),
  discount: Decimal.default('0'),
  validUntil: IsoDate.nullable().default(null),
  note: Text(1000).nullable().default(null),
})

export const ApproveRepairQuoteRequest = z.object({
  approved: z.boolean(),
  channel: z.enum(['balcao', 'whatsapp']),
  approverName: Text(200),
  attachmentId: z.uuid().nullable().default(null),
})

export const DeliverRepairOrderRequest = z.object({
  version: z.number().int(),
  deliveredToName: Text(200),
  deliveredToDocument: z.string().trim().max(30).nullable().default(null),
  executedService: Text(2000),
  checks: SaveRepairChecksRequest.shape.items.optional(),
  signatureAttachmentId: z.uuid().nullable().default(null),
})

export const RepairOrderListQuery = z.object({
  stages: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (value === undefined ? undefined : (Array.isArray(value) ? value : value.split(',')).filter(Boolean))),
  search: z.string().max(100).optional(),
  /** As OS de um cliente (F325): o histórico na ficha dele. */
  partyId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  /** A página seguinte (F322): a lista das encerradas passa de 100. */
  offset: z.coerce.number().int().min(0).default(0),
})

export const RepairOrderSummary = z.object({
  id: z.string(),
  number: z.number().int(),
  stage: RepairStage,
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  device: z.object({
    id: z.string(),
    brand: z.string(),
    model: z.string(),
    color: z.string().nullable(),
    imei: z.string().nullable(),
    serial: z.string().nullable(),
  }),
  reportedDefect: z.string(),
  recommendedService: z.string().nullable(),
  technicianUserId: z.string().nullable(),
  technicianName: z.string().nullable(),
  receivedAt: z.string(),
  expectedReady: z.string().nullable(),
  currentTotal: z.string().nullable(),
  salesDocumentId: z.string().nullable(),
  version: z.number().int(),
})

/**
 * Na lista, quanto já foi pago e quanto falta do pedido da OS (F322): o
 * Financeiro somava isso buscando pedido por pedido. Nulo sem pedido.
 */
export const RepairOrderListItem = RepairOrderSummary.extend({
  paidAmount: z.string().nullable().default(null),
  outstandingAmount: z.string().nullable().default(null),
})

export const RepairOrderList = z.object({
  items: z.array(RepairOrderListItem),
  counts: z.record(z.string(), z.number().int()),
  /** Quantas OS o filtro acha, além da página (F322). */
  total: z.number().int().default(0),
})

export const RepairQuoteSchema = z.object({
  id: z.string(),
  versionNo: z.number().int(),
  lines: z.array(RepairQuoteLineSchema),
  partsTotal: z.string(),
  laborTotal: z.string(),
  discount: z.string(),
  total: z.string(),
  validUntil: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  approval: z
    .object({ channel: z.string(), approved: z.boolean(), approverName: z.string(), approvedAt: z.string() })
    .nullable(),
})

export const RepairWarrantySchema = z.object({
  number: z.number().int(),
  days: z.number().int(),
  startsOn: z.string(),
  endsOn: z.string(),
  coverage: z.string(),
  terms: z.string(),
  exclusions: z.array(z.string()),
})

export const RepairOrderDetail = z.object({
  order: RepairOrderSummary.extend({
    partyId: z.string(),
    customerDocument: z.string().nullable(),
    branchId: z.string(),
    accessories: z.array(z.string()),
    testMode: z.enum(REPAIR_TEST_MODE_VALUES),
    testNote: z.string().nullable(),
    diagnosis: z.string().nullable(),
    expectedStart: z.string().nullable(),
    diagnosisFee: z.string(),
    warrantyOfOrderId: z.string().nullable(),
    publicToken: z.string(),
    deliveredAt: z.string().nullable(),
    deliveredToName: z.string().nullable(),
    deliveredToDocument: z.string().nullable(),
    executedService: z.string().nullable(),
  }),
  checks: z.array(z.object({ phase: z.string(), item: z.string(), state: z.string(), note: z.string().nullable() })),
  damages: z.array(z.object({ id: z.string(), region: z.string(), note: z.string() })),
  attachments: z.array(z.object({ id: z.string(), kind: z.string(), caption: z.string().nullable(), contentType: z.string(), createdAt: z.string() })),
  quotes: z.array(RepairQuoteSchema),
  events: z.array(
    z.object({ id: z.string(), kind: z.string(), text: z.string().nullable(), internal: z.boolean(), occurredAt: z.string(), actorName: z.string().nullable() })
  ),
  warranty: RepairWarrantySchema.nullable(),
  nextStages: z.array(RepairStage),
})

export const RepairPublicView = z.object({
  shopName: z.string(),
  number: z.number().int(),
  stage: RepairStage,
  device: z.string(),
  customerFirstName: z.string(),
  diagnosis: z.string().nullable(),
  quote: RepairQuoteSchema.omit({ id: true }).extend({ id: z.string() }).nullable(),
  events: z.array(z.object({ kind: z.string(), text: z.string().nullable(), occurredAt: z.string() })),
  warranty: RepairWarrantySchema.nullable(),
  /** Pro cliente falar com a loja (F322): o telefone e o endereço do cadastro da empresa. */
  shopPhone: z.string().nullable().default(null),
  shopAddress: z.string().nullable().default(null),
  /** O logo da assistência (F326), em `GET /repair/public/:token/logo`. */
  shopHasLogo: z.boolean().default(false),
})

export const RepairPublicDecisionRequest = z.object({
  quoteId: z.uuid(),
  approved: z.boolean(),
  approverName: Text(200),
})

export const RepairSettingsSchema = z.object({
  warrantyDays: z.number().int().min(0).max(3650),
  warrantyTerms: Text(4000),
  warrantyExclusions: z.array(Text(120)).max(20),
  diagnosisFee: Decimal,
  quoteValidDays: z.number().int().min(1).max(365),
  version: z.number().int(),
})

export const RepairTeamList = z.object({
  members: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      role: z.string(),
      functions: z.array(z.string()),
      /** A comissão sobre a mão de obra (F328), em %; nula quando não tem. */
      laborPercent: z.string().nullable().default(null),
    })
  ),
})

/** A comissão de uma pessoa (F328): nula tira. */
export const SetRepairCommissionRequest = z.object({
  laborPercent: Decimal.refine((value) => Number(value) <= 100, 'A comissão vai até 100%.').nullable(),
})

/** O período do relatório (F328), em dias de São Paulo, os dois inclusive. */
export const RepairReportQuery = z.object({ from: IsoDate, to: IsoDate })

const ReportCount = z.number().int().nonnegative()

export const RepairReport = z.object({
  from: z.string(),
  to: z.string(),
  /** Abertas no período. */
  opened: ReportCount,
  /** Entregues no período, com o orçamento aprovado mais recente de cada uma. */
  delivered: ReportCount,
  revenue: z.string(),
  partsTotal: z.string(),
  laborTotal: z.string(),
  averageTicket: z.string(),
  /** Respostas de orçamento no período. */
  approved: ReportCount,
  decided: ReportCount,
  /** Da entrada até "Pronta", nas entregues do período. */
  averageBenchHours: z.number().nullable(),
  byTechnician: z.array(
    z.object({
      userId: z.string().nullable(),
      name: z.string(),
      delivered: ReportCount,
      revenue: z.string(),
      laborTotal: z.string(),
      laborPercent: z.string().nullable(),
      commission: z.string().nullable(),
      averageBenchHours: z.number().nullable(),
    })
  ),
})

export const SetRepairFunctionsRequest = z.object({
  functions: z.array(z.enum(REPAIR_FUNCTION_VALUES)).max(2),
})

export const RepairAttachmentCreated = z.object({ id: z.string() })

export const RepairQuickItemRequest = z.object({ name: z.enum(REPAIR_QUICK_ITEM_VALUES) })
export const RepairQuickItemResponse = z.object({ variantId: z.string() })

// ---------------------------------------------------------------------------
// O pós-venda (F329)
// ---------------------------------------------------------------------------

export const RepairFollowupQuery = z.object({
  view: z.enum(['hoje', 'proximos', 'feitos']).default('hoje'),
  /** Os contatos de uma OS (a ficha). */
  orderId: z.uuid().optional(),
})

export const RepairFollowupItem = z.object({
  id: z.string(),
  orderId: z.string(),
  orderNumber: z.number().int(),
  ruleKey: z.string(),
  ruleName: z.string(),
  dueOn: z.string(),
  status: z.enum(['pendente', 'feito', 'pulado', 'cancelado']),
  doneAt: z.string().nullable(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  device: z.string(),
  publicToken: z.string(),
  /** O texto pronto, com `{link}` pro front trocar pelo endereço da página do cliente. */
  message: z.string(),
})

export const RepairFollowupList = z.object({
  items: z.array(RepairFollowupItem),
  /** Quantos venceram (hoje e atrasados). */
  due: z.number().int().nonnegative(),
})

export const RepairFollowupActionRequest = z.object({
  action: z.enum(['feito', 'pulado', 'adiar']),
  /** Pra adiar: quantos dias a partir de hoje. */
  days: z.number().int().min(1).max(90).default(3),
})

export const RepairFollowupRuleSchema = z.object({
  key: z.string(),
  name: z.string(),
  anchor: z.enum(['entregue', 'fim_garantia', 'pronta']),
  delayDays: z.number().int(),
  match: z.array(z.string()),
  text: z.string(),
  active: z.boolean(),
})

export const RepairFollowupRules = z.object({ rules: z.array(RepairFollowupRuleSchema) })

export const SaveRepairFollowupRuleRequest = z.object({
  active: z.boolean(),
  delayDays: z.number().int().min(-365).max(730),
  text: Text(1000),
})
