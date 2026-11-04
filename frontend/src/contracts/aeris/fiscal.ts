import { z } from 'zod'

/**
 * A nota fiscal (F371, ADR-0051): o contrato de `/api/v1/fiscal/*`. As listas
 * espelham `@aeris/fiscal` e os CHECKs da 0187;
 * `fiscal-vocabulary-parity.test.ts` as mantém juntas.
 */

export const FISCAL_ENVIRONMENT_VALUES = ['homologacao', 'producao'] as const
export const FiscalEnvironment = z.enum(FISCAL_ENVIRONMENT_VALUES)
export type FiscalEnvironment = z.infer<typeof FiscalEnvironment>

export const FISCAL_REGIME_VALUES = ['1', '2', '3'] as const
export const FiscalRegime = z.enum(FISCAL_REGIME_VALUES)
export type FiscalRegime = z.infer<typeof FiscalRegime>

export const FISCAL_GAP_VALUES = [
  'engine',
  'secret-key',
  'certificate',
  'certificate-expired',
  'certificate-other-company',
  'regime',
  'regime-unsupported',
  'simples-percent',
  'address',
  'city-code',
  'state-registration',
  'municipal-registration',
] as const
export const FiscalGap = z.enum(FISCAL_GAP_VALUES)
export type FiscalGap = z.infer<typeof FiscalGap>

export const FiscalCertificateSummary = z.object({
  cnpj: z.string(),
  holderName: z.string(),
  validFrom: z.string(),
  validTo: z.string(),
  daysLeft: z.number().int(),
})
export type FiscalCertificateSummary = z.infer<typeof FiscalCertificateSummary>

export const FiscalSettingsResponse = z.object({
  company: z.object({
    id: z.uuid(),
    legalName: z.string(),
    cnpj: z.string(),
  }),
  environment: FiscalEnvironment,
  nfeSeries: z.number().int(),
  nfseSeries: z.number().int(),
  simplesPercent: z.string().nullable(),
  informMunicipalRegistration: z.boolean(),
  nextNfeNumber: z.string(),
  nextNfseNumber: z.string(),
  version: z.number().int().nullable(),
  certificate: FiscalCertificateSummary.nullable(),
  regime: z.object({ crt: FiscalRegime, validFrom: z.string() }).nullable(),
  gaps: z.object({
    nfse: z.array(FiscalGap),
    nfe: z.array(FiscalGap),
  }),
  /** Saiu lista de serviços nova no portal oficial, e ela ainda não foi aplicada. */
  catalogOutdated: z.boolean(),
})
export type FiscalSettingsResponse = z.infer<typeof FiscalSettingsResponse>

export const SaveFiscalSettingsRequest = z.object({
  environment: FiscalEnvironment,
  nfeSeries: z.number().int().min(0).max(889),
  nfseSeries: z.number().int().min(1).max(99_999),
  simplesPercent: z
    .string()
    .regex(/^\d{1,2}(\.\d{1,2})?$/u, 'Use um percentual como 6 ou 6.25.')
    .nullable(),
  informMunicipalRegistration: z.boolean(),
  /** Para continuar a numeração de outro sistema. Só anda para a frente. */
  nextNfeNumber: z
    .string()
    .regex(/^[1-9]\d{0,8}$/u)
    .optional(),
  nextNfseNumber: z
    .string()
    .regex(/^[1-9]\d{0,14}$/u)
    .optional(),
  /** `null` quando a empresa ainda não salvou nada. */
  version: z.number().int().nullable(),
  /** Exigido para passar para produção: a nota dali em diante vale de verdade. */
  confirmProduction: z.boolean().optional(),
})
export type SaveFiscalSettingsRequest = z.infer<
  typeof SaveFiscalSettingsRequest
>

/** 64 KB viram cerca de 88 mil caracteres em base64. */
export const UploadFiscalCertificateRequest = z.object({
  pfxBase64: z.string().min(1).max(90_000),
  certificatePassword: z.string().min(1).max(200),
})
export type UploadFiscalCertificateRequest = z.infer<
  typeof UploadFiscalCertificateRequest
>

export const SaveFiscalRegimeRequest = z.object({
  crt: FiscalRegime,
  validFrom: z.iso.date(),
})
export type SaveFiscalRegimeRequest = z.infer<typeof SaveFiscalRegimeRequest>

// ---------------------------------------------------------------------------
// A nota de serviço (F372)
// ---------------------------------------------------------------------------

export const FISCAL_DOCUMENT_STATUS_VALUES = [
  'pendente',
  'processando',
  'autorizada',
  'rejeitada',
  'incerta',
  'cancelando',
  'cancelada',
] as const
export const FiscalDocumentStatus = z.enum(FISCAL_DOCUMENT_STATUS_VALUES)
export type FiscalDocumentStatus = z.infer<typeof FiscalDocumentStatus>

export const FISCAL_EVENT_KIND_VALUES = [
  'criada',
  'enviada',
  'autorizada',
  'rejeitada',
  'incerta',
  'consultada',
  'reenvio',
  'cancelamento_pedido',
  'cancelada',
  'cancelamento_recusado',
  'correcao_pedida',
  'corrigida',
  'correcao_recusada',
] as const

export const FISCAL_DOCUMENT_KIND_VALUES = ['nfe', 'nfce', 'nfse'] as const
export const FiscalDocumentKind = z.enum(FISCAL_DOCUMENT_KIND_VALUES)
export type FiscalDocumentKind = z.infer<typeof FiscalDocumentKind>

export const FiscalCodeListResponse = z.object({
  codes: z.array(z.object({ code: z.string(), description: z.string() })),
})
export type FiscalCodeListResponse = z.infer<typeof FiscalCodeListResponse>

const Percent = z
  .string()
  .regex(/^\d{1,2}(\.\d{1,2})?$/u, 'Use um percentual como 6 ou 6.25.')

export const FiscalServiceItem = z.object({
  id: z.uuid(),
  name: z.string(),
  defaultDescription: z.string(),
  serviceCode: z.string(),
  serviceDescription: z.string(),
  nbsCode: z.string().nullable(),
  municipalCode: z.string().nullable(),
  issRetained: z.boolean(),
  issRate: z.string().nullable(),
  archived: z.boolean(),
  version: z.number().int(),
})
export type FiscalServiceItem = z.infer<typeof FiscalServiceItem>

export const FiscalServiceItemListResponse = z.object({
  items: z.array(FiscalServiceItem),
})
export type FiscalServiceItemListResponse = z.infer<
  typeof FiscalServiceItemListResponse
>

export const FiscalServiceItemResponse = z.object({ item: FiscalServiceItem })
export type FiscalServiceItemResponse = z.infer<
  typeof FiscalServiceItemResponse
>

const ServiceItemFields = z.object({
  name: z.string().trim().min(1).max(120),
  defaultDescription: z.string().trim().min(1).max(2000),
  serviceCode: z
    .string()
    .regex(/^\d{6}$/u, 'O código de serviço tem 6 dígitos.'),
  nbsCode: z
    .string()
    .regex(/^\d{9}$/u, 'A NBS tem 9 dígitos.')
    .nullable(),
  municipalCode: z.string().trim().min(1).max(20).nullable(),
  issRetained: z.boolean(),
  issRate: Percent.nullable(),
})

export const CreateFiscalServiceItemRequest = ServiceItemFields
export type CreateFiscalServiceItemRequest = z.infer<
  typeof CreateFiscalServiceItemRequest
>

export const UpdateFiscalServiceItemRequest = ServiceItemFields.extend({
  archived: z.boolean(),
  version: z.number().int(),
})
export type UpdateFiscalServiceItemRequest = z.infer<
  typeof UpdateFiscalServiceItemRequest
>

export const FiscalDocumentSummary = z.object({
  id: z.uuid(),
  kind: FiscalDocumentKind,
  environment: FiscalEnvironment,
  series: z.number().int(),
  number: z.string(),
  status: FiscalDocumentStatus,
  competence: z.string(),
  totalAmount: z.string(),
  recipientName: z.string(),
  recipientDocument: z.string().nullable(),
  accessKey: z.string().nullable(),
  rejectionCode: z.string().nullable(),
  rejectionMessage: z.string().nullable(),
  hasXml: z.boolean(),
  hasPdf: z.boolean(),
  canCancel: z.boolean(),
  canRetry: z.boolean(),
  canCorrect: z.boolean(),
  authorizedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
})
export type FiscalDocumentSummary = z.infer<typeof FiscalDocumentSummary>

export const FiscalDocumentListResponse = z.object({
  documents: z.array(FiscalDocumentSummary),
  total: z.number().int(),
})
export type FiscalDocumentListResponse = z.infer<
  typeof FiscalDocumentListResponse
>

export const FiscalDocumentResponse = z.object({
  document: FiscalDocumentSummary,
})
export type FiscalDocumentResponse = z.infer<typeof FiscalDocumentResponse>

export const FiscalRecipient = z.object({
  documentKind: z.enum(['cnpj', 'cpf']),
  document: z.string().regex(/^[0-9A-Z]{11,14}$/u, 'Informe só o documento.'),
  name: z.string().trim().min(1).max(300),
  email: z.email().max(80).nullable(),
  phone: z
    .string()
    .regex(/^\d{6,20}$/u, 'O telefone deve ter só dígitos, com DDD.')
    .nullable(),
  address: z
    .object({
      cityCode: z
        .string()
        .regex(/^\d{7}$/u, 'Falta o código IBGE do município do tomador.'),
      postalCode: z.string().regex(/^\d{8}$/u, 'O CEP tem 8 dígitos.'),
      street: z.string().trim().min(1).max(255),
      number: z.string().trim().min(1).max(60),
      complement: z.string().trim().min(1).max(156).nullable(),
      district: z.string().trim().min(1).max(60),
    })
    .nullable(),
})
export type FiscalRecipient = z.infer<typeof FiscalRecipient>

export const CreateNfseRequest = z.object({
  clientRequestId: z.uuid(),
  serviceItemId: z.uuid(),
  description: z.string().trim().min(1).max(2000),
  amount: z
    .string()
    .regex(/^\d{1,13}\.\d{2}$/u, 'O valor tem de ter duas casas decimais.'),
  competence: z.iso.date(),
  recipient: FiscalRecipient,
})
export type CreateNfseRequest = z.infer<typeof CreateNfseRequest>

export const CancelFiscalDocumentRequest = z.object({
  reasonCode: z.enum(['1', '2', '9']),
  reason: z.string().trim().min(15).max(255),
})
export type CancelFiscalDocumentRequest = z.infer<
  typeof CancelFiscalDocumentRequest
>

// ---------------------------------------------------------------------------
// A nota de produto (F373)
// ---------------------------------------------------------------------------

export const FISCAL_CSOSN_CONTRACT_VALUES = [
  '102',
  '103',
  '300',
  '400',
  '500',
] as const

export const FiscalTaxProfile = z.object({
  id: z.uuid(),
  name: z.string(),
  origin: z.string(),
  csosn: z.string(),
  pisCst: z.string(),
  cofinsCst: z.string(),
  cest: z.string().nullable(),
  cfopInternal: z.string(),
  cfopInterstate: z.string(),
  archived: z.boolean(),
  version: z.number().int(),
})
export type FiscalTaxProfile = z.infer<typeof FiscalTaxProfile>

export const FiscalTaxProfileListResponse = z.object({
  profiles: z.array(FiscalTaxProfile),
})
export type FiscalTaxProfileListResponse = z.infer<
  typeof FiscalTaxProfileListResponse
>

export const FiscalTaxProfileResponse = z.object({ profile: FiscalTaxProfile })
export type FiscalTaxProfileResponse = z.infer<typeof FiscalTaxProfileResponse>

const TaxProfileFields = z.object({
  name: z.string().trim().min(1).max(120),
  origin: z.string().regex(/^[0-8]$/u, 'Origem de 0 a 8.'),
  csosn: z.enum(FISCAL_CSOSN_CONTRACT_VALUES),
  pisCst: z.string().regex(/^\d{2}$/u, 'CST de PIS com 2 dígitos.'),
  cofinsCst: z.string().regex(/^\d{2}$/u, 'CST de COFINS com 2 dígitos.'),
  cest: z
    .string()
    .regex(/^\d{7}$/u, 'CEST com 7 dígitos.')
    .nullable(),
  cfopInternal: z
    .string()
    .regex(/^5\d{3}$/u, 'CFOP dentro do estado começa com 5.'),
  cfopInterstate: z
    .string()
    .regex(/^6\d{3}$/u, 'CFOP para outro estado começa com 6.'),
})

export const CreateFiscalTaxProfileRequest = TaxProfileFields
export type CreateFiscalTaxProfileRequest = z.infer<
  typeof CreateFiscalTaxProfileRequest
>

export const UpdateFiscalTaxProfileRequest = TaxProfileFields.extend({
  archived: z.boolean(),
  version: z.number().int(),
})
export type UpdateFiscalTaxProfileRequest = z.infer<
  typeof UpdateFiscalTaxProfileRequest
>

export const AssignFiscalTaxProfileRequest = z.object({
  profileId: z.uuid().nullable(),
})
export type AssignFiscalTaxProfileRequest = z.infer<
  typeof AssignFiscalTaxProfileRequest
>

export const FiscalSaleCheckResponse = z.object({
  document: FiscalDocumentSummary.nullable(),
  problems: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      variantId: z.string().optional(),
    })
  ),
  /** Cliente sem Inscrição Estadual costuma ser consumidor final; a tela confirma. */
  finalConsumerSuggested: z.boolean(),
})
export type FiscalSaleCheckResponse = z.infer<typeof FiscalSaleCheckResponse>

export const CreateNfeRequest = z.object({
  clientRequestId: z.uuid(),
  saleId: z.uuid(),
  finalConsumer: z.boolean(),
  presence: z.enum(['1', '2', '9']),
  operationNature: z.string().trim().min(1).max(60),
})
export type CreateNfeRequest = z.infer<typeof CreateNfeRequest>

export const CreateFiscalCorrectionRequest = z.object({
  text: z.string().trim().min(15).max(1000),
})
export type CreateFiscalCorrectionRequest = z.infer<
  typeof CreateFiscalCorrectionRequest
>

export const FiscalCorrection = z.object({
  id: z.uuid(),
  sequence: z.number().int(),
  text: z.string(),
  status: z.enum(['pendente', 'aceita', 'recusada']),
  message: z.string().nullable(),
  createdAt: z.string(),
})
export type FiscalCorrection = z.infer<typeof FiscalCorrection>

export const FiscalCorrectionListResponse = z.object({
  corrections: z.array(FiscalCorrection),
})
export type FiscalCorrectionListResponse = z.infer<
  typeof FiscalCorrectionListResponse
>
