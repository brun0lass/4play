import { z } from 'zod'

import { TagRefSchema } from './tag.ts'

/**
 * Contas de canal do atendimento (F045).
 *
 * O que NÃO está em nenhum schema aqui é uma credencial: nem a service key
 * do PostgREST, nem o token do webhook. `hasCredentials` é o que
 * uma tela pode saber — presença, não valor, o mesmo padrão da F032 para o
 * Mercado Livre.
 */

export const ChannelAccountKindSchema = z.enum(['whatsapp'])
/** `pairing` (F192): a instância é da loja e ninguém leu o QR ainda. */
export const ChannelAccountStatusSchema = z.enum([
  'active',
  'disconnected',
  'pairing',
])
/**
 * COMO a conta está no WhatsApp (F192, ADR-0039): `cloud_api` é a API oficial
 * (janela de 24 h, modelo, custo), `linked_device` é o aparelho vinculado
 * (responde a qualquer hora, sem modelo, sem campanha).
 */
export const ChannelConnectionSchema = z.enum(['cloud_api', 'linked_device'])

/**
 * O identificador da conta NO GATEWAY — e não um telefone (F072).
 *
 * Este campo já se chamou "o número, em E.164", e a validação era a de um
 * telefone: `/^\+?[1-9]\d{7,14}$/`, oito a quinze dígitos. Estava errado, e o
 * erro só apareceu quando a primeira conta real foi cadastrada.
 *
 * O que o OpenBSP usa como identidade de uma conta é o `phone_number_id` da
 * Meta, não o telefone. `buildOrgAddressMap` procura
 * `organizations_addresses` por `.in("address", [...phone_number_ids])`, e
 * `messages.organization_address` é cópia desse `address`. Ou seja: **todo
 * evento chega com o ID**, e é ele que o índice externo precisa casar. O
 * telefone humano fica em `extra.phone_number`, que nenhum webhook de mensagem
 * carrega.
 *
 * Na instalação do dono: `address = 1235188929669631` (dezesseis dígitos, que
 * a regra antiga recusava) para o telefone `5518981871113`.
 *
 * Continua sendo dígitos, e continua tolerando o `+` à frente — um gateway
 * futuro pode muito bem usar o próprio número como identidade, e recusar isso
 * seria trocar um engessamento por outro. O teto de vinte é folga sobre os
 * dezesseis observados, sem virar campo de texto livre.
 *
 * A metade que falta — mostrar o telefone que uma pessoa reconhece, ao lado do
 * identificador — é a opção B do bloqueio, adiada de propósito: é exibição, e a
 * hora dela é depois de as mensagens estarem entrando.
 */
const GATEWAY_ADDRESS_PATTERN = /^\+?[1-9]\d{7,19}$/

/**
 * Exportado, e não um regex solto, porque a F072 corrigiu o limite AQUI e
 * deixou uma cópia de quinze dígitos viva em `channel-account-form.tsx` — o
 * servidor aceitava o identificador real e a tela recusava, com a frase antiga
 * sobre E.164. Quem cadastrou a primeira conta de verdade nunca chegou à API.
 *
 * Uma regra que vale para os dois lados mora num lugar só. O frontend valida
 * cedo para dizer o que está errado antes do envio, não para ter opinião
 * própria sobre o que é válido.
 */
export const GatewayAddressSchema = z
  .string()
  .trim()
  .regex(
    GATEWAY_ADDRESS_PATTERN,
    'O identificador do número deve ter só dígitos, como o OpenBSP mostra.'
  )

/**
 * A chave de API da ORGANIZAÇÃO no gateway — e não a chave da instalação.
 *
 * O painel do OpenBSP mostra as duas juntas, na mesma tela, e a de cima é a
 * errada: um JWT `eyJ...` rotulado `authorization`, que é a publishable key do
 * Supabase (`role: anon`) e vale para todas as organizações. A certa é a de
 * baixo, `sk_...`, que identifica esta organização.
 *
 * Guardar o JWT aqui não dá erro nenhum na hora. O gateway só reclama depois,
 * do outro lado, e com uma frase que não aponta para este campo — o middleware
 * dele decide o caminho por `token.startsWith("eyJ")`, cai no ramo de sessão de
 * usuário, e responde `401 Invalid JWT: missing sub claim`. O Aeris traduz isso
 * para "o gateway recusou a credencial apresentada", que é verdade e não ajuda
 * ninguém a achar o engano.
 *
 * Foi o que aconteceu na instalação do dono: o JWT ficou na conta, o `sk_` não
 * foi para lugar nenhum, e `reconcile` e `templates-sync` deram 401 por dez
 * horas sem que nada na tela indicasse a causa.
 *
 * Por isso a recusa é aqui, com o nome do que a pessoa colou. O `eyJ` é o
 * cabeçalho `{"alg":...` em base64 — todo JWT começa assim, e nenhuma chave de
 * organização começa.
 */
export const ServiceKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => !value.startsWith('eyJ'),
    'Isso é a chave da instalação (a publishable key, o JWT que começa com "eyJ"), não a chave desta organização. A certa aparece logo abaixo dela no painel do OpenBSP e começa com "sk_".'
  )

export const ChannelAccountSummary = z.object({
  id: z.string(),
  kind: ChannelAccountKindSchema,
  /** `default` porque o cliente pode estar mais novo que o servidor. */
  connection: ChannelConnectionSchema.default('cloud_api'),
  openbspOrgId: z.string(),
  address: z.string(),
  displayName: z.string(),
  status: ChannelAccountStatusSchema,
  /** O número do aparelho pareado, só dígitos (F192). */
  linkedPhone: z.string().nullable().default(null),
  /** O último problema que o gateway relatou, em português (F192). */
  lastError: z.string().nullable().default(null),
  throughputMps: z.number().int(),
  hasCredentials: z.boolean(),
  /** Quem atende por este número (F210). */
  ownerUserId: z.string().nullable().default(null),
  version: z.number().int(),
})

export const ChannelAccountListResponse = z.object({
  accounts: z.array(ChannelAccountSummary),
})

export const ChannelAccountCreate = z.object({
  kind: ChannelAccountKindSchema.default('whatsapp'),
  openbspOrgId: z.string().trim().min(1).max(120),
  address: GatewayAddressSchema,
  displayName: z.string().trim().min(1).max(120),
  /**
   * 20 é o teto fixo da coexistência do WhatsApp. O campo existe para o dia
   * em que uma conta migrar para a Cloud API pura, não porque a maioria vai
   * mudá-lo.
   */
  throughputMps: z.coerce.number().int().min(1).max(1000).default(20),
  /**
   * `null` significa "sem credenciais ainda" — uma conta pode ser cadastrada
   * antes de o gateway estar pronto. Quando presente, cifradas no servidor
   * antes de tocar o banco; nunca voltam numa resposta.
   */
  serviceKey: ServiceKeySchema.nullable().default(null),
  /**
   * O segredo do webhook é OBRIGATÓRIO, e é a única credencial aqui que é.
   *
   * O endpoint que recebe os eventos é público por necessidade — o gateway
   * não tem sessão. O que separa um evento do gateway de um evento inventado
   * por qualquer um é este segredo, e nada mais: o par (organização,
   * número) não serve de segredo, porque o número de telefone da loja está
   * no site dela.
   *
   * Ele viaja como TOKEN, não como assinatura — o OpenBSP manda a cadeia crua
   * em `Authorization: Bearer` (F071). Um token fixo é mais fraco que um HMAC
   * do corpo, e é o que este gateway sabe mandar; ver `verifyToken` em
   * @aeris/openbsp para a troca por extenso.
   *
   * É aqui que este webhook difere do molde do Mercado Livre. Lá o corpo é
   * uma campainha e o pedido é buscado de volta com a credencial da loja, de
   * modo que um corpo forjado não vira dado. Aqui o CORPO É O DADO: aceitar
   * um evento sem credencial é aceitar que um estranho escreva uma mensagem
   * na caixa de entrada de um cliente.
   */
  webhookSecret: z.string().trim().min(1).max(500),
})

/**
 * O que a exclusão de uma conta destruiu (F076).
 *
 * A rota devolvia 204 sem corpo, quando apagar só era possível numa conta
 * vazia. Desde que ela passou a levar os dados junto, o silêncio virou o
 * problema: a pessoa confirmava e não ficava sabendo o tamanho do que sumiu.
 * Estes números aparecem na tela depois da exclusão e ficam na auditoria.
 *
 * `detachedEvents` é o único que NÃO foi apagado — os eventos crus do gateway
 * são soltos da conta e sobrevivem a ela.
 */
export const ChannelAccountRemovalResponse = z.object({
  conversations: z.number().int(),
  messages: z.number().int(),
  contacts: z.number().int(),
  tickets: z.number().int(),
  templates: z.number().int(),
  rules: z.number().int(),
  campaigns: z.number().int(),
  detachedEvents: z.number().int(),
})

export const ChannelAccountUpdate = z.object({
  displayName: z.string().trim().min(1).max(120),
  status: ChannelAccountStatusSchema,
  throughputMps: z.coerce.number().int().min(1).max(1000),
  /** `null` (o padrão) significa "não mexa nas credenciais desta vez". */
  serviceKey: ServiceKeySchema.nullable().default(null),
  webhookSecret: z.string().trim().min(1).max(500).nullable().default(null),
  version: z.number().int().min(1),
})

export type ChannelAccountCreateBody = z.infer<typeof ChannelAccountCreate>
export type ChannelAccountUpdateBody = z.infer<typeof ChannelAccountUpdate>

/**
 * Parear o aparelho de uma conta WuzAPI (F192).
 *
 * Dois caminhos: o QR (para quem tem o celular na mão e o Aeris numa outra
 * tela) e o código de oito letras pelo número (para quem só tem o celular — não
 * dá para ler um QR mostrado no próprio aparelho).
 */
export const ChannelPairingStartRequest = z
  .object({
    method: z.enum(['qr', 'phone']),
    /** Só dígitos, com DDI: `5531977770000`. Obrigatório quando `method` é `phone`. */
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/\D/g, ''))
      .pipe(
        z
          .string()
          .regex(
            /^[1-9]\d{9,14}$/,
            'Informe o número com DDI e DDD, só dígitos.'
          )
      )
      .optional(),
  })
  .refine((value) => value.method !== 'phone' || value.phone !== undefined, {
    message: 'Informe o número do celular que vai ser conectado.',
    path: ['phone'],
  })

export type ChannelPairingStartBody = z.infer<typeof ChannelPairingStartRequest>

/**
 * Onde o pareamento está. `qr`: há um QR para ler (ele gira; a tela pergunta de
 * novo). `code`: há um código para digitar no celular. `waiting`: o WhatsApp
 * ainda não mandou o primeiro código. `paired`: pronto. `passkey`: o aparelho
 * pediu pareamento por chave de acesso, que o Aeris não conduz — use o painel
 * do servidor.
 */
export const ChannelPairingStateSchema = z.object({
  state: z.enum(['paired', 'qr', 'code', 'waiting', 'passkey']),
  /** `data:image/png;base64,…` — a imagem do QR como a WuzAPI a gera. */
  qrCode: z.string().nullable(),
  linkingCode: z.string().nullable(),
  account: ChannelAccountSummary,
})

export type ChannelPairingState = z.infer<typeof ChannelPairingStateSchema>

/** O estado da conexão lido do servidor agora, e a conta já atualizada com ele. */
export const ChannelConnectionCheckResponse = z.object({
  connected: z.boolean(),
  loggedIn: z.boolean(),
  phone: z.string().nullable(),
  account: ChannelAccountSummary,
})

export type ChannelConnectionCheckResponse = z.infer<
  typeof ChannelConnectionCheckResponse
>

/**
 * O inbox: conversa e mensagem (F046).
 *
 * Nada aqui expõe uma credencial — as mesmas contas de canal acima. O que é
 * novo é o `pricing` de uma mensagem, cru, e o `costMicrosUsd`, que viaja
 * como STRING mesmo sendo um inteiro: dinheiro nunca é um `number` do JSON
 * (IEEE-754), nem quando ainda vale `null` nesta feature — ver o comentário
 * na migração 0033.
 */
const instant = z.iso.datetime({ offset: true })

export const ConversationStateSchema = z.enum(['open', 'pending', 'resolved'])
export const MessageDirectionSchema = z.enum(['in', 'out'])
export const MessageKindSchema = z.enum([
  'text',
  'image',
  'audio',
  'video',
  'document',
  'sticker',
  'template',
  'interactive',
  'system',
])
export const MessageStatusSchema = z.enum([
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
])
export const MessageOriginSchema = z.enum([
  'agent',
  'bot',
  'echo',
  'history',
  'campaign',
  'followup',
  'system',
  'automation',
])

export const ConversationSummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  /**
   * O nome do número por onde esta conversa chega (F091) — "Vibora Labs".
   *
   * Vem junto da conversa em vez de ser buscado à parte porque o inbox é lido
   * por `cashier` e `salesperson`, que NÃO têm `communication.channel.read`.
   * Ver o comentário no repositório para a permissão inteira.
   *
   * Nunca nulo: `account_id` é `not null` com chave estrangeira.
   */
  accountDisplayName: z.string(),
  /**
   * Como a conta desta conversa está ligada ao WhatsApp (F192). É o que diz à
   * tela se existe janela de 24 horas e modelo — o aparelho vinculado não tem.
   */
  accountConnection: ChannelConnectionSchema.default('cloud_api'),
  contactId: z.string(),
  /**
   * O TELEFONE do contato — nulo quando o WhatsApp não o revelou (F192, um
   * contato só-LID). A tela diz "número oculto"; nunca mostra o LID como se
   * fosse telefone.
   */
  contactWaId: z.string().nullable(),
  /** O LID do contato, quando conhecido (F192). Não é telefone. */
  contactLid: z.string().nullable().default(null),
  contactProfileName: z.string().nullable(),
  contactPartyId: z.string().nullable(),
  /**
   * O nome do cadastro vinculado, quando existe um **ativo** (F084).
   *
   * É o nome que a tela mostra primeiro: o cadastro é como a LOJA chama a
   * pessoa; o nome de perfil é como a pessoa chama a si mesma. `null` também
   * quando o cadastro foi arquivado — de propósito, para que o inbox pare de
   * anunciar um cliente que alguém acabou de apagar em Pessoas.
   *
   * `default(null)` porque o cliente pode estar mais novo que o servidor.
   */
  contactPartyName: z.string().nullable().default(null),
  /**
   * De onde a pessoa fala — a cidade e a UF do endereço do cadastro (F086).
   *
   * Sai do endereço PRINCIPAL do cadastro vinculado (`is_main`, e o mais
   * antigo como desempate). `null` quando não há vínculo, quando o cadastro
   * foi arquivado, ou quando ele não tem endereço nenhum — o caso mais comum,
   * porque o cadastro rápido do balcão pede só nome e documento.
   *
   * Dois campos e não uma string pronta: o contrato carrega DADO, e "Ponta
   * Grossa/PR" é apresentação. Quem quiser mostrar só a cidade, ou agrupar por
   * UF, não precisa desmontar um texto de volta.
   */
  contactPartyCity: z.string().nullable().default(null),
  contactPartyUf: z.string().nullable().default(null),
  /**
   * As etiquetas coladas NESTA conversa (F088) — "Aguardando pagamento".
   *
   * Diferentes das do cliente: estas nascem e morrem com o assunto, e
   * funcionam para número que nem cadastro tem. As duas famílias aparecem
   * lado a lado no cabeçalho, e o `scope` da migração 0049 é o que impede
   * colar uma no lugar da outra.
   */
  tags: z.array(TagRefSchema).default([]),
  state: ConversationStateSchema,
  assigneeEmployeeId: z.string().nullable(),
  /** `null` até alguém atribuir a conversa a uma fila (F047). */
  queueId: z.string().nullable(),
  lastInboundAt: instant.nullable(),
  lastMessageAt: instant.nullable(),
  /**
   * O corpo da última mensagem, para a lista do inbox saber o que mostrar
   * abaixo do nome (F083). `null` quando não há mensagem, ou quando a última é
   * mídia.
   *
   * Vem em MARKDOWN, como tudo que o gateway guarda — a tela o transforma em
   * texto plano antes de mostrar, senão a prévia exibiria os asteriscos.
   */
  lastMessagePreview: z.string().nullable().default(null),
  /**
   * O tipo da última mensagem (F085).
   *
   * Sem ele a lista mentia: uma conversa cuja última mensagem é uma foto tem
   * `lastMessagePreview` nulo (mídia não tem corpo), e a tela dizia "Sem
   * mensagens" para uma conversa que acabou de receber uma.
   */
  lastMessageKind: MessageKindSchema.nullable().default(null),
  unreadCount: z.number().int(),
  version: z.number().int(),
})

export const ConversationListResponse = z.object({
  conversations: z.array(ConversationSummarySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

/**
 * As contas de canal para o SELETOR do inbox (F091).
 *
 * Um id e um nome, e nada mais. A listagem completa de canais
 * (`ChannelAccountListResponse`) devolve o identificador no gateway, o
 * endereço e se há credencial guardada, e pede `communication.channel.read` —
 * que o atendente não tem. Esta pede `communication.conversation.read`, a
 * mesma de ler a conversa cujo rótulo ela nomeia.
 */
export const InboxAccountSchema = z.object({
  id: z.string(),
  displayName: z.string(),
})

export const InboxAccountListResponse = z.object({
  accounts: z.array(InboxAccountSchema),
})

/**
 * O arquivo de uma mensagem (F194). `url` é montada pelo servidor — a tela
 * nunca constrói caminho de arquivo. `pending`: ainda não baixado; a mesma URL
 * o busca. `unavailable`: o WhatsApp não guarda mais.
 */
export const MessageMediaSchema = z.object({
  url: z.string(),
  status: z.enum(['stored', 'pending', 'unavailable']),
  mime: z.string().nullable(),
  fileName: z.string().nullable(),
  byteSize: z.number().int().nullable(),
  seconds: z.number().int().nullable(),
})

export type MessageMedia = z.infer<typeof MessageMediaSchema>

export const MessageSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  direction: MessageDirectionSchema,
  kind: MessageKindSchema,
  body: z.string().nullable(),
  mediaStorageKey: z.string().nullable(),
  mediaMime: z.string().nullable(),
  /** `default` porque o cliente pode estar mais novo que o servidor. */
  media: MessageMediaSchema.nullable().default(null),
  wamid: z.string().nullable(),
  externalId: z.string().nullable(),
  status: MessageStatusSchema,
  errorCode: z.string().nullable(),
  origin: MessageOriginSchema,
  senderEmployeeId: z.string().nullable(),
  pricingModel: z.string().nullable(),
  pricingType: z.string().nullable(),
  pricingCategory: z.string().nullable(),
  /** Micros de USD, como string — nunca um `number`. Quase sempre `null` nesta feature. */
  costMicrosUsd: z.string().nullable(),
  sentAt: instant.nullable(),
  deliveredAt: instant.nullable(),
  readAt: instant.nullable(),
  occurredAt: instant,
  /** O modelo usado, quando `kind === 'template'` (F050). `null` em qualquer outra mensagem. */
  templateId: z.string().nullable(),
  version: z.number().int(),
})

export const MessageListResponse = z.object({
  messages: z.array(MessageSummarySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export const SendMessageRequest = z.object({
  body: z.string().trim().min(1).max(4096),
})

export type SendMessageBody = z.infer<typeof SendMessageRequest>

/**
 * Cliente ↔ Party — o matching de telefone (F048).
 *
 * Nada aqui reescreve um telefone de `party`; o que estas rotas gravam é só
 * o VÍNCULO, em `communication_contact` — `partyId`, `matchStatus`, quem e
 * quando confirmou.
 */

export const ContactMatchStatusSchema = z.enum([
  'pending',
  'auto_matched',
  'confirmed',
  'created',
  'ignored',
])

export const ContactSummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  /** Nulo num contato só-LID (F192). */
  waId: z.string().nullable(),
  lid: z.string().nullable().default(null),
  profileName: z.string().nullable(),
  partyId: z.string().nullable(),
  matchStatus: ContactMatchStatusSchema,
  matchedByUserId: z.string().nullable(),
  matchedAt: instant.nullable(),
  version: z.number().int(),
})

/** Uma pessoa candidata — o suficiente para a tela oferecer a escolha, nada mais. */
export const PhoneMatchCandidatePartySchema = z.object({
  id: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  document: z.string().nullable(),
})

export const ContactSuggestionsResponse = z.object({
  contact: ContactSummarySchema,
  candidates: z.array(PhoneMatchCandidatePartySchema),
})

export const MatchContactRequest = z.object({
  partyId: z.uuid(),
})

export type MatchContactBody = z.infer<typeof MatchContactRequest>

/**
 * O painel do cliente na conversa (F048).
 *
 * `purchases` vem do domínio de VENDAS (`@aeris/sales`, via o repositório
 * existente) — nunca lido direto das tabelas de vendas por este módulo,
 * seção 32 da Master Spec. `totalAmount` é a soma do conjunto filtrado
 * inteiro (não só da página de `recent`), a mesma convenção de
 * `SalesDocumentPage.totalAmount`: cancelado não entra na soma.
 */
export const PartyPurchaseSummaryItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['quote', 'order', 'sale']),
  status: z.string(),
  number: z.number().int().nullable(),
  issuedAt: instant,
  totalAmount: z.string(),
})

export const PartyPurchaseSummarySchema = z.object({
  totalDocuments: z.number().int(),
  /** Soma do total de cada documento não cancelado, em string — dinheiro nunca é `number` do JSON. */
  totalAmount: z.string(),
  recent: z.array(PartyPurchaseSummaryItemSchema),
})

export const ConversationPartyPanelSchema = z.object({
  id: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  document: z.string().nullable(),
  /** O vendedor do cliente — a carteira (F210). */
  salespersonUserId: z.string().nullable().default(null),
  salespersonName: z.string().nullable().default(null),
  /**
   * A situação de crédito deste cliente (F085, ADR-0022).
   *
   * `null` quando ele não tem crédito concedido E não deve nada — não há o que
   * dizer. Quando existe, `limit` nulo significa **sem crédito concedido**,
   * nunca "ilimitado": crédito é concedido, não presumido.
   *
   * Vem inteira de `creditStandingOf` (`@aeris/database`), o MESMO cálculo que
   * o PDV usa para decidir uma venda fiado — não uma soma escrita aqui. Duas
   * respostas diferentes para "quanto este cliente pode dever" é como o balcão
   * e o financeiro começam a discordar.
   *
   * Dinheiro em string, sempre.
   */
  credit: z
    .object({
      limit: z.string().nullable(),
      outstanding: z.string(),
      available: z.string().nullable(),
      blocked: z.boolean(),
      overdueCount: z.number().int(),
      oldestOverdueDays: z.number().int(),
    })
    .nullable()
    .default(null),
  purchases: PartyPurchaseSummarySchema,
  /** As etiquetas do CADASTRO (F088) — as que seguem a pessoa em qualquer conversa. */
  tags: z.array(TagRefSchema).default([]),
})

export const ConversationDetailResponse = ConversationSummarySchema.extend({
  /** `null` enquanto o contato não estiver vinculado a um Party (match_status !== confirmed/auto_matched/created). */
  party: ConversationPartyPanelSchema.nullable(),
})

/**
 * ============================================================================
 * Horário de atendimento — um contrato ÚNICO (F058)
 * ============================================================================
 *
 * Até esta feature havia DOIS campos para a mesma pergunta, em dois
 * formatos: `communication_bot_config.working_hours` (validado, lido por
 * `isHumanWorkingHoursNow`) e `communication_queue.working_hours`
 * (`z.unknown()`, aceitava qualquer JSON, e não era lido por ninguém — a
 * fila só passava `{botFirst}` para `shouldBotReply`). `WorkingHoursSchema`
 * é o contrato único; `BotWorkingHoursSchema`/`BotWorkingHoursWindowSchema`
 * ficam como ALIAS abaixo, para não quebrar import nenhum neste commit.
 *
 * `timezone` é validado com `Intl.DateTimeFormat` num `.refine` — a única
 * checagem honesta: uma lista fixa de fusos fica desatualizada, e o runtime
 * já sabe quais são válidos.
 *
 * `end` aceita `"24:00"` — e SÓ aqui — para "até a meia-noite". O `.refine`
 * abaixo compara `end > start` como STRING, o que funciona porque `"24:00"`
 * é lexicograficamente maior que qualquer `HH:MM` de `00:00` a `23:59` — e a
 * mensagem explica que uma faixa que atravessa a meia-noite (22:00–02:00)
 * tem que ser gravada como DUAS janelas, nunca uma só com `end < start`:
 * `isHumanWorkingHoursNow` (`@aeris/communication`) compara
 * `agora >= start && agora < end`, e essa comparação nunca casa quando `end`
 * é menor que `start` — silenciosamente.
 */
const WORKING_HOURS_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const isKnownTimeZone = (value: string): boolean => {
  try {
    // Só o construtor valida o fuso — o retorno não importa, o `throw` sim.
    Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const WorkingHoursWindowSchema = z
  .object({
    /** 0 = domingo … 6 = sábado. */
    day: z.number().int().min(0).max(6),
    start: z.string().regex(WORKING_HOURS_TIME_PATTERN, 'HH:MM'),
    /** `HH:MM`, ou `"24:00"` — só aqui — para "até a meia-noite". */
    end: z.union([
      z.string().regex(WORKING_HOURS_TIME_PATTERN),
      z.literal('24:00'),
    ]),
  })
  .refine((window) => window.end > window.start, {
    message:
      'O fim precisa ser depois do início. Uma faixa que atravessa a meia-noite (ex.: 22:00–02:00) é gravada como duas janelas — o editor de horário faz isso sozinho, nunca digite uma faixa com o fim antes do início.',
    path: ['end'],
  })

export const WorkingHoursSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isKnownTimeZone, 'Fuso horário desconhecido.'),
  windows: z.array(WorkingHoursWindowSchema).max(50),
})

export type WorkingHours = z.infer<typeof WorkingHoursSchema>

/**
 * Alias mantido por compatibilidade: `BotWorkingHoursSchema` era o nome
 * antes de esta feature unificar o horário do robô com o da fila (F058).
 * Não remova sem migrar todos os imports de uma vez.
 */
export const BotWorkingHoursWindowSchema = WorkingHoursWindowSchema
export const BotWorkingHoursSchema = WorkingHoursSchema

/**
 * Filas de atendimento e realtime (F047).
 *
 * `workingHours` é o MESMO contrato que o robô usa (`WorkingHoursSchema`,
 * F058) — `null` significa "herda o horário do robô/tenant"
 * (`effectiveWorkingHours`, `@aeris/communication`), nunca "sem horário
 * configurado" solto. `botFirst` decide, DENTRO do horário, se o robô fala
 * antes da fila humana — decisão do tenant, não uma constante do código; o
 * robô em si é a F052.
 */
export const QueueMemberSchema = z.object({
  id: z.string(),
  queueId: z.string(),
  employeeId: z.string(),
  employeeName: z.string().nullable(),
  version: z.number().int(),
})

export const QueueSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  /** `null` = herda o horário do robô/tenant (`effectiveWorkingHours`). */
  workingHours: WorkingHoursSchema.nullable(),
  /**
   * O que estava gravado ANTES desta feature, quando não bate com
   * `WorkingHoursSchema` — a migração 0041 arquiva aqui em vez de apagar ou
   * de inventar um fuso. `null` quando não há nada em quarentena. Só leitura
   * — nenhuma rota escreve este campo.
   */
  workingHoursLegacy: z.unknown().nullable(),
  botFirst: z.boolean(),
  members: z.array(QueueMemberSchema),
  version: z.number().int(),
})

export const QueueListResponse = z.object({
  queues: z.array(QueueSummarySchema),
})

export const QueueCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().default(null),
  active: z.boolean().default(true),
  workingHours: WorkingHoursSchema.nullable().default(null),
  botFirst: z.boolean().default(false),
})

export const QueueUpdate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable(),
  active: z.boolean(),
  workingHours: WorkingHoursSchema.nullable(),
  botFirst: z.boolean(),
  version: z.number().int().min(1),
})

export type QueueCreateBody = z.infer<typeof QueueCreate>
export type QueueUpdateBody = z.infer<typeof QueueUpdate>

export const QueueMemberCreate = z.object({
  employeeId: z.uuid(),
})

export type QueueMemberCreateBody = z.infer<typeof QueueMemberCreate>

/**
 * Atribuir uma conversa a uma fila, ou a um atendente ("é minha") — F047.
 *
 * As duas ações vivem em rotas separadas (a fila é uma escolha
 * administrativa comum; assumir é um ato de uma pessoa sobre si mesma), mas
 * compartilham o mesmo formato de resposta: a conversa, já atualizada.
 */
export const AssignConversationToQueueRequest = z.object({
  queueId: z.string().nullable(),
})

export type AssignConversationToQueueBody = z.infer<
  typeof AssignConversationToQueueRequest
>

export const AssignConversationRequest = z.object({
  /** `null` = tirar o responsável (voltar para a fila, sem dono). */
  employeeId: z.string().nullable(),
})

export type AssignConversationBody = z.infer<typeof AssignConversationRequest>

/**
 * O tempo real do inbox — ADR-0030 (SSE).
 *
 * MAGRO de propósito: nunca o conteúdo de uma mensagem, só o suficiente para
 * o cliente saber O QUE invalidar. Quem decide se pode LER o que mudou
 * continua sendo a rota normal (`GET /conversations`, `.../messages`), que
 * já escopa por tenant e permissão — mandar conteúdo pelo stream duplicaria
 * essa autorização em dois lugares.
 */
export const CommunicationStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('conversation.updated'), id: z.string() }),
  z.object({
    type: z.literal('message.received'),
    conversationId: z.string(),
  }),
])

export type CommunicationStreamEvent = z.infer<
  typeof CommunicationStreamEventSchema
>

/**
 * Chamados (F051) — um ticket ligado a uma conversa, ou aberto à mão.
 *
 * NÃO é ordem de serviço técnica: sem equipamento, agendamento, peças ou
 * valor — decisão do dono, OMNICHANNEL_PLAN.md.
 */

export const TicketStatusSchema = z.enum([
  'open',
  'in_progress',
  'waiting',
  'closed',
])

export const TicketPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent'])

export const TicketEventKindSchema = z.enum([
  'opened',
  'note',
  'status_changed',
  'assigned',
  'closed',
  'reopened',
])

export const TicketSummarySchema = z.object({
  id: z.string(),
  /** O protocolo. `null` só em teoria — toda abertura desenha um número na mesma transação. */
  number: z.number().int().nullable(),
  subject: z.string(),
  description: z.string().nullable(),
  status: TicketStatusSchema,
  priority: TicketPrioritySchema,
  partyId: z.string().nullable(),
  conversationId: z.string().nullable(),
  assigneeEmployeeId: z.string().nullable(),
  openedByUserId: z.string(),
  openedAt: instant,
  closedAt: instant.nullable(),
  closedReason: z.string().nullable(),
  version: z.number().int(),
})

export const TicketListResponse = z.object({
  tickets: z.array(TicketSummarySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export const TicketEventSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  kind: TicketEventKindSchema,
  note: z.string().nullable(),
  fromStatus: TicketStatusSchema.nullable(),
  toStatus: TicketStatusSchema.nullable(),
  employeeId: z.string().nullable(),
  createdAt: instant,
})

export const TicketDetailResponse = TicketSummarySchema.extend({
  events: z.array(TicketEventSchema),
})

/**
 * Criar um chamado — à mão OU a partir de uma conversa.
 *
 * `conversationId` presente é o que faz a rota herdar `partyId` da conversa
 * (o cliente já identificado pela F048), sem que a tela precise repetir o
 * que já sabe.
 */
export const TicketCreate = z.object({
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().default(null),
  priority: TicketPrioritySchema.default('normal'),
  partyId: z.uuid().nullable().default(null),
  conversationId: z.uuid().nullable().default(null),
})

export type TicketCreateBody = z.infer<typeof TicketCreate>

/**
 * Muda a situação de um chamado — inclusive fechar e reabrir.
 *
 * Uma rota só para as seis transições legais (`canTransition`,
 * `@aeris/communication`): fechar é `status: 'closed'`, e `note` vira o
 * motivo do fechamento; reabrir é `status: 'in_progress'` quando a situação
 * atual é `closed`, e a rota grava isso como evento `reopened` em vez de
 * `status_changed` — ver `communication-tickets.ts`.
 */
export const TicketStatusChange = z.object({
  status: TicketStatusSchema,
  /** Livre — "por que fechou", "por que voltou a andar". Vira o `note` do evento (e `closedReason`, ao fechar). */
  note: z.string().trim().max(4000).nullable().default(null),
  version: z.number().int().min(1),
})

export type TicketStatusChangeBody = z.infer<typeof TicketStatusChange>

export const TicketAssign = z.object({
  /** `null` tira o responsável. */
  employeeId: z.string().nullable(),
  version: z.number().int().min(1),
})

export type TicketAssignBody = z.infer<typeof TicketAssign>

export const TicketNoteCreate = z.object({
  note: z.string().trim().min(1).max(4000),
})

export type TicketNoteCreateBody = z.infer<typeof TicketNoteCreate>

/**
 * Modelos aprovados pela Meta, e a janela de 24h (F050).
 *
 * `category` viaja em destaque — é ela que decide o CUSTO da mensagem (o
 * rework de cobrança da Meta em 01/10/2026) — mas nenhum schema aqui carrega
 * um valor em reais/dólar: a Meta só publica as tarifas até 01/09/2026.
 */

export const TemplateCategorySchema = z.enum([
  'MARKETING',
  'UTILITY',
  'AUTHENTICATION',
])

export const TemplateStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'paused',
  'disabled',
])

export const TemplateComponentTypeSchema = z.enum([
  'HEADER',
  'BODY',
  'FOOTER',
  'BUTTONS',
])

/**
 * Um botão de CTA de um componente `BUTTONS` (F059).
 *
 * A Meta devolve um array `buttons` que `structureOf` (`@aeris/openbsp`)
 * descartava até esta feature — sem isto, a pré-visualização fiel do
 * WhatsApp mentiria sobre metade do que o cliente vê. Um discriminated
 * union porque cada tipo carrega campos diferentes: `URL` precisa do
 * endereço, `PHONE_NUMBER` do telefone, `QUICK_REPLY` só do rótulo.
 */
export const TemplateButtonSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('QUICK_REPLY'),
    text: z.string().trim().min(1).max(25),
  }),
  z.object({
    type: z.literal('URL'),
    text: z.string().trim().min(1).max(25),
    url: z.url().max(2000),
  }),
  z.object({
    type: z.literal('PHONE_NUMBER'),
    text: z.string().trim().min(1).max(25),
    phoneNumber: z.string().trim().min(1).max(20),
  }),
])

/**
 * O formato do cabeçalho (F066) — a Meta permite quatro, e o Aeris carregava
 * só o primeiro. Um cabeçalho de mídia não tem texto: `text` é `null` e o
 * conteúdo é o arquivo.
 */
export const TemplateHeaderFormatSchema = z.enum([
  'TEXT',
  'IMAGE',
  'VIDEO',
  'DOCUMENT',
])

/**
 * Uma união discriminada, e não um objeto plano com `format?`, pelo mesmo
 * motivo de `TemplateButtonSchema`: só o `HEADER` tem formato, e um campo
 * opcional é um campo que um parser esquece em silêncio — foi exatamente
 * assim que `structureOf` e `asTemplateStructure` descartaram `format` até
 * a F066. `default('TEXT')` mantém compatível todo `structure` já gravado
 * em `communication_template` desde a migração 0035.
 */
export const TemplateComponentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HEADER'),
    format: TemplateHeaderFormatSchema.default('TEXT'),
    /** Carrega as variáveis posicionais (`{{1}}`, `{{2}}`…) — só quando `format === 'TEXT'`. */
    text: z.string().nullable(),
    buttons: z.array(TemplateButtonSchema).max(10).default([]),
  }),
  z.object({
    type: z.enum(['BODY', 'FOOTER', 'BUTTONS']),
    /** Carrega as variáveis posicionais (`{{1}}`, `{{2}}`…) no BODY. */
    text: z.string().nullable(),
    /** Só populado quando `type === 'BUTTONS'` — dez é o teto da Cloud API. */
    buttons: z.array(TemplateButtonSchema).max(10).default([]),
  }),
])

export const TemplateStructureSchema = z.object({
  components: z.array(TemplateComponentSchema),
})

/**
 * Nome e exemplo de UMA variável posicional (`{{n}}`) — F059, migração 0040.
 *
 * Fica FORA de `TemplateStructureSchema` de propósito: `structure` é o
 * espelho cru da Meta, e `upsertSyncedTemplate` (`@aeris/database`) sobrescreve
 * `structure` inteiro a cada sincronização — qualquer chave nossa dentro dele
 * desapareceria em silêncio na sincronização seguinte (ver o comentário no
 * topo da migração 0040).
 */
export const TemplateVariableSchema = z.object({
  index: z.number().int().min(1).max(20),
  name: z.string().trim().min(1).max(60),
  example: z.string().trim().max(200).default(''),
})

export const TemplateVariablesSchema = z
  .array(TemplateVariableSchema)
  .max(20)
  .default([])
  .refine(
    (list) =>
      new Set(list.map((variable) => variable.index)).size === list.length,
    'Duas variáveis com o mesmo número.'
  )

export const TemplateSummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  /** O nome como a Meta o identifica dentro da WABA. */
  metaTemplateName: z.string(),
  /** BCP-47 — `pt_BR`. */
  language: z.string(),
  category: TemplateCategorySchema,
  status: TemplateStatusSchema,
  structure: TemplateStructureSchema,
  /** Nome e exemplo de cada `{{n}}` — dado pelo Aeris, nunca pela Meta (F059). */
  variables: TemplateVariablesSchema,
  /** Preenchido só quando `status === 'rejected'`. */
  rejectionReason: z.string().nullable(),
  /** `null` até a primeira sincronização (`openbsp.templates.sync`) confirmar este modelo. */
  syncedAt: instant.nullable(),
  version: z.number().int(),
})

export const TemplateListResponse = z.object({
  templates: z.array(TemplateSummarySchema),
})

/**
 * Cria um modelo local e o submete à aprovação da Meta — nasce sempre
 * `pending`. `metaTemplateName` segue a convenção que a Meta exige na
 * submissão: minúsculo, sem espaço.
 */
export const TemplateCreate = z.object({
  accountId: z.uuid(),
  metaTemplateName: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(
      /^[a-z0-9_]+$/,
      'Use letras minúsculas, números e sublinhado — a convenção da Meta.'
    ),
  language: z.string().trim().min(2).max(10),
  category: TemplateCategorySchema,
  structure: TemplateStructureSchema,
  /** Nome e exemplo de cada variável, dados no mesmo formulário que escreve o texto — ninguém digita `{{1}}` na mão (F059). */
  variables: TemplateVariablesSchema,
})

export type TemplateCreateBody = z.infer<typeof TemplateCreate>

/**
 * Dá (ou corrige) nome e exemplo às variáveis de um modelo que já existe —
 * em especial um que veio sincronizado da Meta sem nome nenhum
 * (`upsertSyncedTemplate` nunca escreve `variables`, ver a migração 0040).
 */
export const TemplateVariablesUpdate = z.object({
  variables: TemplateVariablesSchema,
  version: z.number().int().min(1),
})

export type TemplateVariablesUpdateBody = z.infer<
  typeof TemplateVariablesUpdate
>

/**
 * Envia um modelo aprovado numa conversa (F050) — `canSendTemplate` +
 * `fillTemplateVariables` decidem se o pedido é aceito antes de qualquer
 * chamada ao gateway.
 */
export const SendTemplateMessageRequest = z.object({
  templateId: z.uuid(),
  /** Posicional: `values[0]` preenche `{{1}}`, e assim por diante. */
  values: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
})

export type SendTemplateMessageBody = z.infer<typeof SendTemplateMessageRequest>

/**
 * ============================================================================
 * Robô de IA — F052
 * ============================================================================
 *
 * `LlmProviderSchema` espelha `BOT_LLM_PROVIDERS` (`@aeris/communication`) —
 * os cinco provedores que o dono decidiu. Nenhum schema aqui carrega uma
 * chave de API em texto plano: `LlmCredentialUpsert` é ESCREVE-SÓ (a chave
 * entra, nunca sai) e `LlmCredentialSummarySchema` só devolve `hasApiKey`.
 */

export const LlmProviderSchema = z.enum([
  'anthropic',
  'openai',
  'gemini',
  'deepseek',
  'groq',
  'openrouter',
])

export const BotEndReasonSchema = z.enum([
  'handoff_keyword',
  'handoff_model',
  'max_replies',
  'cost_cap',
  'window_closed',
  'human_took_over',
  'error',
  'conversation_merged',
])

export const BotConfigSummarySchema = z.object({
  id: z.string(),
  /** `null` = a config do tenant inteiro; preenchido = sobrescreve só esta fila. */
  queueId: z.string().nullable(),
  enabled: z.boolean(),
  providerOrder: z.array(LlmProviderSchema),
  modelByProvider: z.record(z.string(), z.string()),
  systemPrompt: z.string(),
  greeting: z.string().nullable(),
  workingHours: BotWorkingHoursSchema,
  handoffKeywords: z.array(z.string()),
  maxRepliesPerSession: z.number().int(),
  /** Micros de dólar, como string — o mesmo padrão de `costMicrosUsd` em `MessageSummarySchema`. */
  maxCostMicrosUsdPerSession: z.string(),
  version: z.number().int(),
})

export const BotConfigListResponse = z.object({
  configs: z.array(BotConfigSummarySchema),
})

/**
 * Cria ou atualiza a config do robô — do tenant inteiro (`queueId` ausente)
 * ou de uma fila (`queueId` presente). `version` obrigatório numa
 * atualização (concorrência otimista, o padrão do repositório) — o
 * repositório decide criar vs. atualizar pela presença de uma linha
 * existente para `(tenantId, queueId)`, não por um campo `id` no corpo.
 */
export const BotConfigUpsert = z.object({
  queueId: z.uuid().nullable().default(null),
  enabled: z.boolean(),
  providerOrder: z.array(LlmProviderSchema).max(5),
  modelByProvider: z.record(z.string(), z.string().trim().min(1)).default({}),
  systemPrompt: z.string().trim().max(8000).default(''),
  greeting: z.string().trim().max(2000).nullable().default(null),
  workingHours: BotWorkingHoursSchema,
  handoffKeywords: z
    .array(z.string().trim().min(1).max(60))
    .max(50)
    .default([]),
  maxRepliesPerSession: z.number().int().min(1).max(1000),
  maxCostMicrosUsdPerSession: z
    .string()
    .regex(/^\d+$/, 'Informe um número inteiro de micros de dólar.'),
  /** Obrigatório para atualizar uma config existente; ignorado ao criar. */
  version: z.number().int().optional(),
})

export type BotConfigUpsertBody = z.infer<typeof BotConfigUpsert>

export const LlmCredentialSummarySchema = z.object({
  id: z.string(),
  provider: LlmProviderSchema,
  hasApiKey: z.boolean(),
  baseUrl: z.string().nullable(),
  status: z.enum(['active', 'disabled']),
  version: z.number().int(),
})

export const LlmCredentialListResponse = z.object({
  credentials: z.array(LlmCredentialSummarySchema),
})

/**
 * Cadastra ou troca a chave de um provedor — ESCREVE-SÓ: a chave entra
 * aqui e nunca volta em nenhuma resposta da API, nem mascarada de forma
 * reversível (a mesma regra da service key do OpenBSP, F045).
 */
export const LlmCredentialUpsert = z.object({
  provider: LlmProviderSchema,
  apiKey: z.string().trim().min(1).max(2000),
  /** Só para OpenRouter e compatíveis — endereço fixo nos outros quatro. */
  baseUrl: z.url().nullable().default(null),
})

export type LlmCredentialUpsertBody = z.infer<typeof LlmCredentialUpsert>

export const BotSessionSummarySchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  /** O contato da conversa (nome de perfil, ou o número) — nunca um UUID cru na tela (F058). `null` só se a conversa/contato já não existir. */
  contactLabel: z.string().nullable(),
  providerUsed: LlmProviderSchema.nullable(),
  modelUsed: z.string().nullable(),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  tokensCacheRead: z.number().int(),
  tokensCacheWrite: z.number().int(),
  /** Micros de dólar, como string. */
  costMicrosUsd: z.string(),
  replyCount: z.number().int(),
  startedAt: instant,
  endedAt: instant.nullable(),
  endReason: BotEndReasonSchema.nullable(),
  version: z.number().int(),
})

export const BotSessionListResponse = z.object({
  sessions: z.array(BotSessionSummarySchema),
  /** A soma de `costMicrosUsd` de todas as sessões listadas — "o gasto do período" que a tela mostra, calculada uma vez no servidor. */
  totalCostMicrosUsd: z.string(),
})

/**
 * ============================================================================
 * Follow-up — "comprou ar, lembrar da manutenção em 6 meses" (F053)
 * ============================================================================
 */

export const FollowupTriggerKindSchema = z.enum([
  'product_purchased',
  'category_purchased',
])

export const FollowupTaskStatusSchema = z.enum([
  'pending',
  'sent',
  'cancelled',
  'failed',
  'skipped_optout',
  'skipped_no_contact',
])

export const FollowupRuleSummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  triggerKind: FollowupTriggerKindSchema,
  /** Os produtos que disparam — tabela de junção desde a F065 (migração 0042). Vazio numa regra por marca. */
  productIds: z.array(z.string()),
  /** Compara com `product.brand` — o Aeris não tem uma tabela de categoria (ver a migração 0038). */
  productBrand: z.string().nullable(),
  delayMonths: z.number().int(),
  delayDays: z.number().int(),
  templateId: z.string(),
  cancelOnRepurchase: z.boolean(),
  /** Quantas tarefas `pending` esta regra tem agora, e a próxima a vencer — o que a tela `/crm-regras` mostra por regra. */
  pendingTaskCount: z.number().int(),
  nextDueAt: instant.nullable(),
  version: z.number().int(),
})

export const FollowupRuleListResponse = z.object({
  rules: z.array(FollowupRuleSummarySchema),
})

/**
 * Cria ou atualiza uma regra de follow-up. `productIds` OU `productBrand`,
 * de acordo com `triggerKind` — nunca os dois, nunca nenhum.
 *
 * Desde a F065 (migração 0042) a metade "tem produto" do check do banco
 * **não existe mais lá**: um `check` não consegue contar linhas da tabela de
 * junção. Este `superRefine` e `upsertFollowupRule` (`@aeris/database`) são
 * os dois lugares que passam a sustentar o invariante — ver o topo da
 * migração 0042.
 */
export const FollowupRuleUpsert = z
  .object({
    accountId: z.uuid(),
    name: z.string().trim().min(1).max(200),
    enabled: z.boolean().default(true),
    triggerKind: FollowupTriggerKindSchema,
    productIds: z.array(z.uuid()).max(50).default([]),
    productBrand: z.string().trim().min(1).max(200).nullable().default(null),
    delayMonths: z.number().int().min(0).max(120).default(0),
    delayDays: z.number().int().min(0).max(3660).default(0),
    templateId: z.uuid(),
    cancelOnRepurchase: z.boolean().default(true),
    /** Obrigatório para atualizar uma regra existente; ignorado ao criar. */
    version: z.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.delayMonths === 0 && value.delayDays === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['delayMonths'],
        message: 'Informe um prazo maior que zero.',
      })
    }

    if (value.triggerKind === 'product_purchased') {
      if (value.productIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['productIds'],
          message: 'Escolha ao menos um produto que dispara esta regra.',
        })
      }
      if (new Set(value.productIds).size !== value.productIds.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['productIds'],
          message: 'O mesmo produto aparece duas vezes.',
        })
      }
      if (value.productBrand !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['productBrand'],
          message: 'Uma regra por produto não usa marca.',
        })
      }
    } else {
      if (value.productBrand === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['productBrand'],
          message: 'Escolha a marca que dispara esta regra.',
        })
      }
      if (value.productIds.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['productIds'],
          message: 'Uma regra por marca não usa produto.',
        })
      }
    }
  })

export type FollowupRuleUpsertBody = z.infer<typeof FollowupRuleUpsert>

export const FollowupTaskSummarySchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  partyId: z.string(),
  contactId: z.string().nullable(),
  saleId: z.string(),
  dueAt: instant,
  status: FollowupTaskStatusSchema,
  sentMessageId: z.string().nullable(),
  skippedReason: z.string().nullable(),
  attemptCount: z.number().int(),
  version: z.number().int(),
})

export const FollowupTaskListResponse = z.object({
  tasks: z.array(FollowupTaskSummarySchema),
})

/**
 * ============================================================================
 * Campanhas — o aviso para muita gente (F054)
 * ============================================================================
 */

export const CampaignStatusSchema = z.enum([
  'draft',
  'scheduled',
  'running',
  'paused',
  'done',
  'cancelled',
])

export const CampaignRecipientStatusSchema = z.enum([
  'pending',
  'sent',
  'skipped',
  'failed',
])

/**
 * Exatamente um de `productId`/`productBrand` — a mesma disciplina da
 * regra de follow-up (F053). `purchasedFrom`/`purchasedTo` são opcionais;
 * quando os dois estão presentes, o início não pode ser depois do fim.
 */
export const CampaignSegmentSchema = z
  .object({
    /**
     * Vários produtos (F060) — "quem comprou ar-condicionado OU ventilador"
     * é uma campanha só. O singular `productId` das linhas antigas é
     * convertido na leitura do `jsonb` (`asCampaignSegment`,
     * `@aeris/database`), nunca migrado no banco: mexer nele reescreveria o
     * critério congelado de campanhas já enviadas.
     */
    productIds: z.array(z.uuid()).max(50).default([]),
    productBrand: z.string().trim().min(1).max(200).nullable().default(null),
    purchasedFrom: instant.nullable().default(null),
    purchasedTo: instant.nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.productIds.length === 0 && value.productBrand === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['productIds'],
        message: 'Escolha ao menos um produto, ou uma marca, para segmentar.',
      })
    }
    if (value.productIds.length > 0 && value.productBrand !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['productBrand'],
        message: 'Escolha produtos OU marca, não os dois.',
      })
    }
    if (new Set(value.productIds).size !== value.productIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['productIds'],
        message: 'O mesmo produto aparece duas vezes.',
      })
    }
    if (
      value.purchasedFrom !== null &&
      value.purchasedTo !== null &&
      value.purchasedFrom > value.purchasedTo
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['purchasedTo'],
        message: 'O fim do período não pode ser antes do início.',
      })
    }
  })

export type CampaignSegmentBody = z.infer<typeof CampaignSegmentSchema>

export const CampaignSummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  templateId: z.string(),
  name: z.string(),
  segment: CampaignSegmentSchema,
  status: CampaignStatusSchema,
  scheduledFor: instant.nullable(),
  /** Mensagens por segundo — sempre abaixo do teto da CONTA. Ver `maxCampaignThrottleMps` (`@aeris/communication`). */
  throttleMps: z.number().int(),
  totalRecipients: z.number().int(),
  sentCount: z.number().int(),
  skippedCount: z.number().int(),
  failedCount: z.number().int(),
  startedAt: instant.nullable(),
  completedAt: instant.nullable(),
  version: z.number().int(),
})

export const CampaignListResponse = z.object({
  campaigns: z.array(CampaignSummarySchema),
})

export const CampaignCreate = z.object({
  accountId: z.uuid(),
  templateId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  segment: CampaignSegmentSchema,
  throttleMps: z.number().int().min(1).max(1000),
})

export type CampaignCreateBody = z.infer<typeof CampaignCreate>

/** Pré-visualiza quantas pessoas o segmento pega, e quantas já estão em opt-out — SEM materializar nada. */
export const CampaignPreviewResponse = z.object({
  totalMatches: z.number().int(),
  optedOutCount: z.number().int(),
})

export const CampaignPreviewRequest = z.object({
  accountId: z.uuid(),
  segment: CampaignSegmentSchema,
})

export type CampaignPreviewBody = z.infer<typeof CampaignPreviewRequest>

export const CampaignScheduleRequest = z.object({
  scheduledFor: instant,
  version: z.number().int().min(1),
})

export type CampaignScheduleBody = z.infer<typeof CampaignScheduleRequest>

/** O corpo comum das transições sem parâmetro extra — iniciar, pausar, retomar, cancelar. */
export const CampaignTransitionRequest = z.object({
  version: z.number().int().min(1),
})

export type CampaignTransitionBody = z.infer<typeof CampaignTransitionRequest>

export const CampaignRecipientSummarySchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  partyId: z.string(),
  contactId: z.string().nullable(),
  status: CampaignRecipientStatusSchema,
  skippedReason: z.string().nullable(),
  messageId: z.string().nullable(),
  version: z.number().int(),
})

export const CampaignRecipientListResponse = z.object({
  recipients: z.array(CampaignRecipientSummarySchema),
})

/**
 * ============================================================================
 * Custos — a conta no fim do mês (F054)
 * ============================================================================
 *
 * `metaReportedCostMicrosUsd`/`reconciledAt` ficam nulos até existir uma
 * integração com `GET /{waba-id}/pricing_analytics` da Meta (não construída
 * nesta feature — ver o comentário no topo da migração 0039).
 * `divergenceMicrosUsd` só aparece quando há valor reportado para comparar
 * — a divergência é MOSTRADA, nunca escondida, quando existe dado para
 * calculá-la.
 */
export const CostSnapshotSchema = z.object({
  periodStart: instant,
  pricingCategory: z.string(),
  pricingType: z.string(),
  messageCount: z.number().int(),
  /** Micros de dólar, como string — nunca `number`. */
  costMicrosUsd: z.string(),
  metaReportedCostMicrosUsd: z.string().nullable(),
  reconciledAt: instant.nullable(),
  divergenceMicrosUsd: z.string().nullable(),
})

export const CostDashboardResponse = z.object({
  snapshots: z.array(CostSnapshotSchema),
})

/**
 * ============================================================================
 * Guia de configuração (F055)
 * ============================================================================
 *
 * Dez passos, cada um uma pergunta que o banco responde — nenhum é marcado
 * à mão. `evidence` é o que o banco encontrou (o número conectado, o nome
 * da fila) — a tela mostra evidência, não um `check` genérico. `null`
 * enquanto o passo está pendente.
 */
export const SetupStepKeySchema = z.enum([
  'channel_connected',
  'first_inbound_message',
  'agent_reply',
  'first_queue',
  'contact_identified',
  'template_approved',
  'first_ticket',
  'bot_enabled',
  'followup_rule',
  'campaign_dispatched',
])

export const SetupStepSchema = z.object({
  key: SetupStepKeySchema,
  done: z.boolean(),
  evidence: z.string().nullable(),
})

export const SetupProgressResponse = z.object({
  steps: z.array(SetupStepSchema),
})

/**
 * ============================================================================
 * Diagnóstico de canal — "está funcionando?" por evidência (F063)
 * ============================================================================
 *
 * Nenhum campo aqui vem de um ping ao gateway: todos são leituras do que o
 * Aeris JÁ registrou. Um ping verde não prova que o webhook chega; um evento
 * recebido há três minutos prova. Ver o comentário no topo de
 * `channelDiagnostics` (`@aeris/database`) para por que não existe um botão
 * "testar conexão" que fala com o OpenBSP.
 */
export const ChannelDiagnosticsResponse = z.object({
  accountId: z.string(),
  hasCredentials: z.boolean(),
  status: ChannelAccountStatusSchema,
  lastError: z.string().nullable(),
  /** Sem esta linha o webhook chega, é aceito, e nunca é atribuído a ninguém. */
  externalIndexPresent: z.boolean(),
  lastEventAt: instant.nullable(),
  lastEventKind: z.string().nullable(),
  unprocessedEventCount: z.number().int(),
  failedEventCount: z.number().int(),
  lastInboundAt: instant.nullable(),
  lastOutboundAt: instant.nullable(),
  recentFailedMessageCount: z.number().int(),
  recentFailedErrorCode: z.string().nullable(),
})

/* ---------------------------------------------------------------------------
 * O painel do atendimento (F210)
 * ------------------------------------------------------------------------ */

/** Quem atende por um número; `assignOpen` passa já as abertas sem dono. */
export const ChannelOwnerUpdate = z.object({
  ownerUserId: z.uuid().nullable(),
  assignOpen: z.boolean().default(false),
})
export type ChannelOwnerUpdate = z.input<typeof ChannelOwnerUpdate>

export const ChannelOwnerResponse = z.object({
  accountId: z.string(),
  ownerUserId: z.string().nullable(),
  /** Quantas conversas abertas e sem dono passaram para ele agora. */
  assigned: z.number().int(),
})
export type ChannelOwnerResponse = z.infer<typeof ChannelOwnerResponse>

export const AttendanceMetricsQuery = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  accountId: z.uuid().optional(),
})
export type AttendanceMetricsQuery = z.infer<typeof AttendanceMetricsQuery>

export const AttendantLoadSchema = z.object({
  userId: z.string().nullable(),
  name: z.string().nullable(),
  open: z.number().int(),
  waiting: z.number().int(),
  oldestWaitingAt: z.string().nullable(),
  repliedConversations: z.number().int(),
  messagesSent: z.number().int(),
  medianFirstResponseSeconds: z.number().int().nullable(),
  portfolio: z.number().int(),
})
export type AttendantLoad = z.infer<typeof AttendantLoadSchema>

export const AttendanceMetricsResponse = z.object({
  totals: z.object({
    open: z.number().int(),
    waiting: z.number().int(),
    unassigned: z.number().int(),
    oldestWaitingAt: z.string().nullable(),
  }),
  attendants: z.array(AttendantLoadSchema),
})
export type AttendanceMetricsResponse = z.infer<
  typeof AttendanceMetricsResponse
>

/** Passar várias conversas de uma vez para alguém (F210). */
export const AssignBulkRequest = z.object({
  conversationIds: z.array(z.uuid()).min(1).max(200),
  /** Nulo devolve para "sem responsável". */
  employeeId: z.uuid().nullable(),
})
export type AssignBulkRequest = z.infer<typeof AssignBulkRequest>

export const AssignBulkResponse = z.object({
  assigned: z.number().int(),
  /** As que não existem, ou não são desta empresa. */
  missing: z.number().int(),
})
export type AssignBulkResponse = z.infer<typeof AssignBulkResponse>
