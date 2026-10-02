import { z } from 'zod'

import { ChannelAccountStatusSchema } from './communication.ts'

/**
 * Os servidores de WhatsApp por aparelho vinculado e as instâncias de cada
 * loja — o console da plataforma (F192, ADR-0039).
 *
 * Nenhum schema aqui carrega um token. O de administração do servidor enxerga
 * as instâncias de todos os clientes; o de uma instância lê e manda mensagem
 * por aquele número. Os dois entram pela tela e nunca voltam: o schema de
 * resposta é a lista de permissão de saída (ADR-0005).
 */

/** Sem barra no fim — `https://wz.viboralabs.com.br`. */
const baseUrl = z
  .string()
  .trim()
  .regex(
    /^https?:\/\/[^/\s]+(\/[^\s]*)?$/,
    'Informe o endereço completo, começando por https://.'
  )
  .transform((value) => value.replace(/\/+$/, ''))

export const MessagingServerSummary = z.object({
  id: z.string(),
  kind: z.literal('wuzapi'),
  name: z.string(),
  baseUrl: z.string(),
  version: z.number().int(),
  updatedAt: z.string(),
})

export type MessagingServerSummary = z.infer<typeof MessagingServerSummary>

/** O `/health` do servidor — o "Testar" da tela. */
export const MessagingServerHealth = z.object({
  reachable: z.boolean(),
  version: z.string().nullable(),
  totalUsers: z.number().int().nullable(),
  loggedInUsers: z.number().int().nullable(),
  error: z.string().nullable(),
})

export type MessagingServerHealth = z.infer<typeof MessagingServerHealth>

export const MessagingServerList = z.object({
  servers: z.array(MessagingServerSummary),
})

export type MessagingServerList = z.infer<typeof MessagingServerList>

/**
 * Cadastrar ou editar um servidor. `adminToken: null` na edição mantém o
 * gravado — a tela nunca o recebe de volta para reenviar. `version: 0` cria.
 */
export const SaveMessagingServerRequest = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl,
  adminToken: z.string().trim().min(8).max(500).nullable(),
  version: z.number().int().min(0),
})

export type SaveMessagingServerRequest = z.infer<
  typeof SaveMessagingServerRequest
>

export const MessagingServerResponse = z.object({
  server: MessagingServerSummary,
  health: MessagingServerHealth,
})

export type MessagingServerResponse = z.infer<typeof MessagingServerResponse>

/**
 * Para onde o webhook da instância aponta HOJE — o que a tela precisa mostrar
 * antes de vincular, porque a WuzAPI aceita um webhook só e vincular troca o
 * que estiver lá.
 *
 * `none`: ninguém recebe. `this_account`: já é desta loja. `other_account`: é
 * de OUTRA loja deste Aeris. `elsewhere`: outro sistema recebe hoje — vincular
 * o desliga dele.
 */
export const WhatsappInstanceWebhookState = z.enum([
  'none',
  'this_account',
  'other_account',
  'elsewhere',
])

export const PlatformWhatsappInstance = z.object({
  id: z.string(),
  name: z.string(),
  /** O número pareado, só dígitos; nulo enquanto ninguém leu o QR. */
  phone: z.string().nullable(),
  connected: z.boolean(),
  loggedIn: z.boolean(),
  webhook: WhatsappInstanceWebhookState,
  /** O HOST do webhook atual — nunca a URL inteira, que pode carregar segredo. */
  webhookHost: z.string().nullable(),
  /** A loja do Aeris a que a instância está vinculada, quando está. */
  linkedTenantName: z.string().nullable(),
  /** A conta desta loja, quando a instância é daqui. */
  linkedAccountId: z.string().nullable(),
})

export type PlatformWhatsappInstance = z.infer<typeof PlatformWhatsappInstance>

export const PlatformWhatsappInstancesResponse = z.object({
  serverId: z.string(),
  instances: z.array(PlatformWhatsappInstance),
})

export type PlatformWhatsappInstancesResponse = z.infer<
  typeof PlatformWhatsappInstancesResponse
>

export const LinkWhatsappInstanceRequest = z.object({
  serverId: z.uuid(),
  instanceId: z.string().trim().min(1).max(200),
  /** O nome que a loja vê. Ausente: o nome da instância no servidor. */
  displayName: z.string().trim().min(1).max(120).optional(),
  /**
   * A confirmação explícita de que o webhook atual (de outro sistema) pode ser
   * trocado. Sem ela, vincular uma instância que alimenta outro sistema é
   * recusado — o dono precisa ver o que vai desligar.
   */
  replaceWebhook: z.boolean().default(false),
})

export type LinkWhatsappInstanceRequest = z.infer<
  typeof LinkWhatsappInstanceRequest
>

export const LinkWhatsappInstanceResponse = z.object({
  accountId: z.string(),
  status: ChannelAccountStatusSchema,
})

export type LinkWhatsappInstanceResponse = z.infer<
  typeof LinkWhatsappInstanceResponse
>
