import { clsx } from 'clsx'

/**
 * As cores de uma linha da grade. Na 4Play o que separa as linhas da grade é a
 * cor da peça — muitas vezes mais de uma: "Preto e Vermelho". O Aeris guarda
 * isso no campo `block` da linha (texto, até 60 letras, nunca vazio):
 *
 * - `Preto e Vermelho` — cores conhecidas vão só pelo nome (a bolinha vem da
 *   lista abaixo);
 * - `Azul piscina #00cfd5` — cor de fora da lista leva o RGB escolhido;
 * - `#00cfd5` — só o RGB;
 * - `—` — sem cor (o Aeris não aceita o campo vazio).
 *
 * As grades antigas, com o nome do modelo ("Camisa e Shorts Masc"), continuam
 * como estão: só mudam se alguém mexer nas cores daquela linha.
 */

export const NO_COLOR = '—'
export const BLOCK_MAX = 60

const HEX = /#[0-9a-f]{6}\b/i
const SEPARATOR = /\s+e\s+|\s*[,/+]\s*/i

/** As cores que a fábrica mais usa: o nome já pinta a bolinha. */
export const COMMON_COLORS: readonly { name: string; hex: string }[] = [
  { name: 'Branco', hex: '#ffffff' },
  { name: 'Preto', hex: '#111111' },
  { name: 'Cinza', hex: '#9ca3af' },
  { name: 'Vermelho', hex: '#dc2626' },
  { name: 'Vinho', hex: '#7f1d1d' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Amarelo', hex: '#facc15' },
  { name: 'Dourado', hex: '#c9a227' },
  { name: 'Verde limão', hex: '#d9ff22' },
  { name: 'Verde', hex: '#16a34a' },
  { name: 'Verde escuro', hex: '#14532d' },
  { name: 'Azul celeste', hex: '#7dd3fc' },
  { name: 'Azul royal', hex: '#1d4ed8' },
  { name: 'Azul marinho', hex: '#1e2a5a' },
  { name: 'Roxo', hex: '#7c3aed' },
]

const known = (name: string) =>
  COMMON_COLORS.find((c) => c.name.toLocaleLowerCase('pt-BR') === name.trim().toLocaleLowerCase('pt-BR'))

/** Uma cor da linha: o nome e o RGB escolhido (só nas cores de fora da lista). */
export type GradeColor = { name: string; hex: string | null }

export const parseColors = (block: string): GradeColor[] => {
  const text = block.trim()
  if (text === '' || text === NO_COLOR) return []
  return text
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const hex = HEX.exec(part)?.[0].toLowerCase() ?? null
      return { name: part.replace(HEX, '').replace(/\s+/g, ' ').trim(), hex }
    })
}

/** De volta para o `block`: vazio quando não há cor (quem grava põe o "—"). */
export const serializeColors = (colors: readonly GradeColor[]): string =>
  colors
    .map(({ name, hex }) => {
      const clean = name.replace(HEX, '').replace(/\s+/g, ' ').trim()
      const fromList = known(clean)
      // O nome da lista com outro RGB ("Azul royal" mais claro) guarda o RGB escolhido.
      if (fromList && (hex === null || hex.toLowerCase() === fromList.hex.toLowerCase())) return fromList.name
      return [fromList?.name ?? clean, hex].filter(Boolean).join(' ')
    })
    .filter(Boolean)
    .join(' e ')

/** O que vai para o Aeris. */
export const colorBlock = (block: string): string => block.trim() || NO_COLOR

/** A cor da bolinha: a escolhida, ou a do nome conhecido. */
export const swatchOf = ({ name, hex }: GradeColor): string | null => hex ?? known(name)?.hex ?? null

/** Para ler: "Preto e Vermelho", "#00cfd5" ou "" (sem cor). */
export const colorLabel = (block: string): string =>
  parseColors(block)
    .map((c) => c.name || c.hex || '')
    .filter(Boolean)
    .join(' e ')

export const ColorDot = ({ color, className }: { color: string | null; className?: string }) =>
  color ? (
    <span
      aria-hidden
      className={clsx('inline-block shrink-0 rounded-full border border-ink/25', className ?? 'h-3.5 w-3.5')}
      style={{ backgroundColor: color }}
    />
  ) : null

/** As bolinhas das cores de uma linha, uma ao lado da outra. */
export const ColorDots = ({ block, className }: { block: string; className?: string }) => (
  <span className="inline-flex shrink-0 -space-x-1">
    {parseColors(block).map((c, i) => (
      <ColorDot key={i} color={swatchOf(c)} className={className} />
    ))}
  </span>
)
