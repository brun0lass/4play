import { History, Layers, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Badge, ErrorBox, Spinner } from '@/components/ui'
import { day, int } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { useCustomerHistory } from '@/lib/queries'
import { STAGE_META, orderPieces, orderRef, piecesText, type Order } from '@/lib/uniforms'

/** As máquinas de um pedido, sem repetir: as do pedido e as de cada leva. */
const printersOf = (order: Order): string[] => [
  ...new Set([...order.printers, ...order.batches.flatMap((batch) => batch.printers)].map((p) => p.name)),
]

const statusOf = (order: Order) =>
  order.status === 'fulfilled'
    ? { label: 'Entregue', tone: 'success' as const }
    : order.batches.length > 0
      ? { label: `Em produção · ${String(order.batches.length + 1)} levas`, tone: 'warning' as const }
      : { label: STAGE_META[order.stage].label, tone: 'warning' as const }

/**
 * Os pedidos anteriores do cliente (F229 do Aeris): em qual máquina cada um
 * saiu, as levas e o que foi pedido. É o que se procura quando o cliente volta
 * um ano depois querendo "igual ao do ano passado".
 */
export const CustomerHistory = ({
  partyId,
  exceptOrderId,
  limit,
}: {
  partyId: string
  /** O pedido que está aberto na tela — não se lista a si mesmo. */
  exceptOrderId?: string
  /** Quantos mostrar antes do "ver todos". */
  limit?: number
}) => {
  const history = useCustomerHistory(partyId)
  const [all, setAll] = useState(false)

  if (history.isPending) return <Spinner label="Buscando os pedidos do cliente…" />
  if (history.isError) return <ErrorBox message={errorMessage(history.error)} onRetry={() => void history.refetch()} />

  const orders = history.data.filter((order) => order.id !== exceptOrderId)
  const shown = all || limit === undefined ? orders : orders.slice(0, limit)

  if (orders.length === 0)
    return <p className="text-sm text-muted">Nenhum outro pedido deste cliente.</p>

  return (
    <div>
      <ol className="space-y-2">
        {shown.map((order) => {
          const status = statusOf(order)
          const machines = printersOf(order)
          return (
            <li key={order.id}>
              <Link to={`/pedidos/${order.id}`} className="block rounded-2xl border border-line p-3 transition hover:border-ink/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-extrabold">
                    {orderRef(order)} <span className="font-semibold text-muted">· {day(order.issuedAt)}</span>
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/80">
                  {int(order.pieces)} peças
                  {orderPieces(order).length > 0 ? ` — ${piecesText(orderPieces(order))}` : ''}
                  {order.designerName ? ` · arte de ${order.designerName}` : ''}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {machines.length === 0 ? (
                    <span className="text-[11px] text-muted">Sem impressora marcada</span>
                  ) : (
                    machines.map((name) => (
                      <Badge key={name} tone="info">
                        <Printer className="h-3 w-3" aria-hidden /> {name}
                      </Badge>
                    ))
                  )}
                  {order.sewing.length > 0 && (
                    <span className="text-[11px] font-semibold text-muted">
                      Costura: {[...new Set(order.sewing.map((ref) => ref.seamstressName))].join(', ')}
                    </span>
                  )}
                  {order.batches.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
                      <Layers className="h-3 w-3" /> {order.batches.length + 1} levas
                    </span>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ol>
      {!all && limit !== undefined && orders.length > limit && (
        <button type="button" onClick={() => setAll(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline">
          <History className="h-3.5 w-3.5" /> Ver os {orders.length} pedidos
        </button>
      )}
    </div>
  )
}
