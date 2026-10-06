import type { ProductionQueueQueryInput } from '@/contracts/aeris/uniforms.ts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import {
  fetchCustomerHistory,
  fetchMembers,
  fetchOrder,
  fetchPrinters,
  fetchQueue,
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
