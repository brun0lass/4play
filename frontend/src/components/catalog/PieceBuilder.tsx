import { clsx } from 'clsx'
import { Layers, Plus, Shirt, Shuffle, X } from 'lucide-react'
import { useState } from 'react'

import { NewPieceDialog } from '@/components/PieceSelect'
import { Button } from '@/components/ui'

/**
 * Como o cliente monta a peça no link (F300), com "E" e "OU":
 *
 * - peça única: ele só diz tamanho e quantidade;
 * - peça com tipos: Shorts masculino OU feminino OU infantil;
 * - conjunto ou kit: [Camiseta masculina OU babylook] E [Shorts masculino OU
 *   feminino] — cada "E" é uma parte, cada "OU" um tipo dela.
 *
 * Os tipos são as peças de "Peças e medidas" (as tabelas de medidas): o nome
 * delas é o nome da peça na ficha, e as medidas que o cliente vê saem daqui.
 */

export type BuilderMode = 'unica' | 'tipos' | 'kit'

export type PartDraft = { key: string; id?: string; label: string; sizeChartIds: string[] }

type Chart = { id: string; name: string }

export const modeOf = (parts: readonly unknown[]): BuilderMode =>
  parts.length === 0 ? 'unica' : parts.length === 1 ? 'tipos' : 'kit'

export const blankPart = (label = ''): PartDraft => ({ key: crypto.randomUUID(), label, sizeChartIds: [] })

/** O nome da parte pelo primeiro tipo: "Camiseta babylook" → "Camisa". */
const labelFor = (piece: string): string => {
  const name = piece.trim().toLowerCase()
  if (name.startsWith('camis')) return 'Camisa'
  if (name.startsWith('regata') || name.startsWith('top')) return 'Regata ou top'
  if (name.startsWith('shorts') || name.startsWith('short')) return 'Shorts'
  if (name.startsWith('manga longa')) return 'Manga longa'
  if (name.startsWith('bermuda')) return 'Bermuda'
  if (name.startsWith('calça') || name.startsWith('calca')) return 'Calça'
  return piece.trim().slice(0, 30)
}

/** O que o montador deixa gravar: cada parte com nome e pelo menos um tipo. */
export const builderProblem = (mode: BuilderMode, parts: readonly PartDraft[]): string | null => {
  if (mode === 'unica') return null
  if (mode === 'kit' && parts.length < 2) return 'O conjunto ou kit precisa de pelo menos duas peças (uma E outra).'
  if (parts.some((part) => part.sizeChartIds.length === 0)) return 'Escolha pelo menos um tipo em cada peça.'
  if (parts.some((part) => part.label.trim() === '')) return 'Dê um nome a cada peça do conjunto.'
  const labels = parts.map((part) => part.label.trim().toLowerCase())
  if (new Set(labels).size !== labels.length) return 'Duas peças do conjunto com o mesmo nome.'
  return null
}

/** "Camiseta masculina ou Camiseta babylook + Shorts masculino ou Shorts feminino". */
export const builderSummary = (parts: readonly PartDraft[], charts: readonly Chart[]): string =>
  parts
    .filter((part) => part.sizeChartIds.length > 0)
    .map((part) =>
      part.sizeChartIds.map((id) => charts.find((chart) => chart.id === id)?.name ?? '?').join(' ou ')
    )
    .join(' + ')

const MODES: { mode: BuilderMode; title: string; example: string; icon: typeof Shirt }[] = [
  { mode: 'unica', title: 'Peça única', example: 'O cliente só diz tamanho e quantidade.', icon: Shirt },
  { mode: 'tipos', title: 'Peça com tipos', example: 'Ex.: shorts masculino OU feminino OU infantil.', icon: Shuffle },
  { mode: 'kit', title: 'Conjunto ou kit', example: 'Ex.: camiseta E shorts, cada um com seus tipos.', icon: Layers },
]

export const PieceBuilder = ({
  charts,
  mode,
  onMode,
  parts,
  onParts,
  chartIds,
  onChartIds,
  onChartCreated,
}: {
  charts: readonly Chart[]
  mode: BuilderMode
  onMode: (mode: BuilderMode) => void
  parts: PartDraft[]
  onParts: (parts: PartDraft[]) => void
  /** Peça única: as medidas que o cliente vê. */
  chartIds: string[]
  onChartIds: (ids: string[]) => void
  /** A peça nova cadastrada aqui (recarregar a lista). */
  onChartCreated: () => void
}) => {
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const nameOf = (id: string) => charts.find((chart) => chart.id === id)?.name ?? '?'
  const update = (key: string, change: Partial<PartDraft>) =>
    onParts(parts.map((part) => (part.key === key ? { ...part, ...change } : part)))
  const addOption = (part: PartDraft, id: string) =>
    update(part.key, {
      sizeChartIds: [...part.sizeChartIds, id],
      // O nome da parte vem do primeiro tipo, e a pessoa troca se quiser.
      ...(part.label.trim() === '' ? { label: labelFor(nameOf(id)) } : {}),
    })
  const choose = (next: BuilderMode) => {
    onMode(next)
    if (next === 'tipos' && parts.length === 0) onParts([blankPart()])
    if (next === 'tipos' && parts.length > 1) onParts(parts.slice(0, 1))
    if (next === 'kit') onParts([...parts, ...Array.from({ length: Math.max(0, 2 - parts.length) }, () => blankPart())])
  }
  const problem = builderProblem(mode, parts)

  return (
    <section>
      <h3 className="mb-1 text-sm font-extrabold">Como o cliente monta esta peça</h3>
      <p className="mb-3 text-xs text-muted">É o que aparece no link: o que ele escolhe e em quantas peças a ficha se divide.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map(({ mode: value, title, example, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            className={clsx(
              'rounded-2xl border-2 p-3 text-left transition',
              mode === value ? 'border-ink bg-lime' : 'border-line bg-white hover:border-ink/30'
            )}
          >
            <span className="flex items-center gap-2 text-sm font-extrabold">
              <Icon className="h-4 w-4" /> {title}
            </span>
            <span className="mt-1 block text-xs text-ink/70">{example}</span>
          </button>
        ))}
      </div>

      {mode === 'unica' && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-bold">Medidas que o cliente vê</p>
          <div className="flex flex-wrap gap-2">
            {charts.map((chart) => (
              <label key={chart.id} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={chartIds.includes(chart.id)}
                  onChange={(e) =>
                    onChartIds(e.target.checked ? [...chartIds, chart.id] : chartIds.filter((id) => id !== chart.id))
                  }
                />
                {chart.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {mode !== 'unica' && (
        <div className="mt-3">
          {parts.map((part, index) => (
            <div key={part.key}>
              {index > 0 && (
                <div className="my-2 flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-line" />
                  <span className="rounded-full bg-ink px-3 py-0.5 text-xs font-extrabold text-lime">E</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <div className="rounded-2xl bg-paper p-3">
                <div className="flex items-center gap-2">
                  <input
                    className="field h-9 max-w-[14rem] text-sm font-bold"
                    maxLength={30}
                    placeholder={mode === 'kit' ? 'Camisa, Shorts…' : 'Shorts'}
                    aria-label="Nome desta peça"
                    value={part.label}
                    onChange={(e) => update(part.key, { label: e.target.value })}
                  />
                  {mode === 'kit' && parts.length > 2 && (
                    <button
                      type="button"
                      title="Tirar esta peça do conjunto"
                      className="ml-auto rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                      onClick={() => onParts(parts.filter((entry) => entry.key !== part.key))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {part.sizeChartIds.map((id, at) => (
                    <span key={id} className="inline-flex items-center gap-2">
                      {at > 0 && <span className="text-[11px] font-extrabold text-muted">OU</span>}
                      <span className="inline-flex items-center gap-1 rounded-full border border-ink bg-white px-3 py-1 text-xs font-bold">
                        {nameOf(id)}
                        <button
                          type="button"
                          aria-label={`Tirar ${nameOf(id)}`}
                          className="text-muted hover:text-red-600"
                          onClick={() => update(part.key, { sizeChartIds: part.sizeChartIds.filter((entry) => entry !== id) })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </span>
                  ))}
                  <select
                    className="field h-9 w-auto py-1 text-xs"
                    value=""
                    aria-label="Acrescentar um tipo"
                    onChange={(e) => {
                      if (e.target.value === '__nova__') setCreatingFor(part.key)
                      else if (e.target.value) addOption(part, e.target.value)
                    }}
                  >
                    <option value="">{part.sizeChartIds.length === 0 ? '+ Escolher o tipo…' : '+ OU outro tipo…'}</option>
                    {charts
                      .filter((chart) => !part.sizeChartIds.includes(chart.id))
                      .map((chart) => (
                        <option key={chart.id} value={chart.id}>
                          {chart.name}
                        </option>
                      ))}
                    <option value="__nova__">+ Cadastrar peça nova…</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
          {mode === 'kit' && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => onParts([...parts, blankPart()])}
            >
              E outra peça
            </Button>
          )}
          {builderSummary(parts, charts) !== '' && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs">
              <strong>No link:</strong> {builderSummary(parts, charts)}
            </p>
          )}
          {problem && <p className="mt-2 text-xs font-bold text-amber-800">{problem}</p>}
        </div>
      )}

      <NewPieceDialog
        open={creatingFor !== null}
        onClose={() => setCreatingFor(null)}
        onCreated={(name, id) => {
          const part = parts.find((entry) => entry.key === creatingFor)
          setCreatingFor(null)
          onChartCreated()
          if (part)
            update(part.key, {
              sizeChartIds: [...part.sizeChartIds, id],
              ...(part.label.trim() === '' ? { label: labelFor(name) } : {}),
            })
        }}
      />
    </section>
  )
}
