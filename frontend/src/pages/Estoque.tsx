import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ChevronLeft, ChevronRight, ClipboardCheck, History, PackagePlus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useNavigate } from 'react-router'

import { listBalances, type Balance } from '@/api/inventory'
import { useAuth } from '@/auth/AuthProvider'
import { HistoryDialog, MovementDialog, type MovementKind } from '@/components/inventory/MovementDialog'
import { StarterStockDialog } from '@/components/inventory/StarterStockDialog'
import { Badge, Button, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { UNIT_SHORT, int, money, qty } from '@/lib/format'
import { errorMessage } from '@/lib/http'

type Filter = 'all' | 'low' | 'negative' | 'withStock'

const PAGE = 40

/**
 * O estoque da 4Play: quanto tem de cada coisa, o que está acabando, e cada
 * entrada e saída. Só aparecem os produtos com "controlar estoque" ligado.
 */
export const EstoquePage = () => {
  const { can } = useAuth()
  const navigate = useNavigate()
  const canMove = can('inventory.write')
  const canCount = can('inventory.adjust')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const [moving, setMoving] = useState<{ balance: Balance; kind: MovementKind } | null>(null)
  const [history, setHistory] = useState<Balance | null>(null)
  const [starting, setStarting] = useState(false)
  const canCreate = can('catalog.write')
  const deferred = useDeferredValue(search.trim())

  const balances = useQuery({
    queryKey: ['inventory', 'balances', deferred, filter, page],
    queryFn: ({ signal }) =>
      listBalances(
        {
          search: deferred || undefined,
          belowMinimum: filter === 'low',
          negative: filter === 'negative',
          onlyWithStock: filter === 'withStock',
          page,
          pageSize: PAGE,
        },
        signal
      ),
    placeholderData: keepPreviousData,
  })
  const lowCount = useQuery({
    queryKey: ['inventory', 'balances', 'low-count'],
    queryFn: ({ signal }) => listBalances({ belowMinimum: true, pageSize: 1 }, signal),
  })

  const totals = balances.data?.totals
  const pages = balances.data ? Math.max(1, Math.ceil(balances.data.total / PAGE)) : 1

  return (
    <div>
      <PageHeader
        kicker="Tecido, tinta, papel e peça pronta"
        title="Estoque"
        actions={canCreate && <Button variant="outline" icon={<PackagePlus className="h-4 w-4" />} onClick={() => setStarting(true)}>Cadastrar tecido, papel e tinta</Button>}
      >
        <p className="mt-2 text-sm font-semibold text-muted">
          Para um item aparecer aqui, ligue "Controlar estoque" no cadastro dele em{' '}
          <button type="button" className="font-bold text-ink underline" onClick={() => void navigate('/produtos')}>Produtos</button>.
        </p>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Valor em estoque (custo)" value={totals ? money(totals.costValue) : '…'} dark />
        <Tile label="Valor de venda" value={totals ? money(totals.saleValue) : '…'} />
        <Tile label="Itens no filtro" value={balances.data ? int(balances.data.total) : '…'} />
        <button type="button" onClick={() => { setFilter('low'); setPage(1) }} className="text-left">
          <Tile
            label="Abaixo do mínimo"
            value={lowCount.data ? int(lowCount.data.total) : '…'}
            danger={(lowCount.data?.total ?? 0) > 0}
          />
        </button>
      </div>

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Nome ou código" className="field pl-9" />
        </div>
        {(
          [
            ['all', 'Todos'],
            ['low', 'Acabando'],
            ['withStock', 'Com saldo'],
            ['negative', 'Negativos'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setFilter(key); setPage(1) }}
            className={clsx(
              'rounded-full border px-4 py-2 text-xs font-bold transition',
              filter === key ? (key === 'low' || key === 'negative' ? 'border-red-600 bg-red-600 text-white' : 'border-ink bg-ink text-lime') : 'border-line bg-white hover:border-ink/40'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {balances.isPending && <Spinner />}
      {balances.isError && <ErrorBox message={errorMessage(balances.error)} onRetry={() => void balances.refetch()} />}
      {balances.data?.items.length === 0 && (
        <Empty title={filter === 'low' ? 'Nada acabando' : 'Nenhum item aqui'}>
          <p>{filter === 'all' && !deferred ? 'Nenhum produto com controle de estoque ainda.' : 'Tente outro filtro.'}</p>
          {filter === 'all' && !deferred && canCreate && (
            <Button variant="lime" className="mt-4" icon={<PackagePlus className="h-4 w-4" />} onClick={() => setStarting(true)}>Começar por tecido, papel e tinta</Button>
          )}
        </Empty>
      )}

      {balances.data && balances.data.items.length > 0 && (
        <div className="card overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-ink text-[11px] tracking-wider text-white/70 uppercase">
                <tr>
                  <th className="px-4 py-3 font-bold">Item</th>
                  <th className="px-3 py-3 text-right font-bold">Tem</th>
                  <th className="px-3 py-3 text-right font-bold">Reservado</th>
                  <th className="px-3 py-3 text-right font-bold">Mínimo</th>
                  <th className="px-3 py-3 text-right font-bold">Custo médio</th>
                  <th className="px-4 py-3 text-right font-bold">Movimentar</th>
                </tr>
              </thead>
              <tbody>
                {balances.data.items.map((b) => {
                  const onHand = Number(b.onHand)
                  const low = b.minimumStock != null && onHand < Number(b.minimumStock)
                  const unit = UNIT_SHORT[b.unit] ?? b.unit
                  return (
                    <tr key={b.variantId} className={clsx('border-t border-line', (low || onHand < 0) && 'bg-red-50/60')}>
                      <td className="px-4 py-2.5">
                        <p className="font-bold">{b.productName}</p>
                        <p className="text-[11px] text-muted">{b.sku}{b.categoryName ? ` · ${b.categoryName}` : ''}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={clsx('display text-xl', (low || onHand < 0) && 'text-red-600')}>{qty(b.onHand)}</span>
                        <span className="ml-1 text-[11px] text-muted">{unit}</span>
                        {low && <div><Badge tone="danger"><AlertTriangle className="h-3 w-3" /> acabando</Badge></div>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted">{Number(b.reserved) > 0 ? qty(b.reserved) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{b.minimumStock ? qty(b.minimumStock) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{money(b.averageCost)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {canMove && (
                            <>
                              <IconBtn title="Entrada" onClick={() => setMoving({ balance: b, kind: 'entry' })} className="text-emerald-700"><ArrowDownToLine className="h-4 w-4" /></IconBtn>
                              <IconBtn title="Saída" onClick={() => setMoving({ balance: b, kind: 'exit' })} className="text-red-600"><ArrowUpFromLine className="h-4 w-4" /></IconBtn>
                            </>
                          )}
                          {canCount && (
                            <IconBtn title="Contagem" onClick={() => setMoving({ balance: b, kind: 'adjust' })}><ClipboardCheck className="h-4 w-4" /></IconBtn>
                          )}
                          <IconBtn title="Histórico" onClick={() => setHistory(b)}><History className="h-4 w-4" /></IconBtn>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <footer className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="font-semibold text-muted">Página {page} de {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Próxima <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </footer>
          )}
        </div>
      )}

      <MovementDialog balance={moving?.balance ?? null} kind={moving?.kind ?? 'entry'} onClose={() => setMoving(null)} />
      <HistoryDialog balance={history} onClose={() => setHistory(null)} />
      <StarterStockDialog open={starting} onClose={() => setStarting(false)} />
    </div>
  )
}

const Tile = ({ label, value, dark, danger }: { label: string; value: string; dark?: boolean; danger?: boolean }) => (
  <div className={clsx('h-full rounded-3xl p-5', dark ? 'brush-bg text-white' : danger ? 'bg-red-600 text-white' : 'card')}>
    <p className={clsx('display text-3xl', dark && 'text-lime')}>{value}</p>
    <p className={clsx('mt-1 text-xs font-bold tracking-wide uppercase', dark || danger ? 'text-white/70' : 'text-ink/60')}>{label}</p>
  </div>
)

const IconBtn = ({ title, onClick, children, className }: { title: string; onClick: () => void; children: React.ReactNode; className?: string }) => (
  <button type="button" title={title} aria-label={title} onClick={onClick} className={clsx('inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1.5 text-xs font-bold hover:border-ink', className)}>
    {children}
    <span className="hidden xl:inline">{title}</span>
  </button>
)
