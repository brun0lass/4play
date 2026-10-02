import { z } from 'zod'

import { TagRefSchema } from './tag.ts'

/**
 * Party contracts.
 *
 * One registration carrying roles, not a customer endpoint and a supplier
 * endpoint. Master Specification section 10 — see migration 0006 for why two
 * registrations for one CNPJ is the failure mode being avoided.
 *
 * The enumerations below are repeated rather than imported from `@aeris/party`,
 * because `@aeris/contracts` may depend only on `@aeris/domain` (see
 * .dependency-cruiser.cjs). That is deliberate: the contracts package is
 * imported by the browser, and it must not drag a domain package in behind it.
 * The check constraints in migration 0006 and the tests are what keep the two
 * lists honest.
 */

export const PARTY_KIND_VALUES = ['person', 'company'] as const
export const PARTY_ROLE_VALUES = [
  'customer',
  'supplier',
  'carrier',
  'courier',
] as const
export const STATE_REGISTRATION_STATUS_VALUES = [
  'taxpayer',
  'exempt',
  'non_taxpayer',
] as const
export const ADDRESS_KIND_VALUES = ['billing', 'delivery', 'other'] as const
export const CONTACT_KIND_VALUES = [
  'phone',
  'mobile',
  'email',
  'whatsapp',
] as const
export const UF_VALUES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

export const PartyKindSchema = z.enum(PARTY_KIND_VALUES)
export const PartyRoleSchema = z.enum(PARTY_ROLE_VALUES)
export const StateRegistrationStatusSchema = z.enum(
  STATE_REGISTRATION_STATUS_VALUES
)
export const AddressKindSchema = z.enum(ADDRESS_KIND_VALUES)
export const ContactKindSchema = z.enum(CONTACT_KIND_VALUES)
export const UfSchema = z.enum(UF_VALUES)
export const PartyStatusSchema = z.enum(['active', 'archived'])

export const PartyAddressSummary = z.object({
  id: z.string(),
  kind: AddressKindSchema,
  cep: z.string().nullable(),
  street: z.string(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string(),
  ibgeCode: z.string().nullable(),
  uf: UfSchema,
  country: z.string(),
  isMain: z.boolean(),
})

export type PartyAddressSummary = z.infer<typeof PartyAddressSummary>

export const PartyContactSummary = z.object({
  id: z.string(),
  kind: ContactKindSchema,
  value: z.string(),
  label: z.string().nullable(),
  isMain: z.boolean(),
})

export type PartyContactSummary = z.infer<typeof PartyContactSummary>

export const PartySummary = z.object({
  id: z.string(),
  kind: PartyKindSchema,
  legalName: z.string(),
  tradeName: z.string().nullable(),
  /**
   * CPF or CNPJ, as stored: normalised, no punctuation, always a string.
   *
   * Master Specification section 11. The client formats it for display; the
   * server never sends a pre-formatted value, because a formatted document that
   * then travels back on an update is how punctuation ends up in the column.
   */
  document: z.string().nullable(),
  /**
   * O código do sistema de origem, quando a pessoa veio de uma importação.
   *
   * É por ele que um balcão que usou outro ERP por dez anos conhece o cliente.
   * Null para quem foi cadastrado aqui.
   */
  externalCode: z.string().nullable(),
  /**
   * O código do cliente na loja (F211): gerado ao cadastrar e editável. Null
   * só no Consumidor Final.
   */
  code: z.number().int().nullable().optional(),
  stateRegistration: z.string().nullable(),
  stateRegistrationStatus: StateRegistrationStatusSchema,
  municipalRegistration: z.string().nullable(),
  notes: z.string().nullable(),
  /** Every role the party holds. Several is normal, not exceptional. */
  roles: z.array(PartyRoleSchema),
  /**
   * As etiquetas coladas neste cadastro (F088) — "Atacado", "Não fiado".
   *
   * Só as ATIVAS: arquivar uma etiqueta a tira das telas sem apagar o vínculo,
   * então desarquivá-la devolve a classificação inteira.
   *
   * `default([])` porque o cliente pode ser mais velho que o servidor.
   */
  tags: z.array(TagRefSchema).default([]),
  /**
   * The tenant's `Consumidor Final`: structural, not registered.
   *
   * Sent so an interface can hide the edit and archive controls rather than
   * offering them and being refused. The server refuses independently — this
   * field only stops the product from advertising a button that cannot work.
   */
  isSystem: z.boolean(),
  status: PartyStatusSchema,
  /**
   * The optimistic-concurrency token, sent so the client can hand it back
   * (ADR-0014). Exposing it is deliberate: a client that cannot see it cannot
   * participate in the check, and the alternative is last-write-wins.
   */
  version: z.number().int(),
  updatedAt: z.string(),
  /**
   * As colunas escolhidas da lista (F127).
   *
   * Contato e endereço principais já vêm nas linhas que a lista carrega, então
   * não custam consulta. Opcionais porque a tela pode ser mais nova que o
   * servidor.
   */
  createdAt: z.string().optional(),
  /** WhatsApp, celular ou telefone — o principal primeiro. Só dígitos. */
  mainPhone: z.string().nullable().optional(),
  mainEmail: z.string().nullable().optional(),
  mainCity: z.string().nullable().optional(),
  mainUf: z.string().nullable().optional(),
  /** Com `include=credit` e `finance.read`. Nulo é "sem limite liberado". */
  creditLimit: z.string().nullable().optional(),
  /** Com `include=voucher` e `exchange.read`. */
  voucherBalance: z.string().optional(),
  /** Com `include=activity` e `sales.read`: a última venda concluída. */
  lastPurchaseAt: z.string().nullable().optional(),
  /** Quem vendeu por último. */
  lastSalespersonName: z.string().nullable().optional(),
  /** O vendedor do cliente — a carteira (F210). */
  salespersonUserId: z.string().nullable().optional(),
  salespersonName: z.string().nullable().optional(),
})

export type PartySummary = z.infer<typeof PartySummary>

/** A single party, with every address and contact it carries. */
export const PartyDetail = PartySummary.extend({
  addresses: z.array(PartyAddressSummary),
  contacts: z.array(PartyContactSummary),
})

export type PartyDetail = z.infer<typeof PartyDetail>

/**
 * Offset pagination, capped, exactly as the catalogue does it.
 *
 * An uncapped page size is a way for one request to read every customer in a
 * tenant, which is both a performance and a data-exfiltration concern — and a
 * party list is more sensitive than a product list, because it is personal data
 * rather than a price sheet.
 */
export const PartyListQuery = z.object({
  search: z.string().trim().max(120).optional(),
  status: PartyStatusSchema.optional(),
  role: PartyRoleSchema.optional(),
  /**
   * Só o Consumidor Final da conta — a pessoa estrutural (F104).
   *
   * Existe porque procurá-lo numa página é um chute: quem pedia os primeiros
   * cinquenta clientes e fazia `find(isSystem)` achava numa conta pequena e
   * **não achava** numa conta com 8988 pessoas, onde ele não está entre os
   * cinquenta primeiros por nome. O que vinha depois era pior que nada — um
   * `?? items[0]` nomeando quem ordena primeiro.
   *
   * `aeris.party` tem índice único parcial em `(tenant_id) where is_system`,
   * então a resposta é sempre nenhuma linha ou uma. Uma pergunta com resposta
   * única não deve ser feita como busca.
   */
  system: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  /**
   * Os filtros de coluna (F152).
   *
   * `kind` é coluna do próprio cadastro e custa um `where`. `city` mora no
   * ENDEREÇO, então custa um `EXISTS` — o mesmo desenho do filtro de papel
   * logo acima, e pelo mesmo motivo: uma pessoa com dois endereços na mesma
   * cidade não pode aparecer duas vezes.
   */
  kind: PartyKindSchema.optional(),
  city: z.string().trim().max(120).optional(),
  /** A carteira (F210): o id de um vendedor, ou `none` para quem está sem. */
  salesperson: z.union([z.uuid(), z.literal('none')]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /**
   * Por onde a lista se ordena (F185).
   *
   * Ficaram de fora, por custo: papéis (agregado de N linhas, e a ordem
   * alfabética de "carrier,customer" não quer dizer nada), saldo de vale
   * (soma do razão de crédito de TODOS os clientes que passam pelo filtro,
   * antes da página), vendedor e última compra (o mesmo, sobre os documentos
   * de venda), e telefone/e-mail (a tela mostra o primeiro contato, e uma
   * junção pelo principal ordenaria por um valor diferente do exibido).
   */
  sort: z
    .enum([
      'legalName',
      'code',
      'document',
      'kind',
      'city',
      'creditLimit',
      'stateRegistration',
      'status',
      'createdAt',
    ])
    .default('legalName'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  /**
   * O que juntar às linhas, separado por vírgula (F127): `credit`, `voucher`,
   * `activity`. Cada um é uma consulta a mais para a página, e só vem para
   * quem tem a permissão do módulo dono do dado.
   */
  include: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? [] : value.split(',').map((part) => part.trim())
    )
    .pipe(z.array(z.enum(['credit', 'voucher', 'activity']))),
})

/** The wire-input type, where `z.coerce` widens numbers because a query string carries text. */
export type PartyListQuery = z.input<typeof PartyListQuery>

/** What a client passes. Numbers are numbers. */
export type PartyListRequest = {
  search?: string | undefined
  status?: 'active' | 'archived' | undefined
  role?: 'customer' | 'supplier' | 'carrier' | 'courier' | undefined
  /** Só o Consumidor Final (F104). O espelho do schema acima. */
  system?: boolean | undefined
  /** A carteira (F210): o id de um vendedor, ou `none`. */
  salesperson?: string | undefined
  /** Os filtros de coluna (F152). */
  kind?: 'person' | 'company' | undefined
  city?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
  sort?:
    | 'legalName'
    | 'code'
    | 'document'
    | 'kind'
    | 'city'
    | 'creditLimit'
    | 'stateRegistration'
    | 'status'
    | 'createdAt'
    | undefined
  direction?: 'asc' | 'desc' | undefined
  include?: readonly ('credit' | 'voucher' | 'activity')[] | undefined
}

export const PartyList = z.object({
  items: z.array(PartySummary),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

export type PartyList = z.infer<typeof PartyList>

const legalNameField = z.string().trim().min(1, 'Informe o nome').max(200)

/**
 * Blank means "no value" rather than an empty string.
 *
 * Two variants, because absence means different things in the two operations
 * and conflating them is how a PATCH silently wipes a field:
 *
 *   creating — absent is simply no value, so it becomes null
 *   updating — absent means "leave this alone"; an explicit null clears it
 */
const optionalOnCreate = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null)

const optionalOnUpdate = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional()

/**
 * At least one role.
 *
 * A party with no role is a registration nobody can use: it appears in no
 * customer picker and no supplier picker, so it exists only in this module's
 * own list. Refusing it at the contract is cheaper than explaining it later.
 */
const rolesField = z
  .array(PartyRoleSchema)
  .min(1, 'Escolha ao menos um papel')
  .max(PARTY_ROLE_VALUES.length)

/*
 * Os campos de um endereço e de um contato, sem a versão (F130).
 *
 * Declarados aqui em cima porque servem a dois pedidos: o de acrescentar a um
 * cadastro que existe (com a versão da pessoa) e o de cadastrar já com eles.
 */
const addressShape = {
  kind: AddressKindSchema.default('other'),
  cep: optionalOnCreate(9),
  street: z.string().trim().min(1, 'Informe o logradouro').max(200),
  number: optionalOnCreate(20),
  complement: optionalOnCreate(120),
  district: optionalOnCreate(120),
  city: z.string().trim().min(1, 'Informe o município').max(120),
  ibgeCode: optionalOnCreate(7),
  uf: UfSchema,
  country: z.string().trim().min(2).max(60).default('BR'),
  isMain: z.boolean().default(false),
}

const contactShape = {
  kind: ContactKindSchema,
  value: z.string().trim().min(1, 'Informe o contato').max(200),
  label: optionalOnCreate(120),
  isMain: z.boolean().default(false),
}

export const CreatePartyRequest = z.object({
  kind: PartyKindSchema,
  legalName: legalNameField,
  tradeName: optionalOnCreate(200),
  /**
   * Max 20 rather than 14: the field accepts a formatted document and the
   * server normalises it. Validation of the check digits happens in the
   * handler, where a failure can be a message rather than a parse error.
   */
  document: optionalOnCreate(20),
  stateRegistration: optionalOnCreate(20),
  stateRegistrationStatus:
    StateRegistrationStatusSchema.default('non_taxpayer'),
  municipalRegistration: optionalOnCreate(20),
  notes: optionalOnCreate(2000),
  /** O vendedor do cliente (F210). */
  salespersonUserId: z.uuid().nullable().optional(),
  /** O código (F211). Ausente: o próximo da loja. */
  code: z.number().int().positive().max(999_999_999_999_999).optional(),
  roles: rolesField,
  /**
   * O endereço de quem está sendo cadastrado, gravado na mesma transação
   * (F130). Vira o principal. Ausente: o cadastro nasce sem endereço, como
   * sempre nasceu.
   */
  address: z.object(addressShape).optional(),
  /** Os contatos, na mesma transação. O primeiro vira o principal. */
  contacts: z.array(z.object(contactShape)).max(20).default([]),
})

export type CreatePartyRequest = z.input<typeof CreatePartyRequest>

/** What the handler receives, after defaults and transforms have been applied. */
export type CreatePartyBody = z.output<typeof CreatePartyRequest>

export const UpdatePartyRequest = z.object({
  /** Required: see PartySummary.version. */
  version: z.number().int().nonnegative(),
  kind: PartyKindSchema.optional(),
  legalName: legalNameField.optional(),
  tradeName: optionalOnUpdate(200),
  document: optionalOnUpdate(20),
  stateRegistration: optionalOnUpdate(20),
  stateRegistrationStatus: StateRegistrationStatusSchema.optional(),
  municipalRegistration: optionalOnUpdate(20),
  notes: optionalOnUpdate(2000),
  /** O vendedor do cliente (F210). Ausente não mexe; nulo tira. */
  salespersonUserId: z.uuid().nullable().optional(),
  /** O código (F211). Ausente não mexe. */
  code: z.number().int().positive().max(999_999_999_999_999).optional(),
  /** Absent leaves the roles alone; present replaces the whole set. */
  roles: rolesField.optional(),
})

export type UpdatePartyRequest = z.input<typeof UpdatePartyRequest>

export type UpdatePartyBody = z.output<typeof UpdatePartyRequest>

export type PartyListParams = z.output<typeof PartyListQuery>

export const ArchivePartyRequest = z.object({
  version: z.number().int().nonnegative(),
})

export type ArchivePartyRequest = z.infer<typeof ArchivePartyRequest>

export const PartyResponse = z.object({
  party: PartyDetail,
})

/** O próximo código de cliente da loja, sem reservar (F211). */
export const NextPartyCodeResponse = z.object({
  code: z.number().int().positive(),
})

export type NextPartyCodeResponse = z.infer<typeof NextPartyCodeResponse>

export type PartyResponse = z.infer<typeof PartyResponse>

// ---------------------------------------------------------------------------
// Addresses and contacts
// ---------------------------------------------------------------------------
//
// Both carry the party's `version`, not one of their own. The party is the
// aggregate root: adding an address is a change to the registration, and it
// bumps the same token an edit of the name would. Two people working on one
// customer are therefore serialised against each other rather than silently
// interleaved.

export const PartyAddressRequest = z.object({
  version: z.number().int().nonnegative(),
  ...addressShape,
})

export type PartyAddressRequest = z.input<typeof PartyAddressRequest>

export type PartyAddressBody = z.output<typeof PartyAddressRequest>

export const PartyContactRequest = z.object({
  version: z.number().int().nonnegative(),
  ...contactShape,
})

export type PartyContactRequest = z.input<typeof PartyContactRequest>

export type PartyContactBody = z.output<typeof PartyContactRequest>

export const RemovePartyChildRequest = z.object({
  version: z.number().int().nonnegative(),
})

export type RemovePartyChildRequest = z.infer<typeof RemovePartyChildRequest>
