import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Factory, Plus, ReceiptText, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'

import {
  fetchAgeing,
  fetchBilled,
  fetchEntries,
  fetchOpenOrders,
  type Ageing,
  type Billed,
  type Direction,
  type Entry,
  type OpenOrders,
} from '@/api/finance'
import { useAuth } from '@/auth/AuthProvider'
import { NewEntryDialog } from '@/components/finance/NewEntryDialog'
import { SettleDialog } from '@/components/finance/SettleDialog'
import { Badge, Button, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { day, int, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { STAGE_META } from '@/lib/uniforms'

/** `factory`: os pedidos ainda na fábrica, que ainda não viraram título. */
type Filter = 'open' | 'overdue' | 'settled' | 'factory'

const PAGE = 30

const contas = (n: number) => (n === 1 ? '1 conta' : `${String(n)} contas`)
const pedidos = (n: number) => (n === 1 ? '1 pedido' : `${String(n)} pedidos`)

/** Soma de decimais em texto, em centavos. */
const plus = (...values: (string | undefined)[]) =>
  (values.reduce((sum, value) => sum + Math.round(Number(value ?? 0) * 100), 0) / 100).toFixed(2)

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

/** O mês `offset` meses antes do atual, no fuso daqui: do dia 1 às 23:59:59.999 do último dia. */
const monthRange = (offset: number) => {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1, 0, 0, 0, -1)
  const label = MONTH.format(from)
  return { from, to, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

const ORIGIN_LABEL: Record<Entry['originType'], string> = {
  sale: 'Pedido/venda',
  purchase: 'Compra',
  manual: 'Lançamento',
  payroll: 'Folha',
  tax: 'Imposto',
  exchange: 'Troca',
  renegotiation: 'Renegociação',
  commission: 'Comissão',
}

const overdueOf = (ageing: Ageing | undefined) =>
  ageing?.buckets.filter((b) => b.bucket !== 'current').reduce((sum, b) => ({ amount: sum.amount + Number(b.amount), count: sum.count + b.count }), { amount: 0, count: 0 }) ??
  { amount: 0, count: 0 }

/**
 * O financeiro da 4Play: o que entra e o que sai.
 *
 * O título a receber de um pedido aparece quando o pedido sai (despachado ou
 * retirado). O sinal pago antes disso já desconta dele. Até sair, o que o
 * pedido tem a receber (total − sinal) vem da fila da produção — "A receber"
 * soma os dois, para o número não ficar parado enquanto o pedido é feito.
 *
 * Faturado: o que foi fechado no mês (pedidos confirmados em diante e vendas),
 * pela data do pedido; cancelado e rascunho não contam.
 */
export const FinanceiroPage = () => {
  const { can } = useAuth()
  const [direction, setDirection] = useState<Direction>('receivable')
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState<Entry | null>(null)
  const [creating, setCreating] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)
  const deferred = useDeferredValue(search.trim())
  const month = monthRange(monthOffset)

  const receivable = useQuery({ queryKey: ['finance', 'ageing', 'receivable'], queryFn: ({ signal }) => fetchAgeing('receivable', signal) })
  const payable = useQuery({ queryKey: ['finance', 'ageing', 'payable'], queryFn: ({ signal }) => fetchAgeing('payable', signal) })
  // A fila é de quem lê a produção; o caixa sem `uniforms.read` vê só os títulos.
  const seesFactory = can('uniforms.read')
  const openOrders = useQuery({
    queryKey: ['finance', 'open-orders'],
    queryFn: ({ signal }) => fetchOpenOrders(signal),
    enabled: seesFactory,
  })
  const billed = useQuery({
    queryKey: ['finance', 'billed', month.from.toISOString()],
    queryFn: ({ signal }) => fetchBilled(month.from, month.to, signal),
    enabled: can('sales.read'),
    placeholderData: keepPreviousData,
  })

  const entries = useQuery({
    queryKey: ['finance', 'entries', direction, filter, deferred, offset],
    queryFn: ({ signal }) =>
      fetchEntries(
        {
          direction,
          status: filter === 'settled' ? 'settled' : 'open',
          overdueOnly: filter === 'overdue',
          search: deferred || undefined,
          offset,
          limit: PAGE,
          order: filter === 'settled' ? 'desc' : 'asc',
        },
        signal
      ),
    placeholderData: keepPreviousData,
    enabled: filter !== 'factory',
  })

  const choose = (next: Direction, nextFilter: Filter = 'open') => {
    setDirection(next)
    setFilter(next === 'payable' && nextFilter === 'factory' ? 'open' : nextFilter)
    setOffset(0)
  }

  const canSettle = can('finance.settle')
  const receiving = direction === 'receivable'

  return (
    <div>
      <PageHeader
        kicker="Contas a receber e a pagar"
        title="Financeiro"
        actions={
          can('finance.write') && (
            <Button variant="lime" icon={<Plus className="h-4 w-4" strokeWidth={3} />} onClick={() => setCreating(true)}>
              Lançar conta
            </Button>
          )
        }
      />

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReceivableCard
          ageing={receivable.data}
          orders={seesFactory ? openOrders.data : null}
          error={receivable.error ?? openOrders.error}
          onTitles={() => choose('receivable')}
          onFactory={() => choose('receivable', 'factory')}
          onOverdue={() => choose('receivable', 'overdue')}
        />
        {can('sales.read') && (
          <BilledCard
            billed={billed.data}
            error={billed.error}
            label={month.label}
            loading={billed.isFetching}
            canNext={monthOffset > 0}
            onPrevious={() => setMonthOffset((m) => m + 1)}
            onNext={() => setMonthOffset((m) => Math.max(0, m - 1))}
          />
        )}
        <SummaryCard
          title="A pagar"
          icon={<ArrowUpRight className="h-5 w-5" />}
          ageing={payable.data}
          error={payable.error}
          onOpen={() => choose('payable')}
          onOverdue={() => choose('payable', 'overdue')}
        />
      </div>

      {/* Lista */}
      <section className="card mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-paper p-1">
            {(
              [
                ['receivable', 'A receber'],
                ['payable', 'A pagar'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => choose(key, filter)}
                className={clsx('rounded-full px-5 py-1.5 text-sm font-extrabold transition', direction === key ? 'bg-ink text-lime' : 'text-muted hover:text-ink')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(
              [
                ['open', receiving && seesFactory ? 'Títulos em aberto' : 'Em aberto'],
                ...(receiving && seesFactory ? ([['factory', 'Na fábrica']] as const) : []),
                ['overdue', 'Vencidos'],
                ['settled', receiving ? 'Recebidos' : 'Pagos'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setFilter(key)
                  setOffset(0)
                }}
                className={clsx(
                  'rounded-full border px-3.5 py-1.5 text-xs font-bold transition',
                  filter === key ? (key === 'overdue' ? 'border-red-600 bg-red-600 text-white' : 'border-ink bg-ink text-white') : 'border-line hover:border-ink/40'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0) }} placeholder="Cliente, fornecedor ou descrição" className="field pl-9" />
          </div>
        </div>

        {filter === 'factory' ? (
          <FactoryOrders query={openOrders} search={deferred} />
        ) : (
          <>
        {entries.isPending && <Spinner />}
        {entries.isError && <ErrorBox message={errorMessage(entries.error)} onRetry={() => void entries.refetch()} />}
        {entries.data?.items.length === 0 && (
          <Empty title={filter === 'overdue' ? 'Nada vencido' : 'Nenhuma conta aqui'}>
            {receiving && filter === 'open'
              ? `O título de um pedido nasce quando ele sai da fábrica (despachado ou retirado).${seesFactory ? ' Até lá, o que ele tem a receber está em "Na fábrica".' : ''}`
              : 'Tente outro filtro.'}
          </Empty>
        )}

        {entries.data && entries.data.items.length > 0 && (
          <>
            <p className="mb-2 text-sm font-semibold text-muted">
              {contas(entries.data.total)} · {filter === 'settled' ? 'em aberto no filtro' : 'somando'}{' '}
              <strong className="text-ink">{money(entries.data.outstandingTotal)}</strong> em aberto
            </p>
            <div className="scroll-thin -mx-5 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-[11px] tracking-wider text-muted uppercase">
                  <tr className="border-b border-line">
                    <th className="px-5 py-2 font-bold">Vencimento</th>
                    <th className="px-3 py-2 font-bold">{receiving ? 'Cliente' : 'Fornecedor'}</th>
                    <th className="px-3 py-2 font-bold">Descrição</th>
                    <th className="px-3 py-2 text-right font-bold">Valor</th>
                    <th className="px-3 py-2 text-right font-bold">Em aberto</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {entries.data.items.map((entry) => (
                    <tr key={entry.id} className={clsx('border-b border-line last:border-0', entry.isOverdue && entry.status === 'open' && 'bg-red-50/60')}>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <p className="font-bold">{day(entry.dueAt)}</p>
                        {entry.status === 'open' && entry.isOverdue && (
                          <Badge tone="danger">{entry.daysOverdue}d em atraso</Badge>
                        )}
                        {entry.status === 'settled' && entry.settledAt && (
                          <span className="text-[11px] text-emerald-700">{receiving ? 'recebido' : 'pago'} {day(entry.settledAt)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-bold">{entry.partyName}</td>
                      <td className="px-3 py-3">
                        <p>{entry.description}</p>
                        <p className="text-[11px] text-muted">
                          {ORIGIN_LABEL[entry.originType]}
                          {entry.documentNumber ? ` · nº ${entry.documentNumber}` : ''}
                          {entry.instalmentCount > 1 ? ` · parcela ${String(entry.instalmentNumber)}/${String(entry.instalmentCount)}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right">{money(entry.amount)}</td>
                      <td className="px-3 py-3 text-right font-extrabold">{entry.status === 'open' ? money(entry.outstanding) : '—'}</td>
                      <td className="px-5 py-3 text-right">
                        {entry.status === 'open' && canSettle && (
                          <Button size="sm" variant={entry.isOverdue ? 'ink' : 'outline'} onClick={() => setSettling(entry)}>
                            {receiving ? 'Receber' : 'Pagar'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {entries.data.total > PAGE && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-semibold text-muted">
                  {offset + 1}–{Math.min(offset + PAGE, entries.data.total)} de {entries.data.total}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <Button size="sm" variant="outline" disabled={offset + PAGE >= entries.data.total} onClick={() => setOffset((o) => o + PAGE)}>
                    Próxima <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
          </>
        )}
      </section>

      <SettleDialog entry={settling} onClose={() => setSettling(null)} />
      <NewEntryDialog open={creating} initialDirection={direction} onClose={() => setCreating(false)} />
    </div>
  )
}

const SummaryCard = ({
  title,
  icon,
  ageing,
  error,
  dark = false,
  onOpen,
  onOverdue,
}: {
  title: string
  icon: React.ReactNode
  ageing: Ageing | undefined
  error: unknown
  dark?: boolean
  onOpen: () => void
  onOverdue: () => void
}) => {
  const overdue = overdueOf(ageing)
  const count = ageing?.buckets.reduce((sum, b) => sum + b.count, 0) ?? 0
  return (
    <div className={clsx('rounded-3xl p-5', dark ? 'brush-bg text-white' : 'card')}>
      <div className="flex items-center gap-2">
        <span className={clsx('flex h-9 w-9 items-center justify-center rounded-full', dark ? 'bg-lime text-ink' : 'bg-ink text-lime')}>{icon}</span>
        <h2 className="text-sm font-extrabold tracking-wider uppercase">{title}</h2>
      </div>
      {error ? (
        <p className="mt-4 text-sm">{errorMessage(error)}</p>
      ) : (
        <>
          <button type="button" onClick={onOpen} className="mt-4 block text-left">
            <p className={clsx('display text-4xl', dark && 'text-lime')}>{ageing ? money(ageing.total) : '…'}</p>
            <p className={clsx('text-xs font-bold', dark ? 'text-white/60' : 'text-muted')}>em aberto · {contas(count)}</p>
          </button>
          <button
            type="button"
            onClick={onOverdue}
            disabled={overdue.count === 0}
            className={clsx(
              'mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold',
              overdue.count > 0 ? 'bg-red-600 text-white hover:bg-red-700' : dark ? 'bg-white/10 text-white/60' : 'bg-paper text-muted'
            )}
          >
            {overdue.count > 0 ? `${money(overdue.amount.toFixed(2))} vencido · ${contas(overdue.count)}` : 'Nada vencido'}
          </button>
        </>
      )}
    </div>
  )
}

/** A receber = títulos em aberto (o que já saiu) + o que os pedidos na fábrica ainda devem. */
const ReceivableCard = ({
  ageing,
  orders,
  error,
  onTitles,
  onFactory,
  onOverdue,
}: {
  ageing: Ageing | undefined
  /** `null`: quem não lê a produção — só os títulos. */
  orders: OpenOrders | undefined | null
  error: unknown
  onTitles: () => void
  onFactory: () => void
  onOverdue: () => void
}) => {
  const overdue = overdueOf(ageing)
  const count = ageing?.buckets.reduce((sum, b) => sum + b.count, 0) ?? 0
  const loading = ageing === undefined || orders === undefined
  const total = loading ? null : plus(ageing.total, orders?.outstanding)
  return (
    <div className="brush-bg rounded-3xl p-5 text-white">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime text-ink">
          <ArrowDownLeft className="h-5 w-5" />
        </span>
        <h2 className="text-sm font-extrabold tracking-wider uppercase">A receber</h2>
      </div>
      {error ? (
        <p className="mt-4 text-sm">{errorMessage(error)}</p>
      ) : (
        <>
          <p className="display mt-4 text-4xl text-lime">{total === null ? '…' : money(total)}</p>
          <div className="mt-2 space-y-1 text-xs font-bold text-white/70">
            {orders !== null && (
              <button type="button" onClick={onFactory} className="flex w-full items-center gap-2 text-left hover:text-white">
                <Factory className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {orders ? money(orders.outstanding) : '…'} em pedidos na fábrica · {orders ? pedidos(orders.count) : '…'}
                </span>
              </button>
            )}
            <button type="button" onClick={onTitles} className="flex w-full items-center gap-2 text-left hover:text-white">
              <ReceiptText className="h-3.5 w-3.5 shrink-0" />
              <span>
                {ageing ? money(ageing.total) : '…'} em títulos (já saíram) · {contas(count)}
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onOverdue}
            disabled={overdue.count === 0}
            className={clsx(
              'mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold',
              overdue.count > 0 ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white/10 text-white/60'
            )}
          >
            {overdue.count > 0 ? `${money(overdue.amount.toFixed(2))} vencido · ${contas(overdue.count)}` : 'Nada vencido'}
          </button>
        </>
      )}
    </div>
  )
}

/** O faturado do mês: o que foi fechado, separado entre o que já saiu e o que está na fábrica. */
const BilledCard = ({
  billed,
  error,
  label,
  loading,
  canNext,
  onPrevious,
  onNext,
}: {
  billed: Billed | undefined
  error: unknown
  label: string
  loading: boolean
  canNext: boolean
  onPrevious: () => void
  onNext: () => void
}) => (
  <div className="card rounded-3xl p-5">
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-lime">
        <ReceiptText className="h-5 w-5" />
      </span>
      <h2 className="text-sm font-extrabold tracking-wider uppercase">Faturado</h2>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={onPrevious} className="rounded-full p-1 text-muted hover:bg-paper hover:text-ink" aria-label="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-28 text-center text-xs font-bold">{label}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="rounded-full p-1 text-muted hover:bg-paper hover:text-ink disabled:opacity-30"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
    {error ? (
      <p className="mt-4 text-sm">{errorMessage(error)}</p>
    ) : (
      <>
        <p className={clsx('display mt-4 text-4xl', loading && 'opacity-60')}>{billed ? money(billed.total) : '…'}</p>
        <p className="text-xs font-bold text-muted">{billed ? `${pedidos(billed.count)} fechados no mês` : ''}</p>
        {billed && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-paper px-3 py-2">
              <p className="font-bold text-muted">Já saiu</p>
              <p className="font-extrabold">{money(billed.shipped)}</p>
            </div>
            <div className="rounded-xl bg-paper px-3 py-2">
              <p className="font-bold text-muted">Na fábrica</p>
              <p className="font-extrabold">{money(billed.inProduction)}</p>
            </div>
          </div>
        )}
      </>
    )}
  </div>
)

/** Os pedidos que ainda não saíram e têm o que receber: total, sinal e o que falta. */
const FactoryOrders = ({
  query,
  search,
}: {
  query: { data: OpenOrders | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }
  search: string
}) => {
  if (query.isPending) return <Spinner />
  if (query.isError) return <ErrorBox message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  const needle = search.toLowerCase()
  const orders = (query.data?.orders ?? []).filter(
    (order) => needle === '' || order.customerName.toLowerCase().includes(needle) || String(order.number ?? '').includes(needle)
  )
  if (orders.length === 0)
    return <Empty title="Nenhum pedido aqui">{needle ? 'Tente outra busca.' : 'Todo pedido na fábrica já está pago.'}</Empty>
  const outstanding = plus(...orders.map((order) => order.outstanding))
  return (
    <>
      <p className="mb-2 text-sm font-semibold text-muted">
        {pedidos(orders.length)} na fábrica · faltam <strong className="text-ink">{money(outstanding)}</strong>. Cada um vira título quando sai (despachado
        ou retirado).
      </p>
      <div className="scroll-thin -mx-5 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-[11px] tracking-wider text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-5 py-2 font-bold">Pedido</th>
              <th className="px-3 py-2 font-bold">Cliente</th>
              <th className="px-3 py-2 font-bold">Etapa</th>
              <th className="px-3 py-2 font-bold">Despacho</th>
              <th className="px-3 py-2 text-right font-bold">Total</th>
              <th className="px-3 py-2 text-right font-bold">Já pago</th>
              <th className="px-5 py-2 text-right font-bold">Falta</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3 font-extrabold">
                  <Link to={`/pedidos/${order.id}`} className="hover:underline">
                    {order.number === null ? 'Rascunho' : `nº ${int(order.number)}`}
                  </Link>
                </td>
                <td className="px-3 py-3 font-bold">{order.customerName}</td>
                <td className="px-3 py-3">{STAGE_META[order.stage].label}</td>
                <td className="px-3 py-3 whitespace-nowrap">{day(order.dispatchDate)}</td>
                <td className="px-3 py-3 text-right">{money(order.total)}</td>
                <td className="px-3 py-3 text-right">{Number(order.paid) > 0 ? money(order.paid) : '—'}</td>
                <td className="px-5 py-3 text-right font-extrabold">{money(order.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
