import { z } from 'zod'

/**
 * Cobranças (F135): a fila de quem deve, o que se fez com cada um, a
 * renegociação e a mensagem.
 *
 * Dinheiro como string, pelo motivo de sempre (ADR-0016). Datas de promessa
 * como `AAAA-MM-DD`: a promessa é "dia 20", e não um instante — gravar meia-noite
 * em UTC faria a promessa de dia 20 vencer às 21h do dia 19 em Brasília.
 */

const MONEY = /^\d{1,12}(\.\d{1,2})?$/
const money = (message: string) => z.string().trim().regex(MONEY, message)
const DAY = /^\d{4}-\d{2}-\d{2}$/

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

export const COLLECTION_FILTERS = [
  'overdue',
  'promised_today',
  'broken',
  'due_soon',
  'all',
] as const

export const CollectionFilter = z.enum(COLLECTION_FILTERS)
export type CollectionFilter = z.infer<typeof CollectionFilter>

export const CollectionChannel = z.enum([
  'phone',
  'whatsapp',
  'whatsapp_official',
  'in_person',
  'other',
])
export type CollectionChannel = z.infer<typeof CollectionChannel>

export const CollectionOutcome = z.enum([
  'talked',
  'no_answer',
  'promised',
  'refused',
  'wrong_number',
  'message_sent',
  'note',
])
export type CollectionOutcome = z.infer<typeof CollectionOutcome>

export const CollectionQueueQuery = z.object({
  filter: CollectionFilter.default('overdue'),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['oldest', 'amount', 'name']).default('oldest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  timeZone: TimeZone,
})

export type CollectionQueueRequest = z.input<typeof CollectionQueueQuery>

/**
 * A promessa vigente — a última registrada — e o que aconteceu com ela.
 *
 * `paidSince` é o que entrou em baixa DEPOIS de ela ser registrada. Chegou ao
 * prometido, a promessa foi cumprida e não aparece mais; não chegou e a data
 * passou, está quebrada.
 */
export const CollectionPromise = z.object({
  amount: z.string(),
  promisedFor: z.string(),
  recordedAt: z.string(),
  paidSince: z.string(),
  state: z.enum(['waiting', 'due_today', 'broken']),
})

export type CollectionPromise = z.infer<typeof CollectionPromise>

const LastContact = z.object({
  at: z.string(),
  channel: CollectionChannel,
  outcome: CollectionOutcome,
  actorName: z.string().nullable(),
})

export const CollectionQueueItem = z.object({
  partyId: z.string(),
  name: z.string(),
  /** CPF/CNPJ só com dígitos; a tela formata. */
  document: z.string().nullable(),
  /** O telefone para cobrar: WhatsApp, celular ou fixo, nessa ordem. */
  phone: z.string().nullable(),
  outstanding: z.string(),
  overdueAmount: z.string(),
  overdueCount: z.number().int().nonnegative(),
  openCount: z.number().int().nonnegative(),
  /** Zero quando nada venceu. */
  oldestOverdueDays: z.number().int().nonnegative(),
  nextDueAt: z.string().nullable(),
  creditBlocked: z.boolean(),
  lastContact: LastContact.nullable(),
  promise: CollectionPromise.nullable(),
})

export type CollectionQueueItem = z.infer<typeof CollectionQueueItem>

export const CollectionQueueResponse = z.object({
  items: z.array(CollectionQueueItem),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  summary: z.object({
    overdueAmount: z.string(),
    overdueCustomers: z.number().int().nonnegative(),
    promisesToday: z.number().int().nonnegative(),
    brokenPromises: z.number().int().nonnegative(),
    dueSoonAmount: z.string(),
  }),
  /** Quantos clientes cada aba mostraria, para o número ao lado do nome. */
  counts: z.object({
    overdue: z.number().int().nonnegative(),
    promised_today: z.number().int().nonnegative(),
    broken: z.number().int().nonnegative(),
    due_soon: z.number().int().nonnegative(),
    all: z.number().int().nonnegative(),
  }),
})

export type CollectionQueueResponse = z.infer<typeof CollectionQueueResponse>

export const CollectionDetailQuery = z.object({ timeZone: TimeZone })

export const CollectionEntry = z.object({
  id: z.string(),
  branchId: z.string(),
  description: z.string(),
  documentNumber: z.string().nullable(),
  instalmentNumber: z.number().int(),
  instalmentCount: z.number().int(),
  originType: z.string(),
  issuedAt: z.string(),
  dueAt: z.string(),
  amount: z.string(),
  settledAmount: z.string(),
  outstanding: z.string(),
  daysOverdue: z.number().int().nonnegative(),
  version: z.number().int(),
})

export type CollectionEntry = z.infer<typeof CollectionEntry>

export const CollectionSettlement = z.object({
  id: z.string(),
  entryId: z.string(),
  entryDescription: z.string(),
  amount: z.string(),
  interestAmount: z.string(),
  fineAmount: z.string(),
  discountAmount: z.string(),
  paidAmount: z.string(),
  settledOn: z.string(),
  methodName: z.string().nullable(),
  actorName: z.string().nullable(),
  /** Esta linha é o estorno de outra. */
  isReversal: z.boolean(),
  /** Esta baixa foi estornada depois. */
  reversed: z.boolean(),
  createdAt: z.string(),
})

export type CollectionSettlement = z.infer<typeof CollectionSettlement>

export const CollectionContact = z.object({
  id: z.string(),
  channel: CollectionChannel,
  outcome: CollectionOutcome,
  note: z.string().nullable(),
  promisedAmount: z.string().nullable(),
  promisedFor: z.string().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
})

export type CollectionContact = z.infer<typeof CollectionContact>

export const CollectionRenegotiation = z.object({
  id: z.string(),
  originalTotal: z.string(),
  interestAmount: z.string(),
  discountAmount: z.string(),
  newTotal: z.string(),
  instalmentCount: z.number().int(),
  replacedCount: z.number().int(),
  reason: z.string(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
})

export type CollectionRenegotiation = z.infer<typeof CollectionRenegotiation>

export const CollectionDetailResponse = z.object({
  party: z.object({
    id: z.string(),
    kind: z.enum(['person', 'company']),
    name: z.string(),
    legalName: z.string(),
    document: z.string().nullable(),
    version: z.number().int(),
  }),
  phones: z.array(
    z.object({
      kind: z.enum(['phone', 'mobile', 'whatsapp']),
      value: z.string(),
      label: z.string().nullable(),
      isMain: z.boolean(),
    })
  ),
  standing: z.object({
    outstanding: z.string(),
    overdueAmount: z.string(),
    overdueCount: z.number().int().nonnegative(),
    oldestOverdueDays: z.number().int().nonnegative(),
    creditLimit: z.string().nullable(),
    creditBlocked: z.boolean(),
    creditBlockReason: z.string().nullable(),
  }),
  entries: z.array(CollectionEntry),
  settlements: z.array(CollectionSettlement),
  contacts: z.array(CollectionContact),
  renegotiations: z.array(CollectionRenegotiation),
  promise: CollectionPromise.nullable(),
  /** As contas oficiais em que este cliente já tem conversa ligada. */
  whatsapp: z.array(z.object({ accountId: z.string(), contactId: z.string() })),
})

export type CollectionDetailResponse = z.infer<typeof CollectionDetailResponse>

export const RecordCollectionContactRequest = z
  .object({
    channel: CollectionChannel,
    outcome: CollectionOutcome,
    note: z.string().trim().max(2000).nullable().default(null),
    promisedAmount: money(
      'Informe o valor prometido com ponto decimal, por exemplo 150.00'
    ).optional(),
    promisedFor: z
      .string()
      .regex(DAY, 'Informe a data como AAAA-MM-DD')
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.outcome === 'promised') {
      if (
        value.promisedAmount === undefined ||
        !/[1-9]/.test(value.promisedAmount)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['promisedAmount'],
          message: 'Promessa precisa do valor prometido.',
        })
      }
      if (value.promisedFor === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['promisedFor'],
          message: 'Promessa precisa da data.',
        })
      }
    } else if (
      value.promisedAmount !== undefined ||
      value.promisedFor !== undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'Valor e data só vão numa promessa de pagamento.',
      })
    }
  })

export type RecordCollectionContactRequest = z.input<
  typeof RecordCollectionContactRequest
>
export type RecordCollectionContactBody = z.output<
  typeof RecordCollectionContactRequest
>

export const CollectionContactResponse = z.object({
  contact: CollectionContact,
})

export type CollectionContactResponse = z.infer<
  typeof CollectionContactResponse
>

export const RenegotiateRequest = z.object({
  /** Cada título com a versão que a tela leu: sem ela, é last-write-wins. */
  entries: z
    .array(z.object({ id: z.uuid(), version: z.number().int().nonnegative() }))
    .min(1)
    .max(100),
  interestAmount: money('Juros com ponto decimal, por exemplo 10.00').default(
    '0.00'
  ),
  discountAmount: money(
    'Desconto com ponto decimal, por exemplo 10.00'
  ).default('0.00'),
  instalmentCount: z.number().int().min(1).max(60),
  firstDueAt: z.iso.datetime({ offset: true }),
  interval: z.enum(['monthly', 'days']).default('monthly'),
  intervalDays: z.number().int().min(1).max(365).optional(),
  reason: z.string().trim().min(3).max(500),
  expectedMethodId: z.uuid().nullable().default(null),
})

export type RenegotiateRequest = z.input<typeof RenegotiateRequest>
export type RenegotiateBody = z.output<typeof RenegotiateRequest>

export const RenegotiateResponse = z.object({
  renegotiationId: z.string(),
  cancelledEntryIds: z.array(z.string()),
  newTotal: z.string(),
  entries: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      dueAt: z.string(),
      amount: z.string(),
      instalmentNumber: z.number().int(),
      instalmentCount: z.number().int(),
    })
  ),
})

export type RenegotiateResponse = z.infer<typeof RenegotiateResponse>

export const SendCollectionTemplateRequest = z.object({
  accountId: z.uuid(),
  templateId: z.uuid(),
  values: z.array(z.string().max(1000)).max(20).default([]),
})

export type SendCollectionTemplateRequest = z.input<
  typeof SendCollectionTemplateRequest
>

export const SendCollectionTemplateResponse = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  contact: CollectionContact,
})

export type SendCollectionTemplateResponse = z.infer<
  typeof SendCollectionTemplateResponse
>
