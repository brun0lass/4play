import { clsx } from 'clsx'
import { CalendarClock, ChevronRight, Printer, Shirt } from 'lucide-react'
import { Link } from 'react-router'

import { Avatar, Badge } from '@/components/ui'
import { day, daysSince, daysUntil, int, money } from '@/lib/format'
import {
  ART_STATUS_META,
  FABRIC_LABELS,
  PAYMENT_MARK_META,
  STAGES,
  STAGE_META,
  orderRef,
  type Order,
  type Stage,
} from '@/lib/uniforms'

export const DispatchChip = ({ order }: { order: Pick<Order, 'dispatchDate' | 'late'> }) => {
  if (!order.dispatchDate)
    return <span className="text-[11px] font-semibold text-muted">Sem data de despacho</span>
  const left = daysUntil(order.dispatchDate)
  const text = order.late
    ? `Atrasado ${String(Math.max(1, -left))}d`
    : left === 0
      ? 'Sai hoje'
      : left === 1
        ? 'Sai amanhã'
        : `Sai em ${String(left)}d`
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap',
        order.late
          ? 'bg-red-600 text-white'
          : left <= 2
            ? 'bg-amber-100 text-amber-900'
            : 'bg-zinc-100 text-zinc-700'
      )}
      title={`Despacho ${day(order.dispatchDate)}`}
    >
      <CalendarClock className="h-3 w-3" aria-hidden />
      {text} · {day(order.dispatchDate)}
    </span>
  )
}

export const OrderCard = ({
  order,
  onAdvance,
  moving,
  draggable,
  compact = false,
}: {
  order: Order
  onAdvance?: (to: Stage) => void
  moving?: boolean
  draggable?: boolean
  /** Só número, cliente, prazo e peças. */
  compact?: boolean
}) => {
  const next = STAGES[STAGES.indexOf(order.stage) + 1]
  const stuck = daysSince(order.stageChangedAt)

  return (
    <article
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/order-id', order.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      className={clsx(
        'group relative rounded-2xl border bg-white p-3 shadow-[0_1px_0_0_rgb(0_0_0/0.04)] transition hover:-translate-y-0.5 hover:shadow-lg',
        order.late ? 'border-red-300' : 'border-line',
        moving && 'pointer-events-none opacity-50',
        draggable && 'cursor-grab active:cursor-grabbing'
      )}
    >
      {order.late && <span className="absolute inset-y-3 left-0 w-1 rounded-r bg-red-600" />}
      <Link to={`/pedidos/${order.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <span className="display text-lg">{orderRef(order)}</span>
          <span className="text-xs font-bold text-muted">{money(order.totalAmount)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm leading-snug font-bold">{order.customerName}</p>
        {order.customerCity && <p className="text-[11px] text-muted">{order.customerCity}</p>}

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <DispatchChip order={order} />
        </div>

        {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">
            <Shirt className="h-3 w-3" aria-hidden /> {int(order.pieces)} pç
          </Badge>
          {order.stage === 'arte' && (
            <Badge tone={ART_STATUS_META[order.artStatus].tone}>
              {ART_STATUS_META[order.artStatus].label}
            </Badge>
          )}
          {order.fabric && <Badge tone="neutral">{FABRIC_LABELS[order.fabric]}</Badge>}
          {order.paymentMark !== 'total' && (
            <Badge tone={PAYMENT_MARK_META[order.paymentMark].tone}>
              {PAYMENT_MARK_META[order.paymentMark].label}
            </Badge>
          )}
          {order.printers.map((printer) => (
            <Badge key={printer.id} tone="info">
              <Printer className="h-3 w-3" aria-hidden /> {printer.name}
            </Badge>
          ))}
        </div>
        )}
      </Link>

      <div className={clsx('flex items-center justify-between gap-2 border-t border-line', compact ? 'mt-2 pt-2' : 'mt-3 pt-2.5')}>
        <div className="flex items-center gap-1.5">
          {order.designerName && <Avatar name={order.designerName} />}
          <span className="text-[11px] font-semibold text-muted" title="Dias nesta etapa">
            {stuck === 0 ? 'hoje nesta etapa' : `${String(stuck)}d nesta etapa`}
          </span>
        </div>
        {next && onAdvance && (
          <button
            type="button"
            onClick={() => onAdvance(next)}
            className="inline-flex items-center gap-0.5 rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-lime hover:text-ink"
            title={`Mover para ${STAGE_META[next].label}`}
          >
            {STAGE_META[next].label}
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </article>
  )
}
