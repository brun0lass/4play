import type { PersonalizationType, ProductionOrderLineType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste, Plus, Trash2, UserRoundPen } from 'lucide-react'
import { useState } from 'react'

import { savePersonalization } from '@/api/uniforms'
import { DraftRecovery, SaveBar, Section, tracked, useDraft, useFichaSection } from '@/components/ficha/Section'
import { PieceSelect } from '@/components/PieceSelect'
import { useToast } from '@/components/Toast'
import { Button, Modal } from '@/components/ui'
import { logEvent } from '@/lib/diary'
import { int } from '@/lib/format'
import { UserError } from '@/lib/http'
import { keys } from '@/lib/queries'
import { SIZES, UNNAMED_PERSON, type Size } from '@/lib/uniforms'

type Row = { name: string; number: string; piece: string; size: Size; quantity: string }

const toRows = (rows: readonly PersonalizationType[]): Row[] =>
  // Os campos na ordem de `Row`: o rascunho compara por JSON, e a linha nova
  // (Atleta, Colar lista) é montada nessa ordem — senão a seção nunca fica gravada.
  rows.map((row) => ({
    name: row.name === UNNAMED_PERSON ? '' : row.name,
    number: row.number,
    piece: row.piece,
    size: row.size,
    quantity: String(row.quantity),
  }))

/** A linha vale com nome OU número: "só o número 10" também é personalizado. */
const filled = (row: Pick<Row, 'name' | 'number'>) => row.name.trim() !== '' || row.number.trim() !== ''

/** O que vai para o Aeris — e, de volta por `toRows`, como a lista fica gravada. */
const toSave = (rows: readonly Row[]) =>
  rows.filter(filled).map((row) => ({
    // Só número: o Aeris guarda o nome como "—", como faz o link do cliente.
    name: row.name.trim() || UNNAMED_PERSON,
    number: row.number.trim(),
    piece: row.piece.trim(),
    size: row.size,
    quantity: Math.max(1, Number(row.quantity) || 1),
  }))

const asSaved = (rows: Row[]): Row[] => toRows(toSave(rows))

/** Peças vendidas: o conjunto conta duas (camisa e shorts), como no "Itens do pedido". */
const soldPieces = (lines: readonly ProductionOrderLineType[]) =>
  lines.reduce((sum, line) => sum + Number(line.quantity) * (/^\s*conjunto\b/i.test(line.description) ? 2 : 1), 0)

type Warnings = {
  /** O mesmo nome e número na mesma peça, em mais de uma linha (o tamanho não importa). */
  repeated: { label: string; lines: number[] }[]
  /** Grade + personalizados passando do que foi vendido. */
  over: { built: number; sold: number } | null
}

/**
 * O que merece um "tem certeza?" antes de gravar (pedido #26: uma segunda lista
 * colada embaixo da primeira — 17 camisetas a mais, até a costura). Avisa, não
 * bloqueia: às vezes o atleta leva duas mesmo.
 */
const warningsOf = (rows: readonly Row[], gradePieces: number, lines: readonly ProductionOrderLineType[]): Warnings => {
  const seen = new Map<string, { label: string; lines: number[] }>()
  rows.forEach((row, index) => {
    const name = row.name.trim().replace(/\s+/g, ' ').toUpperCase()
    const number = row.number.trim()
    if (!name || !number) return
    const key = `${name}#${number}|${row.piece.trim().toLowerCase()}`
    const entry = seen.get(key) ?? { label: `${name} ${number}${row.piece.trim() ? ` (${row.piece.trim()})` : ''}`, lines: [] }
    entry.lines.push(index + 1)
    seen.set(key, entry)
  })
  const sold = soldPieces(lines)
  const built = gradePieces + rows.filter(filled).reduce((sum, row) => sum + Math.max(1, Number(row.quantity) || 1), 0)
  return {
    repeated: [...seen.values()].filter((entry) => entry.lines.length > 1),
    over: lines.length > 0 && built > sold ? { built, sold } : null,
  }
}

const joinLines = (lines: number[]) =>
  lines.length === 1 ? String(lines[0]) : `${lines.slice(0, -1).join(', ')} e ${String(lines.at(-1))}`

const warningText = (warnings: Warnings): string[] => [
  ...warnings.repeated.map((entry) => `${entry.label} repetido nas linhas ${joinLines(entry.lines)}`),
  ...(warnings.over
    ? [`Montado ${int(warnings.over.built)} peças (grade + personalizados), mas o pedido vendeu ${int(warnings.over.sold)}`]
    : []),
]

const isSize = (value: string): value is Size => (SIZES as readonly string[]).includes(value)

/**
 * "Colar da planilha": uma linha por atleta, colunas separadas por tab, `;`
 * ou `,` — Nome, Número, Tamanho e, se tiver, Quantidade e Peça. O nome pode
 * ficar em branco quando só vai número (";10;G").
 */
const parsePaste = (text: string, piece: string): { rows: Row[]; skipped: number } => {
  let skipped = 0
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split(/\t|;|,/).map((part) => part.trim())
      const [name = '', number = '', sizeRaw = '', quantity = '1', rowPiece] = parts
      const size = sizeRaw.toUpperCase()
      if (!filled({ name, number }) || !isSize(size)) {
        skipped += 1
        return []
      }
      return [{ name, number, piece: rowPiece ?? piece, size, quantity: quantity.replace(/\D/g, '') || '1' }]
    })
  return { rows, skipped }
}

export const PersonalizationEditor = ({
  orderId,
  version,
  rows: saved,
  editable,
  readOnlyReason,
  lines,
  gradePieces,
}: {
  orderId: string
  version: number
  rows: readonly PersonalizationType[]
  editable: boolean
  readOnlyReason: string | null
  /** Os itens vendidos, para avisar quando o montado passa deles. */
  lines: readonly ProductionOrderLineType[]
  /** As peças da grade gravada. */
  gradePieces: number
}) => {
  const queryClient = useQueryClient()
  const { draft: rows, setDraft: setRows, dirty, reset, recovery } = useDraft<Row[]>(
    toRows(saved),
    { orderId, section: 'personalizados' },
    asSaved
  )
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pastePiece, setPastePiece] = useState('')

  const toast = useToast()
  const send = tracked(
    orderId,
    'personalizados',
    (sheetVersion: number) =>
      savePersonalization(orderId, { version: sheetVersion, rows: toSave(rows) }),
    () => ({ linhas: rows.filter(filled).length })
  )
  // Linha com peça mas sem nome nem número era descartada calada (F279): o
  // gravar para e diz qual é. A linha toda em branco (Atleta sem nada) sai.
  const doSave = (sheetVersion: number) => {
    const missing = rows.flatMap((row, index) => (!filled(row) && row.piece.trim() !== '' ? [index + 1] : []))
    if (missing.length > 0) {
      logEvent('linha-bloqueada', { orderId, section: 'personalizados', detail: { linhas: missing.join(', ') } })
      return Promise.reject(
        new UserError(
          `${missing.length === 1 ? 'A linha' : 'As linhas'} ${missing.join(', ')} dos personalizados ${missing.length === 1 ? 'tem' : 'têm'} peça mas não ${missing.length === 1 ? 'tem' : 'têm'} nome nem número. Preencha (ou apague a linha) e grave de novo.`
        )
      )
    }
    const warned = warningText(warningsOf(rows, gradePieces, lines))
    if (warned.length > 0) {
      if (!window.confirm(`Confira os personalizados antes de gravar:\n\n• ${warned.join('\n• ')}\n\nGravar mesmo assim?`))
        return Promise.reject(new UserError('Não gravou. Confira os avisos dos personalizados e grave de novo.'))
    }
    return send(sheetVersion)
  }
  useFichaSection('personalization', 'Personalizados', dirty, doSave)

  const mutation = useMutation({
    mutationFn: () => doSave(version),
    onSuccess: () => toast('Personalizados gravados.'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.order(orderId) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const total = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
  const disabled = !editable
  const warned = editable ? warningText(warningsOf(rows, gradePieces, lines)) : []
  const preview = parsePaste(pasteText, pastePiece)

  return (
    <Section
      title="Personalizados"
      icon={<UserRoundPen className="h-3.5 w-3.5" />}
      collapsible={{ key: 'personalizados' }}
      aside={<span className="rounded-full bg-ink px-3 py-1 text-xs font-extrabold text-lime">{int(total)} peças</span>}
    >
      {editable && <DraftRecovery recovery={recovery} />}
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted">Nenhuma peça com nome ou número.</p>
      ) : (
        <div className="scroll-thin -mx-5 max-h-[28rem] overflow-auto px-5">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[10px] font-extrabold tracking-wider text-muted uppercase">
                <th className="w-8 pb-2 text-left">#</th>
                <th className="pb-2 text-left">Nome</th>
                <th className="w-20 pb-2 text-left">Número</th>
                <th className="w-44 pb-2 text-left">Peça</th>
                <th className="w-24 pb-2 text-left">Tamanho</th>
                <th className="w-16 pb-2 text-left">Qtd</th>
                {!disabled && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="pr-1 text-xs font-bold text-muted">{index + 1}</td>
                  <td className="p-0.5">
                    <input className="field h-9 px-2 text-xs font-bold uppercase" maxLength={80} disabled={disabled} placeholder={row.number.trim() ? 'Só número' : ''} value={row.name} onChange={(e) => update(index, { name: e.target.value })} />
                  </td>
                  <td className="p-0.5">
                    <input className="field h-9 px-2 text-center text-xs font-extrabold" maxLength={10} disabled={disabled} value={row.number} onChange={(e) => update(index, { number: e.target.value })} />
                  </td>
                  <td className="p-0.5">
                    <PieceSelect className="h-9 px-2 text-xs" disabled={disabled} placeholder="Peça" value={row.piece} onChange={(piece) => update(index, { piece })} />
                  </td>
                  <td className="p-0.5">
                    <select className="field h-9 px-2 text-xs font-bold" disabled={disabled} value={row.size} onChange={(e) => update(index, { size: e.target.value as Size })}>
                      {SIZES.map((size) => <option key={size}>{size}</option>)}
                    </select>
                  </td>
                  <td className="p-0.5">
                    <input inputMode="numeric" className="field h-9 px-2 text-center text-xs" disabled={disabled} value={row.quantity} onChange={(e) => update(index, { quantity: e.target.value.replace(/\D/g, '') })} />
                  </td>
                  {!disabled && (
                    <td>
                      <button type="button" title="Tirar" className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!disabled && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setRows((current) => [
                ...current,
                { name: '', number: '', piece: current.at(-1)?.piece ?? '', size: current.at(-1)?.size ?? 'M', quantity: '1' },
              ])
            }
          >
            Atleta
          </Button>
          <Button variant="outline" size="sm" icon={<ClipboardPaste className="h-4 w-4" />} onClick={() => setPasteOpen(true)}>
            Colar lista
          </Button>
        </div>
      )}

      {warned.length > 0 && (
        <div role="status" className="mt-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-sm">
          <p className="font-bold text-amber-900">Confira antes de mandar para a produção:</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">
            {warned.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-amber-800">Se for isso mesmo (o atleta leva duas, por exemplo), pode gravar assim.</p>
        </div>
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
        readOnlyReason={readOnlyReason ?? (editable ? null : 'Só quem atende (ou gerencia) mexe aqui.')}
      />

      <Modal
        open={pasteOpen}
        title="Colar lista"
        wide
        onClose={() => setPasteOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>Cancelar</Button>
            <Button
              variant="lime"
              disabled={preview.rows.length === 0}
              onClick={() => {
                setRows((current) => [...current, ...preview.rows])
                setPasteText('')
                setPasteOpen(false)
              }}
            >
              Adicionar {preview.rows.length} atleta(s)
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Uma linha por atleta: <strong className="text-ink">Nome, Número, Tamanho</strong> (e, se quiser,
          Quantidade e Peça). Pode colar direto do Excel ou do WhatsApp.
        </p>
        <div className="mb-3 w-64">
          <label className="label" htmlFor="pastePiece">Peça padrão</label>
          <PieceSelect id="pastePiece" value={pastePiece} onChange={setPastePiece} />
        </div>
        <textarea
          rows={10}
          className="field font-mono text-xs"
          placeholder={'JOÃO; 10; G\nPEDRO; 7; M\n; 99; GG'}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        {pasteText && (
          <p className="mt-2 text-xs font-bold">
            {preview.rows.length} válida(s)
            {preview.skipped > 0 && <span className="text-amber-700"> · {preview.skipped} ignorada(s) (sem nome nem número, ou tamanho desconhecido)</span>}
          </p>
        )}
      </Modal>
    </Section>
  )
}
