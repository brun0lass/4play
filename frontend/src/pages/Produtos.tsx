import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, FileSpreadsheet, ImageOff, PackagePlus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { listCategories, listProducts, type Product } from '@/api/catalog'
import { useAuth } from '@/auth/AuthProvider'
import { ImportDialog } from '@/components/catalog/ImportDialog'
import { ProductDialog } from '@/components/catalog/ProductDialog'
import { Badge, Button, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { int, money, qty } from '@/lib/format'
import { errorMessage } from '@/lib/http'

const PAGE = 40

/** A tabela de produtos da 4Play: o que vende e o que consome. */
export const ProdutosPage = () => {
  const { can } = useAuth()
  const editable = can('catalog.write')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [archived, setArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Product | null>(null)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const deferred = useDeferredValue(search.trim())

  const categories = useQuery({ queryKey: ['categories'], queryFn: ({ signal }) => listCategories(signal), staleTime: 60_000 })
  const products = useQuery({
    queryKey: ['catalog', 'products', deferred, categoryId, archived, page],
    queryFn: ({ signal }) =>
      listProducts(
        { search: deferred || undefined, categoryId: categoryId || undefined, status: archived ? 'archived' : 'active', page, pageSize: PAGE },
        signal
      ),
    placeholderData: keepPreviousData,
  })

  const pages = products.data ? Math.max(1, Math.ceil(products.data.total / PAGE)) : 1

  return (
    <div>
      <PageHeader
        kicker="O que a 4Play vende e consome"
        title="Produtos"
        actions={
          editable && (
            <>
              <Button variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setImporting(true)}>
                Importar planilha
              </Button>
              <Button variant="lime" icon={<PackagePlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                Novo produto
              </Button>
            </>
          )
        }
      >
        {products.data && <p className="mt-2 text-sm font-semibold text-muted">{int(products.data.total)} produtos{archived ? ' arquivados' : ''}</p>}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Nome ou código" className="field pl-9" />
        </div>
        <select className="field w-auto" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1) }}>
          <option value="">Todas as categorias</option>
          {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.usageCount})</option>)}
        </select>
        <label className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-xs font-bold">
          <input type="checkbox" className="accent-ink" checked={archived} onChange={(e) => { setArchived(e.target.checked); setPage(1) }} />
          Arquivados
        </label>
      </div>

      {products.isPending && <Spinner />}
      {products.isError && <ErrorBox message={errorMessage(products.error)} onRetry={() => void products.refetch()} />}
      {products.data?.items.length === 0 && (
        <Empty title={deferred ? 'Nada encontrado' : 'Nenhum produto ainda'}>
          <p>{deferred ? 'Tente outro nome.' : 'Cadastre um por um ou traga a tabela inteira por planilha.'}</p>
          {editable && !deferred && (
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setImporting(true)}>Importar planilha</Button>
              <Button variant="lime" icon={<PackagePlus className="h-4 w-4" />} onClick={() => setCreating(true)}>Novo produto</Button>
            </div>
          )}
        </Empty>
      )}

      {products.data && products.data.items.length > 0 && (
        <div className="card overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-ink text-[11px] tracking-wider text-white/70 uppercase">
                <tr>
                  <th className="w-14 px-4 py-3" />
                  <th className="px-3 py-3 font-bold">Produto</th>
                  <th className="px-3 py-3 font-bold">Categoria</th>
                  <th className="px-3 py-3 text-right font-bold">Venda</th>
                  <th className="px-3 py-3 text-right font-bold">Custo</th>
                  <th className="px-3 py-3 text-right font-bold">Margem</th>
                  <th className="px-3 py-3 text-right font-bold">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {products.data.items.map((p) => {
                  const variant = p.variants.find((v) => v.isDefault) ?? p.variants[0]
                  const price = p.price?.basePrice ? Number(p.price.basePrice) : null
                  const cost = p.cost?.averageCost ? Number(p.cost.averageCost) : null
                  const margin = price && cost !== null && price > 0 ? Math.round(((price - cost) / price) * 100) : null
                  const low = p.tracksStock && p.minimumStock && p.stock && Number(p.stock.onHand) < Number(p.minimumStock)
                  return (
                    <tr key={p.id} onClick={() => setEditing(p)} className="cursor-pointer border-t border-line hover:bg-lime-50">
                      <td className="px-4 py-2">
                        {p.primaryImage ? (
                          <img src={p.primaryImage.thumbUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-paper text-muted"><ImageOff className="h-4 w-4" /></span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-bold">{p.name}</p>
                        <p className="text-[11px] text-muted">
                          {variant?.sku} · {variant?.unit}
                          {p.variants.length > 1 && ` · ${String(p.variants.length)} cores`}
                        </p>
                      </td>
                      <td className="px-3 py-2">{p.categoryName ?? <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2 text-right font-bold">{money(p.price?.basePrice)}</td>
                      <td className="px-3 py-2 text-right">{money(p.cost?.averageCost)}</td>
                      <td className={clsx('px-3 py-2 text-right font-semibold', margin !== null && margin < 30 && 'text-red-600')}>
                        {margin === null ? '—' : `${String(margin)}%`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {p.tracksStock ? (
                          <span className={clsx('font-bold', low && 'text-red-600')}>
                            {qty(p.stock?.onHand ?? '0')} {low && <Badge tone="danger">baixo</Badge>}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">sob encomenda</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <footer className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="font-semibold text-muted">Página {page} de {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /> Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Próxima <ChevronRight className="h-4 w-4" /></Button>
              </div>
            </footer>
          )}
        </div>
      )}

      <ProductDialog open={creating || editing !== null} product={editing} onClose={() => { setCreating(false); setEditing(null) }} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </div>
  )
}
