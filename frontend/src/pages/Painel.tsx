import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, ArrowRight, CalendarClock, KanbanSquare, Palette, Plus, Shirt, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { fetchDashboardSales } from '@/api/store'
import { useAuth } from '@/auth/AuthProvider'
import { DispatchChip } from '@/components/OrderCard'
import { useNewOrder } from '@/components/NewOrderContext'
import { Badge, Button, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { daysUntil, int, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { useQueue } from '@/lib/queries'
import { ART_STATUS_META, STAGES, STAGE_META, orderRef, type Order } from '@/lib/uniforms'

const monthRange = () => {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

export const PainelPage = () => {
  const { session, can } = useAuth()
  const openNewOrder = useNewOrder()
  const navigate = useNavigate()
  // A mesma consulta do quadro de Produção: o cache serve as duas telas.
  const queue = useQueue({ pageSize: 500, sort: 'dispatchDate', direction: 'asc' })
  const sales = useQuery({
    queryKey: ['dashboard', 'sales', 'month'],
    queryFn: ({ signal }) => fetchDashboardSales(monthRange(), signal),
    enabled: can('dashboard.read'),
    retry: false,
  })

  const firstName = session?.user.displayName.split(' ')[0] ?? ''
  const items = queue.data?.items ?? []
  const late = items.filter((o) => o.late)
  const thisWeek = items.filter((o) => o.dispatchDate && !o.late && daysUntil(o.dispatchDate) <= 7)
  const waitingClient = items.filter((o) => o.stage === 'arte' && (o.artStatus === 'enviada' || o.artStatus === 'ajuste'))
  const upcoming = items.filter((o) => o.dispatchDate).slice(0, 8)
  const total = queue.data?.total ?? 0

  return (
    <div>
      <PageHeader kicker={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} title={`Fala, ${firstName}!`}
        actions={
          <>
            <Button variant="outline" icon={<KanbanSquare className="h-4 w-4" />} onClick={() => void navigate('/producao')}>
              Ver o quadro
            </Button>
{openNewOrder && (
            <Button variant="lime" icon={<Plus className="h-4 w-4" strokeWidth={3} />} onClick={openNewOrder}>
              Novo pedido
            </Button>
)}
          </>
        }
      >
        <p className="mt-2 text-sm font-semibold text-muted">Como está a fábrica agora.</p>
      </PageHeader>

      {queue.isPending && <Spinner />}
      {queue.isError && <ErrorBox message={errorMessage(queue.error)} onRetry={() => void queue.refetch()} />}

      {queue.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi dark label="Pedidos na fila" value={int(total)} icon={<Shirt className="h-5 w-5" />} />
            <Kpi label="Peças em produção" value={int(queue.data.pieces)} icon={<Timer className="h-5 w-5" />} accent />
            <Kpi label="Atrasados" value={int(late.length)} icon={<AlertTriangle className="h-5 w-5" />} danger={late.length > 0} />
            <Kpi label="Saem em 7 dias" value={int(thisWeek.length)} icon={<CalendarClock className="h-5 w-5" />} />
          </div>

          {/* Distribuição por etapa */}
          <section className="card mt-6 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-extrabold tracking-wider uppercase">Onde estão os pedidos</h2>
              <Link to="/producao" className="inline-flex items-center gap-1 text-xs font-bold hover:underline">
                Abrir quadro <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="flex h-4 overflow-hidden rounded-full bg-paper">
              {STAGES.map((stage) => {
                const count = queue.data.byStage[stage] ?? 0
                if (count === 0 || total === 0) return null
                return (
                  <div
                    key={stage}
                    className={clsx(STAGE_META[stage].dot, 'h-full')}
                    style={{ width: `${String((count / total) * 100)}%` }}
                    title={`${STAGE_META[stage].label}: ${String(count)}`}
                  />
                )
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {STAGES.map((stage) => {
                const Icon = STAGE_META[stage].icon
                return (
                  <div key={stage} className="rounded-2xl bg-paper px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-wide text-muted uppercase">
                      <span className={clsx('h-2 w-2 rounded-full', STAGE_META[stage].dot)} />
                      <Icon className="h-3 w-3" /> {STAGE_META[stage].label}
                    </div>
                    <p className="display mt-1 text-2xl">{queue.data.byStage[stage] ?? 0}</p>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <OrderList
              title="Próximos despachos"
              icon={<CalendarClock className="h-3.5 w-3.5" />}
              orders={upcoming}
              empty="Nenhum pedido com data de despacho."
              right={(order) => <DispatchChip order={order} />}
            />
            <OrderList
              title="Arte esperando o cliente"
              icon={<Palette className="h-3.5 w-3.5" />}
              orders={waitingClient}
              empty="Nenhuma arte parada com o cliente."
              right={(order) => (
                <Badge tone={ART_STATUS_META[order.artStatus].tone}>{ART_STATUS_META[order.artStatus].label}</Badge>
              )}
            />
          </div>

          {queue.data.workload.length > 0 && (
            <section className="card mt-6 p-5">
              <h2 className="mb-4 text-sm font-extrabold tracking-wider uppercase">Carga da equipe</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {queue.data.workload.map((person) => (
                  <div key={`${person.userId}-${person.as}`} className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3">
                    <div>
                      <p className="text-sm font-bold">{person.name}</p>
                      <p className="text-[11px] font-semibold text-muted">{person.as === 'designer' ? 'Designer' : 'Atendente'}</p>
                    </div>
                    <div className="text-right">
                      <p className="display text-2xl">{person.count}</p>
                      {person.late > 0 && <p className="text-[11px] font-bold text-red-600">{person.late} atrasados</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {sales.data && (
        <section className="brush-bg mt-6 rounded-3xl p-6 text-white">
          <h2 className="mb-4 text-sm font-extrabold tracking-wider text-white/60 uppercase">Vendas do mês</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Money label="Faturado" value={money(sales.data.sales.revenue)} highlight />
            <Money label="Vendas" value={int(sales.data.sales.count)} />
            <Money label="Ticket médio" value={money(sales.data.sales.averageTicket)} />
            <Money label="Mês passado (mesmo período)" value={money(sales.data.previous.revenue)} />
          </div>
        </section>
      )}
    </div>
  )
}

const Kpi = ({
  label,
  value,
  icon,
  dark,
  accent,
  danger,
}: {
  label: string
  value: string
  icon: ReactNode
  dark?: boolean
  accent?: boolean
  danger?: boolean
}) => (
  <div
    className={clsx(
      'rounded-3xl p-5',
      dark && 'bg-ink text-white',
      accent && 'bg-lime text-ink',
      danger && 'bg-red-600 text-white',
      !dark && !accent && !danger && 'card'
    )}
  >
    <div className={clsx('mb-3 flex h-9 w-9 items-center justify-center rounded-full', dark ? 'bg-lime text-ink' : accent ? 'bg-ink text-lime' : danger ? 'bg-white text-red-600' : 'bg-paper')}>
      {icon}
    </div>
    <p className="display text-4xl">{value}</p>
    <p className={clsx('mt-1 text-xs font-bold tracking-wide uppercase', dark || danger ? 'text-white/60' : 'text-ink/60')}>{label}</p>
  </div>
)

const Money = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div>
    <p className="text-[11px] font-bold tracking-wide text-white/50 uppercase">{label}</p>
    <p className={clsx('mt-1 text-2xl font-extrabold', highlight && 'text-lime')}>{value}</p>
  </div>
)

const OrderList = ({
  title,
  icon,
  orders,
  empty,
  right,
}: {
  title: string
  icon: ReactNode
  orders: Order[]
  empty: string
  right: (order: Order) => ReactNode
}) => (
  <section className="card p-5">
    <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold tracking-wider uppercase">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-lime">{icon}</span>
      {title}
    </h2>
    {orders.length === 0 ? (
      <p className="py-4 text-sm text-muted">{empty}</p>
    ) : (
      <ul className="divide-y divide-line">
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={`/pedidos/${order.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-lime-50">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  <span className="mr-2 font-extrabold">{orderRef(order)}</span>
                  {order.customerName}
                </p>
                <p className="text-[11px] text-muted">
                  {STAGE_META[order.stage].label} · {int(order.pieces)} peças
                </p>
              </div>
              {right(order)}
            </Link>
          </li>
        ))}
      </ul>
    )}
  </section>
)
