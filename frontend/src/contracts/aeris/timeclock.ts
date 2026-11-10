import { z } from 'zod'

/**
 * O ponto dos funcionários (F339, ADR-0050): o contrato das rotas
 * `/api/v1/timeclock/*` (o gerente, logado) e `/api/v1/timeclock/device/*`
 * (o aparelho pareado, sem login). As listas espelham os CHECKs da 0180.
 */

export const TIMECLOCK_MODE_VALUES = ['loja', 'celular'] as const
export const TIMECLOCK_PUNCH_KIND_VALUES = [
  'entrada',
  'saida_almoco',
  'volta_almoco',
  'saida',
] as const
export const TIMECLOCK_PUNCH_FLAG_VALUES = [
  'ok',
  'fora_da_loja',
  'sem_localizacao',
] as const

export const TimeclockMode = z.enum(TIMECLOCK_MODE_VALUES)
export type TimeclockMode = z.infer<typeof TimeclockMode>
export const TimeclockPunchKind = z.enum(TIMECLOCK_PUNCH_KIND_VALUES)
export type TimeclockPunchKind = z.infer<typeof TimeclockPunchKind>
export const TimeclockPunchFlag = z.enum(TIMECLOCK_PUNCH_FLAG_VALUES)
export type TimeclockPunchFlag = z.infer<typeof TimeclockPunchFlag>

/** 4 a 6 dígitos: é o que se digita num teclado de tablet sem errar. */
export const TimeclockPin = z
  .string()
  .regex(/^\d{4,6}$/, 'O código tem de 4 a 6 números.')

const Modes = z
  .array(TimeclockMode)
  .min(1, 'Escolha onde a pessoa bate o ponto.')
  .max(2)
  .refine((modes) => new Set(modes).size === modes.length, 'Repetido.')

// ---------------------------------------------------------------------------
// O gerente
// ---------------------------------------------------------------------------

export const TimeclockMemberSchema = z.object({
  employeeId: z.string(),
  name: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  member: z
    .object({
      allowedModes: z.array(TimeclockMode),
      photoUrl: z.string().nullable(),
      consentAt: z.string().nullable(),
      lockedUntil: z.string().nullable(),
      version: z.number().int(),
    })
    .nullable(),
})
export type TimeclockMember = z.infer<typeof TimeclockMemberSchema>

export const TimeclockMemberListResponse = z.object({
  members: z.array(TimeclockMemberSchema),
})
export type TimeclockMemberListResponse = z.infer<
  typeof TimeclockMemberListResponse
>

export const SaveTimeclockMemberRequest = z.object({
  /** Ausente mantém o código que já existe. */
  pin: TimeclockPin.optional(),
  allowedModes: Modes,
  consent: z.boolean(),
  /** `null` no primeiro cadastro da pessoa no ponto. */
  version: z.number().int().nullable(),
})
export type SaveTimeclockMemberRequest = z.infer<
  typeof SaveTimeclockMemberRequest
>

/** Quem ainda não está na folha: cria o funcionário junto. */
export const CreateTimeclockMemberRequest = z.object({
  name: z.string().trim().min(1).max(120),
  branchId: z.uuid(),
  pin: TimeclockPin,
  allowedModes: Modes,
  consent: z.boolean(),
})
export type CreateTimeclockMemberRequest = z.infer<
  typeof CreateTimeclockMemberRequest
>

export const TimeclockMemberResponse = z.object({
  member: TimeclockMemberSchema,
})
export type TimeclockMemberResponse = z.infer<typeof TimeclockMemberResponse>

export const TimeclockDeviceSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  kind: TimeclockMode,
  employeeId: z.string().nullable(),
  employeeName: z.string().nullable(),
  name: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
})
export type TimeclockDevice = z.infer<typeof TimeclockDeviceSchema>

export const TimeclockDeviceListResponse = z.object({
  devices: z.array(TimeclockDeviceSchema),
})
export type TimeclockDeviceListResponse = z.infer<
  typeof TimeclockDeviceListResponse
>

export const CreateTimeclockDeviceRequest = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('loja'),
    branchId: z.uuid(),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({
    kind: z.literal('celular'),
    employeeId: z.uuid(),
    name: z.string().trim().min(1).max(80),
  }),
])
export type CreateTimeclockDeviceRequest = z.infer<
  typeof CreateTimeclockDeviceRequest
>

/**
 * O token sai uma vez só: o banco guarda o hash. O link vem pronto do servidor
 * (o endereço público do web, como o do Pix): no app desktop a página roda no
 * proxy local, e o tablet não abriria esse endereço. Nulo sem endereço público.
 */
export const CreateTimeclockDeviceResponse = z.object({
  device: TimeclockDeviceSchema,
  token: z.string(),
  link: z.string().nullable(),
})
export type CreateTimeclockDeviceResponse = z.infer<
  typeof CreateTimeclockDeviceResponse
>

export const RevokeTimeclockDeviceRequest = z.object({
  reason: z.string().trim().max(200).nullable(),
})

const coordinate = (limit: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(\.\d{1,6})?$/, 'Coordenada inválida.')
    .refine((value) => Math.abs(Number(value)) <= limit, 'Coordenada inválida.')

export const TimeclockBranchSettingSchema = z.object({
  branchId: z.string(),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  radiusM: z.number().int(),
  /** F376: o primeiro dia em que o ponto vale (`YYYY-MM-DD`); nulo, desde sempre. */
  officialFrom: z.string().nullable(),
  version: z.number().int().nullable(),
})
export type TimeclockBranchSetting = z.infer<
  typeof TimeclockBranchSettingSchema
>

export const TimeclockBranchSettingResponse = z.object({
  setting: TimeclockBranchSettingSchema,
})
export type TimeclockBranchSettingResponse = z.infer<
  typeof TimeclockBranchSettingResponse
>

export const SaveTimeclockBranchSettingRequest = z
  .object({
    latitude: coordinate(90).nullable(),
    longitude: coordinate(180).nullable(),
    radiusM: z.number().int().min(30).max(5000),
    /**
     * F376. Sem o campo, a data gravada continua; `null` volta a "desde
     * sempre".
     */
    officialFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Data inválida.')
      .nullable()
      .optional(),
    version: z.number().int().nullable(),
  })
  .refine(
    (body) => (body.latitude === null) === (body.longitude === null),
    'Latitude e longitude vão juntas.'
  )
export type SaveTimeclockBranchSettingRequest = z.infer<
  typeof SaveTimeclockBranchSettingRequest
>

export const TimeclockPunchSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  employeeId: z.string(),
  employeeName: z.string(),
  branchId: z.string(),
  deviceName: z.string(),
  kind: TimeclockPunchKind,
  punchedAt: z.string(),
  flag: TimeclockPunchFlag,
  distanceM: z.number().int().nullable(),
  accuracyM: z.number().int().nullable(),
  photoUrl: z.string(),
})
export type TimeclockPunch = z.infer<typeof TimeclockPunchSchema>

export const TimeclockPunchListResponse = z.object({
  punches: z.array(TimeclockPunchSchema),
})
export type TimeclockPunchListResponse = z.infer<
  typeof TimeclockPunchListResponse
>

/**
 * Uma marca do dia como ela vale (F340): a batida do aparelho ou a inclusão
 * do gerente. A anulada vem junto, com `voided`, para aparecer riscada.
 */
export const TimeclockMarkSchema = z.object({
  id: z.string(),
  source: z.enum(['batida', 'ajuste']),
  kind: TimeclockPunchKind,
  at: z.string(),
  /** Só na inclusão. */
  reason: z.string().nullable(),
  by: z.string().nullable(),
  voided: z.object({ reason: z.string(), by: z.string() }).nullable(),
  /** Só na batida. */
  photoUrl: z.string().nullable(),
  flag: TimeclockPunchFlag.nullable(),
  distanceM: z.number().int().nullable(),
  deviceName: z.string().nullable(),
  seq: z.number().int().nullable(),
})
export type TimeclockMark = z.infer<typeof TimeclockMarkSchema>

/**
 * F397: o motivo das férias e dos afastamentos. "folga" é a folga combinada
 * de vários dias (banco de horas, um acerto), que não é feriado nem escala.
 */
export const TIMECLOCK_LEAVE_KIND_VALUES = [
  'ferias',
  'atestado',
  'licenca',
  'folga',
] as const
export const TimeclockLeaveKind = z.enum(TIMECLOCK_LEAVE_KIND_VALUES)
export type TimeclockLeaveKind = z.infer<typeof TimeclockLeaveKind>

export const TIMECLOCK_SHIFT_KIND_VALUES = ['trabalho', 'folga'] as const
export const TimeclockShiftKind = z.enum(TIMECLOCK_SHIFT_KIND_VALUES)
export type TimeclockShiftKind = z.infer<typeof TimeclockShiftKind>

/** O turno resumido, como aparece num dia. */
export const TimeclockDayShiftSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: TimeclockShiftKind,
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
})

/** A aba Hoje: cada funcionário cadastrado no ponto e as marcas do dia. */
export const TimeclockTodayResponse = z.object({
  day: z.string(),
  people: z.array(
    z.object({
      employeeId: z.string(),
      name: z.string(),
      branchId: z.string(),
      branchName: z.string(),
      referencePhotoUrl: z.string().nullable(),
      inside: z.boolean(),
      shift: TimeclockDayShiftSchema.nullable(),
      /** Escalado, passou do começo mais a tolerância, e não entrou. */
      late: z.boolean(),
      /**
       * F380: o problema que o gerente resolve agora — não veio, atrasado
       * (ainda não entrou) ou esqueceu a saída; nulo quando está tudo certo.
       */
      alert: z.enum(['nao_veio', 'atrasado', 'esqueceu_saida']).nullable(),
      /** F380: entrou depois da tolerância; continua depois de chegar. */
      arrivedLate: z.boolean(),
      /** F380: o turno de hoje é de folga (inclusive o feriado). */
      dayOff: z.boolean(),
      /** F397: de férias ou afastada hoje; nulo quando não. */
      leave: TimeclockLeaveKind.nullable().default(null),
      marks: z.array(TimeclockMarkSchema),
    })
  ),
})
export type TimeclockTodayResponse = z.infer<typeof TimeclockTodayResponse>

// ---------------------------------------------------------------------------
// O aparelho
// ---------------------------------------------------------------------------

export const TimeclockDeviceMeResponse = z.object({
  device: z.object({
    kind: TimeclockMode,
    name: z.string(),
    branchName: z.string(),
  }),
  /** Pede a localização na batida: só no celular. */
  asksLocation: z.boolean(),
  members: z.array(
    z.object({
      employeeId: z.string(),
      name: z.string(),
      hasPhoto: z.boolean(),
      /** Muda quando a foto muda: o aparelho guarda a miniatura por ela. */
      photoKey: z.string().nullable(),
      next: TimeclockPunchKind,
      locked: z.boolean(),
    })
  ),
})
export type TimeclockDeviceMeResponse = z.infer<
  typeof TimeclockDeviceMeResponse
>

export const TimeclockDevicePunchResponse = z.object({
  punch: z.object({
    employeeName: z.string(),
    kind: TimeclockPunchKind,
    punchedAt: z.string(),
    flag: TimeclockPunchFlag,
  }),
})
export type TimeclockDevicePunchResponse = z.infer<
  typeof TimeclockDevicePunchResponse
>

// ---------------------------------------------------------------------------
// O ajuste e o espelho (F340)
// ---------------------------------------------------------------------------

const Reason = z.string().trim().min(3, 'Diga o motivo.').max(300)

export const CreateTimeclockAdjustmentRequest = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('incluir'),
    employeeId: z.uuid(),
    kind: TimeclockPunchKind,
    /** A hora da batida que faltou, ISO com fuso. */
    markedAt: z.iso.datetime({ offset: true }),
    reason: Reason,
  }),
  z
    .object({
      action: z.literal('anular'),
      punchId: z.uuid().optional(),
      adjustmentId: z.uuid().optional(),
      reason: Reason,
    })
    .refine(
      (body) =>
        (body.punchId === undefined) !== (body.adjustmentId === undefined),
      'Anule uma batida ou uma inclusão.'
    ),
])
export type CreateTimeclockAdjustmentRequest = z.infer<
  typeof CreateTimeclockAdjustmentRequest
>

export const TimeclockSheetDaySchema = z.object({
  day: z.string(),
  shift: TimeclockDayShiftSchema.nullable(),
  marks: z.array(TimeclockMarkSchema),
  workedMinutes: z.number().int(),
  scheduledMinutes: z.number().int(),
  lateMinutes: z.number().int(),
  earlyMinutes: z.number().int(),
  extraMinutes: z.number().int(),
  /** O dia fechou abaixo do previsto (almoço longo, saiu cedo): o que faltou. */
  shortMinutes: z.number().int(),
  incomplete: z.boolean(),
  /** F376: o dia ainda está acontecendo; não é incompleto nem tem saldo. */
  open: z.boolean(),
  /** F376: horas de um dia sem escala; não são extra até alguém escalar. */
  unscheduledMinutes: z.number().int(),
  absent: z.boolean(),
  note: z
    .enum([
      'sem_escala',
      'folga',
      'trabalhou_na_folga',
      'antes_do_inicio',
      'afastado',
    ])
    .nullable(),
  /** F397: as férias ou o afastamento do dia; nulo quando não há. */
  leave: TimeclockLeaveKind.nullable().default(null),
  /** Tem inclusão ou anulação neste dia. */
  adjusted: z.boolean(),
})
export type TimeclockSheetDay = z.infer<typeof TimeclockSheetDaySchema>

export const TimeclockSheetResponse = z.object({
  employee: z.object({
    employeeId: z.string(),
    name: z.string(),
    branchName: z.string(),
  }),
  month: z.string(),
  /** F376: o dia em que o ponto passou a valer nesta loja. */
  officialFrom: z.string().nullable(),
  days: z.array(TimeclockSheetDaySchema),
  totals: z.object({
    workedMinutes: z.number().int(),
    scheduledMinutes: z.number().int(),
    lateMinutes: z.number().int(),
    earlyMinutes: z.number().int(),
    extraMinutes: z.number().int(),
    shortMinutes: z.number().int(),
    absences: z.number().int(),
    incompleteDays: z.number().int(),
    /** F376: as horas e os dias com marca e sem escala. */
    unscheduledMinutes: z.number().int(),
    unscheduledDays: z.number().int(),
    /** F397: os dias de férias ou afastamento no mês. */
    leaveDays: z.number().int().default(0),
  }),
})
export type TimeclockSheetResponse = z.infer<typeof TimeclockSheetResponse>

// ---------------------------------------------------------------------------
// A escala (F341)
// ---------------------------------------------------------------------------

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, 'Hora inválida.')

export const TimeclockShiftSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: TimeclockShiftKind,
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  breakMinutes: z.number().int(),
  archived: z.boolean(),
  version: z.number().int(),
})
export type TimeclockShift = z.infer<typeof TimeclockShiftSchema>

export const TimeclockShiftListResponse = z.object({
  shifts: z.array(TimeclockShiftSchema),
})
export type TimeclockShiftListResponse = z.infer<
  typeof TimeclockShiftListResponse
>

const ShiftFields = z.object({
  name: z.string().trim().min(1).max(40),
  kind: TimeclockShiftKind,
  startsAt: Clock.nullable(),
  endsAt: Clock.nullable(),
  breakMinutes: z.number().int().min(0).max(240),
})

const shiftShape = (body: z.infer<typeof ShiftFields>): boolean =>
  body.kind === 'folga'
    ? body.startsAt === null && body.endsAt === null && body.breakMinutes === 0
    : body.startsAt !== null &&
      body.endsAt !== null &&
      body.startsAt !== body.endsAt

const SHIFT_SHAPE = 'Folga não tem horário; turno de trabalho tem começo e fim.'

export const CreateTimeclockShiftRequest = ShiftFields.refine(
  shiftShape,
  SHIFT_SHAPE
)
export type CreateTimeclockShiftRequest = z.infer<
  typeof CreateTimeclockShiftRequest
>

export const UpdateTimeclockShiftRequest = ShiftFields.extend({
  archived: z.boolean(),
  version: z.number().int(),
}).refine(shiftShape, SHIFT_SHAPE)
export type UpdateTimeclockShiftRequest = z.infer<
  typeof UpdateTimeclockShiftRequest
>

export const TimeclockScheduleResponse = z.object({
  /** A segunda-feira da semana. */
  week: z.string(),
  days: z.array(z.string()),
  people: z.array(
    z.object({
      employeeId: z.string(),
      name: z.string(),
      cells: z.array(
        z.object({
          day: z.string(),
          /** O turno que vale no dia (a exceção ou a escala fixa). */
          shiftId: z.string().nullable(),
          /** F379: de onde veio o turno; nulo é dia sem escala. */
          source: z.enum(['excecao', 'padrao']).nullable(),
          /** F379: o que a escala fixa daria nesse dia. */
          patternShiftId: z.string().nullable(),
          /** A versão da EXCEÇÃO do dia; nula quando não há exceção. */
          version: z.number().int().nullable(),
          /** F397: de férias ou afastada no dia; vale por cima do turno. */
          leave: TimeclockLeaveKind.nullable().default(null),
        })
      ),
    })
  ),
})
export type TimeclockScheduleResponse = z.infer<
  typeof TimeclockScheduleResponse
>

export const SaveTimeclockScheduleRequest = z.object({
  cells: z
    .array(
      z.object({
        employeeId: z.uuid(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        shiftId: z.uuid().nullable(),
        /** A versão que a tela viu; `null` = a célula estava vazia. */
        version: z.number().int().nullable(),
      })
    )
    .min(1)
    .max(500),
})
export type SaveTimeclockScheduleRequest = z.infer<
  typeof SaveTimeclockScheduleRequest
>

export const CopyTimeclockScheduleRequest = z.object({
  branchId: z.uuid(),
  fromWeek: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  toWeek: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
})
export type CopyTimeclockScheduleRequest = z.infer<
  typeof CopyTimeclockScheduleRequest
>

export const CopyTimeclockScheduleResponse = z.object({
  copied: z.number().int(),
})
export type CopyTimeclockScheduleResponse = z.infer<
  typeof CopyTimeclockScheduleResponse
>

// ---------------------------------------------------------------------------
// A escala fixa (F379)
// ---------------------------------------------------------------------------

const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Data inválida.')

/** Segunda a domingo; nulo é o dia sem turno. */
const WeekDays = z.array(z.uuid().nullable()).length(7)

export const TimeclockPatternListResponse = z.object({
  /** Hoje em São Paulo: a versão vigente é a última que começa até hoje. */
  today: z.string(),
  people: z.array(
    z.object({
      employeeId: z.string(),
      name: z.string(),
      /** As versões em ordem de `validFrom`, inclusive as que ainda vão valer. */
      versions: z.array(
        z.object({
          validFrom: z.string(),
          days: z.array(z.string().nullable()).length(7),
        })
      ),
    })
  ),
})
export type TimeclockPatternListResponse = z.infer<
  typeof TimeclockPatternListResponse
>

export const SaveTimeclockPatternRequest = z.object({
  /** De hoje em diante: a escala fixa não reescreve dia que já passou. */
  validFrom: IsoDay,
  people: z
    .array(z.object({ employeeId: z.uuid(), days: WeekDays }))
    .min(1)
    .max(200),
})
export type SaveTimeclockPatternRequest = z.infer<
  typeof SaveTimeclockPatternRequest
>

// ---------------------------------------------------------------------------
// Férias e afastamentos (F397)
// ---------------------------------------------------------------------------

export const TimeclockLeaveSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  kind: TimeclockLeaveKind,
  /** `YYYY-MM-DD`, inclusive nas duas pontas. */
  startsOn: z.string(),
  endsOn: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  /** Lançado errado: fica na lista, riscado, e não conta mais. */
  voidedAt: z.string().nullable(),
  voidedByName: z.string().nullable(),
})
export type TimeclockLeave = z.infer<typeof TimeclockLeaveSchema>

export const TimeclockLeaveListResponse = z.object({
  leaves: z.array(TimeclockLeaveSchema),
})
export type TimeclockLeaveListResponse = z.infer<
  typeof TimeclockLeaveListResponse
>

export const CreateTimeclockLeaveRequest = z
  .object({
    employeeId: z.uuid(),
    kind: TimeclockLeaveKind,
    startsOn: IsoDay,
    endsOn: IsoDay,
    note: z
      .string()
      .trim()
      .max(300)
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .default(null),
  })
  .refine((body) => body.endsOn >= body.startsOn, {
    message: 'A volta não pode ser antes da saída.',
    path: ['endsOn'],
  })
export type CreateTimeclockLeaveRequest = z.input<
  typeof CreateTimeclockLeaveRequest
>
