import type { ProductionQueueQueryInput } from '@/contracts/aeris/uniforms.ts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  fetchIncidents,
  fetchOrderIncidents,
  fetchSector,
  fetchSectorStats,
  fetchMaterialRates,
  fetchDayCloses,
  fetchCustomerHistory,
  fetchIntake,
  fetchIntakes,
  fetchOrderSewing,
  fetchSeamstressJobs,
  fetchSeamstresses,
  fetchMembers,
  fetchOrder,
  fetchPrinters,
  fetchQueue,
  fetchSizeCharts,
  fetchViewer,
} from '@/api/uniforms'
import { useAuth } from '@/auth/AuthProvider'

/** As chaves de cache num lugar só, para invalidar sem errar o nome. */
export const keys = {
  queue: (query: ProductionQueueQueryInput) => ['uniforms', 'queue', query] as const,
  queueAll: ['uniforms', 'queue'] as const,
  order: (id: string) => ['uniforms', 'order', id] as const,
  viewer: ['uniforms', 'viewer'] as const,
  members: ['uniforms', 'members'] as const,
  printers: (status?: string) => ['uniforms', 'printers', status ?? 'all'] as const,
  history: (partyId: string) => ['uniforms', 'history', partyId] as const,
  seamstresses: (status?: string) => ['uniforms', 'seamstresses', status ?? 'all'] as const,
  seamstressesAll: ['uniforms', 'seamstresses'] as const,
  seamstressJobs: (id: string, statuses?: string) => ['uniforms', 'seamstress-jobs', id, statuses ?? 'all'] as const,
  sewingAll: ['uniforms', 'seamstress-jobs'] as const,
  orderSewing: (orderId: string) => ['uniforms', 'order-sewing', orderId] as const,
  intakes: (statuses?: string) => ['uniforms', 'intakes', statuses ?? 'all'] as const,
  intakesAll: ['uniforms', 'intakes'] as const,
  intake: (id: string) => ['uniforms', 'intake', id] as const,
  sector: (sector: string) => ['uniforms', 'sector', sector] as const,
  sectorAll: ['uniforms', 'sector'] as const,
  stats: (from: string, to: string, group: string) => ['uniforms', 'stats', from, to, group] as const,
  statsAll: ['uniforms', 'stats'] as const,
  materialRates: ['uniforms', 'material-rates'] as const,
  dayCloses: ['uniforms', 'day-closes'] as const,
  orderIncidents: (orderId: string) => ['uniforms', 'order-incidents', orderId] as const,
  incidents: (statuses?: string, sectors?: string) => ['uniforms', 'incidents', statuses ?? 'all', sectors ?? 'all'] as const,
  incidentsAll: ['uniforms', 'incidents'] as const,
}

export const useQueue = (query: ProductionQueueQueryInput, refetchInterval = 30_000) =>
  useQuery({
    queryKey: keys.queue(query),
    queryFn: ({ signal }) => fetchQueue(query, signal),
    placeholderData: keepPreviousData,
    refetchInterval,
  })

export const useOrder = (id: string) =>
  useQuery({
    queryKey: keys.order(id),
    queryFn: ({ signal }) => fetchOrder(id, signal),
    refetchInterval: 60_000,
  })

/** Quem não vê a produção (o financeiro) receberia 403 — então nem pergunta. */
export const useViewer = () => {
  const { can } = useAuth()
  return useQuery({
    queryKey: keys.viewer,
    queryFn: ({ signal }) => fetchViewer(signal),
    staleTime: 5 * 60_000,
    enabled: can('uniforms.read'),
  })
}

/**
 * As peças da loja: as mesmas de "Peças e medidas" — cada tabela de medidas é
 * uma peça. A grade, os personalizados e a tabela da costureira escolhem daqui.
 */
export const usePieceNames = () =>
  useQuery({
    queryKey: ['size-charts'],
    queryFn: ({ signal }) => fetchSizeCharts(signal),
    staleTime: 5 * 60_000,
    // O nome da peça na ficha vai até 40 letras; a tabela aceita 60.
    select: (charts) => [...new Set(charts.map((chart) => chart.name.trim().slice(0, 40)))],
  })

export const useMembers = () =>
  useQuery({ queryKey: keys.members, queryFn: ({ signal }) => fetchMembers(signal), staleTime: 5 * 60_000 })

export const usePrinters = (status?: 'active' | 'archived') =>
  useQuery({
    queryKey: keys.printers(status),
    queryFn: ({ signal }) => fetchPrinters(status, signal),
    staleTime: 5 * 60_000,
  })

/** Os pedidos do cliente — em qual máquina e em quais levas cada um saiu (F229). */
export const useCustomerHistory = (partyId: string | null | undefined) =>
  useQuery({
    queryKey: keys.history(partyId ?? ''),
    queryFn: ({ signal }) => fetchCustomerHistory(partyId ?? '', signal),
    enabled: Boolean(partyId),
    staleTime: 60_000,
  })

/** As costureiras (F231). Quem não vê dinheiro recebe a tabela sem preço. */
export const useSeamstresses = (status?: 'active' | 'archived') =>
  useQuery({
    queryKey: keys.seamstresses(status),
    queryFn: ({ signal }) => fetchSeamstresses(status, signal),
    staleTime: 60_000,
  })

export const useSeamstressJobs = (id: string | null, statuses?: string) =>
  useQuery({
    queryKey: keys.seamstressJobs(id ?? '', statuses),
    queryFn: ({ signal }) => fetchSeamstressJobs(id ?? '', statuses, signal),
    enabled: id !== null,
  })

/** Quem costura cada leva do pedido (F231). */
export const useOrderSewing = (orderId: string) =>
  useQuery({
    queryKey: keys.orderSewing(orderId),
    queryFn: ({ signal }) => fetchOrderSewing(orderId, signal),
    // O diálogo fechado não tem pedido: nada a buscar.
    enabled: orderId !== '',
  })

/** Os links de pedido para o cliente (F232). */
export const useIntakes = (statuses?: string, enabled = true) =>
  useQuery({
    queryKey: keys.intakes(statuses),
    queryFn: ({ signal }) => fetchIntakes(statuses, signal),
    enabled,
    refetchInterval: 60_000,
  })

export const useIntake = (id: string | null) =>
  useQuery({
    queryKey: keys.intake(id ?? ''),
    queryFn: ({ signal }) => fetchIntake(id ?? '', signal),
    enabled: id !== null,
  })

/** O que cada setor fez no período (F240). */
export const useSectorStats = (from: string, to: string, group: 'day' | 'week' | 'month', enabled = true) =>
  useQuery({
    queryKey: keys.stats(from, to, group),
    queryFn: ({ signal }) => fetchSectorStats({ from, to, group }, signal),
    enabled,
    refetchInterval: 60_000,
  })

/** Quanto de cada material vai numa peça (F241). */
export const useMaterialRates = (enabled = true) =>
  useQuery({ queryKey: keys.materialRates, queryFn: ({ signal }) => fetchMaterialRates(signal), enabled })

/** As últimas baixas do dia (F241). */
export const useDayCloses = (enabled = true) =>
  useQuery({ queryKey: keys.dayCloses, queryFn: ({ signal }) => fetchDayCloses(signal), enabled })

/** O que o setor tem para fazer (F239): as levas na etapa dele, com o feito. */
export const useSector = (sector: string) =>
  useQuery({
    queryKey: keys.sector(sector),
    queryFn: ({ signal }) => fetchSector(sector, signal),
    refetchInterval: 30_000,
  })

export const useOrderIncidents = (orderId: string) =>
  useQuery({
    queryKey: keys.orderIncidents(orderId),
    queryFn: ({ signal }) => fetchOrderIncidents(orderId, signal),
  })

/** As ocorrências de todos os pedidos (F234). */
export const useIncidents = (statuses?: string, sectors?: string, enabled = true) =>
  useQuery({
    queryKey: keys.incidents(statuses, sectors),
    queryFn: ({ signal }) => fetchIncidents({ statuses, sectors }, signal),
    enabled,
    refetchInterval: 60_000,
  })
