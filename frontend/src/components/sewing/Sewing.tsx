import type { SeamstressSummaryType, SewingJobSummaryType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { CalendarClock, Check, Shirt, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { cancelSewingJob, createSewingJob, deliverSewingJob } from '@/api/uniforms'
import { useToast } from '@/components/Toast'
import { Badge, Button, ErrorBox, Modal } from '@/components/ui'
import { useAccess } from '@/lib/access'
import { day, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys, useOrderSewing, useSeamstresses } from '@/lib/queries'
import { orderRef, partLabel, pieceKey, type Part } from '@/lib/uniforms'

/** Depois de qualquer mudança numa costura: a ficha, a fila, as listas das costureiras. */
const useSewingInvalidate = () => {
  const queryClient = useQueryClient()
  return (orderId: string) => {
    void queryClient.invalidateQueries({ queryKey: keys.orderSewing(orderId) })
    void queryClient.invalidateQueries({ queryKey: keys.order(orderId) })
    void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    void queryClient.invalidateQueries({ queryKey: keys.seamstressesAll })
    void queryClient.invalidateQueries({ queryKey: keys.sewingAll })
  }
}

export const SEWING_STATUS_META: Record<SewingJobSummaryType['status'], { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  'em-andamento': { label: 'Costurando', tone: 'warning' },
  entregue: { label: 'Entregue', tone: 'success' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
}

export const termText = (days: number | null): string =>
  days === null ? '—' : days === 0 ? 'na entrega' : `${String(days)} dias depois da entrega`

/** "20 Camisa · 10 Shorts". */
export const sewingPiecesText = (job: Pick<SewingJobSummaryType, 'pieces'>): string =>
  job.pieces.map((piece) => `${String(piece.quantity)} ${piece.piece}`).join(' · ')

/**
 * Mandar uma leva (ou parte dela) para uma costureira (F231 do Aeris).
 *
 * O que já está com outra costureira nesta leva não volta como livre. O preço
 * vem da tabela dela; quem vê dinheiro pode combinar outro na hora.
 */
export const SewingDialog = ({ part, onClose }: { part: Part | null; onClose: () => void }) => {
  const toast = useToast()
  const invalidate = useSewingInvalidate()
  const { seeMoney } = useAccess()
  const seamstresses = useSeamstresses('active')
  const sewing = useOrderSewing(part?.order.id ?? '')
  const [seamstressId, setSeamstressId] = useState<string | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')

  // O que está livre nesta leva: o que ela tem menos o que já está com costureiras.
  const free = useMemo(() => {
    if (part === null) return []
    const busy = new Map<string, number>()
    for (const job of sewing.data ?? []) {
      if (job.status === 'cancelada' || (job.batchId ?? null) !== (part.batch?.id ?? null)) continue
      for (const piece of job.pieces) busy.set(pieceKey(piece.piece), (busy.get(pieceKey(piece.piece)) ?? 0) + piece.quantity)
    }
    return part.pieces.map((count) => ({ ...count, quantity: Math.max(0, count.quantity - (busy.get(pieceKey(count.piece)) ?? 0)) }))
  }, [part, sewing.data])

  useEffect(() => {
    if (part === null) return
    setSeamstressId(null)
    setNotes('')
    setPrices({})
  }, [part])
  useEffect(() => {
    setAmounts(Object.fromEntries(free.map((count) => [count.piece, count.quantity > 0 ? String(count.quantity) : ''])))
  }, [free])

  const chosen: SeamstressSummaryType | undefined = seamstresses.data?.find((s) => s.id === seamstressId)
  const tableFor = (piece: string): string | null =>
    chosen?.prices.find((row) => pieceKey(row.piece) === pieceKey(piece))?.unitPrice ?? null

  const quantityOf = (piece: string) => {
    const value = Number(amounts[piece] ?? '')
    return Number.isInteger(value) && value > 0 ? value : 0
  }
  const picked = free.filter((count) => quantityOf(count.piece) > 0)
  const over = free.find((count) => quantityOf(count.piece) > count.quantity)
  const total = picked.reduce((sum, count) => {
    const price = Number(prices[count.piece] ?? tableFor(count.piece) ?? '0')
    return sum + quantityOf(count.piece) * (Number.isFinite(price) ? price : 0)
  }, 0)

  const mutation = useMutation({
    mutationFn: async () => {
      if (part === null || seamstressId === null) return
      await createSewingJob(part.order.id, {
        seamstressId,
        batchId: part.batch?.id ?? null,
        notes: notes.trim() || null,
        pieces: picked.map((count) => {
          const typed = prices[count.piece]?.replace(',', '.').trim()
          return {
            piece: count.piece,
            quantity: quantityOf(count.piece),
            ...(seeMoney && typed ? { unitPrice: typed } : {}),
          }
        }),
      })
    },
    onSuccess: () => {
      if (part !== null) {
        toast(`${orderRef(part.order)} · ${partLabel(part)} foi para ${chosen?.name ?? 'a costureira'}.`)
        invalidate(part.order.id)
      }
      onClose()
    },
  })

  return (
    <Modal
      open={part !== null}
      wide
      title={part === null ? '' : `Mandar para costureira — ${orderRef(part.order)} · ${partLabel(part)}`}
      onClose={() => {
        mutation.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="lime"
            icon={<Shirt className="h-4 w-4" />}
            busy={mutation.isPending}
            disabled={seamstressId === null || picked.length === 0 || over !== undefined}
            onClick={() => mutation.mutate()}
          >
            Mandar {picked.reduce((sum, count) => sum + quantityOf(count.piece), 0)} peças
          </Button>
        </>
      }
    >
      {part && (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Costureira</p>
            {seamstresses.data?.length === 0 && (
              <p className="text-sm text-muted">
                Nenhuma costureira cadastrada. Cadastre em <Link to="/costureiras" className="font-bold underline">Costureiras</Link>.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {seamstresses.data?.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeamstressId(s.id)}
                  className={clsx(
                    'rounded-2xl border-2 px-3 py-2 text-left transition',
                    seamstressId === s.id ? 'border-ink bg-lime' : 'border-line hover:border-ink/30'
                  )}
                >
                  <span className="block truncate text-sm font-bold">{s.name}</span>
                  <span className="text-[11px] text-muted">
                    {s.kind === 'clt' ? 'CLT' : 'Terceirizada'}
                    {s.openPieces > 0 ? ` · ${String(s.openPieces)} pç com ela` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Quantas peças</p>
            <div className="space-y-2">
              {free.map((count) => (
                <div key={count.piece} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{count.piece}</span>
                    <span className="text-[11px] text-muted">{count.quantity} livres nesta leva</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={count.quantity}
                      value={amounts[count.piece] ?? ''}
                      onChange={(event) => setAmounts((current) => ({ ...current, [count.piece]: event.target.value }))}
                      className={clsx('field w-20 text-right', quantityOf(count.piece) > count.quantity && 'border-red-500')}
                      aria-label={`Quantas ${count.piece}`}
                    />
                    {seeMoney && (
                      <label className="flex items-center gap-1 text-xs font-semibold text-muted">
                        R$
                        <input
                          inputMode="decimal"
                          value={prices[count.piece] ?? tableFor(count.piece) ?? ''}
                          onChange={(event) => setPrices((current) => ({ ...current, [count.piece]: event.target.value }))}
                          placeholder="0,00"
                          className="field w-20 text-right"
                          aria-label={`Preço por ${count.piece}`}
                        />
                        <span>/pç</span>
                      </label>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {seeMoney && chosen && (
              <p className="mt-2 text-xs text-muted">
                O preço vem da tabela de {chosen.name}; mude se ela cobrou outro valor por este serviço. Total:{' '}
                <strong className="text-ink">{money(total.toFixed(2))}</strong>
              </p>
            )}
            {over && <p className="mt-2 text-sm font-semibold text-red-700">Só há {over.quantity} {over.piece} livres nesta leva.</p>}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">Observação</span>
            <textarea rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} className="field resize-y" placeholder="Prazo combinado, detalhe do acabamento…" />
          </label>

          {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
        </div>
      )}
    </Modal>
  )
}

/**
 * Costura entregue (F231): só quem gerencia. Da terceirizada nasce a conta a
 * pagar no prazo dela; da CLT, não.
 */
export const DeliverDialog = ({ job, onClose }: { job: SewingJobSummaryType | null; onClose: () => void }) => {
  const toast = useToast()
  const invalidate = useSewingInvalidate()
  const [on, setOn] = useState(() => new Date().toLocaleDateString('en-CA'))
  const seamstresses = useSeamstresses()
  const term = seamstresses.data?.find((s) => s.id === job?.seamstressId)?.paymentTermDays ?? null

  useEffect(() => {
    if (job !== null) setOn(new Date().toLocaleDateString('en-CA'))
  }, [job])

  const due = (() => {
    if (term === null) return null
    const date = new Date(`${on}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() + term)
    return date.toISOString().slice(0, 10)
  })()
  const payable = job !== null && job.seamstressKind === 'terceirizada' && Number(job.total ?? '0') > 0

  const mutation = useMutation({
    mutationFn: () => deliverSewingJob(job?.id ?? '', { version: job?.version ?? 0, deliveredOn: on }),
    onSuccess: (done) => {
      toast(done.payable ? `Entregue. Conta a pagar de ${money(done.total)} para ${day(done.payable.dueAt)}.` : 'Costura entregue.')
      invalidate(done.salesDocumentId)
      onClose()
    },
  })

  return (
    <Modal
      open={job !== null}
      title={job === null ? '' : `Costura entregue — ${job.seamstressName}`}
      onClose={() => {
        mutation.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="lime" icon={<Check className="h-4 w-4" />} busy={mutation.isPending} onClick={() => mutation.mutate()}>
            Marcar entregue
          </Button>
        </>
      }
    >
      {job && (
        <div className="space-y-4 text-sm">
          <p>
            {orderRef({ number: job.orderNumber })} · leva {job.batchNumber} — {sewingPiecesText(job)}
            {job.total !== null && <> · <strong>{money(job.total)}</strong></>}
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">Entregue em</span>
            <input type="date" value={on} onChange={(event) => setOn(event.target.value)} className="field w-auto" />
          </label>
          {payable ? (
            <p className="flex items-start gap-2 rounded-xl bg-lime/30 p-3">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Nasce uma <strong>conta a pagar</strong> de <strong>{money(job.total)}</strong> no financeiro
                {due ? <>, vencendo em <strong>{day(due)}</strong> ({termText(term)})</> : ''}.
              </span>
            </p>
          ) : (
            <p className="rounded-xl bg-paper p-3 text-muted">
              {job.seamstressKind === 'clt' ? 'Costureira CLT: não gera conta a pagar (é da folha).' : 'Sem valor: não gera conta a pagar.'}
            </p>
          )}
          {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
        </div>
      )}
    </Modal>
  )
}

/** Uma costura: quem, o quê, a situação, e o que dá para fazer com ela. */
export const SewingJobRow = ({
  job,
  showOrder = false,
  onDeliver,
}: {
  job: SewingJobSummaryType
  showOrder?: boolean
  onDeliver?: (job: SewingJobSummaryType) => void
}) => {
  const access = useAccess()
  const invalidate = useSewingInvalidate()
  const cancel = useMutation({
    mutationFn: () => cancelSewingJob(job.id, job.version),
    onSuccess: () => invalidate(job.salesDocumentId),
  })
  const meta = SEWING_STATUS_META[job.status]
  const open = job.status === 'em-andamento'
  const canWork = access.isManager || access.functions.includes('producao')

  return (
    <div className={clsx('rounded-xl border border-line px-3 py-2', job.status === 'cancelada' && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          {showOrder ? (
            <Link to={`/pedidos/${job.salesDocumentId}?aba=levas`} className="font-extrabold hover:underline">
              {orderRef({ number: job.orderNumber })} · {job.customerName}
            </Link>
          ) : (
            <span className="font-extrabold">{job.seamstressName}</span>
          )}
          <span className="text-muted"> · leva {job.batchNumber}</span>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <p className="mt-0.5 text-xs">
        {sewingPiecesText(job)}
        {job.total !== null && <> · <strong>{money(job.total)}</strong></>}
      </p>
      {job.notes && <p className="mt-0.5 text-xs text-muted">{job.notes}</p>}
      <p className="mt-0.5 text-[11px] text-muted">
        Desde {day(job.assignedAt)}
        {job.deliveredAt && ` · entregue ${day(job.deliveredAt)}`}
        {job.payable &&
          ` · a pagar ${day(job.payable.dueAt)}${job.payable.status === 'settled' ? ' (pago)' : job.payable.status === 'cancelled' ? ' (cancelado)' : ''}`}
      </p>
      {open && (onDeliver || canWork) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {onDeliver && access.manageSeamstresses && (
            <Button size="sm" variant="ink" icon={<Check className="h-3.5 w-3.5" />} onClick={() => onDeliver(job)}>
              Entregue
            </Button>
          )}
          {canWork && (
            <Button
              size="sm"
              variant="ghost"
              icon={<X className="h-3.5 w-3.5" />}
              busy={cancel.isPending}
              onClick={() => {
                if (window.confirm(`Cancelar a costura de ${job.seamstressName}? As peças voltam a ficar livres.`)) cancel.mutate()
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      )}
      {cancel.isError && <p className="mt-1 text-xs font-semibold text-red-700">{errorMessage(cancel.error)}</p>}
    </div>
  )
}
