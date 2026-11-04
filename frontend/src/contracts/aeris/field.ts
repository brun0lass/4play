import { z } from 'zod'

/**
 * A climatização (F331, ADR-0049): o contrato das rotas `/api/v1/field/*` do
 * Aeris Bot. As listas espelham `@aeris/field` e os CHECKs da migração 0172;
 * o teste de paridade do api confere as três.
 */

export const FIELD_MEMBER_FUNCTION_VALUES = ['tecnico', 'ajudante', 'responsavel_tecnico'] as const
export const FIELD_EQUIPMENT_KIND_VALUES = [
  'split_hiwall',
  'cassete',
  'piso_teto',
  'janela',
  'multi_split',
  'vrf',
  'chiller',
  'self',
  'camara_fria',
  'refrigeracao_comercial',
  'outro',
] as const
export const FIELD_REFRIGERANT_VALUES = ['R-22', 'R-410A', 'R-32', 'R-134a', 'R-404A', 'R-290', 'outro'] as const
export const FIELD_VOLTAGE_VALUES = ['127', '220', '380'] as const
export const FIELD_EXPANSION_VALUES = ['capilar', 'txv', 'eev'] as const
export const FIELD_PRICE_KIND_VALUES = ['instalacao', 'preventiva', 'corretiva', 'carga_gas', 'desinstalacao', 'visita', 'material'] as const
export const FIELD_PRICE_UNIT_VALUES = ['un', 'm', 'kg'] as const
export const FIELD_QUOTE_STATUS_VALUES = ['aberto', 'aprovado', 'recusado', 'cancelado'] as const
export const FIELD_APPROVAL_CHANNEL_VALUES = ['balcao', 'link', 'whatsapp'] as const
export const FIELD_VISIT_KIND_VALUES = ['instalacao', 'preventiva', 'corretiva', 'carga_gas', 'desinstalacao', 'visita_tecnica', 'pmoc'] as const
export const FIELD_VISIT_STAGE_VALUES = ['agendada', 'a_caminho', 'em_atendimento', 'concluida', 'cancelada', 'nao_compareceu'] as const
export const FIELD_MEASUREMENT_KIND_VALUES = [
  't_insuflamento',
  't_retorno',
  't_externa',
  'p_succao',
  'p_descarga',
  'corrente',
  'tensao',
  'superaquecimento',
  'subresfriamento',
  'vacuo',
  'vacuo_decaimento',
  'p_nitrogenio',
  'linha_m',
  'gas_carregado_g',
] as const
export const FIELD_MEASUREMENT_UNIT_VALUES = ['C', 'psi', 'A', 'V', 'K', 'micron', 'm', 'g'] as const
export const FIELD_PHOTO_MOMENT_VALUES = ['antes', 'depois', 'plaqueta', 'outro'] as const

export const FieldTeamList = z.object({
  members: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      role: z.string(),
      functions: z.array(z.string()),
    })
  ),
})

export const SetFieldFunctionsRequest = z.object({
  functions: z.array(z.enum(FIELD_MEMBER_FUNCTION_VALUES)).max(FIELD_MEMBER_FUNCTION_VALUES.length),
})

// ---------------------------------------------------------------------------
// Os locais do atendimento (F332)
// ---------------------------------------------------------------------------

const phone = z
  .string()
  .transform((value) => value.replace(/\D/gu, ''))
  .pipe(z.string().regex(/^[0-9]{10,13}$/u, 'Telefone com DDD.'))

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()

export const FieldSite = z.object({
  id: z.string(),
  partyId: z.string(),
  customerName: z.string(),
  name: z.string(),
  accessNotes: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  status: z.enum(['active', 'archived']),
  version: z.number().int(),
  address: z.object({
    id: z.string(),
    cep: z.string().nullable(),
    street: z.string(),
    number: z.string().nullable(),
    complement: z.string().nullable(),
    district: z.string().nullable(),
    city: z.string(),
    uf: z.string(),
    latitude: z.string().nullable(),
    longitude: z.string().nullable(),
  }),
})

export const FieldSiteList = z.object({ sites: z.array(FieldSite) })

export const FieldSiteListQuery = z.object({
  partyId: z.uuid(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export const CreateFieldSiteRequest = z.object({
  partyId: z.uuid(),
  addressId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  accessNotes: optionalText(1000).optional(),
  contactName: optionalText(120).optional(),
  contactPhone: phone.nullable().optional(),
})

export const UpdateFieldSiteRequest = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(80).optional(),
  addressId: z.uuid().optional(),
  accessNotes: optionalText(1000).optional(),
  contactName: optionalText(120).optional(),
  contactPhone: phone.nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
})

export const FieldSiteResponse = z.object({ site: FieldSite })

// ---------------------------------------------------------------------------
// Os equipamentos (F333)
// ---------------------------------------------------------------------------

const isoDate = z.iso.date()

export const FieldEquipment = z.object({
  id: z.string(),
  siteId: z.string(),
  siteName: z.string(),
  partyId: z.string(),
  customerName: z.string(),
  code: z.number().int(),
  /** A etiqueta como se imprime: EQ-0042. */
  label: z.string(),
  kind: z.enum(FIELD_EQUIPMENT_KIND_VALUES),
  room: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  capacityBtu: z.number().int().nullable(),
  refrigerant: z.enum(FIELD_REFRIGERANT_VALUES).nullable(),
  factoryChargeG: z.number().int().nullable(),
  voltage: z.enum(FIELD_VOLTAGE_VALUES).nullable(),
  inverter: z.boolean().nullable(),
  expansion: z.enum(FIELD_EXPANSION_VALUES).nullable(),
  nameplateCurrentA: z.string().nullable(),
  installedOn: z.string().nullable(),
  makerWarrantyUntil: z.string().nullable(),
  installWarrantyUntil: z.string().nullable(),
  hasNameplatePhoto: z.boolean(),
  notes: z.string().nullable(),
  publicToken: z.string(),
  status: z.enum(['active', 'removed']),
  version: z.number().int(),
})

export const FieldEquipmentList = z.object({ items: z.array(FieldEquipment) })

export const FieldEquipmentListQuery = z.object({
  siteId: z.uuid().optional(),
  partyId: z.uuid().optional(),
  search: z.string().trim().max(80).optional(),
  removed: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

const equipmentFields = {
  kind: z.enum(FIELD_EQUIPMENT_KIND_VALUES),
  room: optionalText(80),
  brand: optionalText(60),
  model: optionalText(80),
  serial: optionalText(80),
  capacityBtu: z.number().int().min(1000).max(10_000_000).nullable(),
  refrigerant: z.enum(FIELD_REFRIGERANT_VALUES).nullable(),
  factoryChargeG: z.number().int().min(1).max(1_000_000).nullable(),
  voltage: z.enum(FIELD_VOLTAGE_VALUES).nullable(),
  inverter: z.boolean().nullable(),
  expansion: z.enum(FIELD_EXPANSION_VALUES).nullable(),
  /** Decimal em texto (7.4), nunca float. */
  nameplateCurrentA: z
    .string()
    .trim()
    .transform((value) => value.replace(',', '.'))
    .pipe(z.string().regex(/^\d{1,4}(\.\d{1,2})?$/u, 'Corrente em ampères, como 7,4.'))
    .nullable(),
  installedOn: isoDate.nullable(),
  makerWarrantyUntil: isoDate.nullable(),
  installWarrantyUntil: isoDate.nullable(),
  notes: optionalText(2000),
}

export const CreateFieldEquipmentRequest = z.object({
  siteId: z.uuid(),
  kind: equipmentFields.kind,
  room: equipmentFields.room.optional(),
  brand: equipmentFields.brand.optional(),
  model: equipmentFields.model.optional(),
  serial: equipmentFields.serial.optional(),
  capacityBtu: equipmentFields.capacityBtu.optional(),
  refrigerant: equipmentFields.refrigerant.optional(),
  factoryChargeG: equipmentFields.factoryChargeG.optional(),
  voltage: equipmentFields.voltage.optional(),
  inverter: equipmentFields.inverter.optional(),
  expansion: equipmentFields.expansion.optional(),
  nameplateCurrentA: equipmentFields.nameplateCurrentA.optional(),
  installedOn: equipmentFields.installedOn.optional(),
  makerWarrantyUntil: equipmentFields.makerWarrantyUntil.optional(),
  installWarrantyUntil: equipmentFields.installWarrantyUntil.optional(),
  notes: equipmentFields.notes.optional(),
})

export const UpdateFieldEquipmentRequest = CreateFieldEquipmentRequest.partial().extend({
  version: z.number().int().positive(),
  status: z.enum(['active', 'removed']).optional(),
})

export const FieldEquipmentResponse = z.object({ equipment: FieldEquipment })

/** O que a etiqueta com QR mostra sem login: o equipamento, a empresa e como chamar. */
export const FieldPublicEquipment = z.object({
  companyName: z.string(),
  companyPhone: z.string().nullable(),
  label: z.string(),
  kind: z.enum(FIELD_EQUIPMENT_KIND_VALUES),
  room: z.string().nullable(),
  siteName: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  capacityBtu: z.number().int().nullable(),
  refrigerant: z.enum(FIELD_REFRIGERANT_VALUES).nullable(),
  installedOn: z.string().nullable(),
  installWarrantyUntil: z.string().nullable(),
})

// ---------------------------------------------------------------------------
// A tabela de preços e o orçamento (F334)
// ---------------------------------------------------------------------------

/** Reais em texto, com vírgula ou ponto ("1.050,00" não: só "1050,00" ou "1050.00"). */
const reais = z
  .string()
  .trim()
  .transform((value) => value.replace(',', '.'))
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/u, 'Valor em reais, como 120,00.'))

/** Quantidade com até 3 casas (2,5 m; 1,2 kg). */
const quantidade = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim().replace(',', '.'))
  .pipe(z.string().regex(/^\d{1,6}(\.\d{1,3})?$/u, 'Quantidade como 1, 2,5 ou 1,25.'))

const btuLimit = z.number().int().min(1).max(10_000_000).nullable()

export const FieldPrice = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(FIELD_PRICE_KIND_VALUES),
  btuMin: z.number().int().nullable(),
  btuMax: z.number().int().nullable(),
  unit: z.enum(FIELD_PRICE_UNIT_VALUES),
  price: z.string(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  version: z.number().int(),
})

export const FieldPriceList = z.object({ prices: z.array(FieldPrice) })

export const CreateFieldPriceRequest = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(FIELD_PRICE_KIND_VALUES),
  btuMin: btuLimit.optional(),
  btuMax: btuLimit.optional(),
  unit: z.enum(FIELD_PRICE_UNIT_VALUES).default('un'),
  price: reais,
})

export const UpdateFieldPriceRequest = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  btuMin: btuLimit.optional(),
  btuMax: btuLimit.optional(),
  unit: z.enum(FIELD_PRICE_UNIT_VALUES).optional(),
  price: reais.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

export const FieldQuoteLineInput = z.object({
  /** O item da tabela; sem ele, a linha é avulsa (descrição e preço livres). */
  priceId: z.uuid().nullable().optional(),
  /** O equipamento que a linha atende, quando já tem cadastro. */
  equipmentId: z.uuid().nullable().optional(),
  description: z.string().trim().min(1).max(200),
  quantity: quantidade,
  unit: z.enum(FIELD_PRICE_UNIT_VALUES).default('un'),
  unitPrice: reais,
})

const quoteBody = {
  lines: z.array(FieldQuoteLineInput).min(1).max(60),
  discount: reais.default('0'),
  /** Validade em dias a partir de hoje (São Paulo). */
  validDays: z.number().int().min(1).max(365).default(7),
  warrantyDays: z.number().int().min(0).max(3650).default(90),
  note: optionalText(1000).optional(),
}

export const CreateFieldQuoteRequest = z.object({
  partyId: z.uuid(),
  siteId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  ...quoteBody,
})

export const CreateFieldQuoteVersionRequest = z.object(quoteBody)

export const FieldQuoteLine = z.object({
  priceId: z.string().nullable(),
  equipmentId: z.string().nullable(),
  description: z.string(),
  quantity: z.string(),
  unit: z.enum(FIELD_PRICE_UNIT_VALUES),
  unitPrice: z.string(),
})

const approvalView = z
  .object({
    approved: z.boolean(),
    channel: z.enum(FIELD_APPROVAL_CHANNEL_VALUES),
    approverName: z.string(),
    decidedAt: z.string(),
  })
  .nullable()

export const FieldQuoteVersion = z.object({
  id: z.string(),
  versionNo: z.number().int(),
  lines: z.array(FieldQuoteLine),
  subtotal: z.string(),
  discount: z.string(),
  total: z.string(),
  validUntil: z.string(),
  warrantyDays: z.number().int(),
  note: z.string().nullable(),
  createdAt: z.string(),
  approval: approvalView,
})

export const FieldQuote = z.object({
  id: z.string(),
  number: z.number().int(),
  partyId: z.string(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  siteId: z.string().nullable(),
  siteName: z.string().nullable(),
  title: z.string(),
  status: z.enum(FIELD_QUOTE_STATUS_VALUES),
  publicToken: z.string(),
  salesDocumentId: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int(),
  /** A mais nova primeiro. */
  versions: z.array(FieldQuoteVersion),
})

export const FieldQuoteResponse = z.object({ quote: FieldQuote })

export const FieldQuoteSummary = z.object({
  id: z.string(),
  number: z.number().int(),
  partyId: z.string(),
  customerName: z.string(),
  siteName: z.string().nullable(),
  title: z.string(),
  status: z.enum(FIELD_QUOTE_STATUS_VALUES),
  total: z.string(),
  validUntil: z.string(),
  versionNo: z.number().int(),
  createdAt: z.string(),
})

export const FieldQuoteList = z.object({ quotes: z.array(FieldQuoteSummary) })

export const FieldQuoteListQuery = z.object({
  status: z.enum(FIELD_QUOTE_STATUS_VALUES).optional(),
  partyId: z.uuid().optional(),
})

/** No balcão ou registrado do WhatsApp: quem aprovou e por onde. Pelo link é a rota pública. */
export const DecideFieldQuoteRequest = z.object({
  versionId: z.uuid(),
  approved: z.boolean(),
  channel: z.enum(['balcao', 'whatsapp']),
  approverName: z.string().trim().min(2).max(200),
})

export const FieldPublicQuoteDecisionRequest = z.object({
  versionId: z.uuid(),
  approved: z.boolean(),
  approverName: z.string().trim().min(2).max(200),
})

/** O que o cliente vê pelo link: a versão mais nova, sem custo nem nada interno. */
export const FieldPublicQuote = z.object({
  companyName: z.string(),
  companyPhone: z.string().nullable(),
  number: z.number().int(),
  title: z.string(),
  customerFirstName: z.string(),
  siteName: z.string().nullable(),
  status: z.enum(FIELD_QUOTE_STATUS_VALUES),
  current: FieldQuoteVersion.omit({ createdAt: true }).extend({
    lines: z.array(FieldQuoteLine.omit({ priceId: true, equipmentId: true })),
  }),
})

// ---------------------------------------------------------------------------
// A agenda e a visita (F335)
// ---------------------------------------------------------------------------

const coordinate = z
  .union([z.number(), z.string()])
  .transform((value) => String(value))
  .pipe(z.string().regex(/^-?\d{1,3}(\.\d{1,6})?$/u))

export const FieldVisit = z.object({
  id: z.string(),
  number: z.number().int(),
  siteId: z.string(),
  siteName: z.string(),
  partyId: z.string(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  address: z.object({
    street: z.string(),
    number: z.string().nullable(),
    district: z.string().nullable(),
    city: z.string(),
    uf: z.string(),
    latitude: z.string().nullable(),
    longitude: z.string().nullable(),
  }),
  accessNotes: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  kind: z.enum(FIELD_VISIT_KIND_VALUES),
  stage: z.enum(FIELD_VISIT_STAGE_VALUES),
  scheduledAt: z.string(),
  windowMinutes: z.number().int(),
  technicianUserId: z.string().nullable(),
  technicianName: z.string().nullable(),
  helperUserId: z.string().nullable(),
  helperName: z.string().nullable(),
  quoteId: z.string().nullable(),
  quoteNumber: z.number().int().nullable(),
  quoteTotal: z.string().nullable(),
  notes: z.string().nullable(),
  publicToken: z.string(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  version: z.number().int(),
  equipmentIds: z.array(z.string()),
})

export const FieldVisitList = z.object({ visits: z.array(FieldVisit) })

export const FieldVisitListQuery = z.object({
  /** Dias em São Paulo, AAAA-MM-DD; `to` inclusive. */
  from: isoDate.optional(),
  to: isoDate.optional(),
  technicianId: z.uuid().optional(),
  partyId: z.uuid().optional(),
  equipmentId: z.uuid().optional(),
  quoteId: z.uuid().optional(),
})

export const FieldVisitDetail = z.object({
  visit: FieldVisit,
  events: z.array(
    z.object({
      fromStage: z.enum(FIELD_VISIT_STAGE_VALUES).nullable(),
      toStage: z.enum(FIELD_VISIT_STAGE_VALUES),
      note: z.string().nullable(),
      hasLocation: z.boolean(),
      occurredAt: z.string(),
      actorName: z.string().nullable(),
    })
  ),
})

export const CreateFieldVisitRequest = z.object({
  siteId: z.uuid(),
  kind: z.enum(FIELD_VISIT_KIND_VALUES),
  scheduledAt: z.iso.datetime({ offset: true }),
  windowMinutes: z.number().int().min(0).max(720).default(120),
  technicianUserId: z.uuid().nullable().optional(),
  helperUserId: z.uuid().nullable().optional(),
  equipmentIds: z.array(z.uuid()).max(100).default([]),
  /** O orçamento aprovado que a visita executa. */
  quoteId: z.uuid().nullable().optional(),
  notes: optionalText(2000).optional(),
})

export const UpdateFieldVisitRequest = z.object({
  version: z.number().int().positive(),
  scheduledAt: z.iso.datetime({ offset: true }).optional(),
  windowMinutes: z.number().int().min(0).max(720).optional(),
  technicianUserId: z.uuid().nullable().optional(),
  helperUserId: z.uuid().nullable().optional(),
  equipmentIds: z.array(z.uuid()).max(100).optional(),
  notes: optionalText(2000).optional(),
})

export const MoveFieldVisitRequest = z.object({
  version: z.number().int().positive(),
  to: z.enum(FIELD_VISIT_STAGE_VALUES),
  note: optionalText(500).optional(),
  /** Do celular, quando ele deu; a visita anda sem. */
  latitude: coordinate.nullable().optional(),
  longitude: coordinate.nullable().optional(),
})

/** O que o cliente vê pelo link da visita: quem vem, quando e em que pé está. */
export const FieldPublicVisit = z.object({
  companyName: z.string(),
  companyPhone: z.string().nullable(),
  number: z.number().int(),
  kind: z.enum(FIELD_VISIT_KIND_VALUES),
  stage: z.enum(FIELD_VISIT_STAGE_VALUES),
  scheduledAt: z.string(),
  windowMinutes: z.number().int(),
  siteName: z.string(),
  technicianFirstName: z.string().nullable(),
  customerFirstName: z.string(),
  equipmentCount: z.number().int(),
})

// ---------------------------------------------------------------------------
// O relatório técnico (F336)
// ---------------------------------------------------------------------------

/** Decimal com sinal e até 2 casas ("11,8", "-3", "500"). */
const decimal = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim().replace(',', '.'))
  .pipe(z.string().regex(/^-?\d{1,7}(\.\d{1,2})?$/u, 'Número como 11,8 ou 500.'))

const measurementStatus = z.enum(['dentro', 'fora', 'sem_referencia'])

export const FieldMeasurement = z.object({
  kind: z.enum(FIELD_MEASUREMENT_KIND_VALUES),
  label: z.string(),
  value: z.string(),
  unit: z.enum(FIELD_MEASUREMENT_UNIT_VALUES),
  refMin: z.string().nullable(),
  refMax: z.string().nullable(),
  refSource: z.string().nullable(),
  status: measurementStatus,
})

export const FieldChecklistItem = z.object({
  key: z.string(),
  label: z.string(),
  done: z.boolean(),
  note: z.string().nullable(),
  /** As medições que o item pede. */
  measurements: z.array(z.enum(FIELD_MEASUREMENT_KIND_VALUES)),
})

export const FieldVisitWorkResponse = z.object({
  equipments: z.array(
    z.object({
      equipmentId: z.string(),
      checklist: z.array(FieldChecklistItem),
      findings: z.string().nullable(),
      measurements: z.array(FieldMeasurement),
      /** A referência de cada medição pra este equipamento (a tela mostra antes de digitar). */
      references: z.array(
        z.object({
          kind: z.enum(FIELD_MEASUREMENT_KIND_VALUES),
          label: z.string(),
          unit: z.enum(FIELD_MEASUREMENT_UNIT_VALUES),
          refMin: z.string().nullable(),
          refMax: z.string().nullable(),
          source: z.string().nullable(),
        })
      ),
    })
  ),
  photos: z.array(
    z.object({
      id: z.string(),
      equipmentId: z.string().nullable(),
      moment: z.enum(FIELD_PHOTO_MOMENT_VALUES),
      caption: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
  report: z
    .object({
      signedAt: z.string(),
      customerSignedName: z.string().nullable(),
      noSignatureReason: z.string().nullable(),
    })
    .nullable(),
})

export const SaveFieldVisitWorkRequest = z.object({
  checklist: z.array(z.object({ key: z.string().min(1).max(60), done: z.boolean(), note: optionalText(300).optional() })).max(60),
  findings: optionalText(2000).optional(),
  measurements: z.array(z.object({ kind: z.enum(FIELD_MEASUREMENT_KIND_VALUES), value: decimal })).max(30),
})

/** A assinatura desenhada no dedo: PNG em data URL, até ~300 KB. */
const signature = z
  .string()
  .max(400_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/u, 'Assinatura inválida.')

export const ConcludeFieldVisitRequest = z.object({
  version: z.number().int().positive(),
  technicianSignature: signature,
  customerSignature: signature.nullable().optional(),
  customerSignedName: z.string().trim().min(2).max(200).nullable().optional(),
  /** Quando o cliente não estava pra assinar: o porquê fica no relatório. */
  noSignatureReason: z.string().trim().min(3).max(300).nullable().optional(),
  /** O texto que o cliente lê no relatório. */
  publicNotes: optionalText(2000).optional(),
  latitude: coordinate.nullable().optional(),
  longitude: coordinate.nullable().optional(),
})

/** O relatório congelado: o que o papel e o link do cliente mostram. */
export const FieldReportSnapshot = z.object({
  number: z.number().int(),
  kind: z.enum(FIELD_VISIT_KIND_VALUES),
  companyName: z.string(),
  companyPhone: z.string().nullable(),
  companyDocument: z.string().nullable(),
  companyAddress: z.string().nullable(),
  customerName: z.string(),
  siteName: z.string(),
  address: z.string(),
  technicianName: z.string().nullable(),
  helperName: z.string().nullable(),
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  publicNotes: z.string().nullable(),
  signedAt: z.string(),
  customerSignedName: z.string().nullable(),
  noSignatureReason: z.string().nullable(),
  hasCustomerSignature: z.boolean(),
  equipments: z.array(
    z.object({
      equipmentId: z.string(),
      label: z.string(),
      kind: z.enum(FIELD_EQUIPMENT_KIND_VALUES),
      room: z.string().nullable(),
      brand: z.string().nullable(),
      model: z.string().nullable(),
      serial: z.string().nullable(),
      capacityBtu: z.number().int().nullable(),
      refrigerant: z.enum(FIELD_REFRIGERANT_VALUES).nullable(),
      done: z.array(z.string()),
      notDone: z.array(z.string()),
      findings: z.string().nullable(),
      measurements: z.array(FieldMeasurement),
      photos: z.array(z.object({ id: z.string(), moment: z.enum(FIELD_PHOTO_MOMENT_VALUES), caption: z.string().nullable() })),
    })
  ),
})

export const FieldReportResponse = z.object({ report: FieldReportSnapshot })

// ---------------------------------------------------------------------------
// A preventiva e o pós-venda (F337)
// ---------------------------------------------------------------------------

export const FieldFollowupQuery = z.object({
  view: z.enum(['hoje', 'proximos', 'feitos']).default('hoje'),
  /** Os contatos de um equipamento (a ficha). */
  equipmentId: z.uuid().optional(),
})

/** Um contato como o cliente recebe: os equipamentos da mesma visita e modelo numa mensagem só. */
export const FieldFollowupItem = z.object({
  id: z.string(),
  visitId: z.string(),
  visitNumber: z.number().int(),
  visitToken: z.string(),
  partyId: z.string(),
  siteId: z.string(),
  ruleKey: z.string(),
  ruleName: z.string(),
  dueOn: z.string(),
  status: z.enum(['pendente', 'feito', 'pulado', 'cancelado']),
  doneAt: z.string().nullable(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  equipments: z.array(z.object({ id: z.string(), code: z.number().int(), kind: z.enum(FIELD_EQUIPMENT_KIND_VALUES), capacityBtu: z.number().int().nullable(), room: z.string().nullable() })),
  /** O preço da preventiva desses equipamentos pela tabela, quando é limpeza e a tabela tem. */
  cleaningPrice: z.string().nullable(),
  /** O texto pronto, com `{link}` pro front trocar pelo endereço da página do cliente. */
  message: z.string(),
})

export const FieldFollowupList = z.object({
  items: z.array(FieldFollowupItem),
  /** Quantos venceram (hoje e atrasados). */
  due: z.number().int().nonnegative(),
  /** Limpezas que vencem nos próximos 30 dias: quantos contatos, quantos equipamentos e quanto dá se todos fecharem. */
  next30: z.object({ contacts: z.number().int().nonnegative(), equipments: z.number().int().nonnegative(), amount: z.string() }),
})

export const FieldFollowupActionRequest = z.object({
  action: z.enum(['feito', 'pulado', 'adiar']),
  /** Pra adiar: quantos dias a partir de hoje. */
  days: z.number().int().min(1).max(90).default(7),
})

export const FieldFollowupRuleSchema = z.object({
  key: z.string(),
  name: z.string(),
  anchor: z.enum(['concluida', 'fim_garantia', 'pre_verao']),
  delayDays: z.number().int(),
  visitKinds: z.array(z.string()),
  customer: z.enum(['person', 'company']).nullable(),
  cleaning: z.boolean(),
  text: z.string(),
  active: z.boolean(),
})

export const FieldFollowupRules = z.object({ rules: z.array(FieldFollowupRuleSchema) })

export const SaveFieldFollowupRuleRequest = z.object({
  active: z.boolean(),
  delayDays: z.number().int().min(-365).max(730),
  text: z.string().trim().min(1).max(1000),
})

// ---------------------------------------------------------------------------
// O PMOC (F338)
// ---------------------------------------------------------------------------

export const PMOC_FREQUENCY_VALUES = ['mensal', 'trimestral', 'semestral', 'anual'] as const
export const PMOC_CONTRACT_STATUS_VALUES = ['rascunho', 'vigente', 'encerrado'] as const
export const PMOC_COUNCIL_VALUES = ['CREA', 'CFT'] as const

/** O número da ART ou TRT: de 3 a 40 caracteres; vazio vira null. */
const artNumber = optionalText(40).refine((value) => value === null || value.length >= 3, 'O número da ART/TRT tem ao menos 3 caracteres.')

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u, 'Mês como 2026-10.')

export const PmocResponsible = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: z.string(),
  document: z.string().nullable(),
  council: z.enum(PMOC_COUNCIL_VALUES),
  registry: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
})

export const PmocResponsibleList = z.object({ responsibles: z.array(PmocResponsible) })

export const CreatePmocResponsibleRequest = z.object({
  userId: z.uuid().nullable().optional(),
  name: z.string().trim().min(3).max(120),
  /** CPF ou CNPJ em texto, nunca número. */
  document: optionalText(20).optional(),
  council: z.enum(PMOC_COUNCIL_VALUES),
  registry: z.string().trim().min(2).max(40),
  phone: phone.nullable().optional(),
  email: z.email().nullable().optional(),
})

export const PmocPlanItem = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/u),
  label: z.string().trim().min(1).max(120),
  equipmentKind: z.enum(FIELD_EQUIPMENT_KIND_VALUES).nullable(),
  frequency: z.enum(PMOC_FREQUENCY_VALUES),
  offsetMonths: z.number().int().min(0).max(11),
  maxFrequency: z.enum(PMOC_FREQUENCY_VALUES).nullable(),
  measurements: z.array(z.enum(FIELD_MEASUREMENT_KIND_VALUES)).max(6),
})

export const PmocRoom = z.object({
  name: z.string().trim().min(1).max(80),
  activity: optionalText(80).nullable(),
  fixedOccupants: z.number().int().min(0).max(100_000),
  floatingOccupants: z.number().int().min(0).max(100_000),
  areaM2: z
    .string()
    .trim()
    .transform((value) => value.replace(',', '.'))
    .pipe(z.string().regex(/^\d{1,8}(\.\d{1,2})?$/u, 'Área como 24,5.'))
    .nullable(),
  thermalLoadBtu: z.number().int().min(1).max(10_000_000).nullable(),
})

/** O ambiente como a API devolve: os mesmos campos, sem as conversões da entrada. */
export const PmocRoomView = z.object({
  name: z.string(),
  activity: z.string().nullable(),
  fixedOccupants: z.number().int(),
  floatingOccupants: z.number().int(),
  areaM2: z.string().nullable(),
  thermalLoadBtu: z.number().int().nullable(),
})

export const PmocInventoryItem = z.object({
  id: z.string(),
  code: z.number().int(),
  kind: z.enum(FIELD_EQUIPMENT_KIND_VALUES),
  capacityBtu: z.number().int().nullable(),
  room: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  refrigerant: z.string().nullable(),
})

export const PmocMonth = z.object({
  month: z.string(),
  visitId: z.string(),
  visitStage: z.enum(FIELD_VISIT_STAGE_VALUES),
  scheduledAt: z.string(),
  salesDocumentId: z.string().nullable(),
  acceptedBy: z.string().nullable(),
})

export const PmocContract = z.object({
  id: z.string(),
  number: z.number().int(),
  partyId: z.string(),
  customerName: z.string(),
  customerDocument: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerEmail: z.string().nullable(),
  siteId: z.string(),
  siteName: z.string(),
  address: z.string(),
  responsibleId: z.string().nullable(),
  responsible: PmocResponsible.nullable(),
  startsOn: z.string(),
  endsOn: z.string(),
  monthlyPrice: z.string(),
  visitDay: z.number().int(),
  status: z.enum(PMOC_CONTRACT_STATUS_VALUES),
  artNumber: z.string().nullable(),
  artValidUntil: z.string().nullable(),
  hasArtFile: z.boolean(),
  emergencyNotes: z.string().nullable(),
  publicToken: z.string(),
  version: z.number().int(),
  inventory: z.array(PmocInventoryItem),
  totalBtu: z.number().int(),
  /** Acima de 60.000 BTU/h a Portaria 3.523 pede responsável técnico. */
  needsResponsible: z.boolean(),
  rooms: z.array(PmocRoomView),
  plan: z.array(PmocPlanItem),
  /** O aceite do plano vale enquanto o plano é o mesmo que o responsável aceitou. */
  planAccepted: z.object({ by: z.string(), at: z.string() }).nullable(),
  months: z.array(PmocMonth),
  airReports: z.array(z.object({ id: z.string(), sampledOn: z.string(), lab: z.string(), ok: z.boolean(), notes: z.string().nullable() })),
  /** O próximo laudo do ar: 6 meses depois do último (ou do início). */
  airReportDue: z.string(),
  company: z.object({ name: z.string(), document: z.string().nullable(), phone: z.string().nullable(), address: z.string().nullable() }),
})

export const PmocContractResponse = z.object({ contract: PmocContract })

export const PmocContractSummary = z.object({
  id: z.string(),
  number: z.number().int(),
  customerName: z.string(),
  siteName: z.string(),
  status: z.enum(PMOC_CONTRACT_STATUS_VALUES),
  startsOn: z.string(),
  endsOn: z.string(),
  monthlyPrice: z.string(),
  equipmentCount: z.number().int(),
  artValidUntil: z.string().nullable(),
  /** A visita do mês corrente, quando já gerada. */
  currentMonth: z.object({ visitId: z.string(), visitStage: z.enum(FIELD_VISIT_STAGE_VALUES) }).nullable(),
})

export const PmocContractList = z.object({
  contracts: z.array(PmocContractSummary),
  /** Os avisos do painel: ART/TRT vencendo (30 dias), laudo do ar vencido e mês sem visita gerada. */
  alerts: z.array(z.object({ contractId: z.string(), number: z.number().int(), customerName: z.string(), kind: z.enum(['art', 'ar', 'mes']), message: z.string() })),
})

export const PmocDefaults = z.object({ plan: z.array(PmocPlanItem) })

export const CreatePmocContractRequest = z.object({
  siteId: z.uuid(),
  responsibleId: z.uuid().nullable().optional(),
  startsOn: isoDate,
  endsOn: isoDate,
  monthlyPrice: reais,
  visitDay: z.number().int().min(1).max(28),
  artNumber: artNumber.nullable().optional(),
  artValidUntil: isoDate.nullable().optional(),
  emergencyNotes: optionalText(3000).nullable().optional(),
  equipmentIds: z.array(z.uuid()).max(500),
  rooms: z.array(PmocRoom).max(200).default([]),
  /** Sem plano, entra o padrão da RE 9/2003. */
  plan: z.array(PmocPlanItem).min(1).max(60).optional(),
})

export const UpdatePmocContractRequest = z.object({
  version: z.number().int().positive(),
  responsibleId: z.uuid().nullable().optional(),
  endsOn: isoDate.optional(),
  monthlyPrice: reais.optional(),
  visitDay: z.number().int().min(1).max(28).optional(),
  status: z.enum(PMOC_CONTRACT_STATUS_VALUES).optional(),
  artNumber: artNumber.nullable().optional(),
  artValidUntil: isoDate.nullable().optional(),
  emergencyNotes: optionalText(3000).nullable().optional(),
})

const contractVersion = z.number().int().positive()
export const SetPmocInventoryRequest = z.object({ version: contractVersion, equipmentIds: z.array(z.uuid()).max(500) })
export const SetPmocRoomsRequest = z.object({ version: contractVersion, rooms: z.array(PmocRoom).max(200) })
export const SetPmocPlanRequest = z.object({ version: contractVersion, plan: z.array(PmocPlanItem).min(1).max(60) })

export const AcceptPmocRequest = z.object({ kind: z.enum(['plano', 'mes']), month: yearMonth.optional() })

export const GeneratePmocMonthRequest = z.object({ month: yearMonth })
export const GeneratePmocMonthResponse = z.object({ visitId: z.string(), salesDocumentId: z.string().nullable(), created: z.boolean(), items: z.array(z.string()) })

export const CreatePmocAirReportRequest = z.object({
  sampledOn: isoDate,
  lab: z.string().trim().min(2).max(120),
  ok: z.boolean(),
  notes: optionalText(2000).nullable().optional(),
})

/** O relatório do mês: os itens que venceram e o que cada visita registrou. */
export const PmocMonthlyReport = z.object({
  contract: PmocContract,
  month: z.string(),
  items: z.array(z.string()),
  visit: z.object({ id: z.string(), stage: z.enum(FIELD_VISIT_STAGE_VALUES), scheduledAt: z.string(), technicianName: z.string().nullable() }).nullable(),
  report: FieldReportSnapshot.nullable(),
  acceptance: z.object({ by: z.string(), at: z.string() }).nullable(),
})

/** O que os ocupantes veem (art. 6º "d" da Portaria 3.523): o plano e os últimos resultados, sem valores. */
export const PmocPublic = z.object({
  companyName: z.string(),
  customerName: z.string(),
  siteName: z.string(),
  address: z.string(),
  responsible: z.object({ name: z.string(), council: z.enum(PMOC_COUNCIL_VALUES), registry: z.string() }).nullable(),
  artNumber: z.string().nullable(),
  startsOn: z.string(),
  endsOn: z.string(),
  emergencyNotes: z.string().nullable(),
  plan: z.array(z.object({ label: z.string(), frequency: z.enum(PMOC_FREQUENCY_VALUES) })),
  months: z.array(z.object({ month: z.string(), done: z.boolean(), visitOn: z.string() })),
  lastAirReport: z.object({ sampledOn: z.string(), ok: z.boolean() }).nullable(),
  equipmentCount: z.number().int(),
})
