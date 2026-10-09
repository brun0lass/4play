import type { SizeChartType, UniformCatalogProductType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Pencil, Plus, Ruler, Save, Tags, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchDefaultPriceListId, fetchVariantTiers } from '@/api/pricing'
import {
  createSizeChart,
  deleteSizeChart,
  fetchSizeCharts,
  fetchUniformCatalog,
  saveUniformFabric,
  saveUniformProduct,
  updateSizeChart,
} from '@/api/uniforms'
import { useAuth } from '@/auth/AuthProvider'
import { SizeChartTable } from '@/components/catalog/SizeChartTable'
import { useToast } from '@/components/Toast'
import { Badge, Button, Empty, ErrorBox, Modal, PageHeader, Spinner } from '@/components/ui'
import { money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { FABRIC_LABELS } from '@/lib/uniforms'

type Kind = UniformCatalogProductType['kind']
type Fabric = keyof typeof FABRIC_LABELS

const KIND_LABELS: Record<Kind, string> = {
  peca: 'Peça',
  personalizacao: 'Cobrança: nome e número (por peça)',
  'sem-logo': 'Cobrança: sem o logo (por peça)',
  arte: 'Cobrança: arte antes do pedido',
}

const CATALOG_KEY = ['uniform-catalog'] as const
const CHARTS_KEY = ['size-charts'] as const

/**
 * A tabela da loja (F258 e F259 do Aeris): o tecido de cada variação, o que
 * está descontinuado, as cobranças do link e as tabelas de medidas.
 *
 * O preço continua no cadastro do produto (a lista padrão, com as faixas por
 * quantidade); aqui ele aparece para conferir.
 */
export const TabelaLojaPage = () => {
  const { can } = useAuth()
  const manage = can('uniforms.manage')
  const [tab, setTab] = useState<'precos' | 'medidas'>('precos')

  return (
    <div>
      <PageHeader kicker="O que o cliente vê no link" title="Tabela e medidas">
        <p className="mt-2 text-sm font-semibold text-muted">
          O tecido de cada peça, o que está descontinuado (fora do link, a não ser que a atendente marque), as cobranças do pedido e as
          medidas de cada modelo.
        </p>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['precos', 'Peças, tecidos e preços', Tags],
            ['medidas', 'Medidas', Ruler],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold', tab === key ? 'bg-ink text-white' : 'bg-black/5')}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      {tab === 'precos' ? <PricesTab manage={manage} /> : <ChartsTab manage={manage} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peças, tecidos e preços (F258)
// ---------------------------------------------------------------------------

const PricesTab = ({ manage }: { manage: boolean }) => {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const catalog = useQuery({ queryKey: CATALOG_KEY, queryFn: ({ signal }) => fetchUniformCatalog(signal) })
  const charts = useQuery({ queryKey: CHARTS_KEY, queryFn: ({ signal }) => fetchSizeCharts(signal) })
  const priceList = useQuery({
    queryKey: ['default-price-list'],
    queryFn: ({ signal }) => fetchDefaultPriceListId(signal),
    enabled: can('pricing.read'),
    staleTime: 300_000,
  })
  const fabric = useMutation({
    mutationFn: ({ value, discontinued }: { value: Fabric; discontinued: boolean }) => saveUniformFabric(value, discontinued),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
  })

  if (catalog.isPending) return <Spinner />
  if (catalog.isError) return <ErrorBox message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} />

  const pieces = catalog.data.products.filter((product) => product.kind === 'peca')
  const extras = catalog.data.products.filter((product) => product.kind !== 'peca')

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-sm font-extrabold tracking-wider uppercase">Tecidos</h2>
        <p className="mt-1 text-xs text-muted">
          O tecido descontinuado sai do link do cliente; quem gera o link ainda pode marcar para um pedido que precise.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {catalog.data.fabrics.map((entry) => (
            <label
              key={entry.fabric}
              className={clsx('inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-extrabold', entry.discontinued ? 'border-line text-muted' : 'border-ink')}
            >
              {FABRIC_LABELS[entry.fabric]}
              {manage ? (
                <span className="inline-flex items-center gap-1 font-bold">
                  <input
                    type="checkbox"
                    className="accent-ink"
                    checked={entry.discontinued}
                    disabled={fabric.isPending}
                    onChange={(e) => fabric.mutate({ value: entry.fabric, discontinued: e.target.checked })}
                  />
                  descontinuado
                </span>
              ) : (
                entry.discontinued && <Badge tone="warning">descontinuado</Badge>
              )}
            </label>
          ))}
        </div>
        {fabric.isError && <p className="mt-2 text-xs font-semibold text-red-700">{errorMessage(fabric.error)}</p>}
      </section>

      {pieces.length === 0 && extras.length === 0 && (
        <Empty title="Nenhum produto ainda">
          <p>Cadastre as peças em Produtos; elas aparecem aqui.</p>
        </Empty>
      )}

      {pieces.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-extrabold tracking-wider uppercase">Peças</h2>
          {pieces.map((product) => (
            <ProductCard key={product.id} product={product} manage={manage} charts={charts.data ?? []} priceListId={priceList.data ?? null} />
          ))}
        </section>
      )}

      {extras.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-extrabold tracking-wider uppercase">Cobranças do pedido</h2>
          <p className="text-xs text-muted">
            Nome e número entra sozinho no link pelas peças com nome ou número; o sem logo e a arte antes o cliente marca. Nenhuma aparece como peça.
          </p>
          {extras.map((product) => (
            <ProductCard key={product.id} product={product} manage={manage} charts={charts.data ?? []} priceListId={priceList.data ?? null} />
          ))}
        </section>
      )}
    </div>
  )
}

const ProductCard = ({
  product,
  manage,
  charts,
  priceListId,
}: {
  product: UniformCatalogProductType
  manage: boolean
  charts: readonly SizeChartType[]
  priceListId: string | null
}) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [kind, setKind] = useState<Kind>(product.kind)
  const [discontinued, setDiscontinued] = useState(product.discontinued)
  const [fabrics, setFabrics] = useState<Record<string, Fabric | null>>(() =>
    Object.fromEntries(product.variants.map((variant) => [variant.id, variant.fabric]))
  )
  const [chartIds, setChartIds] = useState<string[]>(product.sizeChartIds)

  useEffect(() => {
    setKind(product.kind)
    setDiscontinued(product.discontinued)
    setFabrics(Object.fromEntries(product.variants.map((variant) => [variant.id, variant.fabric])))
    setChartIds(product.sizeChartIds)
  }, [product])

  const dirty =
    kind !== product.kind ||
    discontinued !== product.discontinued ||
    product.variants.some((variant) => (fabrics[variant.id] ?? null) !== variant.fabric) ||
    chartIds.join() !== product.sizeChartIds.join()

  const save = useMutation({
    mutationFn: () =>
      saveUniformProduct(product.id, {
        kind,
        discontinued,
        fabrics: product.variants.map((variant) => ({ variantId: variant.id, fabric: fabrics[variant.id] ?? null })),
        sizeChartIds: chartIds,
      }),
    onSuccess: () => {
      toast(`${product.name} salvo.`)
      void queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
      void queryClient.invalidateQueries({ queryKey: CHARTS_KEY })
    },
  })

  return (
    <article className={clsx('card p-4', discontinued && 'opacity-75')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-extrabold">
            {product.name} {discontinued && <Badge tone="warning">descontinuada</Badge>}
          </p>
          {product.kind !== 'peca' && <p className="text-xs text-muted">{KIND_LABELS[product.kind]}</p>}
        </div>
        {manage && (
          <div className="flex flex-wrap items-center gap-2">
            <select className="field w-auto text-xs" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tipo">
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {kind === 'peca' && (
              <label className="inline-flex items-center gap-1.5 text-xs font-bold">
                <input type="checkbox" className="accent-ink" checked={discontinued} onChange={(e) => setDiscontinued(e.target.checked)} />
                Descontinuada
              </label>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {product.variants.map((variant) => (
          <div key={variant.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-3 py-2">
            <span className="min-w-28 text-xs font-bold">
              {variant.name ?? (variant.isDefault ? 'Padrão' : variant.sku)}
              <span className="block text-[11px] font-semibold text-muted">{variant.sku}</span>
            </span>
            {kind === 'peca' &&
              (manage ? (
                <select
                  className="field w-auto text-xs"
                  value={fabrics[variant.id] ?? ''}
                  onChange={(e) => setFabrics((all) => ({ ...all, [variant.id]: e.target.value === '' ? null : (e.target.value as Fabric) }))}
                  aria-label={`Tecido de ${variant.sku}`}
                >
                  <option value="">Qualquer tecido</option>
                  {Object.entries(FABRIC_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge tone="neutral">{variant.fabric === null ? 'Qualquer tecido' : FABRIC_LABELS[variant.fabric]}</Badge>
              ))}
            {priceListId !== null && <Tiers priceListId={priceListId} variantId={variant.id} />}
          </div>
        ))}
      </div>

      {kind === 'peca' && (manage || chartIds.length > 0) && charts.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-extrabold tracking-wide text-muted uppercase">Medidas que o cliente vê</p>
          <div className="flex flex-wrap gap-1.5">
            {(manage ? charts : charts.filter((chart) => chartIds.includes(chart.id))).map((chart) => {
              const on = chartIds.includes(chart.id)
              return (
                <button
                  key={chart.id}
                  type="button"
                  disabled={!manage}
                  onClick={() => setChartIds((ids) => (on ? ids.filter((id) => id !== chart.id) : [...ids, chart.id]))}
                  className={clsx('rounded-full border-2 px-2.5 py-1 text-[11px] font-bold', on ? 'border-ink bg-lime' : 'border-line text-muted')}
                >
                  {chart.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {manage && dirty && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="lime" icon={<Save className="h-3.5 w-3.5" />} busy={save.isPending} onClick={() => save.mutate()}>
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setKind(product.kind)
              setDiscontinued(product.discontinued)
              setFabrics(Object.fromEntries(product.variants.map((variant) => [variant.id, variant.fabric])))
              setChartIds(product.sizeChartIds)
              save.reset()
            }}
          >
            Desfazer
          </Button>
        </div>
      )}
      {save.isError && <p className="mt-2 text-xs font-semibold text-red-700">{errorMessage(save.error)}</p>}
    </article>
  )
}

/** As faixas da variação na lista padrão: "1+ R$ 55,00 · 11+ R$ 48,00". */
const Tiers = ({ priceListId, variantId }: { priceListId: string; variantId: string }) => {
  const tiers = useQuery({
    queryKey: ['variant-tiers', priceListId, variantId],
    queryFn: ({ signal }) => fetchVariantTiers(priceListId, variantId, signal),
    staleTime: 60_000,
  })
  if (tiers.isPending) return <span className="text-[11px] text-muted">…</span>
  if (tiers.isError) return null
  if (tiers.data.length === 0) return <span className="text-[11px] font-bold text-amber-800">sem preço</span>
  const sorted = [...tiers.data].sort((left, right) => Number(left.minQuantity) - Number(right.minQuantity))
  return (
    <span className="flex flex-wrap gap-1">
      {sorted.map((tier) => (
        <span key={tier.id} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold">
          {Math.max(Math.ceil(Number(tier.minQuantity)), 1)}+ · {money(tier.unitPrice)}
        </span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Medidas (F259)
// ---------------------------------------------------------------------------

const ChartsTab = ({ manage }: { manage: boolean }) => {
  const queryClient = useQueryClient()
  const charts = useQuery({ queryKey: CHARTS_KEY, queryFn: ({ signal }) => fetchSizeCharts(signal) })
  const [editing, setEditing] = useState<SizeChartType | 'new' | null>(null)
  const remove = useMutation({
    mutationFn: (chart: SizeChartType) => deleteSizeChart(chart.id, chart.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHARTS_KEY })
      void queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
    },
  })

  if (charts.isPending) return <Spinner />
  if (charts.isError) return <ErrorBox message={errorMessage(charts.error)} onRetry={() => void charts.refetch()} />

  return (
    <div className="space-y-4">
      {manage && (
        <Button variant="lime" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          Nova tabela de medidas
        </Button>
      )}
      {charts.data.length === 0 && (
        <Empty title="Nenhuma tabela de medidas">
          <p>Cadastre a medida de cada modelo; depois escolha, em cada peça, quais o cliente vê no link.</p>
        </Empty>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {charts.data.map((chart) => (
          <article key={chart.id} className="card p-4">
            <SizeChartTable chart={chart} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">
                {chart.productIds.length === 0 ? 'Nenhuma peça mostra esta tabela.' : `${String(chart.productIds.length)} peça(s) mostram.`}
              </span>
              {manage && (
                <>
                  <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(chart)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    busy={remove.isPending && remove.variables.id === chart.id}
                    onClick={() => {
                      if (window.confirm(`Apagar a tabela "${chart.name}"? As peças deixam de mostrá-la.`)) remove.mutate(chart)
                    }}
                  >
                    Apagar
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {remove.isError && <ErrorBox message={errorMessage(remove.error)} />}
      <ChartEditor chart={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

type DraftRow = { key: number; size: string; width: string; height: string }
type DraftSection = { key: number; title: string; rows: DraftRow[] }

let draftKey = 1
const blankRow = (): DraftRow => ({ key: draftKey++, size: '', width: '', height: '' })

/** "52.5" → "52,5" para editar como a loja escreve. */
const comma = (value: string | null): string => (value ?? '').replace('.', ',')

const ChartEditor = ({ chart, onClose }: { chart: SizeChartType | 'new' | null; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [sections, setSections] = useState<DraftSection[]>([])

  useEffect(() => {
    if (chart === null) return
    if (chart === 'new') {
      setName('')
      setNote('Pode haver variação de 1% a 5% após prensa térmica.')
      setSections([{ key: draftKey++, title: '', rows: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG'].map((size) => ({ ...blankRow(), size })) }])
      return
    }
    setName(chart.name)
    setNote(chart.note ?? '')
    setSections(
      chart.sections.map((section) => ({
        key: draftKey++,
        title: section.title ?? '',
        rows: section.rows.map((row) => ({ key: draftKey++, size: row.size, width: comma(row.width), height: comma(row.height) })),
      }))
    )
  }, [chart])

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        note: note.trim() || null,
        sections: sections.map((section) => ({
          title: section.title.trim() || null,
          rows: section.rows
            .filter((row) => row.size.trim() !== '')
            .map((row) => ({ size: row.size.trim(), width: row.width.trim() || null, height: row.height.trim() || null })),
        })),
      }
      return chart === 'new' || chart === null ? createSizeChart(body) : updateSizeChart(chart.id, { ...body, version: chart.version })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHARTS_KEY })
      onClose()
    },
  })

  const updateSection = (key: number, patch: Partial<DraftSection>) =>
    setSections((all) => all.map((section) => (section.key === key ? { ...section, ...patch } : section)))
  const updateRow = (sectionKey: number, rowKey: number, patch: Partial<DraftRow>) =>
    setSections((all) =>
      all.map((section) =>
        section.key === sectionKey ? { ...section, rows: section.rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)) } : section
      )
    )

  return (
    <Modal
      open={chart !== null}
      wide
      title={chart === 'new' ? 'Nova tabela de medidas' : 'Editar tabela de medidas'}
      onClose={() => {
        save.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="lime" icon={<Save className="h-4 w-4" />} busy={save.isPending} disabled={name.trim() === ''} onClick={() => save.mutate()}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Nome do modelo</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="field" placeholder="Camiseta masculina" />
          </label>
          <label className="block">
            <span className="label">Observação</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="field" />
          </label>
        </div>
        {sections.map((section) => (
          <section key={section.key} className="rounded-2xl border border-line p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={section.title}
                onChange={(e) => updateSection(section.key, { title: e.target.value })}
                maxLength={40}
                className="field"
                placeholder="Parte (Infantil, Adulto…) — opcional"
              />
              {sections.length > 1 && (
                <button type="button" onClick={() => setSections((all) => all.filter((s) => s.key !== section.key))} className="rounded-full p-2 text-muted hover:text-red-700" aria-label="Tirar parte">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[11px] font-extrabold tracking-wide text-muted uppercase">
              <span>Tamanho</span>
              <span>Largura (cm)</span>
              <span>Altura (cm)</span>
              <span />
            </div>
            <div className="mt-1 space-y-1.5">
              {section.rows.map((row) => (
                <div key={row.key} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <input value={row.size} onChange={(e) => updateRow(section.key, row.key, { size: e.target.value.toUpperCase() })} maxLength={10} className="field" aria-label="Tamanho" />
                  <input value={row.width} onChange={(e) => updateRow(section.key, row.key, { width: e.target.value })} inputMode="decimal" className="field" aria-label="Largura" />
                  <input value={row.height} onChange={(e) => updateRow(section.key, row.key, { height: e.target.value })} inputMode="decimal" className="field" aria-label="Altura" />
                  <button
                    type="button"
                    onClick={() => updateSection(section.key, { rows: section.rows.filter((r) => r.key !== row.key) })}
                    className="rounded-full p-2 text-muted hover:text-red-700"
                    aria-label="Tirar tamanho"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-2" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => updateSection(section.key, { rows: [...section.rows, blankRow()] })}>
              Mais um tamanho
            </Button>
          </section>
        ))}
        {sections.length < 5 && (
          <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setSections((all) => [...all, { key: draftKey++, title: '', rows: [blankRow()] }])}>
            Mais uma parte (ex.: infantil)
          </Button>
        )}
        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}
