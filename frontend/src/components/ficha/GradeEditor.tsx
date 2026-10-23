import type { GradeEntryType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Copy, Grid3x3, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { saveGrade } from '@/api/uniforms'
import { DraftRecovery, SaveBar, Section, tracked, useDraft, useFichaSection } from '@/components/ficha/Section'
import { ColorPicker } from '@/components/ficha/ColorPicker'
import { PieceSelect } from '@/components/PieceSelect'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui'
import { logEvent } from '@/lib/diary'
import { int } from '@/lib/format'
import { UserError } from '@/lib/http'
import { NO_COLOR, colorBlock } from '@/lib/grade-color'
import { keys } from '@/lib/queries'
import { ADULT_SIZES, SIZES, type Size } from '@/lib/uniforms'

/**
 * A grade como a planilha da fábrica: uma linha por peça (cor + peça), uma
 * coluna por tamanho. O Aeris grava uma linha por tamanho; a ida e a volta
 * estão aqui embaixo. A cor é opcional e vai no `block` (lib/grade-color).
 */

/** `block` é o texto das cores (lib/grade-color); vazio é sem cor. */
type Row = { block: string; piece: string; q: Partial<Record<Size, string>> }

const toRows = (entries: readonly GradeEntryType[]): Row[] => {
  const rows = new Map<number, Row>()
  for (const entry of [...entries].sort((a, b) => a.position - b.position)) {
    const block = entry.block.trim() === NO_COLOR ? '' : entry.block
    const row = rows.get(entry.position) ?? { block, piece: entry.piece, q: {} }
    row.q[entry.size] = String(entry.quantity)
    rows.set(entry.position, row)
  }
  return [...rows.values()]
}

const qty = (text: string | undefined): number => {
  const n = Number(text ?? '')
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

const toEntries = (rows: readonly Row[]): GradeEntryType[] =>
  rows.flatMap((row, position) =>
    SIZES.flatMap((size) => {
      const quantity = qty(row.q[size])
      if (quantity === 0 || !row.piece.trim()) return []
      return [{ block: colorBlock(row.block), piece: row.piece.trim(), size, quantity, position }]
    })
  )

const rowTotal = (row: Row) => SIZES.reduce((sum, size) => sum + qty(row.q[size]), 0)

const EMPTY_ROW = (from?: Row): Row => ({ block: from?.block ?? '', piece: '', q: {} })

export const GradeEditor = ({
  orderId,
  version,
  grade,
  editable,
  readOnlyReason,
  fabric,
}: {
  orderId: string
  version: number
  grade: readonly GradeEntryType[]
  editable: boolean
  readOnlyReason: string | null
  /** O tecido com o acabamento (F303), "92/8 · Liso"; nulo é "a definir". */
  fabric: string | null
}) => {
  const queryClient = useQueryClient()
  const { draft: rows, setDraft: setRows, dirty, reset, recovery } = useDraft<Row[]>(toRows(grade), {
    orderId,
    section: 'grade',
  })
  const [allSizes, setAllSizes] = useState(false)

  const sizes = useMemo(() => {
    if (allSizes) return SIZES
    const used = new Set(rows.flatMap((row) => SIZES.filter((size) => qty(row.q[size]) > 0)))
    return SIZES.filter((size) => ADULT_SIZES.includes(size) || used.has(size))
  }, [rows, allSizes])

  const toast = useToast()
  const send = tracked(
    orderId,
    'grade',
    (sheetVersion: number) => saveGrade(orderId, { version: sheetVersion, entries: toEntries(rows) }),
    () => ({ linhas: rows.length, pecas: rows.reduce((sum, row) => sum + rowTotal(row), 0) })
  )
  // Linha com quantidade e sem peça não é mais descartada calada (F279): o
  // gravar para e diz qual é. Sem cor, grava.
  const doSave = (sheetVersion: number) => {
    const missing = rows.flatMap((row, index) => (rowTotal(row) > 0 && !row.piece.trim() ? [index + 1] : []))
    if (missing.length > 0) {
      logEvent('linha-bloqueada', { orderId, section: 'grade', detail: { linhas: missing.join(', ') } })
      return Promise.reject(
        new UserError(
          `${missing.length === 1 ? 'A linha' : 'As linhas'} ${missing.join(', ')} da grade ${missing.length === 1 ? 'tem' : 'têm'} quantidade mas não ${missing.length === 1 ? 'tem' : 'têm'} peça. Escolha a peça (ou apague a linha) e grave de novo.`
        )
      )
    }
    return send(sheetVersion)
  }
  useFichaSection('grade', 'Grade', dirty, doSave)

  const mutation = useMutation({
    mutationFn: () => doSave(version),
    onSuccess: () => toast('Grade gravada.'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.order(orderId) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const total = rows.reduce((sum, row) => sum + rowTotal(row), 0)
  const bySize = (size: Size) => rows.reduce((sum, row) => sum + qty(row.q[size]), 0)
  const disabled = !editable

  return (
    <Section
      title="Grade"
      icon={<Grid3x3 className="h-3.5 w-3.5" />}
      collapsible={{ key: 'grade' }}
      aside={
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
            <input type="checkbox" className="accent-ink" checked={allSizes} onChange={(e) => setAllSizes(e.target.checked)} />
            Todos os tamanhos
          </label>
          <span className="rounded-full bg-lime px-3 py-1 text-xs font-extrabold">{int(total)} peças</span>
        </div>
      }
    >
      {editable && <DraftRecovery recovery={recovery} />}
      <p
        className={clsx(
          'mb-3 inline-block rounded-xl px-3 py-1.5 text-xs',
          fabric === null ? 'bg-amber-50 font-bold text-amber-800' : 'bg-paper'
        )}
      >
        {fabric === null ? (
          'Tecido a definir — marque no Atendimento.'
        ) : (
          <>
            Tecido: <strong>{fabric}</strong>
          </>
        )}
      </p>
      <div className="scroll-thin -mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-[10px] font-extrabold tracking-wider text-muted uppercase">
              <th className="px-1 pb-2 text-left">Cor</th>
              <th className="px-1 pb-2 text-left">Peça</th>
              {sizes.map((size) => (
                <th key={size} className="w-12 px-0.5 pb-2 text-center">{size}</th>
              ))}
              <th className="w-12 px-1 pb-2 text-right">Total</th>
              {!disabled && <th className="w-16" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="p-0.5">
                  <ColorPicker disabled={disabled} value={row.block} onChange={(block) => update(index, { block })} />
                </td>
                <td className="p-0.5">
                  <PieceSelect
                    className={clsx('h-9 w-44 px-2 text-xs', rowTotal(row) > 0 && !row.piece.trim() && 'border-red-500 bg-red-50')}
                    placeholder="Peça"
                    disabled={disabled}
                    value={row.piece}
                    onChange={(piece) => update(index, { piece })}
                  />
                </td>
                {sizes.map((size) => (
                  <td key={size} className="p-0.5">
                    <input
                      inputMode="numeric"
                      className="field h-9 w-11 px-1 text-center text-xs font-bold"
                      disabled={disabled}
                      value={row.q[size] ?? ''}
                      onChange={(e) =>
                        update(index, { q: { ...row.q, [size]: e.target.value.replace(/\D/g, '') } })
                      }
                    />
                  </td>
                ))}
                <td className="px-1 text-right font-extrabold">{rowTotal(row)}</td>
                {!disabled && (
                  <td className="pl-1 whitespace-nowrap">
                    <button
                      type="button"
                      title="Duplicar linha"
                      className="rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-ink"
                      onClick={() => setRows((current) => [...current.slice(0, index + 1), { ...row, q: {} }, ...current.slice(index + 1)])}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Tirar linha"
                      className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="text-xs font-extrabold">
                <td className="px-1 pt-2" colSpan={2}>Total por tamanho</td>
                {sizes.map((size) => (
                  <td key={size} className="pt-2 text-center">{bySize(size) || ''}</td>
                ))}
                <td className="px-1 pt-2 text-right">{total}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {rows.length === 0 && <p className="py-4 text-sm text-muted">A grade ainda não foi preenchida.</p>}

      {!disabled && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setRows((current) => [...current, EMPTY_ROW(current.at(-1))])}
        >
          Linha
        </Button>
      )}


      <SaveBar
        dirty={dirty}
        busy={mutation.isPending}
        saved={mutation.isSuccess}
        error={mutation.error}
        onSave={() => mutation.mutate()}
        onDiscard={() => {
          reset()
          mutation.reset()
        }}
        readOnlyReason={readOnlyReason ?? (editable ? null : 'Só quem atende (ou gerencia) mexe na grade.')}
      />
    </Section>
  )
}
