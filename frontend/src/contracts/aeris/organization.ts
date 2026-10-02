import { z } from 'zod'

/**
 * Organization contracts.
 *
 * Reading arrived with F006, because the context switcher needed it. Writing
 * arrived with the company's fiscal registration: a document cannot be issued
 * without `enderEmit`, `IE` and `CRT`, and a document received cannot be
 * checked against a company that only knows its own CNPJ.
 *
 * Every field below maps onto the NF-e `emit` group, and the sizes are the
 * manual's own — a value this schema accepts and the SEFAZ rejects is worse
 * than one refused here, because the second failure happens in front of a
 * customer.
 */

export const EntityStatusSchema = z.enum(['active', 'archived'])

export const CompanySummary = z.object({
  id: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  /** Unformatted, fourteen characters. Always a string — Master Spec §11. */
  cnpj: z.string(),
  status: EntityStatusSchema,
})

export type CompanySummary = z.infer<typeof CompanySummary>

/**
 * Código de Regime Tributário.
 *
 * A string, not a number, because it is a code from a table and arithmetic on
 * it is meaningless. The whole tax block of every document branches on it.
 */
export const TaxRegimeSchema = z.enum(['1', '2', '3'])

/** What is still missing before this company could issue an NF-e. */
export const IssuanceGapSchema = z.enum([
  'state-registration',
  'tax-regime',
  'address',
  'city-code',
])

const optional = (max: number) =>
  z.string().trim().max(max).nullable().optional()

export const CompanyFiscalSchema = z.object({
  /** Digits only, or the literal `ISENTO` the manual permits. */
  stateRegistration: z.string().nullable(),
  municipalRegistration: z.string().nullable(),
  cnae: z.string().nullable(),
  taxRegime: TaxRegimeSchema.nullable(),
  street: z.string().nullable(),
  streetNumber: z.string().nullable(),
  complement: z.string().nullable(),
  district: z.string().nullable(),
  /** Código IBGE, 7 digits. The SEFAZ validates this, never the name. */
  cityCode: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  phone: z.string().nullable(),
})

export type CompanyFiscalSchema = z.infer<typeof CompanyFiscalSchema>

/**
 * Quando o estoque sai, dito como duas perguntas (F034).
 *
 * A call com a Elite Digital revelou que "dar baixa" quer dizer coisas
 * diferentes para pessoas diferentes, e uma pergunta só não conseguiria
 * perguntar isso sem mentir. São dois momentos distintos e os dois importam:
 * quando a peça deixa de poder ser vendida a outra pessoa, e quando ela deixa
 * de existir na contagem física.
 */
export const StockExitAtSchema = z.enum(['confirmation', 'dispatch'])

export type StockExitAt = z.infer<typeof StockExitAtSchema>

export const CompanySalesFlowSchema = z.object({
  /**
   * Se esta empresa controla estoque (F102).
   *
   * A chave que a Elite Digital pediu — *"eles nao contabilizam estoque, tem
   * que ter um modo pra eu desligar de tudo"*. Manda em TODOS os produtos,
   * inclusive os já cadastrados, e não apaga `tracksStock` de nenhum.
   *
   * A regra efetiva é uma conjunção: o produto tem saldo quando `countsStock`
   * **e** `product.tracksStock`. Quem mostrar um sem o outro mente.
   */
  countsStock: z.boolean(),
  /**
   * Se a venda pode levar o saldo abaixo de zero (F103).
   *
   * Para quem CONTA e vende antes de receber. O saldo negativo aparece em
   * Estoque > A acertar (F044), onde vira lista de trabalho em vez de número
   * perdido — e é essa metade, já pronta, que torna o negativo aceitável agora.
   */
  allowNegativeStock: z.boolean(),
  /**
   * Se o sinal, a retirada e o estorno do pedido passam por um caixa aberto
   * (F174). Desligado, o pagamento é gravado sem movimento de caixa.
   */
  usesTill: z.boolean(),
  /**
   * Se produto novo desta empresa nasce controlando estoque (F028, F070).
   *
   * A coluna existe desde a migração 0023 e passou dois meses sem tela: dava
   * para responder a pergunta por produto e não para a loja, então uma loja que
   * não conta nada — a Elite Digital, com 5309 produtos importados do GDOOR sem
   * saldo — teria de desmarcar 5309 caixas e refazer isso a cada importação.
   *
   * É o padrão para produto NOVO, e não um interruptor sobre os que existem.
   * Ver F070: uma chave da empresa mandando por cima do produto seria uma
   * segunda fonte de verdade, com o cadastro dizendo "controla" e o balcão
   * ignorando. O catálogo que já existe se muda pela ação em massa em Produtos.
   */
  tracksStockDefault: z.boolean(),
  /** O orçamento impresso segura a mercadoria: sai do disponível, fica no físico. */
  reservesOnQuote: z.boolean(),
  stockExitAt: StockExitAtSchema,
})

export type CompanySalesFlowSchema = z.infer<typeof CompanySalesFlowSchema>

export const CompanyDetail = CompanySummary.extend({
  fiscal: CompanyFiscalSchema,
  salesFlow: CompanySalesFlowSchema,
  /**
   * What is missing before an NF-e could be issued.
   *
   * Empty does NOT mean the company can issue: the digital certificate and the
   * credenciamento at the SEFAZ are real prerequisites and neither is data
   * this system holds.
   */
  issuanceGaps: z.array(IssuanceGapSchema),
  version: z.number().int(),
  updatedAt: z.string(),
})

export type CompanyDetail = z.infer<typeof CompanyDetail>

export const CompanyResponse = z.object({ company: CompanyDetail })

export type CompanyResponse = z.infer<typeof CompanyResponse>

/**
 * What may be changed.
 *
 * The CNPJ is absent on purpose: changing it is not an edit, it is a different
 * company. Every document ever issued carries the old one, and repointing the
 * row would make last year's notes belong to a business that did not issue
 * them.
 */
export const UpdateCompanyRequest = z.object({
  version: z.number().int().nonnegative(),
  legalName: z.string().trim().min(2).max(200).optional(),
  tradeName: optional(200),
  salesFlow: z
    .object({
      countsStock: z.boolean().optional(),
      allowNegativeStock: z.boolean().optional(),
      usesTill: z.boolean().optional(),
      tracksStockDefault: z.boolean().optional(),
      reservesOnQuote: z.boolean().optional(),
      stockExitAt: StockExitAtSchema.optional(),
    })
    .optional(),
  fiscal: z
    .object({
      // 2–14 per the manual, or ISENTO. Checked in the handler, where a
      // failure can be a sentence rather than a parse error.
      stateRegistration: optional(14),
      municipalRegistration: optional(15),
      cnae: optional(7),
      taxRegime: TaxRegimeSchema.nullable().optional(),
      street: optional(60),
      streetNumber: optional(60),
      complement: optional(60),
      district: optional(60),
      cityCode: optional(7),
      city: optional(60),
      state: optional(2),
      postalCode: optional(8),
      phone: optional(14),
    })
    .optional(),
})

export type UpdateCompanyRequest = z.input<typeof UpdateCompanyRequest>
export type UpdateCompanyBody = z.output<typeof UpdateCompanyRequest>

export const CompanyList = z.object({
  companies: z.array(CompanySummary),
})

export type CompanyList = z.infer<typeof CompanyList>

export const BranchSummary = z.object({
  id: z.string(),
  companyId: z.string(),
  code: z.string(),
  name: z.string(),
  isHeadquarters: z.boolean(),
  status: EntityStatusSchema,
})

export type BranchSummary = z.infer<typeof BranchSummary>

export const BranchList = z.object({
  branches: z.array(BranchSummary),
})

export type BranchList = z.infer<typeof BranchList>

export const BranchQuery = z.object({
  companyId: z.string().optional(),
})

export type BranchQuery = z.infer<typeof BranchQuery>
