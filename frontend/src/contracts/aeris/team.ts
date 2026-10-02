import { z } from 'zod'

import { RoleSchema } from './auth.ts'

/**
 * Team contracts — who has access to the active tenant, and on what terms.
 *
 * The word "equipe" in the interface is deliberate and so is what it excludes.
 * This is not an employee record: there is no salary, no hiring date, no
 * document number and no job title, because none of those are access. An HR
 * module, when it exists, will reference a person; this references an account.
 *
 * As everywhere, a response is declared through `jsonResponse()` and therefore
 * serialised by `fast-json-stringify` from exactly these fields. That makes the
 * schema an output whitelist: `password_hash` and `token_hash` cannot leak
 * through a handler that selected them by accident. See ADR-0005.
 */

export const MemberStatusSchema = z.enum(['active', 'disabled'])

export type MemberStatus = z.infer<typeof MemberStatusSchema>

export const TeamMemberSummary = z.object({
  userId: z.string(),
  membershipId: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: RoleSchema,
  /** Access to *this* tenant. Not the account, which may serve others. */
  status: MemberStatusSchema,
  /**
   * The account itself.
   *
   * Distinct from `status` because they answer different questions: a disabled
   * membership means "no longer works here", a disabled account means "cannot
   * sign in at all". Only the first is changeable from this screen.
   */
  accountStatus: MemberStatusSchema,
  /** True while they are holding a password an administrator generated. */
  mustChangePassword: z.boolean(),
  /** Most recent activity in this tenant. Null if they have never signed in. */
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
  /** Optimistic-concurrency token of the membership (ADR-0014). */
  version: z.number().int(),
  /**
   * True for the person reading the list.
   *
   * Computed by the server rather than compared in the browser, so the row that
   * must not offer "disable" is identified by the same authority that would
   * refuse it.
   */
  isSelf: z.boolean(),
})

export type TeamMemberSummary = z.infer<typeof TeamMemberSummary>

/**
 * Quem pode ser escolhido como vendedor (F034).
 *
 * Deliberadamente magro: id e nome, e nada mais. Um operador de balcão precisa
 * escolher quem atendeu, e para isso não precisa — nem deve — ver o e-mail, o
 * papel, a última sessão ou o estado da conta de cada colega. Reaproveitar
 * `TeamMemberSummary` aqui entregaria a ficha administrativa da equipe inteira
 * a quem só queria um nome numa lista.
 */
export const SalespersonSummary = z.object({
  userId: z.string(),
  displayName: z.string(),
})

export type SalespersonSummary = z.infer<typeof SalespersonSummary>

export const SalespersonList = z.object({
  items: z.array(SalespersonSummary),
})

export type SalespersonList = z.infer<typeof SalespersonList>

export const TeamListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: MemberStatusSchema.optional(),
  /** Só um papel — "quem são os caixas" (F136). */
  role: RoleSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Capped like every list: an uncapped page size is a way for one request to
  // read the whole table.
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['displayName', 'email']).default('displayName'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type TeamListQuery = z.input<typeof TeamListQuery>

export type TeamListParams = z.output<typeof TeamListQuery>

/** What a client passes; numbers are numbers. */
export type TeamListRequest = {
  search?: string | undefined
  status?: MemberStatus | undefined
  role?: z.infer<typeof RoleSchema> | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?: 'displayName' | 'email' | undefined
  direction?: 'asc' | 'desc' | undefined
}

export const TeamList = z.object({
  items: z.array(TeamMemberSummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type TeamList = z.infer<typeof TeamList>

export const AddMemberRequest = z.object({
  displayName: z.string().trim().min(1, 'Informe o nome').max(200),
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail')
    .max(320)
    // Lower-cased on the server, never only in the browser: `user_account` has
    // a check constraint proving addresses are stored lower-cased, and the
    // uniqueness index is on the stored value.
    .transform((value) => value.toLowerCase())
    .refine(
      (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      'Informe um e-mail válido'
    ),
  role: RoleSchema,
})

export type AddMemberRequest = z.input<typeof AddMemberRequest>

export type AddMemberBody = z.output<typeof AddMemberRequest>

export const AddMemberResponse = z.object({
  member: TeamMemberSummary,
  /**
   * Returned exactly once, and never stored in a readable form.
   *
   * There is no e-mail infrastructure yet, so the administrator has to hand the
   * password over themselves. Null when an account for this address already
   * existed: that person keeps the password they chose, and an administrator of
   * one tenant must not be handed a working credential for another. See
   * docs/features/F011-team.md.
   */
  temporaryPassword: z.string().nullable(),
  /** False when an existing account was linked to this tenant. */
  accountCreated: z.boolean(),
})

export type AddMemberResponse = z.infer<typeof AddMemberResponse>

/**
 * As telas de uma pessoa (F038).
 *
 * `allowed` é o que ela alcança hoje; `available` é o que o papel dela
 * permitiria. A tela mostra os dois porque o que o papel não alcança aparece
 * desmarcado e travado — sumir faria o admin procurar o que não está lá.
 */
export const MemberPagesResponse = z.object({
  allowed: z.array(z.string()),
  available: z.array(z.string()),
})

export type MemberPagesResponse = z.infer<typeof MemberPagesResponse>

/**
 * O que fica marcado na tela é o que fica no banco.
 *
 * Manda a lista inteira do que é permitido, e não a diferença: calcular
 * diferença exigiria que o navegador tivesse visto o mesmo estado do servidor,
 * e duas abas abertas quebrariam isso sem aviso.
 */
export const ChangeMemberPagesRequest = z.object({
  allowed: z.array(z.string()).max(200),
})

export type ChangeMemberPagesRequest = z.infer<typeof ChangeMemberPagesRequest>

export const ChangeMemberRoleRequest = z.object({
  version: z.number().int().nonnegative(),
  role: RoleSchema,
})

export type ChangeMemberRoleRequest = z.infer<typeof ChangeMemberRoleRequest>

export const SetMemberStatusRequest = z.object({
  version: z.number().int().nonnegative(),
})

export type SetMemberStatusRequest = z.infer<typeof SetMemberStatusRequest>

export const MemberResponse = z.object({
  member: TeamMemberSummary,
  /**
   * Sessions ended as a direct consequence of this request.
   *
   * Reported rather than left implicit, because "disabled, and three live
   * sessions closed" is the sentence an administrator needs to believe the
   * access is actually gone.
   */
  revokedSessions: z.number().int().nonnegative(),
})

export type MemberResponse = z.infer<typeof MemberResponse>

export const ResetMemberPasswordResponse = z.object({
  member: TeamMemberSummary,
  /** One-time, same rule as `AddMemberResponse.temporaryPassword`. */
  temporaryPassword: z.string(),
  revokedSessions: z.number().int().nonnegative(),
})

export type ResetMemberPasswordResponse = z.infer<
  typeof ResetMemberPasswordResponse
>

export const MemberSessionSummary = z.object({
  id: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  /** Null when the request arrived without one the server could record. */
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** True for the session making this request, so nobody ends their own by accident. */
  isCurrent: z.boolean(),
})

export type MemberSessionSummary = z.infer<typeof MemberSessionSummary>

export const MemberSessionList = z.object({
  sessions: z.array(MemberSessionSummary),
})

export type MemberSessionList = z.infer<typeof MemberSessionList>

export const RevokeSessionsResponse = z.object({
  revokedSessions: z.number().int().nonnegative(),
})

export type RevokeSessionsResponse = z.infer<typeof RevokeSessionsResponse>
