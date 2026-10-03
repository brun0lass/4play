import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useNavigate } from 'react-router'

import { DispatchChip } from '@/components/OrderCard'
import { Badge, Button, Empty, ErrorBox, Spinner } from '@/components/ui'
import { int, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { useAccess } from '@/lib/access'
import { useQueue } from '@/lib/queries'
import {
  ART_STATUS_META,
  FABRIC_LABELS,
  PAYMENT_MARK_META,
  STAGES,
  STAGE_META,
  logisticsText,
  orderRef,
  type Stage,
} from '@/lib/uniforms'

type Sort = 'dispatchDate' | 'number' | 'customer' | 'total' | 'stage' | 'pieces'

const PAGE_SIZE = 50

/** A fila em tabela — a outra cara do quadro, com ordenação e paginação. */
export const OrderList = () => {
  const navigate = useNavigate()
  const { seeMoney } = useAccess()
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<Stage | ''>('')
  const [drafts, setDrafts] = useState(false)
  const [late, setLate] = useState(false)
  const [sort, setSort] = useState<Sort>('dispatchDate')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const deferred = useDeferredValue(search.trim())

  const queue = useQueue({
    search: deferred || undefined,
    stages: stage || undefined,
    drafts: drafts ? 'true' : undefined,
    late: late ? 'true' : undefined,
    sort,
    direction,
    page,
    pageSize: PAGE_SIZE,
  })

  const pages = queue.data ? Math.max(1, Math.ceil(queue.data.total / PAGE_SIZE)) : 1

  const header = (key: Sort, label: string, className?: string) => (
    <th className={clsx('px-3 py-3 font-bold', className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-ink"
        onClick={() => {
          if (sort === key) setDirection((value) => (value === 'asc' ? 'desc' : 'asc'))
          else {
            setSort(key)
            setDirection('asc')
          }
          setPage(1)
        }}
      >
        {label}
        {sort === key &&
          (direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )

  return (
    <div>
      {queue.data && (
        <p className="mb-3 text-sm font-semibold text-muted">
          {int(queue.data.total)} pedidos · {int(queue.data.pieces)} peças no filtro
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Número ou cliente"
            className="field pl-9"
          />
        </div>
        <select
          value={stage}
          onChange={(event) => {
            setStage(event.target.value as Stage | '')
            setPage(1)
          }}
          className="field w-auto"
        >
          <option value="">Todas as etapas</option>
          {STAGES.map((value) => (
            <option key={value} value={value}>
              {STAGE_META[value].label}
              {queue.data?.byStage[value] !== undefined ? ` (${String(queue.data.byStage[value])})` : ''}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-xs font-bold">
          <input type="checkbox" checked={late} onChange={(e) => { setLate(e.target.checked); setPage(1) }} className="accent-ink" />
          Só atrasados
        </label>
        <label className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-xs font-bold">
          <input type="checkbox" checked={drafts} onChange={(e) => { setDrafts(e.target.checked); setPage(1) }} className="accent-ink" />
          Rascunhos
        </label>
      </div>

      {queue.isPending && <Spinner />}
      {queue.isError && <ErrorBox message={errorMessage(queue.error)} onRetry={() => void queue.refetch()} />}
      {queue.data?.items.length === 0 && (
        <Empty title="Nenhum pedido">Nada na fila com esses filtros.</Empty>
      )}

      {queue.data && queue.data.items.length > 0 && (
        <div className="card overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-ink text-[11px] tracking-wider text-white/70 uppercase">
                <tr>
                  {header('number', 'Pedido')}
                  {header('customer', 'Cliente')}
                  {header('stage', 'Etapa')}
                  <th className="px-3 py-3 font-bold">Arte</th>
                  {header('dispatchDate', 'Despacho')}
                  {header('pieces', 'Peças', 'text-right')}
                  {seeMoney && header('total', 'Valor', 'text-right')}
                  {seeMoney && <th className="px-3 py-3 font-bold">Pago</th>}
                  <th className="px-3 py-3 font-bold">Tecido</th>
                  <th className="px-3 py-3 font-bold">Logística</th>
                  <th className="px-3 py-3 font-bold">Designer</th>
                </tr>
              </thead>
              <tbody>
                {queue.data.items.map((order) => {
                  const Icon = STAGE_META[order.stage].icon
                  return (
                    <tr
                      key={order.id}
                      onClick={() => void navigate(`/pedidos/${order.id}`)}
                      className={clsx(
                        'cursor-pointer border-t border-line transition hover:bg-lime-50',
                        order.late && 'bg-red-50/60'
                      )}
                    >
                      <td className="px-3 py-3 font-extrabold">{orderRef(order)}</td>
                      <td className="min-w-[220px] px-3 py-3">
                        <p className="font-bold">{order.customerName}</p>
                        {order.customerCity && <p className="text-xs text-muted">{order.customerCity}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <Icon className="h-4 w-4" /> {STAGE_META[order.stage].label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={ART_STATUS_META[order.artStatus].tone}>
                          {ART_STATUS_META[order.artStatus].label}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <DispatchChip order={order} />
                      </td>
                      <td className="px-3 py-3 text-right font-bold">{int(order.pieces)}</td>
                      {seeMoney && (
                        <td className="px-3 py-3 text-right">
                          <p className="font-bold">{money(order.totalAmount)}</p>
                          {order.ticketPerPiece && (
                            <p className="text-[11px] text-muted">{money(order.ticketPerPiece)}/pç</p>
                          )}
                        </td>
                      )}
                      {seeMoney && (
                        <td className="px-3 py-3">
                          <p className="text-xs font-semibold">{money(order.paidAmount)}</p>
                          {order.paymentMark === 'cortesia' && (
                            <Badge tone={PAYMENT_MARK_META.cortesia.tone}>Cortesia</Badge>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-3">{order.fabric ? FABRIC_LABELS[order.fabric] : '?'}</td>
                      <td className="px-3 py-3">{logisticsText(order.logistics)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{order.designerName ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="font-semibold text-muted">
              Página {page} de {pages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </footer>
        </div>
      )}
    </div>
  )
}
