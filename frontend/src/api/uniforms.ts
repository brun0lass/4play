import {
  ConvertIntakeResponse,
  CreateIntakeRequest,
  IntakeDetailResponse,
  IntakeListResponse,
  IntakeResponse,
  IntakeSubmissionSchema,
  IntakeVersionRequest,
  PublicIntakeResponse,
  PublicIntakeSubmitResponse,
  type CreateIntakeBody,
  type IntakeDetailResponseType,
  type IntakeSubmissionBody,
  type IntakeSummaryType,
  type PublicIntakeResponseType,
  AddCommentRequest,
  BatchResponse,
  CancelSewingJobRequest,
  CreateSeamstressRequest,
  CreateSewingJobRequest,
  DeliverSewingJobRequest,
  SeamstressListResponse,
  SeamstressResponse,
  SewingJobListResponse,
  SewingJobResponse,
  UpdateSeamstressRequest,
  UpdateSewingJobRequest,
  type CreateSeamstressBody,
  type CreateSewingJobBody,
  type DeliverSewingJobBody,
  type SeamstressSummaryType,
  type SewingJobSummaryType,
  type UpdateSeamstressBody,
  type UpdateSewingJobBody,
  CustomerProductionHistoryResponse,
  MoveStageRequest,
  MoveStageResponse,
  ProductionAttachmentSummary,
  ProductionOrderResponse,
  ProductionQueueResponse,
  ProductionSheetVersionResponse,
  ProductionTimelineEntrySchema,
  RepeatProductionOrderRequest,
  RepeatProductionOrderResponse,
  ReplaceGradeRequest,
  ReplacePersonalizationRequest,
  ReplacePrintersRequest,
  SaveArtRequest,
  SaveArtResponse,
  SplitBatchRequest,
  UniformMemberListResponse,
  UniformPrinterListResponse,
  UniformPrinterSummary,
  UniformViewerResponse,
  type AddCommentBody,
  type ProductionBatchType,
  type ProductionOrderSummaryType,
  type SplitBatchBody,
  type MoveStageBody,
  type MoveStageResponseType,
  type ProductionAttachmentSummaryType,
  type ProductionOrderResponseType,
  type ProductionQueueQueryInput,
  type ProductionQueueResponseType,
  type ProductionTimelineEntryType,
  type RepeatProductionOrderBody,
  type RepeatProductionOrderResponseType,
  type ReplaceGradeBody,
  type ReplacePersonalizationBody,
  type SaveArtBody,
  type SaveArtResponseType,
  type UniformMemberSummaryType,
  type UniformPrinterSummaryType,
  type UniformViewerResponseType,
  type UpdateProductionSheetBody,
  UpdateProductionSheetRequest,
} from '@/contracts/aeris/uniforms.ts'
import { z } from 'zod'

import { qs, request } from '@/lib/http'

/**
 * `/api/v1/uniforms` — a fila de produção da 4Play (F170/F171 do Aeris).
 *
 * A conta precisa da chave `uniformes` ligada; sem ela toda rota responde
 * 403 `feature_not_enabled`.
 */

const BASE = '/api/v1/uniforms'

export const fetchQueue = async (
  query: ProductionQueueQueryInput,
  signal?: AbortSignal
): Promise<ProductionQueueResponseType> =>
  ProductionQueueResponse.parse(
    await request(`${BASE}/orders${qs(query as Record<string, string | number | undefined>)}`, {
      signal,
    })
  )

export const fetchOrder = async (
  id: string,
  signal?: AbortSignal
): Promise<ProductionOrderResponseType> =>
  ProductionOrderResponse.parse(await request(`${BASE}/orders/${id}`, { signal }))

export const saveSheet = async (id: string, input: UpdateProductionSheetBody): Promise<number> =>
  ProductionSheetVersionResponse.parse(
    await request(`${BASE}/orders/${id}`, {
      method: 'PUT',
      body: UpdateProductionSheetRequest.parse(input),
    })
  ).version

export const saveGrade = async (id: string, input: ReplaceGradeBody): Promise<number> =>
  ProductionSheetVersionResponse.parse(
    await request(`${BASE}/orders/${id}/grade`, {
      method: 'PUT',
      body: ReplaceGradeRequest.parse(input),
    })
  ).version

export const savePersonalization = async (
  id: string,
  input: ReplacePersonalizationBody
): Promise<number> =>
  ProductionSheetVersionResponse.parse(
    await request(`${BASE}/orders/${id}/personalization`, {
      method: 'PUT',
      body: ReplacePersonalizationRequest.parse(input),
    })
  ).version

export const moveStage = async (id: string, input: MoveStageBody): Promise<MoveStageResponseType> =>
  MoveStageResponse.parse(
    await request(`${BASE}/orders/${id}/stage`, {
      method: 'POST',
      body: MoveStageRequest.parse(input),
    })
  )

/** Separa uma leva: estas peças vão, como leva nova, para outra etapa (F230 do Aeris). */
export const splitBatch = async (id: string, input: SplitBatchBody): Promise<ProductionBatchType> =>
  BatchResponse.parse(
    await request(`${BASE}/orders/${id}/batches`, {
      method: 'POST',
      body: SplitBatchRequest.parse(input),
    })
  ).batch

/** Troca a etapa de uma leva separada inteira (F230). */
export const moveBatch = async (
  id: string,
  batchId: string,
  input: MoveStageBody
): Promise<ProductionBatchType> =>
  BatchResponse.parse(
    await request(`${BASE}/orders/${id}/batches/${batchId}/stage`, {
      method: 'POST',
      body: MoveStageRequest.parse(input),
    })
  ).batch

// ---------------------------------------------------------------------------
// As costureiras (F231 do Aeris)
// ---------------------------------------------------------------------------

export const fetchSeamstresses = async (
  status: 'active' | 'archived' | undefined,
  signal?: AbortSignal
): Promise<SeamstressSummaryType[]> =>
  SeamstressListResponse.parse(await request(`${BASE}/seamstresses${qs({ status })}`, { signal })).seamstresses

export const createSeamstress = async (input: CreateSeamstressBody): Promise<SeamstressSummaryType> =>
  SeamstressResponse.parse(
    await request(`${BASE}/seamstresses`, { method: 'POST', body: CreateSeamstressRequest.parse(input) })
  ).seamstress

export const updateSeamstress = async (id: string, input: UpdateSeamstressBody): Promise<SeamstressSummaryType> =>
  SeamstressResponse.parse(
    await request(`${BASE}/seamstresses/${id}`, { method: 'PUT', body: UpdateSeamstressRequest.parse(input) })
  ).seamstress

export const fetchSeamstressJobs = async (
  id: string,
  statuses: string | undefined,
  signal?: AbortSignal
): Promise<SewingJobSummaryType[]> =>
  SewingJobListResponse.parse(await request(`${BASE}/seamstresses/${id}/jobs${qs({ statuses })}`, { signal })).jobs

export const fetchOrderSewing = async (orderId: string, signal?: AbortSignal): Promise<SewingJobSummaryType[]> =>
  SewingJobListResponse.parse(await request(`${BASE}/orders/${orderId}/sewing`, { signal })).jobs

export const createSewingJob = async (orderId: string, input: CreateSewingJobBody): Promise<SewingJobSummaryType> =>
  SewingJobResponse.parse(
    await request(`${BASE}/orders/${orderId}/sewing`, { method: 'POST', body: CreateSewingJobRequest.parse(input) })
  ).job

export const updateSewingJob = async (id: string, input: UpdateSewingJobBody): Promise<SewingJobSummaryType> =>
  SewingJobResponse.parse(
    await request(`${BASE}/sewing/${id}`, { method: 'PATCH', body: UpdateSewingJobRequest.parse(input) })
  ).job

/** Costura entregue: da terceirizada nasce a conta a pagar no prazo dela. */
export const deliverSewingJob = async (id: string, input: DeliverSewingJobBody): Promise<SewingJobSummaryType> =>
  SewingJobResponse.parse(
    await request(`${BASE}/sewing/${id}/deliver`, { method: 'POST', body: DeliverSewingJobRequest.parse(input) })
  ).job

export const cancelSewingJob = async (id: string, version: number): Promise<SewingJobSummaryType> =>
  SewingJobResponse.parse(
    await request(`${BASE}/sewing/${id}/cancel`, { method: 'POST', body: CancelSewingJobRequest.parse({ version }) })
  ).job

// ---------------------------------------------------------------------------
// O link do cliente (F232 do Aeris)
// ---------------------------------------------------------------------------

/** A página pública: sem login, só o token. */
export const fetchPublicIntake = async (token: string, signal?: AbortSignal): Promise<PublicIntakeResponseType> =>
  PublicIntakeResponse.parse(await request(`${BASE}/public/intakes/${token}`, { signal }))

export const submitPublicIntake = async (token: string, input: IntakeSubmissionBody) =>
  PublicIntakeSubmitResponse.parse(
    await request(`${BASE}/public/intakes/${token}`, { method: 'POST', body: IntakeSubmissionSchema.parse(input) })
  )

export const fetchIntakes = async (statuses: string | undefined, signal?: AbortSignal): Promise<IntakeSummaryType[]> =>
  IntakeListResponse.parse(await request(`${BASE}/intakes${qs({ statuses })}`, { signal })).intakes

export const fetchIntake = async (id: string, signal?: AbortSignal): Promise<IntakeDetailResponseType> =>
  IntakeDetailResponse.parse(await request(`${BASE}/intakes/${id}`, { signal }))

export const createIntake = async (input: CreateIntakeBody): Promise<IntakeSummaryType> =>
  IntakeResponse.parse(
    await request(`${BASE}/intakes`, { method: 'POST', body: CreateIntakeRequest.parse(input) })
  ).intake

export const cancelIntake = async (id: string, version: number): Promise<IntakeSummaryType> =>
  IntakeResponse.parse(
    await request(`${BASE}/intakes/${id}/cancel`, { method: 'POST', body: IntakeVersionRequest.parse({ version }) })
  ).intake

/** A conferência vira pedido: o cadastro do cliente novo, o pedido e a ficha. */
export const convertIntake = async (id: string, version: number) =>
  ConvertIntakeResponse.parse(
    await request(`${BASE}/intakes/${id}/convert`, { method: 'POST', body: IntakeVersionRequest.parse({ version }) })
  )

/** Os pedidos do cliente, abertos e entregues, do mais novo para o mais velho (F229). */
export const fetchCustomerHistory = async (
  partyId: string,
  signal?: AbortSignal
): Promise<ProductionOrderSummaryType[]> =>
  CustomerProductionHistoryResponse.parse(await request(`${BASE}/customers/${partyId}/orders`, { signal }))
    .orders

export const saveArt = async (id: string, input: SaveArtBody): Promise<SaveArtResponseType> =>
  SaveArtResponse.parse(
    await request(`${BASE}/orders/${id}/art`, { method: 'PUT', body: SaveArtRequest.parse(input) })
  )

export const replacePrinters = async (id: string, printerIds: string[]): Promise<void> => {
  await request(`${BASE}/orders/${id}/printers`, {
    method: 'PUT',
    body: ReplacePrintersRequest.parse({ printerIds }),
  })
}

export const addComment = async (
  id: string,
  input: AddCommentBody
): Promise<ProductionTimelineEntryType> =>
  ProductionTimelineEntrySchema.parse(
    await request(`${BASE}/orders/${id}/comments`, {
      method: 'POST',
      body: AddCommentRequest.parse(input),
    })
  )

export const repeatOrder = async (
  id: string,
  input: RepeatProductionOrderBody
): Promise<RepeatProductionOrderResponseType> =>
  RepeatProductionOrderResponse.parse(
    await request(`${BASE}/orders/${id}/repeat`, {
      method: 'POST',
      body: RepeatProductionOrderRequest.parse(input),
    })
  )

export const uploadAttachment = async (
  id: string,
  file: File
): Promise<ProductionAttachmentSummaryType[]> => {
  const form = new FormData()
  form.append('file', file)
  return z
    .array(ProductionAttachmentSummary)
    .parse(await request(`${BASE}/orders/${id}/attachments`, { method: 'POST', body: form }))
}

export const deleteAttachment = async (id: string, attachmentId: string): Promise<void> => {
  await request(`${BASE}/orders/${id}/attachments/${attachmentId}`, { method: 'DELETE' })
}

export const fetchPrinters = async (
  status?: 'active' | 'archived',
  signal?: AbortSignal
): Promise<UniformPrinterSummaryType[]> =>
  UniformPrinterListResponse.parse(await request(`${BASE}/printers${qs({ status })}`, { signal }))
    .printers

export const createPrinter = async (name: string): Promise<UniformPrinterSummaryType> =>
  UniformPrinterSummary.parse(
    await request(`${BASE}/printers`, { method: 'POST', body: { name } })
  )

export const updatePrinter = async (
  id: string,
  input: { name?: string; status?: 'active' | 'archived'; version: number }
): Promise<UniformPrinterSummaryType> =>
  UniformPrinterSummary.parse(
    await request(`${BASE}/printers/${id}`, { method: 'PATCH', body: input })
  )

export const fetchViewer = async (signal?: AbortSignal): Promise<UniformViewerResponseType> =>
  UniformViewerResponse.parse(await request(`${BASE}/me`, { signal }))

export const fetchMembers = async (signal?: AbortSignal): Promise<UniformMemberSummaryType[]> =>
  UniformMemberListResponse.parse(await request(`${BASE}/members`, { signal })).members

export const replaceMemberFunctions = async (
  userId: string,
  functions: ('atendimento' | 'arte' | 'producao')[]
): Promise<void> => {
  await request(`${BASE}/members/${userId}/functions`, { method: 'PUT', body: { functions } })
}
