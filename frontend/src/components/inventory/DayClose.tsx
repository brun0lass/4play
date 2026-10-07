import type { DayCloseType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { CalendarCheck, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { listBalances } from '@/api/inventory'
import { createDayClose, saveMaterialRates } from '@/api/uniforms'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal, Spinner } from '@/components/ui'
import { UNIT_SHORT, dateTime, day, int, qty, toQuantity, todaySP } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys, useDayCloses, useMaterialRates, useSectorStats } from '@/lib/queries'
import { FACTORY_SECTORS, SECTOR_LABELS, type FactorySector } from '@/lib/uniforms'

type Row = {
  variantId: string
  name: string
  unit: string | null
  onHand: string | null
  sector: FactorySector
  /** Consumo por peça, como digitado ("0,5"). */
  perPiece: string
  /** A quantidade da baixa, como digitada; nula = ainda a sugestão. */
  quantity: string | null
}

const unitOf = (unit: string | null): string => (unit === null ? '' : (UNIT_SHORT[unit] ?? unit))

/** "0.500000" → "0,5", para pôr de volta num campo. */
const toInput = (value: string): string => qty(value).replace(/\./g, '')

/** A sugestão: consumo por peça × as peças que o setor fez no dia, com até 3 casas. */
const suggestion = (row: Row, pieces: number): string => {
  const rate = Number(toQuantity(row.perPiece) ?? '0')
  const value = Math.round(rate * pieces * 1000) / 1000
  return value > 0 ? String(value).replace('.', ',') : ''
}

/**
 * A baixa do dia (F241 do Aeris): no fim do dia, o que a produção gastou de
 * tecido, papel e tinta sai do estoque de uma vez. A tela sugere pelo consumo
 * por peça × as peças que cada setor fez no dia (F240); a pessoa confere e
 * muda. O mesmo dia não fecha duas vezes.
 */
export const DayCloseDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [date, setDate] = useState(todaySP())
  const [rows, setRows] = useState<Row[]>([])
  const [remember, setRemember] = useState(true)
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState('')
  const rates = useMaterialRates(open)
  const stats = useSectorStats(date, date, 'day', open)
  const materials = useQuery({
    queryKey: ['inventory', 'balances', 'day-close'],
    queryFn: ({ signal }) => listBalances({ pageSize: 100, sort: 'name', direction: 'asc' }, signal),
    enabled: open,
  })

  // Ao abrir: os materiais com consumo por peça já entram na lista.
  useEffect(() => {
    if (!open || rates.data === undefined) return
    setRows(
      rates.data.map((rate) => ({
        variantId: rate.variantId,
        name: rate.name,
        unit: rate.unit,
        onHand: null,
        sector: rate.sector,
        perPiece: toInput(rate.perPiece),
        quantity: null,
      }))
    )
    setNote('')
    setDate(todaySP())
  }, [open, rates.data])

  const piecesOf = (sector: FactorySector): number => stats.data?.totals.find((item) => item.sector === sector)?.pieces ?? 0
  const onHandOf = (variantId: string): string | null =>
    materials.data?.items.find((item) => item.variantId === variantId)?.onHand ?? null
  const quantityOf = (row: Row): string => row.quantity ?? suggestion(row, piecesOf(row.sector))
  const update = (variantId: string, change: Partial<Row>) =>
    setRows((list) => list.map((row) => (row.variantId === variantId ? { ...row, ...change } : row)))

  const lines = rows
    .map((row) => ({ row, quantity: toQuantity(quantityOf(row)) }))
    .filter((line) => line.quantity !== null && Number(line.quantity) > 0)
  const invalid = rows.some((row) => quantityOf(row) !== '' && toQuantity(quantityOf(row)) === null)

  const save = useMutation({
    mutationFn: async () => {
      if (remember) {
        await saveMaterialRates({
          rates: rows.flatMap((row) => {
            const perPiece = toQuantity(row.perPiece)
            return perPiece !== null && Number(perPiece) > 0
              ? [{ variantId: row.variantId, sector: row.sector, perPiece }]
              : []
          }),
        })
      }
      return await createDayClose({
        day: date,
        lines: lines.map((line) => ({ variantId: line.row.variantId, quantity: line.quantity ?? '0' })),
        note: note.trim() || null,
      })
    },
    onSuccess: (close) => {
      toast(`Baixa de ${day(close.day)} lançada: ${String(close.lines.length)} ${close.lines.length === 1 ? 'material' : 'materiais'}.`)
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: keys.dayCloses })
      void queryClient.invalidateQueries({ queryKey: keys.materialRates })
      onClose()
    },
  })

  const available = (materials.data?.items ?? []).filter((item) => !rows.some((row) => row.variantId === item.variantId))

  return (
    <Modal
      open={open}
      wide
      title="Baixa do dia"
      onClose={() => {
        save.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="lime"
            icon={<CalendarCheck className="h-4 w-4" />}
            busy={save.isPending}
            disabled={lines.length === 0 || invalid}
            onClick={() => save.mutate()}
          >
            Dar baixa de {lines.length} {lines.length === 1 ? 'material' : 'materiais'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">Dia</span>
            <input type="date" value={date} max={todaySP()} onChange={(e) => setDate(e.target.value || todaySP())} className="field w-44" />
          </label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {FACTORY_SECTORS.map((sector) => (
              <span key={sector} className="rounded-full bg-paper px-3 py-1 text-xs font-bold">
                {SECTOR_LABELS[sector]}: {stats.data ? int(piecesOf(sector)) : '…'} peças
              </span>
            ))}
          </div>
        </div>

        {(rates.isPending || materials.isPending) && <Spinner />}
        {rows.length === 0 && rates.data && (
          <p className="rounded-xl bg-paper p-3 text-sm text-muted">
            Adicione o tecido, o papel e a tinta que a produção gasta. Com o consumo por peça, a baixa já vem calculada pelas peças do dia.
          </p>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row) => {
              const onHand = row.onHand ?? onHandOf(row.variantId)
              const value = quantityOf(row)
              return (
                <div key={row.variantId} className="rounded-2xl border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">{row.name}</p>
                      <p className="text-[11px] text-muted">
                        Tem {onHand === null ? '—' : qty(onHand)} {unitOf(row.unit)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows((list) => list.filter((item) => item.variantId !== row.variantId))}
                      className="rounded-full p-1 text-muted hover:bg-black/5 hover:text-ink"
                      aria-label={`Tirar ${row.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <input
                      value={row.perPiece}
                      onChange={(e) => update(row.variantId, { perPiece: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      className="field h-8 w-20 text-right"
                      aria-label={`Consumo por peça de ${row.name}`}
                    />
                    <span className="text-muted">{unitOf(row.unit)} por peça da</span>
                    <select
                      value={row.sector}
                      onChange={(e) => update(row.variantId, { sector: e.target.value as FactorySector })}
                      className="field h-8 w-auto text-xs"
                      aria-label={`Setor de ${row.name}`}
                    >
                      {FACTORY_SECTORS.map((sector) => (
                        <option key={sector} value={sector}>
                          {SECTOR_LABELS[sector]}
                        </option>
                      ))}
                    </select>
                    <span className="ml-auto flex items-center gap-1.5 font-bold">
                      Baixa
                      <input
                        value={value}
                        onChange={(e) => update(row.variantId, { quantity: e.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                        className={clsx('field h-9 w-24 text-right text-sm font-extrabold', value !== '' && toQuantity(value) === null && 'border-red-500')}
                        aria-label={`Baixa de ${row.name}`}
                      />
                      {unitOf(row.unit)}
                    </span>
                  </div>
                  {row.quantity !== null && (
                    <button type="button" onClick={() => update(row.variantId, { quantity: null })} className="mt-1 text-[11px] font-bold text-muted hover:text-ink">
                      Voltar à sugestão ({suggestion(row, piecesOf(row.sector)) || '0'})
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select value={adding} onChange={(e) => setAdding(e.target.value)} className="field h-9 max-w-xs flex-1 text-sm">
            <option value="">Adicionar material do estoque…</option>
            {available.map((item) => (
              <option key={item.variantId} value={item.variantId}>
                {item.productName}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            icon={<Plus className="h-3.5 w-3.5" />}
            disabled={adding === ''}
            onClick={() => {
              const item = materials.data?.items.find((candidate) => candidate.variantId === adding)
              if (item === undefined) return
              setRows((list) => [
                ...list,
                {
                  variantId: item.variantId,
                  name: item.productName,
                  unit: item.unit,
                  onHand: item.onHand,
                  sector: 'impressao',
                  perPiece: '',
                  quantity: null,
                },
              ])
              setAdding('')
            }}
          >
            Adicionar
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Lembrar o consumo por peça para os próximos dias
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">Observação (opcional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="field" placeholder="Ex.: perdemos 2 m de tecido no corte" />
        </label>

        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}

const closeText = (close: DayCloseType): string =>
  close.lines.map((line) => `${qty(line.quantity)} ${unitOf(line.unit)} ${line.name}`.replace(/\s+/g, ' ')).join(' · ')

/** As últimas baixas do dia, para conferir o que já saiu. */
export const DayCloseHistory = () => {
  const closes = useDayCloses()
  if (closes.isPending || (closes.data?.length ?? 0) === 0) return null
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold tracking-wide uppercase">
        <CalendarCheck className="h-4 w-4" /> Baixas do dia
      </h2>
      {closes.isError && <ErrorBox message={errorMessage(closes.error)} />}
      <div className="card divide-y divide-line">
        {closes.data?.slice(0, 15).map((close) => (
          <div key={close.id} className="px-4 py-3 text-sm">
            <p className="font-extrabold">
              {day(close.day)} · {close.branchName}
            </p>
            <p className="text-ink/80">{closeText(close)}</p>
            <p className="text-[11px] text-muted">
              {close.closedByName ?? 'Alguém'} · {dateTime(close.closedAt)}
              {close.note && ` · ${close.note}`}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
