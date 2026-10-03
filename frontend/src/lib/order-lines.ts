import { useQuery } from '@tanstack/react-query'

import { fetchSalesDocument } from '@/api/sales'
import { money, qty } from '@/lib/format'

type Line = { readonly description: string; readonly quantity: string; readonly unitPrice: string | null }

/**
 * "29 Camisa dry a R$ 45,00 + 1 Frete a R$ 80,00" — a coluna DADOS DO PEDIDO.
 * Sem `withPrices` (ou com o preço nulo, que a API manda para quem não vê
 * dinheiro), só as quantidades: "29 Camisa dry + 1 Frete".
 */
export const linesText = (lines: readonly Line[] | undefined, withPrices = true): string =>
  (lines ?? [])
    .map((line) => {
      const price = withPrices && line.unitPrice !== null ? ` a ${money(line.unitPrice)}` : ''
      return `${qty(line.quantity)} ${line.description}${price}`
    })
    .join(' + ')

const docKey = (id: string) => ['sales-document', id] as const

export const useSalesDocument = (id: string | undefined) =>
  useQuery({
    queryKey: docKey(id ?? ''),
    queryFn: ({ signal }) => fetchSalesDocument(id!, signal),
    enabled: id !== undefined,
    staleTime: 5 * 60_000,
  })
