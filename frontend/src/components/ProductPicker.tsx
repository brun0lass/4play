import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, PackagePlus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { createProduct, searchProducts, type Product } from '@/api/sales'
import { useAuth } from '@/auth/AuthProvider'
import { Button, ErrorBox } from '@/components/ui'
import { money, toDecimal } from '@/lib/format'
import { errorMessage } from '@/lib/http'

export type PickedProduct = {
  variantId: string
  description: string
  unit: string
  basePrice: string | null
}

const toPicked = (product: Product): PickedProduct | null => {
  const variants = product.variants.filter((variant) => variant.status === 'active')
  const variant = variants.find((v) => v.isDefault) ?? variants[0]
  if (!variant) return null
  return {
    variantId: variant.id,
    description: variant.name ? `${product.name} — ${variant.name}` : product.name,
    unit: variant.unit,
    basePrice: product.price?.basePrice ?? null,
  }
}

/**
 * Procurar um produto do catálogo — ou cadastrar ali mesmo, sem sair do pedido.
 */
export const ProductPicker = ({ onPick }: { onPick: (product: PickedProduct) => void }) => {
  const { can } = useAuth()
  const canCreate = can('catalog.write')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [price, setPrice] = useState('')
  const deferred = useDeferredValue(search.trim())

  const products = useQuery({
    queryKey: ['products', 'search', deferred],
    queryFn: ({ signal }) => searchProducts(deferred, signal),
    staleTime: 60_000,
  })

  const create = useMutation({
    mutationFn: () => createProduct({ name: search.trim(), salePrice: toDecimal(price) ?? '0.00' }),
    onSuccess: (product) => {
      const picked = toPicked(product)
      if (picked) onPick(picked)
    },
  })

  const items = products.data?.items ?? []

  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setCreating(false)
          }}
          placeholder="Procure o produto: conjunto, camisa, regata…"
          className="field pl-9"
        />
        {products.isFetching && <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>

      {products.isError && <div className="mt-2"><ErrorBox message={errorMessage(products.error)} /></div>}

      <ul className="scroll-thin mt-2 max-h-56 overflow-y-auto">
        {items.map((product) => {
          const picked = toPicked(product)
          if (!picked) return null
          return (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onPick(picked)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-lime-50"
              >
                <span className="text-sm font-bold">{picked.description}</span>
                <span className="text-xs font-semibold text-muted">
                  {picked.basePrice ? money(picked.basePrice) : 'sem preço'}
                </span>
              </button>
            </li>
          )
        })}
        {products.isSuccess && items.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted">
            {deferred ? `Nenhum produto com "${deferred}".` : 'O catálogo ainda está vazio.'}
          </li>
        )}
      </ul>

      {deferred.length >= 3 && !creating && !canCreate && items.length === 0 && (
        <p className="mt-1 px-3 text-xs font-semibold text-amber-700">Produto novo só o gerente ou o dono cadastram. Peça para cadastrarem “{search.trim()}”.</p>
      )}
      {deferred.length >= 3 && !creating && canCreate && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-ink/30 px-3 py-2.5 text-left text-sm font-bold hover:border-ink hover:bg-lime-50"
        >
          <PackagePlus className="h-4 w-4" /> Cadastrar “{search.trim()}” como produto novo
        </button>
      )}

      {creating && (
        <div className="mt-2 rounded-xl bg-paper p-3">
          <p className="mb-2 text-xs font-semibold text-muted">
            Produto novo: <strong className="text-ink">{search.trim()}</strong>
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="label" htmlFor="np-price">Preço por peça (R$)</label>
              <input id="np-price" inputMode="decimal" placeholder="45,00" className="field" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <Button variant="ink" busy={create.isPending} disabled={toDecimal(price) === null} onClick={() => create.mutate()}>
              Cadastrar e usar
            </Button>
          </div>
          {create.isError && <div className="mt-2"><ErrorBox message={errorMessage(create.error)} /></div>}
        </div>
      )}
    </div>
  )
}
