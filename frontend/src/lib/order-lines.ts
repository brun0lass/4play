import { useQueries, useQuery } from '@tanstack/react-query'

import { fetchSalesDocument, type SalesDocument } from '@/api/sales'
import { money, qty } from '@/lib/format'

/**
 * "29 Camisa dry a R$ 45,00 + 1 Frete a R$ 80,00" — a coluna DADOS DO PEDIDO.
 * Sem `withPrices`, só as quantidades: "29 Camisa dry + 1 Frete".
 */
export const linesText = (doc: SalesDocument | undefined, withPrices = true): string => {
  if (!doc) return ''
  return doc.lines
    .map((line) => `${qty(line.quantity)} ${line.description}${withPrices ? ` a ${money(line.unitPrice)}` : ''}`)
    .join(' + ')
}

const docKey = (id: string) => ['sales-document', id] as const

export const useSalesDocument = (id: string | undefined) =>
  useQuery({
    queryKey: docKey(id ?? ''),
    queryFn: ({ signal }) => fetchSalesDocument(id!, signal),
    enabled: id !== undefined,
    staleTime: 5 * 60_000,
  })

/** Os documentos de vários pedidos, para a planilha — cada um fica em cache 5 min. */
export const useSalesDocuments = (ids: readonly string[]) => {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: docKey(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchSalesDocument(id, signal),
      staleTime: 5 * 60_000,
    })),
  })
  const byId = new Map<string, SalesDocument>()
  results.forEach((result, index) => {
    const id = ids[index]
    if (id && result.data) byId.set(id, result.data)
  })
  return { byId, loading: results.filter((r) => r.isPending).length }
}
