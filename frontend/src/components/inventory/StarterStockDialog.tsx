import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { createCategory, createProductFull, listCategories } from '@/api/catalog'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { errorMessage } from '@/lib/http'
import { toQuantity } from '@/lib/format'

/**
 * Começar o estoque pelo que importa para a 4Play: tecido, papel e tinta.
 * Cria os itens com "controlar estoque" ligado, na categoria Matéria-prima.
 */

type Row = { on: boolean; name: string; unit: 'M' | 'L' | 'KG'; group: string; onHand: string; minimum: string }

const SUGGESTED: Row[] = [
  { on: true, group: 'Tecido', name: 'Tecido elastano', unit: 'M', onHand: '', minimum: '' },
  { on: true, group: 'Tecido', name: 'Tecido furadinho', unit: 'M', onHand: '', minimum: '' },
  { on: true, group: 'Tecido', name: 'Tecido 100% poliéster', unit: 'M', onHand: '', minimum: '' },
  { on: true, group: 'Papel', name: 'Papel sublimático', unit: 'M', onHand: '', minimum: '' },
  { on: true, group: 'Tinta', name: 'Tinta sublimática ciano', unit: 'L', onHand: '', minimum: '' },
  { on: true, group: 'Tinta', name: 'Tinta sublimática magenta', unit: 'L', onHand: '', minimum: '' },
  { on: true, group: 'Tinta', name: 'Tinta sublimática amarela', unit: 'L', onHand: '', minimum: '' },
  { on: true, group: 'Tinta', name: 'Tinta sublimática preta', unit: 'L', onHand: '', minimum: '' },
]

const UNIT: Record<Row['unit'], string> = { M: 'metros', L: 'litros', KG: 'quilos' }

export const StarterStockDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { session } = useAuth()
  const [rows, setRows] = useState<Row[]>(SUGGESTED)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    if (open) {
      setRows(SUGGESTED)
      setProgress('')
    }
  }, [open])

  const update = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const chosen = rows.filter((r) => r.on && r.name.trim())
  const invalid = chosen.some(
    (r) => (r.onHand.trim() !== '' && toQuantity(r.onHand) === null) || (r.minimum.trim() !== '' && toQuantity(r.minimum) === null)
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const categories = await listCategories()
      const category =
        categories.find((c) => c.name.toLowerCase() === 'matéria-prima') ?? (await createCategory('Matéria-prima'))
      let done = 0
      for (const r of chosen) {
        setProgress(`Cadastrando ${r.name} (${String(done + 1)}/${String(chosen.length)})…`)
        const opening = r.onHand.trim() ? toQuantity(r.onHand) : null
        const minimum = r.minimum.trim() ? toQuantity(r.minimum) : null
        await createProductFull({
          name: r.name.trim(),
          categoryId: category.id,
          unit: r.unit,
          tracksStock: true,
          ...(minimum ? { minimumStock: minimum } : {}),
          ...(opening
            ? { openingStock: { mode: 'now' as const, quantity: opening, ...(session?.context?.branchId ? { branchId: session.context.branchId } : {}) } }
            : {}),
        })
        done += 1
      }
      return done
    },
    onSuccess: (done) => {
      toast(`${String(done)} itens de estoque cadastrados.`)
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['catalog'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      onClose()
    },
    onSettled: () => setProgress(''),
  })

  return (
    <Modal
      open={open}
      wide
      title="Começar o estoque"
      onClose={onClose}
      footer={
        <>
          {progress && <span className="mr-auto self-center text-xs font-semibold text-muted">{progress}</span>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="lime" busy={mutation.isPending} disabled={chosen.length === 0 || invalid} onClick={() => mutation.mutate()}>
            Cadastrar {chosen.length} itens
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Os itens que mais importam na 4Play. Ajuste os nomes, desmarque o que não usa e, se souber, diga quanto tem
        hoje e a partir de quanto o sistema deve avisar que está acabando. Dá para mudar tudo depois em Produtos.
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] tracking-wider text-muted uppercase">
          <tr><th className="w-8" /><th className="py-2">Item</th><th className="w-32">Tem hoje</th><th className="w-36">Avisar abaixo de</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.on ? '' : 'opacity-40'}>
              <td><input type="checkbox" className="h-4 w-4 accent-ink" checked={r.on} onChange={(e) => update(i, { on: e.target.checked })} aria-label={`Cadastrar ${r.name}`} /></td>
              <td className="py-1 pr-2">
                <span className="mr-2 rounded bg-paper px-1.5 py-0.5 text-[10px] font-extrabold text-muted uppercase">{r.group}</span>
                <input className="field inline-block h-9 w-56 px-2 text-xs font-bold" value={r.name} disabled={!r.on} onChange={(e) => update(i, { name: e.target.value })} />
              </td>
              <td className="py-1 pr-2">
                <div className="flex items-center gap-1">
                  <input inputMode="decimal" className="field h-9 px-2 text-xs" disabled={!r.on} value={r.onHand} onChange={(e) => update(i, { onHand: e.target.value })} />
                  <span className="text-[11px] text-muted">{UNIT[r.unit]}</span>
                </div>
              </td>
              <td className="py-1">
                <div className="flex items-center gap-1">
                  <input inputMode="decimal" className="field h-9 px-2 text-xs" disabled={!r.on} value={r.minimum} onChange={(e) => update(i, { minimum: e.target.value })} />
                  <span className="text-[11px] text-muted">{UNIT[r.unit]}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {mutation.isError && <div className="mt-3"><ErrorBox message={errorMessage(mutation.error)} /></div>}
    </Modal>
  )
}
