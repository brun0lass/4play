import type { UniformPieceType } from '@/contracts/aeris/uniforms'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  archivePiece,
  editPrice,
  fetchFabrics,
  fetchPersonalizationTypes,
  fetchPieces,
  savePiece,
  storeKeys,
} from '@/api/uniform-store'
import { fetchSizeCharts } from '@/api/uniforms'
import { useAuth } from '@/auth/AuthProvider'
import { StoreField } from '@/components/catalog/StoreFields'
import { useToast } from '@/components/Toast'
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
} from '@/components/ui'
import { money } from '@/lib/format'
import { errorMessage } from '@/lib/http'

export const ProdutosPage = () => {
  const { can } = useAuth()
  const manage = can('uniforms.manage')
  const client = useQueryClient()
  const pieces = useQuery({
    queryKey: storeKeys.pieces,
    queryFn: ({ signal }) => fetchPieces(signal),
  })
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<UniformPieceType | 'new' | null>(null)
  const remove = useMutation({
    mutationFn: (piece: UniformPieceType) =>
      archivePiece(piece.id, piece.version),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: storeKeys.pieces })
      void client.invalidateQueries({ queryKey: ['catalog'] })
    },
  })
  return (
    <div>
      <PageHeader
        title="Produtos"
        kicker="Peças e preços por tecido"
        actions={
          manage && (
            <Button
              variant="lime"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setEditing('new')}
            >
              Novo produto
            </Button>
          )
        }
      >
        <p className="mt-2 text-sm text-muted">
          Cada produto tem seus tecidos, preços por quantidade e custo opcional.
          Escolha também as personalizações e as medidas.
        </p>
      </PageHeader>
      <input
        className="field mb-4 max-w-sm"
        placeholder="Procurar produto"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {pieces.isPending && <Spinner />}
      {pieces.isError && (
        <ErrorBox
          message={errorMessage(pieces.error)}
          onRetry={() => void pieces.refetch()}
        />
      )}
      {pieces.data?.length === 0 && (
        <Empty title="Nenhum produto">
          <p>
            Cadastre os tecidos em{' '}
            <Link to="/tecidos" className="underline">
              Tecidos
            </Link>{' '}
            e crie sua primeira peça.
          </p>
        </Empty>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {pieces.data
          ?.filter((p) =>
            p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
          )
          .map((piece) => (
            <article className="card p-5" key={piece.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-extrabold">{piece.name}</h2>
                  {piece.discontinued && (
                    <Badge tone="warning">Descontinuado</Badge>
                  )}
                </div>
                {manage && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => setEditing(piece)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Apagar ${piece.name}`}
                      busy={
                        remove.isPending && remove.variables.id === piece.id
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            `Apagar "${piece.name}"? Os pedidos antigos ficam preservados.`
                          )
                        )
                          remove.mutate(piece)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {piece.fabrics.map((f) => (
                  <div key={f.fabricId} className="rounded-2xl bg-paper p-3">
                    <p className="text-sm font-bold">
                      {f.fabricName}{' '}
                      {f.fabricArchived && (
                        <Badge tone="warning">Apagado</Badge>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f.tiers.map((tier, i) => (
                        <span
                          key={tier.minQuantity}
                          className="rounded-full bg-white px-2 py-1 text-xs"
                        >
                          {Math.max(1, tier.minQuantity)}
                          {f.tiers[i + 1]
                            ? `–${f.tiers[i + 1]!.minQuantity - 1}`
                            : '+'}{' '}
                          peças · <strong>{money(tier.unitPrice)}</strong>
                        </span>
                      ))}
                    </div>
                    {f.cost !== null && (
                      <p className="mt-1 text-xs text-muted">
                        Custo: {money(f.cost)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                {piece.personalized
                  ? `${piece.personalizationTypeIds.length} tipo(s) de personalização`
                  : 'Sem personalização'}{' '}
                · {piece.sizeChartIds.length} tabela(s) de medidas
              </p>
            </article>
          ))}
      </div>
      {remove.isError && <ErrorBox message={errorMessage(remove.error)} />}
      {editing !== null && (
        <PieceEditor
          key={editing === 'new' ? 'new' : editing.id}
          piece={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
type FabricDraft = {
  fabricId: string
  cost: string
  tiers: { minQuantity: string; unitPrice: string }[]
}
const PieceEditor = ({
  piece,
  onClose,
}: {
  piece: UniformPieceType | null
  onClose: () => void
}) => {
  const client = useQueryClient()
  const toast = useToast()
  const fabrics = useQuery({
    queryKey: storeKeys.fabrics,
    queryFn: ({ signal }) => fetchFabrics(signal),
  })
  const types = useQuery({
    queryKey: storeKeys.types,
    queryFn: ({ signal }) => fetchPersonalizationTypes(signal),
  })
  const charts = useQuery({
    queryKey: ['size-charts'],
    queryFn: ({ signal }) => fetchSizeCharts(signal),
  })
  const [name, setName] = useState(piece?.name ?? '')
  const [discontinued, setDiscontinued] = useState(piece?.discontinued ?? false)
  const [personalized, setPersonalized] = useState(piece?.personalized ?? false)
  const [typeIds, setTypeIds] = useState(piece?.personalizationTypeIds ?? [])
  const [chartIds, setChartIds] = useState(piece?.sizeChartIds ?? [])
  const [rows, setRows] = useState<FabricDraft[]>(
    piece?.fabrics.map((f) => ({
      fabricId: f.fabricId,
      cost: editPrice(f.cost),
      tiers: f.tiers.map((t) => ({
        minQuantity: String(Math.max(1, t.minQuantity)),
        unitPrice: editPrice(t.unitPrice),
      })),
    })) ?? []
  )
  const update = (id: string, change: Partial<FabricDraft>) =>
    setRows((all) =>
      all.map((row) => (row.fabricId === id ? { ...row, ...change } : row))
    )
  const save = useMutation({
    mutationFn: () =>
      savePiece(piece?.id ?? null, {
        name,
        discontinued,
        personalized,
        personalizationTypeIds: personalized ? typeIds : [],
        sizeChartIds: chartIds,
        ...(piece ? { version: piece.version } : {}),
        fabrics: rows.map((row) => ({
          fabricId: row.fabricId,
          cost: row.cost.trim() || null,
          tiers: row.tiers.map((tier) => ({
            minQuantity: Number(tier.minQuantity),
            unitPrice: tier.unitPrice,
          })),
        })),
      }),
    onSuccess: () => {
      for (const key of [
        storeKeys.pieces,
        storeKeys.fabrics,
        storeKeys.types,
        ['size-charts'],
        ['catalog'],
      ])
        void client.invalidateQueries({ queryKey: key })
      toast('Produto salvo.')
      onClose()
    },
  })
  const selected = rows.map((row) => row.fabricId)
  return (
    <Modal
      open
      title={piece ? `Editar ${piece.name}` : 'Novo produto'}
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="lime"
            busy={save.isPending}
            disabled={
              !name.trim() ||
              rows.length === 0 ||
              fabrics.isPending ||
              types.isPending ||
              charts.isPending
            }
            onClick={() => save.mutate()}
          >
            Salvar produto
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <StoreField label="Nome do produto">
          <input
            className="field"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Camisa polo"
          />
        </StoreField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={discontinued}
            onChange={(e) => setDiscontinued(e.target.checked)}
          />
          Descontinuado (fora do link por padrão)
        </label>
        <section className="space-y-3">
          <h3 className="text-sm font-extrabold">Tecidos e preços</h3>
          {fabrics.isPending && <Spinner />}
          {fabrics.isError && (
            <ErrorBox message={errorMessage(fabrics.error)} />
          )}
          <div className="flex flex-wrap gap-2">
            {fabrics.data?.map((fabric) => (
              <button
                type="button"
                key={fabric.id}
                onClick={() =>
                  setRows((all) =>
                    selected.includes(fabric.id)
                      ? all.filter((r) => r.fabricId !== fabric.id)
                      : [
                          ...all,
                          {
                            fabricId: fabric.id,
                            cost: '',
                            tiers: [{ minQuantity: '1', unitPrice: '' }],
                          },
                        ]
                  )
                }
                className={`rounded-full border-2 px-3 py-2 text-xs font-bold ${selected.includes(fabric.id) ? 'border-ink bg-lime' : 'border-line'}`}
              >
                {fabric.name}
              </button>
            ))}
          </div>
          {fabrics.data?.length === 0 && (
            <p className="text-sm text-muted">
              Cadastre um tecido em Tecidos para definir o preço.
            </p>
          )}
          {rows.map((row) => (
            <div
              key={row.fabricId}
              className="space-y-3 rounded-2xl bg-paper p-4"
            >
              <div className="flex justify-between gap-2">
                <strong className="text-sm">
                  {fabrics.data?.find((f) => f.id === row.fabricId)?.name ??
                    piece?.fabrics.find((f) => f.fabricId === row.fabricId)
                      ?.fabricName ??
                    'Tecido apagado'}
                </strong>
                <button
                  type="button"
                  aria-label="Tirar tecido"
                  onClick={() =>
                    setRows((all) =>
                      all.filter((r) => r.fabricId !== row.fabricId)
                    )
                  }
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-bold">
                <span>A partir de (peças)</span>
                <span>Venda (R$)</span>
                <span />
              </div>
              {row.tiers.map((tier, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input
                    aria-label="Quantidade mínima"
                    className="field"
                    type="number"
                    min={1}
                    step={1}
                    disabled={i === 0}
                    value={tier.minQuantity}
                    onChange={(e) =>
                      update(row.fabricId, {
                        tiers: row.tiers.map((t, at) =>
                          at === i ? { ...t, minQuantity: e.target.value } : t
                        ),
                      })
                    }
                  />
                  <input
                    aria-label="Preço de venda"
                    className="field"
                    inputMode="decimal"
                    value={tier.unitPrice}
                    onChange={(e) =>
                      update(row.fabricId, {
                        tiers: row.tiers.map((t, at) =>
                          at === i ? { ...t, unitPrice: e.target.value } : t
                        ),
                      })
                    }
                    placeholder="89,00"
                  />
                  <button
                    type="button"
                    disabled={i === 0}
                    aria-label="Tirar faixa"
                    onClick={() =>
                      update(row.fabricId, {
                        tiers: row.tiers.filter((_, at) => at !== i),
                      })
                    }
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {row.tiers.length < 10 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update(row.fabricId, {
                      tiers: [
                        ...row.tiers,
                        {
                          minQuantity: String(
                            Number(row.tiers.at(-1)?.minQuantity ?? 1) + 10
                          ),
                          unitPrice: '',
                        },
                      ],
                    })
                  }
                >
                  Adicionar faixa
                </Button>
              )}
              <StoreField label="Custo por peça neste tecido (opcional)">
                <input
                  className="field max-w-xs"
                  inputMode="decimal"
                  value={row.cost}
                  onChange={(e) =>
                    update(row.fabricId, { cost: e.target.value })
                  }
                  placeholder="Não informado"
                />
              </StoreField>
            </div>
          ))}
        </section>
        <section>
          <label className="flex items-center gap-2 text-sm font-extrabold">
            <input
              type="checkbox"
              checked={personalized}
              onChange={(e) => setPersonalized(e.target.checked)}
            />
            Tem personalização?
          </label>
          {personalized && (
            <div className="mt-3 space-y-2">
              {types.data?.map((type) => (
                <label
                  key={type.id}
                  className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={typeIds.includes(type.id)}
                    onChange={(e) =>
                      setTypeIds((ids) =>
                        e.target.checked
                          ? [...ids, type.id]
                          : ids.filter((id) => id !== type.id)
                      )
                    }
                  />
                  <span>
                    <strong>{type.name}</strong>
                    <span className="block text-xs text-muted">
                      {type.kind === 'dados'
                        ? `Preenche ${type.fields.join(' e ')}`
                        : 'Marca uma opção'}{' '}
                      ·{' '}
                      {type.charge === 'nenhuma'
                        ? 'Sem cobrança no pedido'
                        : `${money(type.unitPrice)} ${type.charge === 'por-peca' ? 'por peça' : 'por pedido'}`}
                    </span>
                  </span>
                </label>
              ))}
              {types.data?.length === 0 && (
                <p className="text-xs text-muted">
                  Cadastre os tipos em Personalizações.
                </p>
              )}
            </div>
          )}
          {types.isError && <ErrorBox message={errorMessage(types.error)} />}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-extrabold">
            Medidas que o cliente vê
          </h3>
          <div className="flex flex-wrap gap-2">
            {charts.data?.map((chart) => (
              <label
                key={chart.id}
                className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={chartIds.includes(chart.id)}
                  onChange={(e) =>
                    setChartIds((ids) =>
                      e.target.checked
                        ? [...ids, chart.id]
                        : ids.filter((id) => id !== chart.id)
                    )
                  }
                />
                {chart.name}
              </label>
            ))}
          </div>
          {charts.isError && <ErrorBox message={errorMessage(charts.error)} />}
        </section>
        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}
