import { z } from 'zod'

import { UfSchema } from './party.ts'

/**
 * As rotas de entrega (F265–F267). Nesta fatia (F265): o cliente vira ponto
 * no mapa, a saída da filial e a chave do Google na Plataforma.
 */

// ---------------------------------------------------------------------------
// Pontos
// ---------------------------------------------------------------------------

/**
 * Um ponto no Brasil — a mesma caixa do check do banco (0144). Coordenada não
 * é dinheiro: `number` em trânsito, `numeric(9,6)` no banco.
 */
export const GeoPointSchema = z.object({
  latitude: z.number().min(-34).max(6),
  longitude: z.number().min(-74).max(-34),
})

export type GeoPoint = z.infer<typeof GeoPointSchema>

export const GeoPrecisionSchema = z.enum([
  'exact',
  'interpolated',
  'street',
  'area',
])

/** O endereço separado em campos, como o cadastro guarda. */
export const AddressPartsSchema = z.object({
  street: z.string().nullable(),
  number: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  uf: z.string().nullable(),
  cep: z.string().nullable(),
})

// ---------------------------------------------------------------------------
// Buscar no mapa
// ---------------------------------------------------------------------------

export const GeocodeRequest = z.object({
  street: z.string().trim().min(1).max(200),
  number: z.string().trim().max(20).nullable().optional(),
  district: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().min(1).max(120),
  uf: UfSchema,
  cep: z.string().trim().max(9).nullable().optional(),
})

export type GeocodeRequest = z.infer<typeof GeocodeRequest>

export const GeocodeCandidateSchema = GeoPointSchema.extend({
  formattedAddress: z.string(),
  precision: GeoPrecisionSchema,
  parts: AddressPartsSchema,
})

export const GeocodeResponse = z.object({
  candidates: z.array(GeocodeCandidateSchema),
})

export type GeocodeResponse = z.infer<typeof GeocodeResponse>

export const PlaceSearchRequest = z.object({
  query: z.string().trim().min(3).max(200),
})

export const PlaceCandidateSchema = GeoPointSchema.extend({
  name: z.string(),
  formattedAddress: z.string(),
  parts: AddressPartsSchema,
})

export const PlaceSearchResponse = z.object({
  candidates: z.array(PlaceCandidateSchema),
})

export type PlaceSearchResponse = z.infer<typeof PlaceSearchResponse>

// ---------------------------------------------------------------------------
// Clientes sem ponto
// ---------------------------------------------------------------------------

export const UnlocatedQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
})

export const UnlocatedAddressSchema = z.object({
  id: z.string(),
  kind: z.enum(['billing', 'delivery', 'other']),
  cep: z.string().nullable(),
  street: z.string(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string(),
  uf: z.string(),
  isMain: z.boolean(),
})

export const UnlocatedCustomerSchema = z.object({
  partyId: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  document: z.string().nullable(),
  deliveries: z.number().int(),
  lastDeliveryAt: z.string(),
  addresses: z.array(UnlocatedAddressSchema),
})

export type UnlocatedCustomer = z.infer<typeof UnlocatedCustomerSchema>

export const UnlocatedResponse = z.object({
  customers: z.array(UnlocatedCustomerSchema),
})

export type UnlocatedResponse = z.infer<typeof UnlocatedResponse>

// ---------------------------------------------------------------------------
// Gravar o ponto do cliente
// ---------------------------------------------------------------------------

const NewDeliveryAddress = z.object({
  cep: z.string().trim().max(9).nullable(),
  street: z.string().trim().min(1, 'Informe o logradouro').max(200),
  number: z.string().trim().max(20).nullable(),
  complement: z.string().trim().max(120).nullable(),
  district: z.string().trim().max(120).nullable(),
  city: z.string().trim().min(1, 'Informe o município').max(120),
  uf: UfSchema,
})

/**
 * O ponto de um endereço que existe (`addressId`) ou um endereço de entrega
 * novo com o ponto (`address`). Um dos dois. `source`: `google` quando a
 * pessoa aceitou o pino sugerido, `manual` quando arrastou.
 */
export const LocateCustomerRequest = z
  .object({
    addressId: z.uuid().optional(),
    address: NewDeliveryAddress.optional(),
    point: GeoPointSchema,
    source: z.enum(['google', 'manual']),
  })
  .refine(
    (body) => (body.addressId === undefined) !== (body.address === undefined),
    {
      message: 'Mande o endereço que existe ou o novo — um dos dois.',
    }
  )

export type LocateCustomerRequest = z.infer<typeof LocateCustomerRequest>

export const LocateCustomerResponse = z.object({
  partyId: z.string(),
  addressId: z.string(),
  created: z.boolean(),
})

// ---------------------------------------------------------------------------
// A saída da filial
// ---------------------------------------------------------------------------

export const DeliveryOriginSchema = GeoPointSchema.extend({
  branchId: z.string(),
  addressLabel: z.string(),
  footRadiusM: z.number().int(),
  updatedAt: z.string(),
  version: z.number().int(),
})

export const DeliveryOriginResponse = z.object({
  /** A filial da sessão; `null` quando a sessão não tem filial. */
  branchId: z.string().nullable(),
  origin: DeliveryOriginSchema.nullable(),
  /** A Plataforma já ligou o mapa? Sem chave, a tela explica em vez de falhar. */
  mapsReady: z.boolean(),
})

export type DeliveryOriginResponse = z.infer<typeof DeliveryOriginResponse>

export const SaveDeliveryOriginRequest = z.object({
  addressLabel: z.string().trim().min(1).max(300),
  point: GeoPointSchema,
  footRadiusM: z.number().int().min(100).max(5000),
  version: z.number().int().nullable(),
})

export type SaveDeliveryOriginRequest = z.infer<
  typeof SaveDeliveryOriginRequest
>

// ---------------------------------------------------------------------------
// A Plataforma
// ---------------------------------------------------------------------------

export const PlatformMapsUsageRow = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  geocode: z.number().int(),
  place: z.number().int(),
  matrix: z.number().int(),
  route: z.number().int(),
  matrixElements: z.number().int(),
  calls: z.number().int(),
})

export const PlatformMapsResponse = z.object({
  hasGoogleKey: z.boolean(),
  defaultMonthlyCallCap: z.number().int(),
  version: z.number().int().nullable(),
  /** `YYYY-MM`, o mês do uso abaixo (São Paulo). */
  month: z.string(),
  usage: z.array(PlatformMapsUsageRow),
})

export type PlatformMapsResponse = z.infer<typeof PlatformMapsResponse>

export const SavePlatformMapsRequest = z.object({
  /** Ausente: mantém a chave gravada. `null`: apaga. */
  googleKey: z.string().trim().min(20).max(200).nullable().optional(),
  defaultMonthlyCallCap: z.number().int().min(1).max(1_000_000),
  version: z.number().int().nullable(),
})

export type SavePlatformMapsRequest = z.infer<typeof SavePlatformMapsRequest>

// ---------------------------------------------------------------------------
// F266 — A rota da saída
// ---------------------------------------------------------------------------

export const RouteModeSchema = z.enum(['motorcycle', 'foot'])

export const QueuedDeliverySchema = z.object({
  salesDocumentId: z.string(),
  number: z.string().nullable(),
  totalAmount: z.string(),
  notes: z.string().nullable(),
  queuedAt: z.string(),
  customerPartyId: z.string(),
  customerName: z.string(),
  customerTradeName: z.string().nullable(),
  /** O ponto que a rota usa; `null` = sem ponto (localizar antes). */
  place: GeoPointSchema.extend({
    addressId: z.string(),
    label: z.string(),
  }).nullable(),
  plannedRouteId: z.string().nullable(),
})

export type QueuedDelivery = z.infer<typeof QueuedDeliverySchema>

export const RouteQueueResponse = z.object({
  items: z.array(QueuedDeliverySchema),
})

export const CourierSchema = z.object({
  partyId: z.string(),
  name: z.string(),
  mode: RouteModeSchema,
  phone: z.string().nullable(),
  version: z.number().int().nullable(),
})

export type Courier = z.infer<typeof CourierSchema>

export const CouriersResponse = z.object({
  couriers: z.array(CourierSchema),
})

export const SaveCourierRequest = z.object({
  mode: RouteModeSchema,
  /** Com DDD; o servidor guarda só os dígitos, com o 55 na frente. */
  phone: z.string().trim().max(20).nullable(),
  version: z.number().int().nullable(),
})

export type SaveCourierRequest = z.infer<typeof SaveCourierRequest>

export const PlanRoutesRequest = z.object({
  documentIds: z.array(z.uuid()).min(1).max(60),
  couriers: z.array(z.uuid()).min(1).max(10),
})

export type PlanRoutesRequest = z.infer<typeof PlanRoutesRequest>

export const RouteStopSchema = GeoPointSchema.extend({
  salesDocumentId: z.string(),
  position: z.number().int(),
  number: z.string().nullable(),
  customerName: z.string(),
  totalAmount: z.string(),
  /** O que falta receber na entrega; nulo antes do despacho ou já pago. */
  dueAmount: z.string().nullable(),
  addressLabel: z.string(),
  arrivalSeconds: z.number().int(),
  legSeconds: z.number().int(),
  legMeters: z.number().int(),
})

export const DeliveryRouteSchema = z.object({
  id: z.string(),
  courierPartyId: z.string(),
  courierName: z.string(),
  mode: RouteModeSchema,
  status: z.enum(['planned', 'dispatched', 'returned', 'cancelled']),
  plannedAt: z.string(),
  dispatchedAt: z.string().nullable(),
  returnedAt: z.string().nullable(),
  durationSeconds: z.number().int(),
  returnSeconds: z.number().int().nullable(),
  distanceMeters: z.number().int(),
  encodedPolyline: z.string().nullable(),
  /** A rota foi ao WhatsApp do entregador (F267). */
  sentAt: z.string().nullable(),
  sendSkipReason: z.enum(['no_phone', 'no_account', 'failed']).nullable(),
  version: z.number().int(),
  stops: z.array(RouteStopSchema),
})

export type DeliveryRoute = z.infer<typeof DeliveryRouteSchema>

export const UnassignedStopSchema = z.object({
  salesDocumentId: z.string(),
  reason: z.enum(['no-point', 'too-far-on-foot', 'no-path']),
})

export const DeliveryRoutesResponse = z.object({
  routes: z.array(DeliveryRouteSchema),
  unassigned: z.array(UnassignedStopSchema),
})

export type DeliveryRoutesResponse = z.infer<typeof DeliveryRoutesResponse>

export const RearrangeRoutesRequest = z.object({
  routes: z
    .array(
      z.object({
        id: z.uuid(),
        version: z.number().int(),
        documentIds: z.array(z.uuid()).max(60),
      })
    )
    .min(1)
    .max(10),
})

export type RearrangeRoutesRequest = z.infer<typeof RearrangeRoutesRequest>

export const RouteVersionRequest = z.object({
  version: z.number().int(),
})

export const RoutesQuery = z.object({
  status: z
    .string()
    .regex(/^(planned|dispatched|returned)(,(planned|dispatched|returned))*$/)
    .default('planned,dispatched'),
})
