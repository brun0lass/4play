import type { PublicIntakeResponseType } from '@/contracts/aeris/uniforms.ts'
import { clsx } from 'clsx'
import { CheckCircle2, Copy, Minus, Plus } from 'lucide-react'
import { useState } from 'react'

import { Button, Modal } from '@/components/ui'
import { int } from '@/lib/format'

/**
 * O conjunto preenchido por partes no link do cliente (F300): "a camisa de um
 * tamanho e o shorts de outro", o tipo de cada peça (babylook, shorts
 * feminino…) e o nome e o número de cada peça — a camisa "AMANDA 22", o
 * shorts só "22". Cada parte é uma peça da ficha.
 */

type Product = PublicIntakeResponseType['products'][number]
type Part = Product['parts'][number]
type Size = PublicIntakeResponseType['sizes'][number]

type KitPiece = { sizeChartId: string; size: Size | ''; name: string; number: string }
/** Um conjunto personalizado: uma peça de cada parte, cada uma com o seu nome e número. */
export type KitPerson = {
  key: number
  quantity: string
  pieces: Record<string, KitPiece>
}
export type KitCount = {
  key: number
  partId: string
  sizeChartId: string
  bySize: Partial<Record<Size, string>>
}
export type KitDraft = {
  people: KitPerson[]
  counts: KitCount[]
}

const ADULT: readonly string[] = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG']

// As chaves sobrevivem ao rascunho guardado no celular: começam do relógio.
let nextKey = Date.now()

const blankPiece = (part: Part): KitPiece => ({
  sizeChartId: part.options[0]?.sizeChartId ?? '',
  size: '',
  name: '',
  number: '',
})

const blankPerson = (parts: readonly Part[]): KitPerson => ({
  key: nextKey++,
  quantity: '1',
  pieces: Object.fromEntries(parts.map((part) => [part.id, blankPiece(part)])),
})

const blankCount = (part: Part, sizeChartId?: string): KitCount => ({
  key: nextKey++,
  partId: part.id,
  sizeChartId: sizeChartId ?? part.options[0]?.sizeChartId ?? '',
  bySize: {},
})

/** O conjunto novo: as grades sem nome, uma por parte. */
export const newKit = (product: Product): KitDraft => ({
  people: [],
  counts: product.parts.map((part) => blankCount(part)),
})

const personal = (piece: KitPiece | undefined) =>
  piece !== undefined && (piece.name.trim() !== '' || piece.number.trim() !== '')

const filledPerson = (person: KitPerson) =>
  Object.values(person.pieces).some((piece) => personal(piece) || piece.size !== '')

/** O conjunto tem alguma peça com nome ou número. */
export const kitNamed = (kit: KitDraft) =>
  kit.people.some((person) => Object.values(person.pieces).some(personal))

const quantityOf = (text: string) => Number(text) || 0

/** O total de cada parte e quantos conjuntos fecham (nulo quando não batem). */
export const kitTotals = (product: Product, kit: KitDraft) => {
  const people = kit.people
    .filter(filledPerson)
    .reduce((sum, person) => sum + Math.max(1, quantityOf(person.quantity)), 0)
  const perPart = product.parts.map((part) => ({
    part,
    total:
      people +
      kit.counts
        .filter((count) => count.partId === part.id)
        .reduce(
          (sum, count) => sum + Object.values(count.bySize).reduce((at, value) => at + quantityOf(value ?? ''), 0),
          0
        ),
  }))
  const first = perPart[0]?.total ?? 0
  const count = first > 0 && perPart.every((entry) => entry.total === first) ? first : null
  return { perPart, count, biggest: Math.max(0, ...perPart.map((entry) => entry.total)) }
}

/** O que falta para enviar: tamanho de alguma peça, ou as partes que não batem. */
export const kitProblem = (product: Product, kit: KitDraft): string | null => {
  const people = kit.people.filter(filledPerson)
  if (people.some((person) => product.parts.some((part) => (person.pieces[part.id]?.size ?? '') === '')))
    return `Falta o tamanho de alguma peça personalizada em ${product.name}.`
  const totals = kitTotals(product, kit)
  if (totals.biggest > 0 && totals.count === null)
    return `Em ${product.name}, cada conjunto tem uma peça de cada parte: ${totals.perPart
      .map((entry) => `${int(entry.total)} ${entry.part.label.toLowerCase()}`)
      .join(', ')}.`
  return null
}

/** As peças personalizadas, uma linha por peça: o que a personalização cobra. */
export const kitChargeRows = (product: Product, kit: KitDraft) =>
  kit.people.filter(filledPerson).flatMap((person) =>
    product.parts.flatMap((part) => {
      const piece = person.pieces[part.id]
      return piece && personal(piece)
        ? [
            {
              quantity: Math.max(1, quantityOf(person.quantity)),
              name: piece.name.trim() || null,
              number: piece.number.trim() || null,
            },
          ]
        : []
    })
  )

/** O conjunto na forma do envio (`IntakeKitSchema`). */
export const kitToSubmit = (product: Product, kit: KitDraft) => ({
  people: kit.people.filter(filledPerson).map((person) => ({
    quantity: Math.max(1, quantityOf(person.quantity)),
    pieces: product.parts.map((part) => {
      const piece = person.pieces[part.id] ?? blankPiece(part)
      return {
        partId: part.id,
        sizeChartId: piece.sizeChartId,
        size: piece.size as Size,
        name: piece.name.trim() || null,
        number: piece.number.trim() || null,
      }
    }),
  })),
  counts: kit.counts.flatMap((count) =>
    Object.entries(count.bySize)
      .filter(([, value]) => quantityOf(value ?? '') > 0)
      .map(([size, value]) => ({
        partId: count.partId,
        sizeChartId: count.sizeChartId,
        size: size as Size,
        quantity: quantityOf(value ?? ''),
      }))
  ),
})

const optionName = (part: Part, sizeChartId: string) =>
  part.options.find((option) => option.sizeChartId === sizeChartId)?.piece ?? part.label

/** "AMANDA 22", "22", "AMANDA" — o que vai na peça. */
const markOf = (piece: KitPiece | undefined) =>
  piece ? [piece.name.trim(), piece.number.trim()].filter(Boolean).join(' ') : ''

export const KitEditor = ({
  product,
  sizes,
  sizesOf,
  kit,
  onChange,
}: {
  product: Product
  sizes: readonly Size[]
  /** Os tamanhos da tabela de medidas do tipo; nulo quando ela não diz. */
  sizesOf: (sizeChartId: string) => readonly Size[] | null
  kit: KitDraft
  onChange: (kit: KitDraft) => void
}) => {
  const [allSizes, setAllSizes] = useState(false)
  const shownSizes = allSizes ? sizes : sizes.filter((size) => ADULT.includes(size))
  /**
   * Os tamanhos de um tipo: o tipo só infantil ("Shorts infantil") mostra os
   * dele (2 a 14); os outros, os de adulto (e todos com "mais tamanhos").
   */
  const sizesFor = (sizeChartId: string): readonly Size[] => {
    const own = sizesOf(sizeChartId)
    return own !== null && own.length > 0 && own.every((size) => !ADULT.includes(size)) ? own : shownSizes
  }
  const fields = product.fields
  // "Vai ter nome ou número?": sim abre a personalização; não a fecha.
  const [named, setNamedState] = useState(kit.people.length > 0)
  const setNamed = (value: boolean) => {
    if (value === named) return
    if (!value && kit.people.some(filledPerson)) {
      if (!window.confirm('Tirar os nomes e números já preenchidos?')) return
      onChange({ ...kit, people: [] })
    }
    setNamedState(value)
  }
  // O conjunto sendo preenchido na janela (novo ou um da lista).
  const [editing, setEditing] = useState<KitPerson | null>(null)
  const totals = kitTotals(product, kit)
  const updateCount = (key: number, patch: Partial<KitCount>) =>
    onChange({ ...kit, counts: kit.counts.map((count) => (count.key === key ? { ...count, ...patch } : count)) })
  const first = product.parts[0]

  return (
    <div className="mt-4 space-y-5 border-t border-line pt-4">
      {fields.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-extrabold">Vai ter nome ou número?</p>
          <div className="flex gap-2">
            {(
              [
                [true, 'Sim'],
                [false, 'Não'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setNamed(value)}
                className={clsx(
                  'flex-1 rounded-2xl border-2 px-4 py-2.5 text-sm font-extrabold',
                  named === value ? 'border-ink bg-lime' : 'border-line bg-white'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {fields.length > 0 && named && (
        <div>
          <p className="mb-1 text-xs font-extrabold tracking-wide uppercase">
            Personalização: {fields.map((f) => (f === 'nome' ? 'nome' : 'número')).join(' e ')}
          </p>
          <p className="mb-2 text-xs text-muted">Cada peça do conjunto pode ter o seu nome e número — ou nenhum.</p>
          <div className="space-y-2">
            {kit.people.map((person) => (
              <div key={person.key} className="flex items-center gap-2 rounded-2xl border border-line bg-white p-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(person)}>
                  {product.parts.map((part) => {
                    const piece = person.pieces[part.id]
                    return (
                      <span key={part.id} className="block truncate text-xs">
                        <strong>{piece ? optionName(part, piece.sizeChartId) : part.label}</strong> {piece?.size || '?'}
                        {markOf(piece) && <span className="text-muted"> · {markOf(piece)}</span>}
                      </span>
                    )
                  })}
                  {Number(person.quantity) > 1 && <span className="text-xs text-muted">{person.quantity} conjuntos</span>}
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...kit, people: kit.people.filter((entry) => entry.key !== person.key) })}
                  className="rounded-full p-2 text-muted hover:text-red-700"
                  aria-label="Tirar este conjunto"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEditing(blankPerson(product.parts))}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/30 p-3 text-sm font-extrabold hover:border-ink"
          >
            <Plus className="h-4 w-4" /> Adicionar personalizado
          </button>
        </div>
      )}

      <Modal
        open={editing !== null}
        title={editing && kit.people.some((person) => person.key === editing.key) ? 'Editar personalizado' : 'Novo personalizado'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              variant="lime"
              disabled={editing === null || product.parts.some((part) => (editing.pieces[part.id]?.size ?? '') === '')}
              onClick={() => {
                if (editing === null) return
                const known = kit.people.some((person) => person.key === editing.key)
                onChange({
                  ...kit,
                  people: known
                    ? kit.people.map((person) => (person.key === editing.key ? editing : person))
                    : [...kit.people, editing],
                })
                setEditing(null)
              }}
            >
              {editing && kit.people.some((person) => person.key === editing.key) ? 'Salvar' : 'Adicionar'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            {product.parts.map((part, index) => {
              const piece = editing.pieces[part.id] ?? blankPiece(part)
              // Funcional: dois toques seguidos (o tipo e o tamanho) não se atropelam.
              const setPiece = (patch: Partial<KitPiece>) =>
                setEditing((current) =>
                  current === null
                    ? current
                    : {
                        ...current,
                        pieces: {
                          ...current.pieces,
                          [part.id]: { ...blankPiece(part), ...current.pieces[part.id], ...patch },
                        },
                      }
                )
              const source = first ? editing.pieces[first.id] : undefined
              return (
                <div key={part.id} className="rounded-2xl bg-paper p-3">
                  <p className="text-sm font-extrabold">{part.label}</p>
                  {part.options.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {part.options.map((option) => (
                        <button
                          key={option.sizeChartId}
                          type="button"
                          // O tamanho que não existe no tipo novo (M no infantil) sai.
                          onClick={() =>
                            setPiece({
                              sizeChartId: option.sizeChartId,
                              ...(piece.size !== '' && !sizesFor(option.sizeChartId).includes(piece.size) ? { size: '' } : {}),
                            })
                          }
                          className={clsx(
                            'rounded-full border-2 px-3 py-1 text-xs font-bold',
                            piece.sizeChartId === option.sizeChartId ? 'border-ink bg-lime' : 'border-line bg-white'
                          )}
                        >
                          {option.piece}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sizesFor(piece.sizeChartId).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setPiece({ size })}
                        className={clsx(
                          'min-w-11 rounded-xl border-2 px-2 py-1.5 text-xs font-extrabold',
                          piece.size === size ? 'border-ink bg-ink text-lime' : 'border-line bg-white'
                        )}
                        aria-label={`${part.label} tamanho ${size}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {fields.includes('nome') && (
                      <input
                        value={piece.name}
                        onChange={(e) => {
                          const name = e.target.value
                          setPiece({ name })
                        }}
                        maxLength={80}
                        placeholder={`Nome na ${part.label.toLowerCase()} (opcional)`}
                        className="field min-w-0 flex-1 bg-white"
                        aria-label={`Nome em ${part.label}`}
                      />
                    )}
                    {fields.includes('numero') && (
                      <input
                        value={piece.number}
                        onChange={(e) => {
                          const number = e.target.value
                          setPiece({ number })
                        }}
                        maxLength={10}
                        inputMode="numeric"
                        placeholder="Nº"
                        className="field w-20 bg-white"
                        aria-label={`Número em ${part.label}`}
                      />
                    )}
                  </div>
                  {index > 0 && first && source && personal(source) && (
                    // Igual à primeira peça: só o nome, só o número, ou os dois.
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Copy className="h-3.5 w-3.5 text-muted" aria-hidden />
                      <span className="text-[11px] font-bold text-muted">Igual à {first.label.toLowerCase()}:</span>
                      {fields.includes('nome') && source.name.trim() && (
                        <CopyButton onClick={() => setPiece({ name: source.name })}>nome</CopyButton>
                      )}
                      {fields.includes('numero') && source.number.trim() && (
                        <CopyButton onClick={() => setPiece({ number: source.number })}>número</CopyButton>
                      )}
                      {fields.length > 1 && source.name.trim() && source.number.trim() && (
                        <CopyButton onClick={() => setPiece({ name: source.name, number: source.number })}>
                          nome e número
                        </CopyButton>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {!allSizes && (
              <button type="button" onClick={() => setAllSizes(true)} className="text-xs font-bold hover:underline">
                Mais tamanhos (G1–G4, infantil)
              </button>
            )}
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold">Quantos conjuntos iguais a este</span>
              <input
                value={editing.quantity}
                onChange={(e) => {
                  const quantity = e.target.value.replace(/\D/g, '')
                  setEditing((current) => (current === null ? current : { ...current, quantity }))
                }}
                inputMode="numeric"
                className="field w-16 text-center"
                aria-label="Quantos conjuntos"
              />
            </label>
          </div>
        )}
      </Modal>

      <div>
        <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Sem nome — quantas de cada peça, por tamanho</p>
        <div className="space-y-3">
          {product.parts.map((part) => (
            <div key={part.id} className="space-y-2">
              {kit.counts
                .filter((count) => count.partId === part.id)
                .map((count, index) => (
                  <div key={count.key} className="rounded-2xl bg-paper p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold">{part.label}</span>
                      {part.options.length > 1 ? (
                        <select
                          className="field h-9 w-auto py-1 text-xs"
                          value={count.sizeChartId}
                          onChange={(e) => updateCount(count.key, { sizeChartId: e.target.value })}
                          aria-label={`Tipo de ${part.label}`}
                        >
                          {part.options.map((option) => (
                            <option key={option.sizeChartId} value={option.sizeChartId}>
                              {option.piece}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted">{optionName(part, count.sizeChartId)}</span>
                      )}
                      {index > 0 && (
                        <button
                          type="button"
                          className="ml-auto text-xs font-bold text-muted hover:text-red-700"
                          onClick={() => onChange({ ...kit, counts: kit.counts.filter((entry) => entry.key !== count.key) })}
                        >
                          Tirar
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {sizesFor(count.sizeChartId).map((size) => (
                        <label key={size} className="block text-center">
                          <span className="text-xs font-extrabold">{size}</span>
                          <input
                            value={count.bySize[size] ?? ''}
                            onChange={(e) =>
                              updateCount(count.key, {
                                bySize: { ...count.bySize, [size]: e.target.value.replace(/\D/g, '') },
                              })
                            }
                            inputMode="numeric"
                            placeholder="0"
                            className="field mt-1 bg-white text-center"
                            aria-label={`${optionName(part, count.sizeChartId)} ${size} sem nome`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              {part.options.length > 1 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
                  onClick={() => {
                    const used = new Set(kit.counts.filter((count) => count.partId === part.id).map((count) => count.sizeChartId))
                    const next = part.options.find((option) => !used.has(option.sizeChartId))
                    onChange({ ...kit, counts: [...kit.counts, blankCount(part, next?.sizeChartId)] })
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Outro tipo de {part.label.toLowerCase()}
                </button>
              )}
            </div>
          ))}
        </div>
        {!allSizes && (
          <button type="button" onClick={() => setAllSizes(true)} className="mt-2 text-xs font-bold hover:underline">
            Mais tamanhos (G1–G4, infantil)
          </button>
        )}
      </div>

      <div
        className={clsx(
          'flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-bold',
          totals.biggest > 0 && totals.count === null ? 'bg-amber-100 text-amber-900' : 'bg-paper'
        )}
      >
        <span>{totals.perPart.map((entry) => `${entry.part.label}: ${int(entry.total)}`).join(' · ')}</span>
        {totals.count !== null ? (
          <span className="inline-flex items-center gap-1 text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> {int(totals.count)} conjunto(s)
          </span>
        ) : (
          totals.biggest > 0 && <span>As partes precisam bater</span>
        )}
      </div>
    </div>
  )
}

const CopyButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-full border border-ink bg-white px-2.5 py-0.5 text-[11px] font-bold hover:bg-lime"
  >
    {children}
  </button>
)
