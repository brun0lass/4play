import { z } from 'zod'

/**
 * Authentication contracts.
 *
 * Shared by the API and the web app, so the client cannot drift from the
 * server's idea of a response. Authored in Zod; every response is declared to
 * Fastify through `jsonResponse()`, which converts these to JSON Schema so
 * `fast-json-stringify` writes them. See ADR-0005.
 *
 * That conversion has a security consequence worth stating plainly: the schema
 * is an output whitelist. A field that is not declared here cannot appear in a
 * response, so `password_hash` and `token_hash` cannot leak through an endpoint
 * that accidentally selected them.
 */

export const ROLE_VALUES = [
  'owner',
  'admin',
  'manager',
  'cashier',
  'trocador',
  'salesperson',
] as const

export const RoleSchema = z.enum(ROLE_VALUES)

/**
 * How the session token should be carried.
 *
 * Browsers use the httpOnly cookie and never see the token — that is the point
 * of httpOnly. Non-browser clients (the Tauri shell, an Edge, a future mobile
 * app) cannot rely on a cookie jar, so they ask for the token explicitly and
 * send it as a Bearer header. See ADR-0012.
 */
export const SessionTransport = z.enum(['cookie', 'bearer'])

export type SessionTransport = z.infer<typeof SessionTransport>

export const LoginRequest = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail')
    .max(320)
    .transform((value) => value.toLowerCase()),
  // Not `.email()`: the address is verified by looking it up, not by matching a
  // pattern, and a stricter regex here would only reject valid addresses while
  // telling an attacker which ones parse.
  password: z.string().min(1, 'Informe a senha').max(256),
  transport: SessionTransport.default('cookie'),
})

export type LoginRequest = z.input<typeof LoginRequest>

export const UserSummary = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  isPlatformAdmin: z.boolean(),
  /**
   * True while this account holds a password somebody else chose.
   *
   * Sent so the interface can send the user straight to the change-password
   * screen instead of to a shell whose every request would be refused. It is
   * not the enforcement: the API rejects every permission-checked route with
   * `password_change_required` while the flag is set, which is what actually
   * makes the change compulsory. Master Specification section 28.
   */
  mustChangePassword: z.boolean(),
})

export type UserSummary = z.infer<typeof UserSummary>

export const MembershipSummary = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  /**
   * Para o seletor poder dizer por que a conta não abre (F119).
   *
   * Dois valores, não três: a consulta que alimenta isto não devolve conta
   * arquivada. Uma suspensa aparece de propósito — o lojista precisa ler uma
   * frase, não encontrar um Aeris vazio.
   */
  tenantStatus: z.enum(['active', 'suspended']),
  role: RoleSchema,
})

export type MembershipSummary = z.infer<typeof MembershipSummary>

/**
 * The organisational context a session is acting in.
 *
 * Null when the user has authenticated but belongs to no tenant — a real state,
 * not an error, and one the interface has to render honestly rather than
 * crashing on.
 */
export const ActiveContext = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  companyId: z.string().nullable(),
  /** Razão social. */
  companyName: z.string().nullable(),
  /**
   * Nome fantasia, when the company has one.
   *
   * The topbar shows this rather than the legal name: "Elite Digital" is what
   * an operator recognises, and "Elite Digital Comércio e Serviços LTDA" only
   * fits a topbar by being truncated into uselessness.
   */
  companyTradeName: z.string().nullable(),
  branchId: z.string().nullable(),
  branchName: z.string().nullable(),
  role: RoleSchema,
})

export type ActiveContext = z.infer<typeof ActiveContext>

export const SessionResponse = z.object({
  user: UserSummary,
  context: ActiveContext.nullable(),
  memberships: z.array(MembershipSummary),
  /**
   * What this session may do, resolved from the active role.
   *
   * Sent so the interface can hide what the user cannot do. It is never the
   * enforcement — the API checks independently on every request. Master
   * Specification section 28.
   */
  permissions: z.array(z.string()),
  /**
   * As telas que esta pessoa vê no menu (F038).
   *
   * Vem separado das permissões porque não dá para deduzir uma da outra:
   * Vendas e Orçamentos exigem a mesma `sales.read`, e tirar a primeira não
   * pode revogar a permissão da segunda. Sem esta lista o menu mostrava a tela
   * que o admin acabara de desmarcar.
   *
   * Lista vazia significa "esta resposta não sabe" — uma sessão guardada por
   * uma versão anterior do produto —, e nesse caso o menu volta a decidir só
   * pela permissão. Nunca é vazia de verdade: `inicio` não é negável.
   */
  pages: z.array(z.string()).default([]),
  /**
   * As chaves que a CONTA tem ligadas (F169).
   *
   * Por conta, e não por pessoa: quem liga é o console da plataforma. O
   * servidor já desconta de `pages` as telas cuja chave está desligada — o menu
   * confere de novo porque uma sessão guardada por versão anterior do produto
   * chega com `pages` vazio, e nesse caso `pages` deixa de decidir.
   *
   * Vazio é o estado de quase toda loja, e não significa "não sei": significa
   * "esta conta não tem chave nenhuma", que é o padrão certo — chave é
   * concessão, ao contrário de `pages`, que é negação.
   */
  features: z.array(z.string()).default([]),
  /**
   * A plataforma está dentro desta loja por esta sessão (F169).
   *
   * Nulo em toda sessão normal, que é a esmagadora maioria delas. Quando
   * presente, a tela mostra a faixa de suporte com o nome da conta e o tempo
   * que falta — quem vê "acesso de suporte" sem prazo não sabe se são trinta
   * minutos ou para sempre.
   *
   * Isto é para o OPERADOR, não para o lojista: por decisão do dono
   * (adendo da ADR-0035), o cliente não é avisado, e a sessão dele nunca traz
   * este campo preenchido.
   */
  support: z
    .object({
      tenantName: z.string(),
      expiresAt: z.string(),
    })
    .nullable()
    .default(null),
  /** Present only when `transport: 'bearer'` was requested. */
  token: z.string().optional(),
})

export type SessionResponse = z.infer<typeof SessionResponse>

export const SwitchContextRequest = z.object({
  tenantId: z.string().min(1),
  /** Null clears the selection rather than leaving the previous one behind. */
  companyId: z.string().nullable().default(null),
  branchId: z.string().nullable().default(null),
})

export type SwitchContextRequest = z.input<typeof SwitchContextRequest>

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
})

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>

export const LogoutResponse = z.object({
  status: z.literal('signed-out'),
})

export type LogoutResponse = z.infer<typeof LogoutResponse>

export const ChangePasswordResponse = z.object({
  status: z.literal('password-changed'),
  /** Other sessions of this user that were revoked as a consequence. */
  revokedSessions: z.number().int().nonnegative(),
})

export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponse>

/* --- Autorização de supervisor (ADR-0026, F034) --------------------------- */

/**
 * Alguém com mais autoridade autoriza uma ação de outra pessoa.
 *
 * "para cancelar tem que confirmar com senha" — a frase da Elite Digital. O
 * que ela pede não é a senha: é a resposta à pergunta que aparece meses
 * depois, quando alguém quer saber por que aquela peça voltou ao estoque em
 * março e quem disse que podia.
 *
 * Presa à ação E ao alvo de propósito. Um "sim" que valesse para mais de uma
 * coisa seria um "sim" para a coisa que o gerente não viu.
 */
export const AuthorizeRequest = z.object({
  email: z.email().trim().toLowerCase().max(320),
  password: z.string().min(1).max(256),
  /** A permissão exercida, no vocabulário de `@aeris/permissions`. */
  action: z.string().trim().min(1).max(80),
  targetType: z.enum(['sales_document', 'cash_session', 'party', 'exchange']),
  targetId: z.string().min(1),
  /** Obrigatório: um cancelamento sem motivo é um que ninguém defende depois. */
  reason: z.string().trim().min(3).max(500),
  /**
   * O que está sendo aprovado, quando a ação tem conteúdo (F148).
   *
   * A troca sem venda manda cliente, peças e valores — que o admin viu na tela
   * antes de digitar a senha. Fica gravado na autorização, e a troca só
   * conclui se o pedido for exatamente isto.
   */
  detail: z.record(z.string(), z.unknown()).optional(),
})

export type AuthorizeRequest = z.infer<typeof AuthorizeRequest>

export const AuthorizeResponse = z.object({
  /**
   * O id do registro de autorização, que É o token.
   *
   * Não há um cofre de tokens separado, e a ausência é deliberada: o registro
   * já existe, já é imutável e já carrega tudo que precisa ser verificado —
   * tenant, ação, alvo e instante. Um segundo objeto guardando os mesmos
   * fatos só criaria a chance de os dois discordarem.
   *
   * Uso único não é imposto por um campo "consumido" (a tabela não aceita
   * UPDATE): é imposto pelo alvo. Um documento cancelado não cancela de novo,
   * então repetir o token não faz nada uma segunda vez.
   */
  authorisationId: z.string(),
  /** Quem autorizou, para a tela poder dizer em vez de só deixar passar. */
  authorisedBy: z.string(),
  expiresAt: z.string(),
})

export type AuthorizeResponse = z.infer<typeof AuthorizeResponse>
