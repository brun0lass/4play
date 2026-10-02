import { clsx } from 'clsx'

/**
 * A marca 4Play. Lima e branca, feita para fundo ESCURO — em fundo claro, ponha
 * dentro de um bloco preto.
 *
 * O arquivo é `public/brand/4play.svg`: a logo da arte da parceria, vetorizada
 * (nítida em qualquer tamanho). Se a 4Play mandar o SVG original, basta
 * substituir o arquivo com o mesmo nome.
 */
export const Logo = ({ className }: { className?: string }) => (
  <img
    src="/brand/4play.svg"
    alt="4Play Uniformes"
    draggable={false}
    className={clsx('w-auto select-none', className ?? 'h-10')}
  />
)
