import type { SectorCellType, SectorPartType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, ArrowRight, CheckCheck, Minus, Plus, Printer, Search, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { sendSector, setSectorDone } from '@/api/uniforms'
import { DispatchChip } from '@/components/OrderCard'
import { IncidentDialog, useCanReport, type IncidentDraft } from '@/components/progress/Incidents'
import { useToast } from '@/components/Toast'
import { Badge, Button, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { day, int } from '@/lib/format'
import { ApiError, errorMessage } from '@/lib/http'
import { keys, usePrinters, useSector, useViewer } from '@/lib/queries'
import {
  FABRIC_LABELS,
  FACTORY_SECTORS,
  SECTOR_LABELS,
  STAGE_META,
  STAGE_REFUSALS,
  canMoveStage,
  canWork,
  isFactorySector,
  orderRef,
  pieceKey,
  type FactorySector,
  type Stage,
} from '@/lib/uniforms'

const SECTOR_KEY = '4play.setor'

const SEND_REFUSALS: Record<string, string> = {
  ...STAGE_REFUSALS,
  nothing_done: 'Marque quantas peças já foram feitas antes de mandar.',
  not_in_sector: 'Esta leva já saiu deste setor. A tela foi atualizada.',
  unknown_cell: 'A leva mudou enquanto a tela estava aberta. A tela foi atualizada.',
  over_quantity: 'Mais peças do que o tamanho tem.',
  stage_changed: 'Alguém mexeu nesta leva agora há pouco. A tela foi atualizada.',
}

const refusalText = (error: unknown): string =>
  error instanceof ApiError ? (SEND_REFUSALS[error.code] ?? errorMessage(error)) : errorMessage(error)

const left = (part: SectorPartType): number => part.total - part.done

/**
 * O setor e a grade (F235 do Aeris): cada setor da fábrica vê só as levas que
 * estão com ele, a grade por peça e tamanho, e vai marcando embaixo quantas já
 * fez — como na folha da grade. As feitas vão para o próximo setor num botão;
 * o que falta continua aqui.
 */
export const SetoresPage = () => {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('setor')
  const [sector, setSector] = useState<FactorySector>(() => {
    if (isFactorySector(fromUrl)) return fromUrl
    try {
      const saved = localStorage.getItem(SECTOR_KEY)
      if (isFactorySector(saved)) return saved
    } catch {
      // Sem armazenamento: começa pela impressão.
    }
    return 'impressao'
  })
  const [search, setSearch] = useState('')
  const all = {
    impressao: useSector('impressao'),
    corte: useSector('corte'),
    costura: useSector('costura'),
    embalagem: useSector('embalagem'),
  }
  const current = all[sector]

  const choose = (next: FactorySector) => {
    setSector(next)
    setParams({ setor: next }, { replace: true })
    try {
      localStorage.setItem(SECTOR_KEY, next)
    } catch {
      // Lembrar o setor é só conveniência.
    }
  }

  const term = search.trim().toLocaleLowerCase('pt-BR')
  const parts = (current.data?.parts ?? []).filter(
    (part) =>
      term === '' ||
      part.customerName.toLocaleLowerCase('pt-BR').includes(term) ||
      String(part.orderNumber ?? '').includes(term.replace('#', ''))
  )

  return (
    <div>
      <PageHeader kicker="Chão de fábrica" title="Setores">
        <p className="mt-2 max-w-2xl text-sm font-semibold text-muted">
          Cada setor vê o que tem para fazer, por peça e tamanho. Marque embaixo quantas já foram feitas e mande as feitas para o
          próximo setor — o resto continua aqui.
        </p>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist">
        {FACTORY_SECTORS.map((value) => {
          const data = all[value].data
          const pieces = data?.parts.reduce((sum, part) => sum + left(part), 0)
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={sector === value}
              onClick={() => choose(value)}
              className={clsx(
                'rounded-2xl border-2 px-3 py-2.5 text-left transition',
                sector === value ? 'border-ink bg-lime' : 'border-line bg-white hover:border-ink/30'
              )}
            >
              <span className="block text-sm font-extrabold">{SECTOR_LABELS[value]}</span>
              <span className="text-[11px] font-semibold text-ink/70">
                {data === undefined
                  ? '…'
                  : data.parts.length === 0
                    ? 'Nada para fazer'
                    : `${int(pieces ?? 0)} peças · ${String(data.parts.length)} ${data.parts.length === 1 ? 'leva' : 'levas'}`}
              </span>
            </button>
          )
        })}
      </div>

      <label className="relative mb-5 block max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente ou nº do pedido" className="field pl-9" />
      </label>

      {current.isPending && <Spinner label="Carregando o setor…" />}
      {current.isError && <ErrorBox message={errorMessage(current.error)} onRetry={() => void current.refetch()} />}
      {current.data && parts.length === 0 && (
        <Empty title={term === '' ? `Nada na ${SECTOR_LABELS[sector].toLocaleLowerCase('pt-BR')} agora` : 'Nada encontrado'}>
          <p>{term === '' ? 'Quando uma leva chegar neste setor, ela aparece aqui.' : 'Tente outro nome ou número.'}</p>
        </Empty>
      )}
      <div className="space-y-4">
        {current.data &&
          parts.map((part) => (
            <SectorCard key={`${part.orderId}:${part.batchId ?? '1'}`} sector={sector} nextStage={current.data.nextStage} part={part} />
          ))}
      </div>
    </div>
  )
}

/** As células agrupadas por peça, para a grade: linhas são peças, colunas tamanhos. */
const byPiece = (cells: readonly SectorCellType[]) => {
  const groups: { piece: string; cells: SectorCellType[] }[] = []
  for (const cell of cells) {
    const group = groups.find((item) => pieceKey(item.piece) === pieceKey(cell.piece))
    if (group) group.cells.push(cell)
    else groups.push({ piece: cell.piece, cells: [cell] })
  }
  return groups
}

/** Uma leva no setor: a grade com o feito embaixo, e mandar as feitas. */
const SectorCard = ({ sector, nextStage, part }: { sector: FactorySector; nextStage: Stage; part: SectorPartType }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const viewer = useViewer().data
  const printers = usePrinters('active')
  const canReport = useCanReport()
  const canMark = canWork(viewer, 'producao')
  const canSend = canMoveStage(viewer, part.stage, nextStage)
  // O que a pessoa marcou e ainda não foi gravado (grava logo depois de parar de clicar).
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [typing, setTyping] = useState<Record<string, string>>({})
  const [chosenPrinters, setChosenPrinters] = useState<string[]>([])
  const [showNames, setShowNames] = useState(false)
  const [incident, setIncident] = useState<IncidentDraft | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<Record<string, number>>({})

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.sectorAll })
    void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    void queryClient.invalidateQueries({ queryKey: keys.order(part.orderId) })
  }

  const save = useMutation({
    mutationFn: (cells: { key: string; done: number }[]) => setSectorDone(part.orderId, sector, { batchId: part.batchId, cells }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.sector(sector) })
      setDraft((all) => Object.fromEntries(Object.entries(all).filter(([key]) => !(key in pending.current))))
    },
    onError: () => {
      setDraft({})
      refresh()
    },
  })

  const flush = async () => {
    window.clearTimeout(timer.current)
    const cells = Object.entries(pending.current).map(([key, done]) => ({ key, done }))
    pending.current = {}
    if (cells.length > 0) await save.mutateAsync(cells)
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const doneOf = (cell: SectorCellType): number => draft[cell.key] ?? cell.done
  const mark = (cell: SectorCellType, value: number) => {
    const done = Math.max(0, Math.min(cell.quantity, value))
    setDraft((all) => ({ ...all, [cell.key]: done }))
    pending.current = { ...pending.current, [cell.key]: done }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 600)
  }
  const markAll = (value: 'tudo' | 'nada') => {
    for (const cell of part.cells) mark(cell, value === 'tudo' ? cell.quantity : 0)
  }

  const done = part.cells.reduce((sum, cell) => sum + doneOf(cell), 0)
  const everything = done === part.total && part.total > 0
  // A impressão diz a máquina quando a leva ainda não passou por "imprimindo".
  const needsPrinter = sector === 'impressao' && part.stage !== 'imprimindo'

  const send = useMutation({
    mutationFn: async () => {
      await flush()
      return sendSector(part.orderId, sector, {
        batchId: part.batchId,
        from: part.stage,
        printerIds: needsPrinter ? chosenPrinters : [],
      })
    },
    onSuccess: (result) => {
      toast(
        `${orderRef({ number: part.orderNumber })}: ${int(result.pieces)} ${result.pieces === 1 ? 'peça foi' : 'peças foram'} para ${STAGE_META[result.to].label}.`
      )
      setDraft({})
      refresh()
    },
    onError: refresh,
  })

  const names = part.names.filter((row) =>
    part.cells.some((cell) => pieceKey(cell.piece) === pieceKey(row.piece) && (cell.size === null || cell.size === row.size))
  )

  return (
    <article className={clsx('rounded-3xl border bg-white p-4 sm:p-5', part.late ? 'border-red-300' : 'border-line')}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/pedidos/${part.orderId}`} className="text-base font-extrabold hover:underline">
            {orderRef({ number: part.orderNumber })} · {part.customerName}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted">
            {part.split && <Badge tone="lime">Leva {part.batchNumber}</Badge>}
            <Badge>{STAGE_META[part.stage].label}</Badge>
            <DispatchChip order={part} />
            {part.eventDate && <span>Evento {day(part.eventDate)}</span>}
            {part.fabric && <span>· {FABRIC_LABELS[part.fabric]}</span>}
            {part.printers.length > 0 && (
              <span className="inline-flex items-center gap-1">
                · <Printer className="h-3 w-3" aria-hidden /> {part.printers.map((p) => p.name).join(', ')}
              </span>
            )}
            {part.seamstresses.length > 0 && <span>· Costura: {part.seamstresses.join(', ')}</span>}
            {part.openIncidents > 0 && (
              <Badge tone="danger">
                {part.openIncidents} {part.openIncidents === 1 ? 'ocorrência' : 'ocorrências'}
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl leading-none font-extrabold">
            {int(part.total - done)}
            <span className="text-sm font-bold text-muted"> a fazer</span>
          </p>
          <p className="text-[11px] font-semibold text-muted">
            {int(done)} de {int(part.total)} feitas
          </p>
        </div>
      </header>

      <div className="mb-3 h-2 overflow-hidden rounded-full bg-black/5" aria-hidden>
        <div className="h-full rounded-full bg-lime-600 transition-all" style={{ width: `${String(part.total === 0 ? 0 : (done / part.total) * 100)}%` }} />
      </div>

      {part.cells.length === 0 ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Este pedido não tem grade. Peça ao atendimento.</p>
      ) : (
        <div className="space-y-3">
          {byPiece(part.cells).map((group) => (
            <div key={group.piece}>
              <p className="mb-1.5 text-xs font-extrabold tracking-wide uppercase">{group.piece}</p>
              <div className="flex flex-wrap gap-2">
                {group.cells.map((cell) => {
                  const value = doneOf(cell)
                  const full = value >= cell.quantity
                  return (
                    <div
                      key={cell.key}
                      className={clsx('w-[7.5rem] rounded-2xl border-2 p-2 text-center', full ? 'border-lime-600 bg-lime/30' : 'border-line')}
                    >
                      <p className="text-[11px] font-extrabold text-muted">{cell.size ?? 'sem tamanho'}</p>
                      <p className="text-xl leading-tight font-extrabold" title="A fazer">
                        {int(cell.quantity - value)}
                        <span className="text-[10px] font-bold text-muted"> /{int(cell.quantity)}</span>
                      </p>
                      <div className="mt-1 border-t border-dashed border-line pt-1">
                        <p className="text-[10px] font-bold text-muted uppercase">Feitas</p>
                        {canMark ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => mark(cell, value - 1)}
                              disabled={value === 0}
                              className="rounded-full p-1 hover:bg-black/5 disabled:opacity-30"
                              aria-label={`Uma ${cell.piece} ${cell.size ?? ''} a menos`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              value={typing[cell.key] ?? String(value)}
                              onChange={(e) => setTyping((all) => ({ ...all, [cell.key]: e.target.value.replace(/\D/g, '') }))}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={() => {
                                const typed = typing[cell.key]
                                if (typed !== undefined && Number(typed || '0') !== value) mark(cell, Number(typed || '0'))
                                setTyping((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== cell.key)))
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                              }}
                              inputMode="numeric"
                              className="field h-7 w-11 px-1 text-center text-sm font-extrabold"
                              aria-label={`Feitas ${cell.piece} ${cell.size ?? ''}`}
                            />
                            <button
                              type="button"
                              onClick={() => mark(cell, value + 1)}
                              disabled={full}
                              className="rounded-full p-1 hover:bg-black/5 disabled:opacity-30"
                              aria-label={`Mais uma ${cell.piece} ${cell.size ?? ''}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm font-extrabold">{int(value)}</p>
                        )}
                        {canMark && !full && (
                          <button
                            type="button"
                            onClick={() => mark(cell, cell.quantity)}
                            className="mt-0.5 text-[10px] font-bold text-muted hover:text-ink"
                          >
                            Todas
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {names.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowNames((value) => !value)}
            className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-ink"
          >
            <Users className="h-3.5 w-3.5" /> {showNames ? 'Esconder' : 'Ver'} os nomes ({names.length})
          </button>
          {showNames && (
            <div className="scroll-thin mt-2 max-h-56 overflow-y-auto rounded-2xl bg-paper p-2">
              <table className="w-full text-xs">
                <tbody>
                  {names.map((row, index) => (
                    <tr key={`${row.name}-${row.number}-${String(index)}`} className="border-t border-line first:border-0">
                      <td className="py-1 font-bold">{row.name || '—'}</td>
                      <td className="py-1 text-center">{row.number}</td>
                      <td className="py-1">{row.piece}</td>
                      <td className="py-1 text-center font-bold">{row.size}</td>
                      <td className="py-1 text-right text-muted">{row.quantity > 1 ? `${String(row.quantity)}×` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {canSend && needsPrinter && done > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-extrabold tracking-wide uppercase">Em qual máquina foi impresso</p>
          <div className="flex flex-wrap gap-1.5">
            {printers.data?.map((printer) => {
              const on = chosenPrinters.includes(printer.id)
              return (
                <button
                  key={printer.id}
                  type="button"
                  onClick={() => setChosenPrinters((list) => (on ? list.filter((id) => id !== printer.id) : [...list, printer.id]))}
                  className={clsx('inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-extrabold', on ? 'border-ink bg-lime' : 'border-line')}
                >
                  <Printer className="h-3.5 w-3.5" /> {printer.name}
                </button>
              )
            })}
            {printers.data?.length === 0 && <p className="text-xs text-muted">Nenhuma impressora cadastrada (Equipe e máquinas).</p>}
          </div>
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {canSend && (
          <Button
            variant="lime"
            icon={<ArrowRight className="h-4 w-4" />}
            busy={send.isPending}
            disabled={done === 0 || save.isPending || (needsPrinter && chosenPrinters.length === 0)}
            onClick={() => send.mutate()}
          >
            {done === 0
              ? `Marque as feitas para mandar para ${STAGE_META[nextStage].label}`
              : everything
                ? `Mandar ${part.split ? 'a leva inteira' : 'tudo'} para ${STAGE_META[nextStage].label}`
                : `Mandar as ${int(done)} feitas para ${STAGE_META[nextStage].label}`}
          </Button>
        )}
        {canMark && part.cells.length > 0 && (
          <Button variant="ghost" size="sm" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => markAll(everything ? 'nada' : 'tudo')}>
            {everything ? 'Desmarcar tudo' : 'Marcar tudo feito'}
          </Button>
        )}
        {canReport && (
          <Button
            variant="ghost"
            size="sm"
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            onClick={() => setIncident({ kind: 'refazer', sector, lines: {} })}
          >
            Ocorrência
          </Button>
        )}
        {save.isPending && <span className="text-[11px] font-semibold text-muted">Salvando…</span>}
      </footer>
      {!everything && done > 0 && canSend && (
        <p className="mt-2 text-[11px] text-muted">
          As {int(done)} feitas viram uma leva nova em {STAGE_META[nextStage].label}; as {int(part.total - done)} que faltam continuam aqui.
        </p>
      )}
      {(save.isError || send.isError) && (
        <div className="mt-3">
          <ErrorBox message={refusalText(send.error ?? save.error)} />
        </div>
      )}

      <IncidentDialog
        orderId={part.orderId}
        lines={part.cells}
        parts={[]}
        batchId={part.batchId}
        draft={incident}
        onClose={() => setIncident(null)}
      />
    </article>
  )
}
