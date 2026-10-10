import type { SizeChartType } from '@/contracts/aeris/uniforms'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  createSizeChart,
  deleteSizeChart,
  fetchSizeCharts,
  updateSizeChart,
} from '@/api/uniforms'
import { storeKeys } from '@/api/uniform-store'
import { useAuth } from '@/auth/AuthProvider'
import { SizeChartTable } from '@/components/catalog/SizeChartTable'
import {
  Button,
  Empty,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
} from '@/components/ui'
import { errorMessage } from '@/lib/http'

const CHARTS_KEY = ['size-charts'] as const
const CATALOG_KEY = storeKeys.pieces
export const TabelaLojaPage = () => {
  const { can } = useAuth()
  return (
    <div>
      <PageHeader kicker="As peças da loja e as medidas delas" title="Peças e medidas">
        <p className="mt-2 text-sm text-muted">
          Cada peça daqui aparece para escolher na grade e nos personalizados.
          Em Produtos, marque as medidas que o cliente vê no link. Apagar uma
          peça não mexe nos pedidos que já a usam.
        </p>
      </PageHeader>
      <ChartsTab manage={can('uniforms.manage')} />
    </div>
  )
}

const ChartsTab = ({ manage }: { manage: boolean }) => {
  const queryClient = useQueryClient()
  const charts = useQuery({
    queryKey: CHARTS_KEY,
    queryFn: ({ signal }) => fetchSizeCharts(signal),
  })
  const [editing, setEditing] = useState<SizeChartType | 'new' | null>(null)
  const remove = useMutation({
    mutationFn: (chart: SizeChartType) =>
      deleteSizeChart(chart.id, chart.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHARTS_KEY })
      void queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
    },
  })

  if (charts.isPending) return <Spinner />
  if (charts.isError)
    return (
      <ErrorBox
        message={errorMessage(charts.error)}
        onRetry={() => void charts.refetch()}
      />
    )

  return (
    <div className="space-y-4">
      {manage && (
        <Button
          variant="lime"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setEditing('new')}
        >
          Nova peça
        </Button>
      )}
      {charts.data.length === 0 && (
        <Empty title="Nenhuma peça cadastrada">
          <p>
            Cadastre cada peça e, se quiser, as medidas; depois escolha, em
            cada produto, quais medidas o cliente vê no link.
          </p>
        </Empty>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {charts.data.map((chart) => (
          <article key={chart.id} className="card p-4">
            <SizeChartTable chart={chart} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">
                {chart.productIds.length === 0
                  ? 'Nenhum produto mostra estas medidas.'
                  : `${String(chart.productIds.length)} produto(s) mostram as medidas.`}
              </span>
              {manage && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => setEditing(chart)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    busy={remove.isPending && remove.variables.id === chart.id}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Apagar a peça "${chart.name}"? Ela sai da lista de escolha e os produtos deixam de mostrar as medidas. Os pedidos que já a usam continuam iguais.`
                        )
                      )
                        remove.mutate(chart)
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
const blankRow = (): DraftRow => ({
  key: draftKey++,
  size: '',
  width: '',
  height: '',
})

/** "52.5" → "52,5" para editar como a loja escreve. */
const comma = (value: string | null): string => (value ?? '').replace('.', ',')

const ChartEditor = ({
  chart,
  onClose,
}: {
  chart: SizeChartType | 'new' | null
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [sections, setSections] = useState<DraftSection[]>([])

  useEffect(() => {
    if (chart === null) return
    if (chart === 'new') {
      setName('')
      setNote('Pode haver variação de 1% a 5% após prensa térmica.')
      setSections([
        {
          key: draftKey++,
          title: '',
          rows: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG'].map((size) => ({
            ...blankRow(),
            size,
          })),
        },
      ])
      return
    }
    setName(chart.name)
    setNote(chart.note ?? '')
    setSections(
      chart.sections.map((section) => ({
        key: draftKey++,
        title: section.title ?? '',
        rows: section.rows.map((row) => ({
          key: draftKey++,
          size: row.size,
          width: comma(row.width),
          height: comma(row.height),
        })),
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
            .map((row) => ({
              size: row.size.trim(),
              width: row.width.trim() || null,
              height: row.height.trim() || null,
            })),
        })),
      }
      return chart === 'new' || chart === null
        ? createSizeChart(body)
        : updateSizeChart(chart.id, { ...body, version: chart.version })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHARTS_KEY })
      onClose()
    },
  })

  const updateSection = (key: number, patch: Partial<DraftSection>) =>
    setSections((all) =>
      all.map((section) =>
        section.key === key ? { ...section, ...patch } : section
      )
    )
  const updateRow = (
    sectionKey: number,
    rowKey: number,
    patch: Partial<DraftRow>
  ) =>
    setSections((all) =>
      all.map((section) =>
        section.key === sectionKey
          ? {
              ...section,
              rows: section.rows.map((row) =>
                row.key === rowKey ? { ...row, ...patch } : row
              ),
            }
          : section
      )
    )

  return (
    <Modal
      open={chart !== null}
      wide
      title={
        chart === 'new' ? 'Nova peça' : 'Editar peça'
      }
      onClose={() => {
        save.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="lime"
            icon={<Save className="h-4 w-4" />}
            busy={save.isPending}
            disabled={name.trim() === ''}
            onClick={() => save.mutate()}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Nome da peça</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="field"
              placeholder="Camiseta masculina"
            />
          </label>
          <label className="block">
            <span className="label">Observação</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              className="field"
            />
          </label>
        </div>
        {sections.map((section) => (
          <section
            key={section.key}
            className="rounded-2xl border border-line p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <input
                value={section.title}
                onChange={(e) =>
                  updateSection(section.key, { title: e.target.value })
                }
                maxLength={40}
                className="field"
                placeholder="Parte (Infantil, Adulto…) — opcional"
              />
              {sections.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setSections((all) =>
                      all.filter((s) => s.key !== section.key)
                    )
                  }
                  className="rounded-full p-2 text-muted hover:text-red-700"
                  aria-label="Tirar parte"
                >
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
                <div
                  key={row.key}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"
                >
                  <input
                    value={row.size}
                    onChange={(e) =>
                      updateRow(section.key, row.key, {
                        size: e.target.value.toUpperCase(),
                      })
                    }
                    maxLength={10}
                    className="field"
                    aria-label="Tamanho"
                  />
                  <input
                    value={row.width}
                    onChange={(e) =>
                      updateRow(section.key, row.key, { width: e.target.value })
                    }
                    inputMode="decimal"
                    className="field"
                    aria-label="Largura"
                  />
                  <input
                    value={row.height}
                    onChange={(e) =>
                      updateRow(section.key, row.key, {
                        height: e.target.value,
                      })
                    }
                    inputMode="decimal"
                    className="field"
                    aria-label="Altura"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateSection(section.key, {
                        rows: section.rows.filter((r) => r.key !== row.key),
                      })
                    }
                    className="rounded-full p-2 text-muted hover:text-red-700"
                    aria-label="Tirar tamanho"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() =>
                updateSection(section.key, {
                  rows: [...section.rows, blankRow()],
                })
              }
            >
              Mais um tamanho
            </Button>
          </section>
        ))}
        {sections.length < 5 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() =>
              setSections((all) => [
                ...all,
                { key: draftKey++, title: '', rows: [blankRow()] },
              ])
            }
          >
            Mais uma parte (ex.: infantil)
          </Button>
        )}
        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}
