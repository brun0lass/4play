import { z } from 'zod'

/**
 * The sync contracts between an Aeris Edge and the Cloud (ADR-0019).
 *
 * Two directions, and they are not symmetrical, which is the whole design:
 *
 *   * **Down** is a SNAPSHOT. The Cloud owns the catalogue, so the Edge
 *     replaces its copy wholesale and there is no conflict to resolve.
 *   * **Up** is a LOG of things that happened. Nothing can be discarded, so
 *     every entry is an insert, applied idempotently by the id the Edge minted
 *     when it queued the entry.
 *
 * Both are **pulled and pushed by the Edge**, never initiated by the Cloud.
 * The docs originally said the Cloud would push the catalogue down; that
 * cannot work, because an Edge sits on a shop's network behind NAT and has no
 * address the Cloud can reach. The party that can open a connection is the one
 * that has to.
 *
 * Every amount is a string, for the reason ADR-0016 gives.
 */

const AMOUNT = /^-?\d{1,12}(\.\d{1,6})?$/

const amount = (label: string) =>
  z
    .string()
    .trim()
    .regex(AMOUNT, `${label} deve ser um número com ponto decimal.`)

// ---------------------------------------------------------------------------
// Down: the catalogue snapshot
// ---------------------------------------------------------------------------

export const EdgeSnapshotVariant = z.object({
  variantId: z.string(),
  productId: z.string(),
  name: z.string(),
  sku: z.string(),
  gtin: z.string().nullable(),
  /**
   * Se esta loja conta este produto (F028).
   *
   * Vai para o Edge porque o balcão offline precisa da mesma resposta que o
   * online: a Elite Digital tem 5309 produtos importados e zero saldos, e um
   * PDV que avisasse "sem estoque" em todos eles seria pior do que não avisar
   * em nenhum — é exatamente o defeito que a F028 removeu.
   *
   * `default(true)` para um Edge que sincronize contra uma nuvem anterior a
   * este campo: contar é o padrão do produto, e o erro nessa direção é um
   * aviso a mais, não uma venda a menos.
   *
   * ## O que este campo passou a significar (F102)
   *
   * **"o balcão conta esta variante"** — uma resposta RESOLVIDA, e não mais o
   * espelho de `product.tracks_stock`. O servidor combina a chave da empresa
   * (`company.counts_stock`) com a do produto antes de mandar, porque a
   * alternativa seria descer duas políticas e deixar o Edge recombiná-las: uma
   * segunda implementação da regra, no lugar onde ninguém está olhando quando
   * ela diverge.
   *
   * Consequência: um Edge com snapshot velho continua contando até
   * sincronizar.
   */
  tracksStock: z.boolean().default(true),
  unit: z.string(),
  isActive: z.boolean(),
  /**
   * A identificação do fornecedor e onde a peça fica NESTA filial (F141).
   *
   * Descem para o balcão offline mostrar e achar pela gaveta como o online.
   * `default(null)` para uma nuvem anterior a estes campos.
   */
  supplierReference: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  /**
   * A variação padrão do produto, de onde esta cor tira o preço quando não
   * tem o seu (F176). Nula no produto de uma variação só.
   */
  fallbackVariantId: z.string().nullable().default(null),
  /**
   * What the Cloud believes this branch holds, right now.
   *
   * Signed, because it can be negative — see the conflict rule in ADR-0019.
   * An Edge that refused to accept a negative opening balance would refuse to
   * accept the truth.
   */
  openingQuantity: amount('A quantidade'),
})

export type EdgeSnapshotVariant = z.infer<typeof EdgeSnapshotVariant>

export const EdgeSnapshotTier = z.object({
  id: z.string(),
  variantId: z.string(),
  minQuantity: amount('A quantidade mínima'),
  unitPrice: amount('O preço'),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: z.enum(['active', 'archived']),
})

export type EdgeSnapshotTier = z.infer<typeof EdgeSnapshotTier>

export const EdgeSnapshotPaymentMethod = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: z.string(),
  status: z.enum(['active', 'archived']),
  displayOrder: z.number().int(),
})

export type EdgeSnapshotPaymentMethod = z.infer<
  typeof EdgeSnapshotPaymentMethod
>

/**
 * Um caixa que já está aberto na nuvem quando o Edge sincroniza (F042).
 *
 * ## O furo que isto tapa
 *
 * A pessoa abre o caixa de manhã pelo navegador, a internet cai às onze, e o
 * PDV passa a vender contra o Edge. Sem esta lista, o Edge não conhece aquele
 * turno e abre um segundo — e, na volta, a nuvem responde "já existe caixa
 * aberto neste terminal" e recusa a operação **para sempre**, porque uma recusa
 * do Edge é permanente por desenho.
 *
 * O resultado seria a pior forma de perder dinheiro que este produto tem: as
 * vendas do Edge chegam órfãs de um turno que a nuvem não aceitou, e alguém
 * descobre no fechamento.
 *
 * Com esta lista, o Edge **continua** o turno em vez de abrir outro: mesmo id,
 * mesma gaveta, uma conferência só no fim do dia.
 */
export const EdgeSnapshotSession = z.object({
  /** O id da nuvem. É ele que o Edge adota, e é isso que faz ser o mesmo turno. */
  id: z.string(),
  terminalId: z.string(),
  openingFloat: amount('O fundo de troco'),
  openedAt: z.string(),
  /** Quem abriu. Null quando a nuvem não sabe — não impede continuar. */
  openedByUserId: z.string().nullable(),
})

export type EdgeSnapshotSession = z.infer<typeof EdgeSnapshotSession>

export const EdgeSnapshotResponse = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  /** Null when the tenant has no default list — the Edge then sells nothing. */
  priceListId: z.string().nullable(),
  consumerPartyId: z.string(),
  /**
   * Se a loja autorizou vender abaixo de zero (F103).
   *
   * A PRIMEIRA política de empresa a descer para o Edge, e ela desce porque o
   * balcão offline decide sozinho: sem isto, uma loja com o negativo ligado
   * venderia na nuvem e seria recusada no zero assim que a internet caísse —
   * exatamente a hora em que a loja menos pode parar.
   *
   * Fecha também uma incoerência que já existia: o Edge SEMPRE aceitou
   * negativo ao sincronizar (uma venda offline é um fato consumado, ADR-0019)
   * enquanto a tela recusava antes de deixar vender.
   *
   * `default(false)` para um Edge que sincronize contra uma nuvem anterior a
   * este campo: recusar é o lado conservador, e é o comportamento de hoje.
   */
  allowNegativeStock: z.boolean().default(false),
  variants: z.array(EdgeSnapshotVariant),
  tiers: z.array(EdgeSnapshotTier),
  paymentMethods: z.array(EdgeSnapshotPaymentMethod),
  /**
   * Os turnos abertos nesta filial, para o Edge continuá-los (F042).
   *
   * Lista e não um só: uma filial tem mais de uma gaveta, e o Edge atende
   * todas. Vazio numa loja que não abriu o caixa ainda.
   */
  openSessions: z.array(EdgeSnapshotSession).default([]),
  /** When the Cloud built this. Shown at the counter, not used for merging. */
  generatedAt: z.string(),
})

export type EdgeSnapshotResponse = z.infer<typeof EdgeSnapshotResponse>

export const EdgeSnapshotQuery = z.object({
  branchId: z.string().min(1).optional(),
})

export type EdgeSnapshotParams = z.output<typeof EdgeSnapshotQuery>

// ---------------------------------------------------------------------------
// Up: what happened at the counter
// ---------------------------------------------------------------------------

export const EdgeOperationRequest = z.object({
  /** The Edge's own id for this operation. UUIDv7, and the idempotency key. */
  id: z.uuid(),
  operation: z.enum(['cash.session.opened', 'sales.sale.completed']),
  /** Validated per operation once the kind is known. */
  payload: z.looseObject({}),
})

export type EdgeOperationRequest = z.infer<typeof EdgeOperationRequest>

export const EdgeSyncRequest = z.object({
  branchId: z.string().min(1).optional(),
  /**
   * Capped at 200.
   *
   * An Edge that has been offline for a week has thousands queued, and one
   * request carrying all of them is a request that times out and is retried
   * forever. Batches drain; a single giant push does not.
   */
  operations: z.array(EdgeOperationRequest).min(1).max(200),
})

export type EdgeSyncBody = z.output<typeof EdgeSyncRequest>

export const EdgeOperationResult = z.object({
  id: z.string(),
  /**
   * `applied` — it took effect on this delivery.
   * `duplicate` — it had already been applied, and this is the same answer.
   * `refused` — the Cloud will never accept it, so the Edge must stop retrying.
   */
  status: z.enum(['applied', 'duplicate', 'refused']),
  /** The Cloud's id for what was created, when there is one. */
  documentId: z.string().nullable(),
  /** Set on `refused`, and meant to be readable by a person, not a machine. */
  message: z.string().nullable(),
})

export type EdgeOperationResult = z.infer<typeof EdgeOperationResult>

export const EdgeSyncResponse = z.object({
  results: z.array(EdgeOperationResult),
})

export type EdgeSyncResponse = z.infer<typeof EdgeSyncResponse>

// ---------------------------------------------------------------------------
// As credenciais das máquinas (F041)
// ---------------------------------------------------------------------------
//
// Nada aqui é falado pelo Edge: é a tela do administrador emitindo e revogando
// as credenciais que o Edge usa. Mora neste arquivo por assunto, e não em
// `team.ts`, porque quem procura "como o Edge se autentica" abre este.

export const EdgeCredentialSummary = z.object({
  id: z.string(),
  branchId: z.string(),
  branchName: z.string(),
  /** "Balcão — PC da frente". Sem isto, revogar é adivinhar. */
  name: z.string(),
  actsAsUserId: z.string(),
  /** Quem responde pelo que esta máquina grava. */
  actsAsDisplayName: z.string(),
  createdAt: z.string(),
  /**
   * O último contato com a nuvem, ou nulo se nunca houve um.
   *
   * É o que substitui a validade: a credencial não expira, e a pergunta que a
   * tela responde é "há quanto tempo esta máquina não aparece?".
   */
  lastSeenAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedReason: z.string().nullable(),
})

export type EdgeCredentialSummary = z.infer<typeof EdgeCredentialSummary>

export const EdgeCredentialListResponse = z.object({
  items: z.array(EdgeCredentialSummary),
})

export type EdgeCredentialListResponse = z.infer<
  typeof EdgeCredentialListResponse
>

export const CreateEdgeCredentialRequest = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  /**
   * Quem esta máquina representa no que ela grava.
   *
   * Existe porque um caixa aberto tem um responsável, e uma máquina não é uma
   * pessoa. Escolhido na criação, em vez de deduzido de quem clicou: quem
   * instala o Edge costuma ser o dono, e o turno pertence a quem fica no
   * balcão.
   */
  actsAsUserId: z.string().min(1),
})

export type CreateEdgeCredentialRequest = z.infer<
  typeof CreateEdgeCredentialRequest
>

export const CreateEdgeCredentialResponse = z.object({
  credential: EdgeCredentialSummary,
  /**
   * O token, uma vez só.
   *
   * O banco guarda o hash, então nem o servidor consegue mostrá-lo de novo. A
   * tela precisa dizer isso ANTES de a pessoa fechar o diálogo — quem perde o
   * token não perde nada além do trabalho de emitir outro, mas descobrir isso
   * com o Edge já instalado custa uma viagem à loja.
   */
  token: z.string(),
})

export type CreateEdgeCredentialResponse = z.infer<
  typeof CreateEdgeCredentialResponse
>

export const RevokeEdgeCredentialRequest = z.object({
  /** "PC trocado", "sumiu". Curto, e é o que a tela mostra depois. */
  reason: z.string().trim().max(200).nullable().default(null),
})

export type RevokeEdgeCredentialRequest = z.infer<
  typeof RevokeEdgeCredentialRequest
>
