import { clsx } from 'clsx'
import { Check, Plus, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  BLOCK_MAX,
  COMMON_COLORS,
  ColorDot,
  parseColors,
  serializeColors,
  swatchOf,
  type GradeColor,
} from '@/lib/grade-color'

/**
 * A cor da linha da grade: clicar em qualquer parte do campo abre a escolha.
 * Dá para marcar várias cores ("Preto e Vermelho"), escolher na lista, ou pôr
 * uma cor de fora dela com nome e RGB.
 *
 * A janela vai para o `body` (portal): a grade rola de lado e cortaria uma
 * janela presa dentro dela.
 */
export const ColorPicker = ({
  value,
  onChange,
  disabled,
}: {
  /** O texto do `block`: "Preto e Vermelho", "Azul piscina #00cfd5"… */
  value: string
  onChange: (block: string) => void
  disabled: boolean
}) => {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const colors = parseColors(value)
  const label = colors.map((c) => c.name || c.hex).join(' e ')

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={label || 'Escolher a cor'}
        className={clsx(
          'flex h-9 w-44 items-center gap-1.5 rounded-xl border bg-white px-2 text-left text-xs transition disabled:cursor-default disabled:text-ink/70',
          open ? 'border-ink' : 'border-line hover:border-ink/40'
        )}
      >
        {colors.length > 0 ? (
          <>
            <span className="inline-flex shrink-0 -space-x-1">
              {colors.map((c, i) => (
                <ColorDot key={i} color={swatchOf(c)} className="h-4 w-4" />
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{label}</span>
          </>
        ) : (
          <span className="flex-1 text-muted">{disabled ? '—' : 'Cor (opcional)'}</span>
        )}
      </button>
      {open && trigger.current && (
        <Popover anchor={trigger.current} onClose={() => setOpen(false)}>
          <ColorPanel colors={colors} onChange={(next) => onChange(serializeColors(next))} onDone={() => setOpen(false)} />
        </Popover>
      )}
    </>
  )
}

const Popover = ({
  anchor,
  onClose,
  children,
}: {
  anchor: HTMLElement
  onClose: () => void
  children: ReactNode
}) => {
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const width = 320
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const height = panel.current?.offsetHeight ?? 360
      const below = rect.bottom + 6
      const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Escolher as cores"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="fixed z-50 w-80 rounded-2xl border border-line bg-white p-3 shadow-xl"
    >
      {children}
    </div>,
    document.body
  )
}

export const ColorPanel = ({
  colors,
  onChange,
  onDone,
}: {
  colors: GradeColor[]
  onChange: (colors: GradeColor[]) => void
  onDone: () => void
}) => {
  const [name, setName] = useState('')
  const [hex, setHex] = useState('#00cfd5')
  const isOn = (n: string) => colors.some((c) => c.name.toLocaleLowerCase('pt-BR') === n.toLocaleLowerCase('pt-BR'))
  const fits = (next: GradeColor[]) => serializeColors(next).length <= BLOCK_MAX

  const toggle = (n: string) => {
    const next = isOn(n)
      ? colors.filter((c) => c.name.toLocaleLowerCase('pt-BR') !== n.toLocaleLowerCase('pt-BR'))
      : [...colors, { name: n, hex: null }]
    if (fits(next)) onChange(next)
  }
  const custom = [...colors, { name: name.trim(), hex }]
  const add = () => {
    if (!fits(custom)) return
    onChange(custom)
    setName('')
  }

  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="mb-1.5 font-extrabold tracking-wider text-muted uppercase">Cores da linha</p>
        {colors.length === 0 ? (
          <p className="text-muted">Nenhuma ainda. Marque uma ou mais abaixo.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {colors.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-paper py-0.5 pr-1 pl-1.5 font-bold">
                <ColorDot color={swatchOf(c)} />
                {c.name || c.hex}
                <button
                  type="button"
                  aria-label={`Tirar ${c.name || c.hex || 'a cor'}`}
                  className="rounded-full p-0.5 text-muted hover:bg-black/10 hover:text-ink"
                  onClick={() => onChange(colors.filter((_, j) => j !== i))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {COMMON_COLORS.map((c) => {
          const on = isOn(c.name)
          return (
            <button
              key={c.name}
              type="button"
              onClick={() => toggle(c.name)}
              className={clsx(
                'flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 text-[10px] leading-tight font-bold transition',
                on ? 'border-ink bg-lime/40' : 'border-transparent hover:border-line'
              )}
            >
              <span
                className="relative grid h-6 w-6 place-items-center rounded-full border border-ink/20"
                style={{ backgroundColor: c.hex }}
              >
                {on && <Check className="h-3.5 w-3.5 text-white mix-blend-difference" />}
              </span>
              {c.name}
            </button>
          )
        })}
      </div>

      <div>
        <p className="mb-1.5 font-extrabold tracking-wider text-muted uppercase">Outra cor</p>
        <div className="flex items-center gap-1.5">
          <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-ink/20" title="Escolher na paleta">
            <span className="absolute inset-0" style={{ backgroundColor: hex }} />
            <input
              type="color"
              aria-label="Escolher na paleta"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={hex}
              onChange={(e) => setHex(e.target.value.toLowerCase())}
            />
          </label>
          <input
            className="field h-8 min-w-0 flex-1 px-2 text-xs"
            placeholder="Nome (ex.: Azul piscina)"
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <button
            type="button"
            onClick={add}
            disabled={!fits(custom)}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-2.5 font-bold text-white disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Pôr
          </button>
        </div>
      </div>

      {!fits([...colors, { name: 'Verde escuro', hex: null }]) && (
        <p className="text-[11px] text-amber-700">Cabe pouco mais: o campo de cor tem até {BLOCK_MAX} letras.</p>
      )}

      <div className="flex justify-between border-t border-line pt-2">
        <button type="button" className="font-bold text-muted hover:text-ink" onClick={() => onChange([])}>
          Limpar
        </button>
        <button type="button" className="rounded-full bg-lime px-3 py-1 font-extrabold" onClick={onDone}>
          Pronto
        </button>
      </div>
    </div>
  )
}
