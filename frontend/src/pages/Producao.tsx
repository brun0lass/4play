import { clsx } from 'clsx'
import { AlertTriangle, Eye, EyeOff, KanbanSquare, List, Plus, RefreshCw, Search, Sheet, SlidersHorizontal, User } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'

import { OrderCard } from '@/components/OrderCard'
import { useStageMover } from '@/components/StageMover'
import { useSearchParams } from 'react-router'

import { useNewOrder } from '@/components/NewOrderContext'
import { Button, Empty, ErrorBox, Modal, PageHeader, Spinner } from '@/components/ui'
import { OrderList } from '@/pages/Pedidos'
import { Planilha } from '@/pages/Planilha'
import { int } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { useBoardPrefs } from '@/lib/board-prefs'
import { useQueue, useViewer } from '@/lib/queries'
import { STAGES, STAGE_META, type Order, type Stage } from '@/lib/uniforms'

/**
 * O quadro da fábrica: uma coluna por etapa, o pedido anda arrastando.
 * Pede a fila inteira de uma vez (até 500), como o quadro do Aeris.
 */
const Board = () => {
  const [search, setSearch] = useState('')
  const [mine, setMine] = useState(false)
  const [lateOnly, setLateOnly] = useState(false)
  const deferred = useDeferredValue(search.trim())
  const viewer = useViewer().data

  const queue = useQueue({
    search: deferred === '' ? undefined : deferred,
    mine: mine ? 'true' : undefined,
    late: lateOnly ? 'true' : undefined,
    pageSize: 500,
    sort: 'dispatchDate',
    direction: 'asc',
  })
  const mover = useStageMover()
  const [dragOver, setDragOver] = useState<Stage | null>(null)
  const { prefs, update } = useBoardPrefs()
  const [customizing, setCustomizing] = useState(false)

  const columns = useMemo(() => {
    const map = new Map<Stage, Order[]>(STAGES.map((stage) => [stage, []]))
    for (const order of queue.data?.items ?? []) map.get(order.stage)?.push(order)
    return map
  }, [queue.data])

  const openNewOrder = useNewOrder()
  const late = queue.data?.items.filter((order) => order.late).length ?? 0
  const filtered = deferred !== '' || mine || lateOnly
  const byId = (id: string) => queue.data?.items.find((order) => order.id === id)

  return (
    <div>
      {queue.data && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-bold">
          <span className="rounded-full bg-ink px-3 py-1 text-white">
            {int(queue.data.total)} pedidos
          </span>
          <span className="rounded-full bg-lime px-3 py-1 text-ink">
            {int(queue.data.pieces)} peças
          </span>
          {late > 0 && (
            <button
              type="button"
              onClick={() => setLateOnly(true)}
              className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-white"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> {late} atrasados
            </button>
          )}
          <button
            type="button"
            onClick={() => void queue.refetch()}
            className="ml-1 inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-ink"
            title="O quadro também se atualiza sozinho a cada 30 segundos"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', queue.isFetching && 'animate-spin')} /> Atualizar
          </button>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número ou cliente"
            className="field pl-9"
          />
        </div>
        <Toggle on={mine} onClick={() => setMine((value) => !value)}>
          <User className="h-3.5 w-3.5" /> Minha fila
          {viewer && !viewer.manages && viewer.functions.length === 0 && ' (sem função)'}
        </Toggle>
        <Toggle on={lateOnly} onClick={() => setLateOnly((value) => !value)}>
          <AlertTriangle className="h-3.5 w-3.5" /> Só atrasados
        </Toggle>
        <Toggle on={prefs.hidden.length > 0 || prefs.collapseEmpty || prefs.compact} onClick={() => setCustomizing(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Personalizar quadro
        </Toggle>
      </div>

      {mover.lastError && (
        <div className="mb-4">
          <ErrorBox message={mover.lastError} onRetry={mover.clearError} />
        </div>
      )}

      {queue.isPending && <Spinner label="Carregando a fila…" />}
      {queue.isError && (
        <ErrorBox message={errorMessage(queue.error)} onRetry={() => void queue.refetch()} />
      )}

      {queue.data?.total === 0 && !filtered && (
        <Empty title="A fila está vazia">
          <p>Todo pedido novo entra aqui na etapa Arte e vai andando até Pronto.</p>
{openNewOrder && (
          <Button variant="lime" className="mt-4" icon={<Plus className="h-4 w-4" />} onClick={openNewOrder}>
            Criar o primeiro pedido
          </Button>
)}
        </Empty>
      )}

      {queue.data && queue.data.total > 0 && (
        <p className="mb-3 text-xs font-semibold text-muted">
          Para mudar a etapa, <strong className="text-ink">arraste o card</strong> para outra coluna ou use o
          botão preto no pé do card. Clique no card para abrir a ficha.
        </p>
      )}

      {queue.data && prefs.hidden.length > 0 && (() => {
        const hiddenCount = prefs.hidden.reduce((sum, stage) => sum + (columns.get(stage)?.length ?? 0), 0)
        return (
          <p className="mb-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-black/[0.05] px-3 py-1.5 text-xs font-semibold">
            <EyeOff className="h-3.5 w-3.5" />
            {prefs.hidden.length} etapa(s) oculta(s) neste navegador{hiddenCount > 0 ? `, com ${String(hiddenCount)} pedido(s)` : ''}.
            <button type="button" className="font-bold underline" onClick={() => update({ hidden: [] })}>Mostrar todas</button>
          </p>
        )
      })()}

      {queue.data && (queue.data.total > 0 || filtered) && (
        <div className="scroll-thin -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
          <div className="flex min-w-max gap-4">
            {STAGES.filter((stage) => !prefs.hidden.includes(stage)).map((stage) => {
              const meta = STAGE_META[stage]
              const Icon = meta.icon
              const orders = columns.get(stage) ?? []
              const pieces = orders.reduce((sum, order) => sum + order.pieces, 0)
              if (prefs.collapseEmpty && orders.length === 0) {
                // Recolhida, mas ainda recebe um card arrastado.
                return (
                  <section
                    key={stage}
                    title={`${meta.label} — vazia`}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragOver(stage)
                    }}
                    onDragLeave={() => setDragOver((current) => (current === stage ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragOver(null)
                      const order = byId(event.dataTransfer.getData('text/order-id'))
                      if (order) mover.requestMove(order, stage)
                    }}
                    className={clsx(
                      'flex w-12 shrink-0 flex-col items-center gap-3 rounded-3xl py-3 transition',
                      dragOver === stage ? 'bg-lime/40 ring-2 ring-ink' : 'bg-black/[0.04]'
                    )}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-lime"><Icon className="h-3.5 w-3.5" /></span>
                    <span className="text-xs font-extrabold tracking-wide uppercase [writing-mode:vertical-rl]">{meta.label}</span>
                  </section>
                )
              }
              return (
                <section
                  key={stage}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragOver(stage)
                  }}
                  onDragLeave={() => setDragOver((current) => (current === stage ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragOver(null)
                    const order = byId(event.dataTransfer.getData('text/order-id'))
                    if (order) mover.requestMove(order, stage)
                  }}
                  className={clsx(
                    'flex w-72 shrink-0 flex-col rounded-3xl p-2 transition',
                    dragOver === stage ? 'bg-lime/40 ring-2 ring-ink' : 'bg-black/[0.04]',
                    stage === 'pronto' && dragOver !== stage && 'bg-lime/15'
                  )}
                >
                  <header className="flex items-center justify-between px-2 pt-1.5 pb-3" title={meta.what}>
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          'flex h-7 w-7 items-center justify-center rounded-full',
                          stage === 'pronto' ? 'bg-lime text-ink' : 'bg-ink text-lime'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <h2 className="text-sm font-extrabold tracking-wide uppercase">{meta.label}</h2>
                    </div>
                    <div className="text-right leading-tight">
                      <span className="block text-sm font-extrabold">{orders.length}</span>
                      <span className="block text-[10px] font-semibold text-muted">{int(pieces)} pç</span>
                    </div>
                  </header>
                  <div className="scroll-thin flex max-h-[calc(100vh-17rem)] min-h-24 flex-col gap-2 overflow-y-auto px-0.5 pb-1">
                    {orders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        compact={prefs.compact}
                        draggable
                        moving={mover.isMoving(order.id)}
                        onAdvance={(to) => mover.requestMove(order, to)}
                      />
                    ))}
                    {orders.length === 0 && (
                      <p className="px-2 py-6 text-center text-xs font-semibold text-muted">Nada aqui</p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}
      {mover.dialog}

      <Modal
        open={customizing}
        title="Personalizar quadro"
        onClose={() => setCustomizing(false)}
        footer={<Button variant="ink" onClick={() => setCustomizing(false)}>Fechar</Button>}
      >
        <p className="mb-4 text-sm text-muted">
          Vale só para você, neste navegador. Cada pessoa monta o quadro do jeito que trabalha — o operador da costura
          pode esconder a Arte, por exemplo.
        </p>
        <span className="label">Etapas visíveis</span>
        <ul className="mb-5 divide-y divide-line rounded-2xl border border-line">
          {STAGES.map((stage) => {
            const meta = STAGE_META[stage]
            const Icon = meta.icon
            const visible = !prefs.hidden.includes(stage)
            return (
              <li key={stage}>
                <button
                  type="button"
                  onClick={() =>
                    update({ hidden: visible ? [...prefs.hidden, stage] : prefs.hidden.filter((s) => s !== stage) })
                  }
                  className={clsx('flex w-full items-center gap-3 px-4 py-2.5 text-left', !visible && 'opacity-50')}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-lime"><Icon className="h-3.5 w-3.5" /></span>
                  <span className="flex-1 text-sm font-bold">{meta.label}</span>
                  <span className="text-xs font-semibold text-muted">{columns.get(stage)?.length ?? 0} pedidos</span>
                  {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </li>
            )
          })}
        </ul>
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-ink" checked={prefs.collapseEmpty} onChange={(e) => update({ collapseEmpty: e.target.checked })} />
          Recolher colunas vazias (continuam recebendo cards arrastados)
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-ink" checked={prefs.compact} onChange={(e) => update({ compact: e.target.checked })} />
          Cards compactos (cabem mais pedidos na tela)
        </label>
      </Modal>
    </div>
  )
}

const Toggle = ({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={clsx(
      'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-xs font-bold transition',
      on ? 'border-ink bg-ink text-lime' : 'border-line bg-white text-ink hover:border-ink/40'
    )}
  >
    {children}
  </button>
)

type View = 'quadro' | 'lista' | 'planilha'

const readView = (): View => {
  try {
    const saved = localStorage.getItem('4play.producao.vista')
    return saved === 'lista' || saved === 'planilha' ? saved : 'quadro'
  } catch {
    return 'quadro'
  }
}

/**
 * Pedidos e produção: a mesma fila em quadro (chão de fábrica) ou lista
 * (escritório). A escolha fica lembrada neste navegador.
 */
export const ProducaoPage = () => {
  const [params, setParams] = useSearchParams()
  const openNewOrder = useNewOrder()
  const view: View = (params.get('vista') as View | null) ?? readView()

  const choose = (next: View) => {
    try {
      localStorage.setItem('4play.producao.vista', next)
    } catch {
      /* navegador sem armazenamento: só não lembra */
    }
    setParams(next === 'quadro' ? {} : { vista: next }, { replace: true })
  }

  return (
    <div>
      <div className="no-print">
      <PageHeader
        kicker="Fila de produção"
        title="Pedidos"
        actions={
          <>
            <div className="flex rounded-full bg-black/[0.06] p-1" role="tablist" aria-label="Como ver os pedidos">
              {(
                [
                  ['quadro', 'Quadro', KanbanSquare],
                  ['lista', 'Lista', List],
                  ['planilha', 'Planilha', Sheet],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => choose(key)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-extrabold transition',
                    view === key ? 'bg-white text-ink shadow' : 'text-muted hover:text-ink'
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
{openNewOrder && (
            <Button variant="lime" icon={<Plus className="h-4 w-4" strokeWidth={3} />} onClick={openNewOrder}>
              Novo pedido
            </Button>
)}
          </>
        }
      />
      </div>
      {view === 'quadro' ? <Board /> : view === 'lista' ? <OrderList /> : <Planilha />}
    </div>
  )
}
