import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { fetchAgeing, fetchEntries, type Ageing, type Direction, type Entry } from '@/api/finance'
import { useAuth } from '@/auth/AuthProvider'
import { NewEntryDialog } from '@/components/finance/NewEntryDialog'
import { SettleDialog } from '@/components/finance/SettleDialog'
import { Badge, Button, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { day, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'

type Filter = 'open' | 'overdue' | 'settled'

const PAGE = 30

const contas = (n: number) => (n === 1 ? '1 conta' : `${String(n)} contas`)

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
 * retirado). O sinal pago antes disso já desconta dele.
 */
export const FinanceiroPage = () => {
  const { can } = useAuth()
  const [direction, setDirection] = useState<Direction>('receivable')
  const [filter, setFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState<Entry | null>(null)
  const [creating, setCreating] = useState(false)
  const deferred = useDeferredValue(search.trim())

  const receivable = useQuery({ queryKey: ['finance', 'ageing', 'receivable'], queryFn: ({ signal }) => fetchAgeing('receivable', signal) })
  const payable = useQuery({ queryKey: ['finance', 'ageing', 'payable'], queryFn: ({ signal }) => fetchAgeing('payable', signal) })

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
  })

  const choose = (next: Direction, nextFilter: Filter = 'open') => {
    setDirection(next)
    setFilter(nextFilter)
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
      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard
          title="A receber"
          icon={<ArrowDownLeft className="h-5 w-5" />}
          ageing={receivable.data}
          error={receivable.error}
          dark
          onOpen={() => choose('receivable')}
          onOverdue={() => choose('receivable', 'overdue')}
        />
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
                ['open', 'Em aberto'],
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

        {entries.isPending && <Spinner />}
        {entries.isError && <ErrorBox message={errorMessage(entries.error)} onRetry={() => void entries.refetch()} />}
        {entries.data?.items.length === 0 && (
          <Empty title={filter === 'overdue' ? 'Nada vencido' : 'Nenhuma conta aqui'}>
            {receiving && filter === 'open'
              ? 'O valor de um pedido entra aqui quando ele sai da fábrica (despachado ou retirado).'
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
