import { clsx } from 'clsx'

import { Logo } from '@/components/Logo'

/**
 * A parceria 4Play × Aeris One.
 *
 * Duas composições, as duas para fundo escuro:
 *  - `stacked`: a 4Play em cima, o "×" entre dois fios (lima e azul) e o Aeris
 *    One embaixo — a arte da parceria, usada no login e no menu;
 *  - `inline`: tudo numa linha, para barras estreitas.
 *
 * Os arquivos ficam em `public/brand/` (`4play.png`, `aeris-one.png`,
 * `aeris-mark.png`) e podem ser trocados pelos originais sem mexer no código.
 */

const STACK = {
  lg: { play: 'h-28 sm:h-32', aeris: 'h-14 sm:h-[4.75rem]', gap: 'gap-5', cross: 'w-72 sm:w-80' },
  md: { play: 'h-20', aeris: 'h-12', gap: 'gap-4', cross: 'w-60' },
  sm: { play: 'h-10', aeris: 'h-7', gap: 'gap-2.5', cross: 'w-44' },
} as const

const Cross = ({ className }: { className?: string }) => (
  <div className={clsx('flex items-center gap-3', className)} aria-hidden>
    <span className="h-px flex-1 bg-gradient-to-r from-transparent to-lime" />
    <span className="text-2xl leading-none font-light text-white/90">×</span>
    <span className="h-px flex-1 bg-gradient-to-l from-transparent to-sky-400" />
  </div>
)

export const CoBrand = ({
  size = 'md',
  layout = 'stacked',
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  layout?: 'stacked' | 'inline'
  className?: string
}) => {
  if (layout === 'inline') {
    return (
      <div className={clsx('flex items-center gap-3', className)}>
        <Logo className="h-8" />
        <span className="text-base font-light text-white/70" aria-hidden>×</span>
        <img src="/brand/aeris-mark.png" alt="Aeris One" draggable={false} className="h-7 w-auto select-none" />
      </div>
    )
  }
  const s = STACK[size]
  return (
    <div className={clsx('flex flex-col items-center', s.gap, className)}>
      <Logo className={s.play} />
      <Cross className={s.cross} />
      <img
        src="/brand/aeris-one.png"
        alt="Aeris One — Sistema de Gestão"
        draggable={false}
        className={clsx('w-auto select-none', s.aeris)}
      />
    </div>
  )
}
