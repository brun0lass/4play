import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Archive, ArchiveRestore, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  createCategory,
  createProductFull,
  listCategories,
  setProductArchived,
  updateProduct,
  type Product,
} from '@/api/catalog'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { UNIT_VALUES } from '@/contracts/aeris/catalog.ts'
import { UNIT_LABELS, decimalToInput, toDecimal, toQuantity } from '@/lib/format'
import { errorMessage } from '@/lib/http'

type Unit = (typeof UNIT_VALUES)[number]

type Form = {
  name: string
  sku: string
  categoryId: string
  unit: Unit
  salePrice: string
  cost: string
  tracksStock: boolean
  openingStock: string
  minimumStock: string
  description: string
}

const EMPTY: Form = {
  name: '',
  sku: '',
  categoryId: '',
  unit: 'UN',
  salePrice: '',
  cost: '',
  tracksStock: false,
  openingStock: '',
  minimumStock: '',
  description: '',
}

const fromProduct = (p: Product): Form => {
  const variant = p.variants.find((v) => v.isDefault) ?? p.variants[0]
  return {
    name: p.name,
    sku: variant?.sku ?? '',
    categoryId: p.categoryId ?? '',
    unit: (variant?.unit as Unit | undefined) ?? 'UN',
    salePrice: decimalToInput(p.price?.basePrice),
    cost: decimalToInput(p.cost?.averageCost),
    tracksStock: p.tracksStock,
    openingStock: '',
    minimumStock: p.minimumStock ? String(Number(p.minimumStock)).replace('.', ',') : '',
    description: p.description ?? '',
  }
}

/**
 * Cadastrar ou editar um produto — o que a 4Play vende (conjunto, camisa,
 * regata) e o que ela consome (tecido, tinta, papel).
 */
export const ProductDialog = ({
  open,
  product,
  onClose,
}: {
  open: boolean
  /** Ausente: produto novo. */
  product: Product | null
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { can, session } = useAuth()
  const editable = can('catalog.write')
  const [form, setForm] = useState<Form>(EMPTY)
  const [newCategory, setNewCategory] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(product ? fromProduct(product) : EMPTY)
    setNewCategory(null)
  }, [open, product])

  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => listCategories(signal), enabled: open, staleTime: 60_000 })

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const addCategory = useMutation({
    mutationFn: () => createCategory(newCategory ?? ''),
    onSuccess: (category) => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      set('categoryId', category.id)
      setNewCategory(null)
    },
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog'] })
    void queryClient.invalidateQueries({ queryKey: ['inventory'] })
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const save = useMutation({
    mutationFn: async () => {
      const salePrice = toDecimal(form.salePrice) ?? undefined
      const cost = toDecimal(form.cost) ?? undefined
      const minimumStock = form.minimumStock.trim() ? toQuantity(form.minimumStock) : null
      if (product) {
        return updateProduct(product.id, {
          version: product.version,
          name: form.name.trim(),
          ...(form.sku.trim() ? { sku: form.sku } : {}),
          categoryId: form.categoryId || null,
          unit: form.unit,
          tracksStock: form.tracksStock,
          description: form.description,
          ...(salePrice ? { salePrice } : {}),
          ...(cost ? { cost } : {}),
          minimumStock,
        })
      }
      const opening = form.tracksStock && form.openingStock.trim() ? toQuantity(form.openingStock) : null
      return createProductFull({
        name: form.name.trim(),
        ...(form.sku.trim() ? { sku: form.sku } : {}),
        categoryId: form.categoryId || null,
        unit: form.unit,
        tracksStock: form.tracksStock,
        description: form.description,
        ...(salePrice ? { salePrice } : {}),
        ...(cost ? { cost } : {}),
        ...(minimumStock ? { minimumStock } : {}),
        ...(opening
          ? { openingStock: { mode: 'now' as const, quantity: opening, ...(session?.context?.branchId ? { branchId: session.context.branchId } : {}) } }
          : {}),
      })
    },
    onSuccess: (saved) => {
      toast(product ? `${saved.name} atualizado.` : `${saved.name} cadastrado.`)
      refresh()
      onClose()
    },
  })

  const archive = useMutation({
    mutationFn: () => setProductArchived(product!.id, product!.version, product!.status === 'active'),
    onSuccess: (saved) => {
      toast(saved.status === 'archived' ? `${saved.name} arquivado — some das buscas, fica nos pedidos antigos.` : `${saved.name} voltou.`)
      refresh()
      onClose()
    },
  })

  const invalid =
    form.name.trim() === '' ||
    (form.salePrice.trim() !== '' && toDecimal(form.salePrice) === null) ||
    (form.cost.trim() !== '' && toDecimal(form.cost) === null) ||
    (form.minimumStock.trim() !== '' && toQuantity(form.minimumStock) === null) ||
    (form.openingStock.trim() !== '' && toQuantity(form.openingStock) === null)

  const unitWord = UNIT_LABELS[form.unit] ?? form.unit

  return (
    <Modal
      open={open}
      wide
      title={product ? product.name : 'Novo produto'}
      onClose={onClose}
      footer={
        editable ? (
          <>
            {product && (
              <Button
                variant="ghost"
                className="mr-auto"
                busy={archive.isPending}
                icon={product.status === 'active' ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                onClick={() => archive.mutate()}
              >
                {product.status === 'active' ? 'Arquivar' : 'Reativar'}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="lime" busy={save.isPending} disabled={invalid} onClick={() => save.mutate()}>
              {product ? 'Salvar' : 'Cadastrar produto'}
            </Button>
          </>
        ) : (
          <Button variant="ink" onClick={onClose}>Fechar</Button>
        )
      }
    >
      <fieldset disabled={!editable} className="space-y-4">
        {!editable && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">Só dono, administrador e gerente mexem no cadastro de produtos.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <div>
            <label className="label" htmlFor="p-name">Nome *</label>
            <input id="p-name" autoFocus maxLength={200} className="field" placeholder="Ex.: Conjunto futebol sublimado" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-sku">Código</label>
            <input id="p-sku" maxLength={40} className="field uppercase" placeholder={product ? '' : 'automático'} value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-cat">Categoria</label>
            {newCategory === null ? (
              <div className="flex gap-2">
                <select id="p-cat" className="field" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">Sem categoria</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button variant="outline" title="Nova categoria" onClick={() => setNewCategory('')} icon={<Plus className="h-4 w-4" />} />
              </div>
            ) : (
              <div className="flex gap-2">
                <input autoFocus className="field" placeholder="Ex.: Matéria-prima" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                <Button variant="ink" busy={addCategory.isPending} disabled={!newCategory.trim()} onClick={() => addCategory.mutate()}>Criar</Button>
                <Button variant="ghost" onClick={() => setNewCategory(null)}>×</Button>
              </div>
            )}
            {addCategory.isError && <p className="mt-1 text-xs text-red-600">{errorMessage(addCategory.error)}</p>}
          </div>
          <div>
            <label className="label" htmlFor="p-unit">Unidade</label>
            <select id="p-unit" className="field" value={form.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
              {UNIT_VALUES.map((u) => <option key={u} value={u}>{u} — {UNIT_LABELS[u] ?? u}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-price">Preço de venda (R$ por {unitWord})</label>
            <input id="p-price" inputMode="decimal" className="field font-bold" placeholder="Deixe vazio se não vende" value={form.salePrice} onChange={(e) => set('salePrice', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-cost">Custo (R$ por {unitWord})</label>
            <input id="p-cost" inputMode="decimal" className="field" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
          </div>
        </div>

        <div className={clsx('rounded-2xl p-4', form.tracksStock ? 'bg-lime-50 ring-1 ring-lime-600' : 'bg-paper')}>
          <label className="flex items-center gap-2 text-sm font-extrabold">
            <input type="checkbox" className="h-4 w-4 accent-ink" checked={form.tracksStock} onChange={(e) => set('tracksStock', e.target.checked)} />
            Controlar estoque deste produto
          </label>
          <p className="mt-1 text-xs text-muted">
            Ligue para tecido, tinta, papel e peças prontas de pronta-entrega. Para peça feita sob encomenda, deixe desligado.
          </p>
          {form.tracksStock && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {!product && (
                <div>
                  <label className="label" htmlFor="p-open">Quanto tem hoje ({unitWord})</label>
                  <input id="p-open" inputMode="decimal" className="field" placeholder="0" value={form.openingStock} onChange={(e) => set('openingStock', e.target.value)} />
                </div>
              )}
              <div>
                <label className="label" htmlFor="p-min">Avisar quando ficar abaixo de ({unitWord})</label>
                <input id="p-min" inputMode="decimal" className="field" value={form.minimumStock} onChange={(e) => set('minimumStock', e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="p-desc">Descrição</label>
          <textarea id="p-desc" rows={2} maxLength={2000} className="field" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        {(save.error ?? archive.error) && <ErrorBox message={errorMessage(save.error ?? archive.error)} />}
      </fieldset>
    </Modal>
  )
}
