import { z } from 'zod'

/**
 * O console de quem opera a instalação (F119).
 *
 * Tudo aqui é sobre CONTAS, nunca sobre o que há dentro delas. O console lista
 * lojas, abre lojas, suspende lojas e mostra quanto cada uma usa — e não mostra
 * uma venda, um produto ou um cliente sequer. Essa fronteira não é estética: é
 * o que permite que a exceção ao RLS que sustenta a lista seja uma função sem
 * parâmetro cujo conjunto de colunas cabe numa revisão. Ver ADR-0035.
 *
 * Como em todo lugar, a resposta é declarada por `jsonResponse()` e serializada
 * a partir exatamente destes campos — o schema é uma lista de permissão de
 * saída, e é por isso que `password_hash` não vaza por um handler distraído
 * (ADR-0005).
 */

export const AccountStatusSchema = z.enum(['active', 'suspended', 'archived'])

export type AccountStatus = z.infer<typeof AccountStatusSchema>

/**
 * O retrato de uso de uma conta, medido por último em `capturedAt`.
 *
 * Nulo na conta recém-criada, e a tela diz "ainda não medido" em vez de zero:
 * zero é uma afirmação, e afirmar que a loja que nasceu hoje não vendeu nada é
 * diferente de admitir que ninguém contou ainda.
 */
export const PlatformUsage = z.object({
  capturedAt: z.string(),
  periodStart: z.string(),
  activeUserCount: z.number().int().nonnegative(),
  productCount: z.number().int().nonnegative(),
  salesCount: z.number().int().nonnegative(),
  /** Decimal na rede é string, sempre (ADR-0016). */
  salesAmount: z.string(),
  communicationCostMicrosUsd: z.number().int().nonnegative(),
})

export type PlatformUsage = z.infer<typeof PlatformUsage>

export const PlatformAccountSummary = z.object({
  tenantId: z.string(),
  slug: z.string(),
  name: z.string(),
  status: AccountStatusSchema,
  createdAt: z.string(),
  /** Da matriz. Nulo só numa conta cujo provisionamento não terminou. */
  legalName: z.string().nullable(),
  tradeName: z.string().nullable(),
  /** Sempre string, nunca número. Master Specification seção 11. */
  cnpj: z.string().nullable(),
  ownerEmail: z.string().nullable(),
  memberCount: z.number().int().nonnegative(),
  usage: PlatformUsage.nullable(),
})

export type PlatformAccountSummary = z.infer<typeof PlatformAccountSummary>

export const PlatformAccountListQuery = z.object({
  /** Casa com nome, slug ou CNPJ. */
  search: z.string().trim().max(120).optional(),
  status: AccountStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', 'createdAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type PlatformAccountListParams = z.output<
  typeof PlatformAccountListQuery
>

/** O que um cliente passa; números são números. */
export type PlatformAccountListRequest = {
  search?: string | undefined
  status?: AccountStatus | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?: 'name' | 'createdAt' | undefined
  direction?: 'asc' | 'desc' | undefined
}

export const PlatformAccountList = z.object({
  items: z.array(PlatformAccountSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type PlatformAccountList = z.infer<typeof PlatformAccountList>

export const CreateAccountRequest = z.object({
  /**
   * O identificador curto da conta, e ele não muda depois.
   *
   * A expressão é a cópia literal da restrição `tenant_slug_format` da
   * migração 0002 (e de `isValidTenantSlug`, que este pacote não pode
   * importar): um slug que passasse aqui e morresse no banco daria erro 500
   * numa tela de cadastro.
   */
  slug: z
    .string()
    .trim()
    .min(1, 'Informe o identificador da conta')
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(value),
      'Use letras minúsculas, números e hífen'
    ),
  /** O nome curto, que é o que aparece na tela. */
  name: z.string().trim().min(1, 'Informe o nome da conta').max(200),
  /** A razão social, como está no cartão CNPJ. */
  legalName: z.string().trim().min(1, 'Informe a razão social').max(200),
  tradeName: z.string().trim().max(200).optional(),
  /**
   * Só a forma aqui; o dígito verificador é conferido na rota.
   *
   * Não por preguiça: `@aeris/contracts` pode compor `@aeris/domain` e mais
   * nada (ADR-0003, e a regra está no dependency-cruiser), e `isValidCnpj`
   * mora em `@aeris/organization`. Nenhum contrato deste repositório valida
   * dígito verificador — o `bootstrap` e o `seed` também conferem no ponto de
   * uso —, e a alternativa seria arrastar o domínio de organização para dentro
   * dos contratos para ganhar uma mensagem de erro.
   *
   * O que NÃO muda é onde a conferência acontece: no servidor. Validar só no
   * navegador não é controle nenhum (Master Specification seção 28), e a
   * restrição do banco confere o formato — um par de dígitos trocados passa
   * por ela intacto, e descobrir isso depois custa reemitir documento.
   */
  cnpj: z
    .string()
    .trim()
    .min(1, 'Informe o CNPJ')
    .transform((value) => value.replace(/[^0-9A-Za-z]/g, '').toUpperCase())
    .refine(
      (value) => /^[0-9A-Z]{12}[0-9]{2}$/.test(value),
      'O CNPJ precisa ter 14 caracteres'
    ),
  ownerName: z.string().trim().min(1, 'Informe o nome do dono').max(200),
  ownerEmail: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail do dono')
    .max(320)
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      'Informe um e-mail válido'
    ),
})

export type CreateAccountRequest = z.input<typeof CreateAccountRequest>

export type CreateAccountBody = z.output<typeof CreateAccountRequest>

export const CreateAccountResponse = z.object({
  account: PlatformAccountSummary,
  /**
   * Devolvida uma única vez, e nunca guardada de forma legível.
   *
   * Nula quando já existia conta para este e-mail: essa pessoa fica com a senha
   * que ela escolheu, e entregar a quem abre uma loja uma credencial que
   * funciona na loja de outro cliente não é comodidade, é vazamento entre
   * contas. Mesma regra, e mesmo motivo, de `POST /team/members`.
   */
  temporaryPassword: z.string().nullable(),
  /** Falso quando uma conta de usuário que já existia foi vinculada. */
  ownerAccountCreated: z.boolean(),
})

export type CreateAccountResponse = z.infer<typeof CreateAccountResponse>

export const SuspendAccountRequest = z.object({
  /**
   * Obrigatório.
   *
   * Suspender sem motivo produz uma linha de auditoria que não responde à única
   * pergunta que alguém vai fazer daqui a seis meses — "por que essa loja
   * parou?" — e quem for responder já não vai lembrar.
   */
  reason: z.string().trim().min(3, 'Diga por quê').max(280),
})

export type SuspendAccountRequest = z.infer<typeof SuspendAccountRequest>

export const PlatformAccountResponse = z.object({
  account: PlatformAccountSummary,
})

export type PlatformAccountResponse = z.infer<typeof PlatformAccountResponse>

/**
 * A senha nova do dono de uma conta de lojista (F121).
 *
 * `ownerEmail` viaja junto de propósito: quem redefine precisa saber A QUEM
 * entregar a senha, e a tela que dispara isto é uma lista de contas, não de
 * pessoas. Sem ele, o operador leria "pronto" e não saberia para qual endereço
 * escrever.
 *
 * `revokedSessions` é o número de sessões derrubadas — a senha antiga deixou de
 * abrir, então as sessões abertas com ela também. Aparece na tela porque um
 * número diferente de zero significa que alguém foi desconectado agora, e quem
 * redefiniu deveria saber que isso aconteceu.
 */
export const ResetOwnerPasswordResponse = z.object({
  ownerEmail: z.string(),
  /** Entregue uma única vez. Nunca é guardada de forma legível, nem vai para a auditoria. */
  temporaryPassword: z.string(),
  revokedSessions: z.number().int().nonnegative(),
})

export type ResetOwnerPasswordResponse = z.infer<
  typeof ResetOwnerPasswordResponse
>

/**
 * A plataforma entra na loja de um cliente (F169).
 *
 * O motivo é obrigatório pela mesma razão do `suspend`: a única pergunta que
 * alguém faz sobre esta linha de auditoria seis meses depois é "por que a Aeris
 * estava dentro da conta do Elias naquele dia?", e quem estiver respondendo já
 * não vai lembrar.
 *
 * O adendo da ADR-0035 é onde está escrito o que isto custa: o lojista NÃO é
 * avisado, e a auditoria é a única garantia que sobra.
 */
export const StartSupportRequest = z.object({
  reason: z.string().trim().min(3, 'Diga por quê').max(280),
})

export type StartSupportRequest = z.infer<typeof StartSupportRequest>

/**
 * O que a tela precisa saber depois de entrar.
 *
 * `expiresAt` viaja porque a faixa vermelha mostra o tempo que falta, e quem
 * lê "acesso de suporte" sem prazo não sabe se são trinta minutos ou para
 * sempre.
 */
export const StartSupportResponse = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  expiresAt: z.string(),
})

export type StartSupportResponse = z.infer<typeof StartSupportResponse>

/**
 * As chaves que uma conta tem ligadas (F169).
 *
 * `z.string()` e não um enum: a lista de chaves conhecidas mora em
 * `@aeris/permissions` (`TENANT_FEATURES`), e é a rota que confere contra ela —
 * um enum aqui obrigaria a manter a mesma lista em dois pacotes, e o dia em que
 * elas divergissem a tela ofereceria uma chave que o servidor recusa.
 */
export const TenantFeatureList = z.object({
  features: z.array(z.string()),
})

export type TenantFeatureList = z.infer<typeof TenantFeatureList>

/**
 * Substitui o conjunto inteiro, e não manda uma diferença.
 *
 * Mesma decisão de `PUT /team/members/:userId/pages`: o que está marcado na
 * tela é o que fica no banco. Calcular diferença exigiria que o navegador
 * tivesse visto o mesmo estado que o servidor, e duas abas abertas quebrariam
 * isso sem aviso.
 */
export const SetTenantFeaturesRequest = z.object({
  features: z.array(z.string()).max(50),
})

export type SetTenantFeaturesRequest = z.infer<typeof SetTenantFeaturesRequest>

/**
 * As telas do núcleo que uma conta NÃO tem (F172).
 *
 * Texto, pelo mesmo motivo das chaves: quem confere contra o catálogo
 * (`pagesTenantCanDisable`) é a rota.
 */
export const TenantPagesOffList = z.object({
  pagesOff: z.array(z.string()),
})

export type TenantPagesOffList = z.infer<typeof TenantPagesOffList>

/** Substitui o conjunto inteiro de telas desligadas. */
export const SetTenantPagesOffRequest = z.object({
  pagesOff: z.array(z.string()).max(200),
})

export type SetTenantPagesOffRequest = z.infer<typeof SetTenantPagesOffRequest>

/**
 * O que a plataforma anota sobre uma conta (F169).
 *
 * Nunca chega ao lojista: a tabela só é alcançável fora de qualquer escopo de
 * loja (migração 0097). `version` 0 quando ninguém anotou nada ainda.
 */
export const PlatformAccountNoteSchema = z.object({
  contactPhone: z.string().trim().max(40).nullable(),
  contactEmail: z.string().trim().max(254).nullable(),
  notes: z.string().max(4000),
  version: z.number().int().nonnegative(),
})

export type PlatformAccountNoteSchema = z.infer<
  typeof PlatformAccountNoteSchema
>

export const PlatformAccountNoteResponse = z.object({
  note: PlatformAccountNoteSchema,
})

export type PlatformAccountNoteResponse = z.infer<
  typeof PlatformAccountNoteResponse
>

export const SavePlatformAccountNoteRequest = PlatformAccountNoteSchema

export type SavePlatformAccountNoteRequest = z.infer<
  typeof SavePlatformAccountNoteRequest
>

/**
 * O custo de IA de uma conta, mês a mês (F169).
 *
 * Separado por quem paga: `platform` é a chave da Aeris (custo nosso),
 * `tenant` é a chave do próprio lojista (custo dele, medido só para
 * transparência). Misturar os dois faria o número que decide se um cliente se
 * paga contar o que ele mesmo pagou.
 *
 * Micros de dólar como `number`, pela mesma razão escrita em `toUsage`: a
 * serialização não carrega `bigint`, e micros de uma conta num mês ficam muito
 * longe do limite de precisão de um inteiro de JavaScript.
 */
export const PlatformAiCostMonth = z.object({
  periodStart: z.string(),
  platformMicrosUsd: z.number().int().nonnegative(),
  tenantMicrosUsd: z.number().int().nonnegative(),
  runCount: z.number().int().nonnegative(),
})

export const PlatformAiCostResponse = z.object({
  months: z.array(PlatformAiCostMonth),
})

export type PlatformAiCostResponse = z.infer<typeof PlatformAiCostResponse>
