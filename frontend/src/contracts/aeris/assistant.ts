import { z } from 'zod'

/**
 * O assistente (F253–F255): as conexões do Claude, e — na F254 — o número do
 * WhatsApp, as pessoas ligadas e o histórico.
 */

/** Uma conexão viva do Claude com esta loja. */
export const ClaudeConnection = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  userName: z.string().nullable(),
  clientName: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  /** É da pessoa que está olhando: ela pode desconectar. */
  mine: z.boolean(),
})

export type ClaudeConnection = z.infer<typeof ClaudeConnection>

export const ClaudeConnectionsResponse = z.object({
  /** O endereço para colar no Claude: `https://api.aerisone.com.br/mcp`. */
  mcpUrl: z.string(),
  connections: z.array(ClaudeConnection),
})

export type ClaudeConnectionsResponse = z.infer<
  typeof ClaudeConnectionsResponse
>

/**
 * As últimas consultas que o Claude e o assistente fizeram (F295): quem,
 * qual ferramenta, se deu certo e quanto demorou. Sem o resultado.
 */
export const AssistantToolCall = z.object({
  id: z.uuid(),
  userName: z.string().nullable(),
  channel: z.enum(['mcp', 'whatsapp', 'digest']),
  tool: z.string(),
  args: z.string(),
  status: z.string(),
  durationMs: z.number().int(),
  createdAt: z.string(),
})

export type AssistantToolCall = z.infer<typeof AssistantToolCall>

export const AssistantToolCallsResponse = z.object({
  calls: z.array(AssistantToolCall),
})

export type AssistantToolCallsResponse = z.infer<
  typeof AssistantToolCallsResponse
>

// ---------------------------------------------------------------------------
// O WhatsApp do assistente (F254)
// ---------------------------------------------------------------------------

export const AssistantSettings = z.object({
  enabled: z.boolean(),
  questionsPerUserPerHour: z.number().int(),
  consentAt: z.string().nullable(),
  /** Os horários do resumo do dia, "HH:MM" no relógio da loja (F255). */
  digestTimes: z.array(z.string()),
  /** Os dias do resumo: 0 = domingo … 6 = sábado. */
  digestDays: z.array(z.number().int()),
  version: z.number().int().nullable(),
})

export type AssistantSettings = z.infer<typeof AssistantSettings>

export const AssistantSettingsResponse = z.object({
  settings: AssistantSettings,
  /** O número do Aeris (F256); nulo enquanto a Plataforma não liga um. */
  assistantPhone: z.string().nullable(),
  /** Em dólar, texto decimal: o gasto do mês e o teto da conta. */
  spentMonthUsd: z.string(),
  monthlyCapUsd: z.string(),
})

export type AssistantSettingsResponse = z.infer<
  typeof AssistantSettingsResponse
>

export const SaveAssistantSettingsRequest = z.object({
  enabled: z.boolean(),
  questionsPerUserPerHour: z.number().int().min(1).max(200),
  /** A loja aceita que os números dela vão à OpenAI pelo Aeris One (F256). */
  consent: z.boolean(),
  /** Sem os campos, os horários e os dias ficam como estão. */
  digestTimes: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .max(6)
    .optional(),
  digestDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  version: z.number().int().nullable(),
})

export type SaveAssistantSettingsRequest = z.infer<
  typeof SaveAssistantSettingsRequest
>

/** O WhatsApp de uma pessoa ligado ao assistente. */
export const AssistantLink = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  /** Quem usa o número: o nome dado a ele (F276) ou, sem nome, o da conta. */
  userName: z.string().nullable(),
  /** O nome dado a este número (F276); nulo: vale o da conta. */
  personName: z.string().nullable().default(null),
  /** O nome da pessoa da conta, dona do número. */
  accountName: z.string().nullable().default(null),
  /** Mascarado: "(31) 9•••-•347". */
  phone: z.string().nullable(),
  receivesDigest: z.boolean(),
  /** O dono liberou este número do limite por hora (F276). */
  hourlyUnlimited: z.boolean().default(false),
  linkedAt: z.string(),
  lastMessageAt: z.string().nullable(),
})

export type AssistantLink = z.infer<typeof AssistantLink>

/** O dono libera um número do limite por hora (F276). */
export const UpdateAssistantLinkRequest = z.object({
  hourlyUnlimited: z.boolean(),
})

export type UpdateAssistantLinkRequest = z.infer<
  typeof UpdateAssistantLinkRequest
>

export const AssistantLinksResponse = z.object({
  links: z.array(AssistantLink),
})

export const MyAssistantWhatsappResponse = z.object({
  /** O assistente está ligado e tem número. */
  available: z.boolean(),
  assistantPhone: z.string().nullable(),
  /** Os números ligados da pessoa, do mais antigo ao mais novo (F273). */
  links: z.array(AssistantLink).default([]),
  /** Quantos números a pessoa pode ligar (F273). */
  maxLinks: z.number().int().positive().default(1),
  /** O primeiro de `links` — para a tela de antes da F273. */
  link: AssistantLink.nullable(),
  /** Os horários do resumo do dia, para a pessoa saber quando chega (F255). */
  digestTimes: z.array(z.string()),
})

export type MyAssistantWhatsappResponse = z.infer<
  typeof MyAssistantWhatsappResponse
>

export const AssistantLinkCodeResponse = z.object({
  code: z.string(),
  expiresAt: z.string(),
  /** Abre o WhatsApp no número do assistente com o código já escrito. */
  waMeUrl: z.string(),
})

export type AssistantLinkCodeResponse = z.infer<
  typeof AssistantLinkCodeResponse
>

/** O nome de quem usa um número — a mesma regra do "Nome" do convite (F276). */
export const AssistantPersonName = z
  .string()
  .trim()
  .min(1, 'Informe o nome')
  .max(200)

/** F276: o código já leva o nome de quem vai usar o número. */
export const CreateAssistantLinkCodeRequest = z.object({
  personName: AssistantPersonName,
})

export type CreateAssistantLinkCodeRequest = z.infer<
  typeof CreateAssistantLinkCodeRequest
>

export const MyAssistantLinkParams = z.object({ linkId: z.uuid() })

/** Liga/desliga o resumo e/ou troca o nome de quem usa o número (F276). */
export const UpdateMyAssistantWhatsappRequest = z
  .object({
    receivesDigest: z.boolean().optional(),
    personName: AssistantPersonName.optional(),
  })
  .refine(
    (body) =>
      body.receivesDigest !== undefined || body.personName !== undefined,
    { message: 'Nada para mudar.' }
  )

export type UpdateMyAssistantWhatsappRequest = z.infer<
  typeof UpdateMyAssistantWhatsappRequest
>

export const AssistantExchange = z.object({
  id: z.uuid(),
  userName: z.string().nullable(),
  question: z.string(),
  answer: z.string().nullable(),
  status: z.enum(['queued', 'answering', 'answered', 'failed', 'refused']),
  toolCalls: z.number().int(),
  costUsd: z.string(),
  createdAt: z.string(),
})

export const AssistantExchangesQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const AssistantExchangesResponse = z.object({
  items: z.array(AssistantExchange),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export type AssistantExchangesResponse = z.infer<
  typeof AssistantExchangesResponse
>

// ---------------------------------------------------------------------------
// O número do Aeris, na Plataforma (F256)
// ---------------------------------------------------------------------------

export const PlatformAssistantResponse = z.object({
  serverId: z.uuid().nullable(),
  instanceId: z.string().nullable(),
  instanceName: z.string().nullable(),
  linkedPhone: z.string().nullable(),
  status: z.enum(['unlinked', 'pairing', 'active']),
  hasLlmKey: z.boolean(),
  llmModel: z.string().nullable(),
  defaultModel: z.string(),
  /** Em dólar, texto decimal ("5.00"). */
  defaultMonthlyCapUsd: z.string(),
  version: z.number().int().nullable(),
})

export type PlatformAssistantResponse = z.infer<
  typeof PlatformAssistantResponse
>

export const SavePlatformAssistantRequest = z.object({
  /** Ausente: mantém a chave gravada. `null`: apaga. */
  llmKey: z.string().trim().min(20).max(400).nullable().optional(),
  llmModel: z.string().trim().min(1).max(60).nullable(),
  defaultMonthlyCapUsd: z.string().regex(/^\d{1,4}(\.\d{1,2})?$/),
  version: z.number().int().nullable(),
})

export type SavePlatformAssistantRequest = z.infer<
  typeof SavePlatformAssistantRequest
>

/** Uma instância do servidor, para escolher a do número do Aeris. */
export const PlatformAssistantInstance = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  loggedIn: z.boolean(),
  /**
   * `aeris`: já é o número do Aeris. `store`: é de uma loja (não serve).
   * `elsewhere`: manda para outro sistema. `none`: livre.
   */
  use: z.enum(['aeris', 'store', 'elsewhere', 'none']),
  storeName: z.string().nullable(),
  webhookHost: z.string().nullable(),
})

export type PlatformAssistantInstance = z.infer<
  typeof PlatformAssistantInstance
>

export const PlatformAssistantInstancesResponse = z.object({
  instances: z.array(PlatformAssistantInstance),
})

export const LinkPlatformAssistantRequest = z.object({
  serverId: z.uuid(),
  instanceId: z.string().trim().min(1).max(128),
  /** Confirma tirar a instância de outro sistema (o webhook dela muda). */
  replaceWebhook: z.boolean(),
  version: z.number().int().nullable(),
})

export type LinkPlatformAssistantRequest = z.infer<
  typeof LinkPlatformAssistantRequest
>

export const PlatformAssistantPairing = z.object({
  state: z.enum(['paired', 'qr', 'waiting']),
  /** A imagem do QR (data URL), quando `state` é `qr`. */
  qrCode: z.string().nullable(),
  linkedPhone: z.string().nullable(),
})

export type PlatformAssistantPairing = z.infer<typeof PlatformAssistantPairing>

/** O assistente de uma conta, visto da Plataforma. */
export const PlatformAccountAssistant = z.object({
  enabled: z.boolean(),
  linkedPeople: z.number().int(),
  spentMonthUsd: z.string(),
  questionsMonth: z.number().int(),
  /** O teto próprio da conta; nulo = o padrão. */
  monthlyCapUsd: z.string().nullable(),
  defaultMonthlyCapUsd: z.string(),
})

export type PlatformAccountAssistant = z.infer<typeof PlatformAccountAssistant>

export const SetAccountAssistantCapRequest = z.object({
  monthlyCapUsd: z
    .string()
    .regex(/^\d{1,4}(\.\d{1,2})?$/)
    .nullable(),
})

export type SetAccountAssistantCapRequest = z.infer<
  typeof SetAccountAssistantCapRequest
>
