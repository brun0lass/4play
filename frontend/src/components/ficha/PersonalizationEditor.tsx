import type { PersonalizationType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste, Plus, Trash2, UserRoundPen } from 'lucide-react'
import { useState } from 'react'

import { savePersonalization } from '@/api/uniforms'
import { SaveBar, Section, useDraft, useFichaSection } from '@/components/ficha/Section'
import { useToast } from '@/components/Toast'
import { Button, Modal } from '@/components/ui'
import { int } from '@/lib/format'
import { keys } from '@/lib/queries'
import { SIZES, type Size } from '@/lib/uniforms'

type Row = { name: string; number: string; piece: string; size: Size; quantity: string }

const toRows = (rows: readonly PersonalizationType[]): Row[] =>
  rows.map((row) => ({ ...row, quantity: String(row.quantity) }))

const isSize = (value: string): value is Size => (SIZES as readonly string[]).includes(value)

/**
 * "Colar da planilha": uma linha por atleta, colunas separadas por tab, `;`
 * ou `,` — Nome, Número, Tamanho e, se tiver, Quantidade e Peça.
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
      if (!name || !isSize(size)) {
        skipped += 1
        return []
      }
      return [{ name, number, size, quantity: quantity.replace(/\D/g, '') || '1', piece: rowPiece ?? piece }]
    })
  return { rows, skipped }
}

export const PersonalizationEditor = ({
  orderId,
  version,
  rows: saved,
  editable,
  readOnlyReason,
}: {
  orderId: string
  version: number
  rows: readonly PersonalizationType[]
  editable: boolean
  readOnlyReason: string | null
}) => {
  const queryClient = useQueryClient()
  const { draft: rows, setDraft: setRows, dirty, reset } = useDraft<Row[]>(toRows(saved))
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pastePiece, setPastePiece] = useState('Camisa')

  const toast = useToast()
  const doSave = (sheetVersion: number) =>
      savePersonalization(orderId, {
        version: sheetVersion,
        rows: rows
          .filter((row) => row.name.trim())
          .map((row) => ({
            name: row.name.trim(),
            number: row.number.trim(),
            piece: row.piece.trim(),
            size: row.size,
            quantity: Math.max(1, Number(row.quantity) || 1),
          })),
      })
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
  const preview = parsePaste(pasteText, pastePiece)

  return (
    <Section
      title="Personalizados"
      icon={<UserRoundPen className="h-3.5 w-3.5" />}
      aside={<span className="rounded-full bg-ink px-3 py-1 text-xs font-extrabold text-lime">{int(total)} peças</span>}
    >
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted">Nenhuma peça com nome e número.</p>
      ) : (
        <div className="scroll-thin -mx-5 max-h-[28rem] overflow-auto px-5">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[10px] font-extrabold tracking-wider text-muted uppercase">
                <th className="w-8 pb-2 text-left">#</th>
                <th className="pb-2 text-left">Nome</th>
                <th className="w-20 pb-2 text-left">Número</th>
                <th className="w-32 pb-2 text-left">Peça</th>
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
                    <input className="field h-9 px-2 text-xs font-bold uppercase" maxLength={80} disabled={disabled} value={row.name} onChange={(e) => update(index, { name: e.target.value })} />
                  </td>
                  <td className="p-0.5">
                    <input className="field h-9 px-2 text-center text-xs font-extrabold" maxLength={10} disabled={disabled} value={row.number} onChange={(e) => update(index, { number: e.target.value })} />
                  </td>
                  <td className="p-0.5">
                    <input className="field h-9 px-2 text-xs" maxLength={40} disabled={disabled} value={row.piece} onChange={(e) => update(index, { piece: e.target.value })} />
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
                { name: '', number: '', piece: current.at(-1)?.piece ?? 'Camisa', size: current.at(-1)?.size ?? 'M', quantity: '1' },
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
        <div className="mb-3 w-48">
          <label className="label" htmlFor="pastePiece">Peça padrão</label>
          <input id="pastePiece" className="field" value={pastePiece} onChange={(e) => setPastePiece(e.target.value)} />
        </div>
        <textarea
          rows={10}
          className="field font-mono text-xs"
          placeholder={'JOÃO; 10; G\nPEDRO; 7; M\nLUCAS; 99; GG'}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        {pasteText && (
          <p className="mt-2 text-xs font-bold">
            {preview.rows.length} válida(s)
            {preview.skipped > 0 && <span className="text-amber-700"> · {preview.skipped} ignorada(s) (sem nome ou tamanho desconhecido)</span>}
          </p>
        )}
      </Modal>
    </Section>
  )
}
