import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { fetchPieces, storeKeys } from '@/api/uniform-store'
import { ErrorBox, Spinner } from '@/components/ui'
import { money } from '@/lib/format'
import { errorMessage } from '@/lib/http'

export type PickedProduct = {
  variantId: string
  description: string
  unit: string
  basePrice: string | null
  fabricId: string
  tiers: { minQuantity: number; unitPrice: string }[]
}

/** Somente peças, uma opção por tecido; serviços de personalização não são produtos avulsos. */
export const ProductPicker = ({
  onPick,
  fabricId,
}: {
  onPick: (product: PickedProduct) => void
  fabricId?: string
}) => {
  const [search, setSearch] = useState('')
  const products = useQuery({
    queryKey: storeKeys.pieces,
    queryFn: ({ signal }) => fetchPieces(signal),
  })
  const items =
    products.data?.filter((product) =>
      product.name
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR'))
    ) ?? []
  return (
    <div className="rounded-2xl border border-line bg-white p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procure a peça e escolha seu tecido"
          className="field pl-9"
        />
      </div>
      {products.isPending && <Spinner />}
      {products.isError && <ErrorBox message={errorMessage(products.error)} />}
      <ul className="scroll-thin mt-2 max-h-72 overflow-y-auto">
        {items.map((piece) => (
          <li key={piece.id} className="border-b border-line py-2">
            <p className="px-3 text-sm font-extrabold">
              {piece.name}
              {piece.discontinued && (
                <span className="ml-2 text-xs text-amber-800">
                  Descontinuado
                </span>
              )}
            </p>
            {piece.fabrics
              .filter(
                (fabric) =>
                  !fabric.fabricArchived &&
                  (!fabricId || fabric.fabricId === fabricId)
              )
              .map((fabric) => (
                <button
                  type="button"
                  key={fabric.variantId}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-lime-50"
                  onClick={() =>
                    onPick({
                      variantId: fabric.variantId,
                      description: `${piece.name} — ${fabric.fabricName}`,
                      unit: 'UN',
                      basePrice: fabric.tiers[0]?.unitPrice ?? null,
                      fabricId: fabric.fabricId,
                      tiers: fabric.tiers,
                    })
                  }
                >
                  <span className="text-sm">{fabric.fabricName}</span>
                  <span className="text-xs text-muted">
                    {fabric.tiers[0]
                      ? money(fabric.tiers[0].unitPrice)
                      : 'Preço a definir'}
                  </span>
                </button>
              ))}
          </li>
        ))}
      </ul>
      {products.isSuccess && items.length === 0 && (
        <p className="p-3 text-sm text-muted">
          Nenhuma peça encontrada. Cadastre as peças e os preços por tecido em{' '}
          <Link to="/produtos" className="underline">
            Produtos
          </Link>
          .
        </p>
      )}
    </div>
  )
}
