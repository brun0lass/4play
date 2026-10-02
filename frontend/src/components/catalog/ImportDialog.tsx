import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { applyImport, previewImport, type ImportPreview } from '@/api/catalog'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { int, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'

const ACTION_LABEL: Record<string, string> = {
  create: 'Novo',
  update: 'Atualiza',
  replace: 'Substitui',
  review: 'Conferir',
  skip: 'Ignorado',
}

/**
 * Trazer a tabela de produtos da 4Play de uma vez: primeiro mostra o que vai
 * acontecer, depois grava.
 */
export const ImportDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  useEffect(() => {
    if (open) {
      setFile(null)
      setPreview(null)
    }
  }, [open])

  const read = useMutation({
    mutationFn: (f: File) => previewImport(f),
    onSuccess: (p) => setPreview(p),
  })

  const apply = useMutation({
    mutationFn: () => applyImport(file!, preview?.review.map((r) => r.line) ?? []),
    onSuccess: (r) => {
      toast(`Planilha importada: ${String(r.created)} novos, ${String(r.updated + r.replaced)} atualizados.`)
      void queryClient.invalidateQueries({ queryKey: ['catalog'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      wide
      title="Importar tabela de produtos"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          {preview && (
            <Button variant="lime" busy={apply.isPending} disabled={preview.counts.create + preview.counts.update + preview.counts.replace + preview.counts.review === 0} onClick={() => apply.mutate()}>
              Importar {int(preview.counts.create + preview.counts.update + preview.counts.replace + preview.counts.review)} produtos
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-paper p-4 text-sm">
          <p className="font-extrabold">Como montar a planilha (.xlsx)</p>
          <p className="mt-1 text-muted">A primeira linha tem os títulos das colunas:</p>
          <table className="mt-2 w-full overflow-hidden rounded-xl bg-white text-xs">
            <thead className="bg-ink text-lime">
              <tr>
                <th className="px-3 py-2 text-left">Código <span className="font-normal text-white/60">(opcional)</span></th>
                <th className="px-3 py-2 text-left">Descrição</th>
                <th className="px-3 py-2 text-left">Preço Custo <span className="font-normal text-white/60">(opcional)</span></th>
                <th className="px-3 py-2 text-left">Preço Venda</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line"><td className="px-3 py-1.5">CJ-FUT</td><td className="px-3 py-1.5">Conjunto futebol sublimado</td><td className="px-3 py-1.5">22,00</td><td className="px-3 py-1.5">45,00</td></tr>
              <tr><td className="px-3 py-1.5">REG-BT</td><td className="px-3 py-1.5">Regata beach tennis</td><td className="px-3 py-1.5">14,50</td><td className="px-3 py-1.5">32,00</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Mandar a mesma planilha de novo <strong className="text-ink">atualiza os preços</strong>, não duplica. Nada é gravado antes de você confirmar.
          </p>
        </div>

        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) {
              setFile(f)
              setPreview(null)
              read.mutate(f)
            }
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-ink/30 px-4 py-6 text-sm font-bold hover:border-ink hover:bg-lime-50"
        >
          {read.isPending ? 'Lendo a planilha…' : file ? (<><FileSpreadsheet className="h-5 w-5" /> {file.name} — escolher outra</>) : (<><Upload className="h-5 w-5" /> Escolher a planilha</>)}
        </button>

        {read.isError && <ErrorBox message={errorMessage(read.error)} />}

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Count label="Novos" value={preview.counts.create} strong />
              <Count label="Atualizados" value={preview.counts.update + preview.counts.replace} />
              <Count label="Parecidos (atualiza)" value={preview.counts.review} />
              <Count label="Ignorados" value={preview.counts.skip} />
            </div>
            {preview.problems.length > 0 && (
              <ul className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                {preview.problems.map((p) => <li key={p.problem}><strong>{p.count}×</strong> {p.problem}</li>)}
              </ul>
            )}
            <div className="scroll-thin max-h-60 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-paper text-left text-muted">
                  <tr><th className="px-3 py-2">Linha</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Custo</th><th className="px-3 py-2 text-right">Venda</th><th className="px-3 py-2">O que faz</th></tr>
                </thead>
                <tbody>
                  {preview.sample.map((row) => (
                    <tr key={row.line} className="border-t border-line">
                      <td className="px-3 py-1.5 text-muted">{row.line}</td>
                      <td className="px-3 py-1.5 font-semibold">{row.description}</td>
                      <td className="px-3 py-1.5 text-right">{row.cost ? money(row.cost) : '—'}</td>
                      <td className="px-3 py-1.5 text-right">{row.unitPrice ? money(row.unitPrice) : '—'}</td>
                      <td className="px-3 py-1.5">{row.problem ?? ACTION_LABEL[row.action] ?? row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted">Mostrando {preview.sample.length} de {preview.rowCount} linhas.</p>
          </div>
        )}
        {apply.isError && <ErrorBox message={errorMessage(apply.error)} />}
      </div>
    </Modal>
  )
}

const Count = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
  <div className={strong ? 'rounded-2xl bg-lime p-3' : 'rounded-2xl bg-paper p-3'}>
    <p className="display text-2xl">{int(value)}</p>
    <p className="text-[11px] font-bold text-ink/70">{label}</p>
  </div>
)
