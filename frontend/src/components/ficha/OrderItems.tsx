import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ClipboardList, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchPersonalizationTypes, fetchPieces, storeKeys } from '@/api/uniform-store'
import { fetchSizeCharts } from '@/api/uniforms'
import { MissingPiecesDialog } from '@/components/ficha/MissingPiecesDialog'
import { Section } from '@/components/ficha/Section'
import { Button } from '@/components/ui'
import type { ProductionOrderResponseType } from '@/contracts/aeris/uniforms.ts'
import { int, money } from '@/lib/format'
import { missingOptions, uncoveredPieces, type Uncovered } from '@/lib/grade-coverage'

type Order = ProductionOrderResponseType['order']
type Counted = { readonly piece: string; readonly quantity: number }

const qty = (value: string) => Number(value)

/**
 * O que o cliente pediu, à vista na aba da grade: é dele que se monta a grade
 * e os personalizados. Os itens vêm do pedido de vendas (F220); o preço só
 * para quem vê dinheiro.
 *
 * O total da grade não é comparado "peça a peça" com o do pedido: um conjunto
 * é um item no pedido e duas linhas na grade (camisa e shorts). Mas a peça que
 * está na grade e em nenhum item (o manguito do #83) abre um modal para pôr no
 * pedido (F422 do Aeris) — sozinho, uma vez por grade, para quem pode pôr.
 *
 * O frete repassado é uma linha do pedido de vendas (F422 do Aeris), não peça:
 * fica fora da conta e aparece à parte.
 */
export const OrderItems = ({
  order,
  counted,
  gradePieces,
  personalizedPieces,
  canAdd,
  active,
}: {
  order: Order
  /** As peças da grade e dos personalizados, linha a linha. */
  counted: readonly Counted[]
  gradePieces: number
  personalizedPieces: number
  /** Quem atende e vê os valores, com o pedido na fila, põe a peça que falta. */
  canAdd: boolean
  /** A aba da grade está à vista: só aí o modal abre sozinho. */
  active: boolean
}) => {
  const items = order.lines.filter((line) => !line.freight)
  const freight = order.lines.find((line) => line.freight)
  const ordered = items.reduce((sum, line) => sum + qty(line.quantity), 0)
  const { missing, groups } = useMissingPieces(items, counted, order.fabricId)
  const [open, setOpen] = useState(false)

  // Abre sozinho uma vez para cada situação da grade; "Agora não" vale até a grade mudar.
  const signature = missing.map((entry) => `${entry.piece}:${String(entry.quantity)}`).join('|')
  useEffect(() => {
    if (!active || !canAdd || signature === '') return
    if (readDismissed(order.id) === signature) return
    setOpen(true)
  }, [active, canAdd, signature, order.id])
  useEffect(() => {
    if (signature === '') setOpen(false)
  }, [signature])
  const close = () => {
    writeDismissed(order.id, signature)
    setOpen(false)
  }

  return (
    <Section
      title="Itens do pedido"
      icon={<ClipboardList className="h-3.5 w-3.5" />}
      collapsible={{ key: 'itens-do-pedido', defaultOpen: true }}
      aside={<span className="rounded-full bg-black/5 px-3 py-1 text-xs font-extrabold">{int(ordered)} no pedido</span>}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">O pedido não tem itens.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((line, index) => (
            <li key={index} className="flex items-baseline gap-3 py-2 text-sm">
              <span className="w-12 shrink-0 text-right text-base font-extrabold">{int(qty(line.quantity))}</span>
              <span className="flex-1 font-semibold">{line.description}</span>
              {line.unitPrice !== null && (
                <span className="text-xs whitespace-nowrap text-muted">{money(line.unitPrice)} cada</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {freight && (
        <p className="mt-1 flex items-center gap-2 px-1 text-xs font-semibold text-muted">
          <Truck className="h-3.5 w-3.5" />
          Frete repassado ao cliente{freight.unitPrice !== null ? `: ${money(freight.unitPrice)}` : ''} — entra no total, não é peça.
        </p>
      )}
      {missing.length > 0 && <MissingLine missing={missing} canAdd={canAdd} onResolve={() => setOpen(true)} />}
      <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-xs font-semibold text-ink/80">
        Na grade: <strong>{int(gradePieces)}</strong> · Personalizados: <strong>{int(personalizedPieces)}</strong> · Total
        montado: <strong>{int(gradePieces + personalizedPieces)}</strong>
        <span className="mt-0.5 block text-[11px] font-normal text-muted">
          Conjunto conta como um item no pedido e como duas peças na grade (camisa e shorts).
        </span>
      </p>
      {canAdd && <MissingPiecesDialog open={open} onClose={close} orderId={order.id} groups={groups} />}
    </Section>
  )
}

/** A lembrança curta, depois do "Agora não": a peça e o botão de voltar ao modal. */
const MissingLine = ({
  missing,
  canAdd,
  onResolve,
}: {
  missing: readonly Uncovered[]
  canAdd: boolean
  onResolve: () => void
}) => (
  <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
    <AlertTriangle className="h-4 w-4 shrink-0" />
    <span className="flex-1">
      <strong>Fora dos itens:</strong> {missing.map((entry) => `${entry.piece} (${int(entry.quantity)})`).join(', ')}
      {canAdd ? '' : '. Quem atende acerta os itens.'}
    </span>
    {canAdd && (
      <Button variant="outline" size="sm" onClick={onResolve}>
        Resolver
      </Button>
    )}
  </div>
)

const DISMISSED_KEY = (orderId: string) => `4play.grade-fora-dos-itens.${orderId}`

const readDismissed = (orderId: string): string | null => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY(orderId))
  } catch {
    return null
  }
}

const writeDismissed = (orderId: string, signature: string) => {
  try {
    sessionStorage.setItem(DISMISSED_KEY(orderId), signature)
  } catch {
    /* sem armazenamento: o modal volta na próxima vez */
  }
}

/** O catálogo da loja para cruzar a grade com os itens; sem ele (ou sem acesso), não acusa nada. */
const useMissingPieces = (lines: Order['lines'], counted: readonly Counted[], fabricId: string | null) => {
  const pieces = useQuery({ queryKey: storeKeys.pieces, queryFn: ({ signal }) => fetchPieces(signal), staleTime: 5 * 60_000 })
  const charts = useQuery({ queryKey: ['size-charts'], queryFn: ({ signal }) => fetchSizeCharts(signal), staleTime: 5 * 60_000 })
  const types = useQuery({
    queryKey: storeKeys.types,
    queryFn: ({ signal }) => fetchPersonalizationTypes(signal),
    staleTime: 5 * 60_000,
  })
  if (!pieces.data || !charts.data || !types.data) return { missing: [], groups: [] }
  const missing =
    uncoveredPieces({
      lines,
      pieces: pieces.data,
      charts: charts.data,
      services: types.data.map((type) => type.name),
      counted,
    }) ?? []
  return { missing, groups: missingOptions({ missing, pieces: pieces.data, charts: charts.data, fabricId }) }
}
