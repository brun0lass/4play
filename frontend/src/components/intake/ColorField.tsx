import { clsx } from 'clsx'
import { Palette } from 'lucide-react'
import { useState } from 'react'

import { ColorPanel } from '@/components/ficha/ColorPicker'
import { ColorDot, colorLabel, parseColors, serializeColors, swatchOf } from '@/lib/grade-color'

/**
 * A cor de uma linha no link do cliente (10/11): o botão fica na linha da
 * peça, como a cor da linha na ficha, e aceita mais de uma cor ("Preto e
 * Vermelho"). A escolha abre embaixo, na própria tela — no celular, uma
 * janela por cima atrapalha.
 */
export const ColorButton = ({
  value,
  label,
  open,
  onToggle,
  className,
}: {
  /** O texto da cor da grade; vazio, a loja combina com o cliente. */
  value: string
  /** De que peça é a cor: "Camiseta masculina". */
  label: string
  open: boolean
  onToggle: () => void
  className?: string
}) => {
  const colors = parseColors(value)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={colors.length > 0 ? `Cor de ${label}: ${colorLabel(value)}` : `Escolher a cor de ${label}`}
      title={colors.length > 0 ? colorLabel(value) : undefined}
      className={clsx(
        'inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-xl border bg-white px-2.5 text-xs font-semibold',
        open ? 'border-ink' : colors.length === 0 ? 'border-dashed border-ink/40 text-ink/70' : 'border-line',
        className
      )}
    >
      {colors.length > 0 ? (
        <>
          <span className="inline-flex shrink-0 -space-x-1">
            {colors.map((c, i) => (
              <ColorDot key={i} color={swatchOf(c)} className="h-4 w-4" />
            ))}
          </span>
          <span className="truncate">{colorLabel(value)}</span>
        </>
      ) : (
        <>
          <Palette className="h-3.5 w-3.5 shrink-0" /> Cor
        </>
      )}
    </button>
  )
}

/** O painel das cores, na largura toda da linha (`basis-full` num `flex-wrap`). */
export const ColorPanelBlock = ({
  value,
  label,
  onChange,
  onDone,
}: {
  value: string
  label: string
  onChange: (block: string) => void
  onDone: () => void
}) => (
  <div className="basis-full rounded-xl border border-line bg-white p-3">
    <ColorPanel
      title={`Cores — ${label}`}
      colors={parseColors(value)}
      onChange={(next) => onChange(serializeColors(next))}
      onDone={onDone}
    />
  </div>
)

/** O botão e o painel juntos. Use dentro de um `flex flex-wrap`: o painel ocupa a linha inteira. */
export const ColorField = ({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (block: string) => void
  label: string
}) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ColorButton value={value} label={label} open={open} onToggle={() => setOpen((current) => !current)} />
      {open && <ColorPanelBlock value={value} label={label} onChange={onChange} onDone={() => setOpen(false)} />}
    </>
  )
}
