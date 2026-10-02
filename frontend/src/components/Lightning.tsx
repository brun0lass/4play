import { clsx } from 'clsx'

/**
 * O fundo da arte da parceria: azul-marinho profundo com raios verde-limão nos
 * cantos e um pontilhado discreto. Só decoração — fica atrás do conteúdo.
 */
export const LightningBackdrop = ({ className }: { className?: string }) => (
  <div className={clsx('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(110% 80% at 88% 100%, rgb(24 80 200 / 0.38) 0%, transparent 58%), radial-gradient(90% 70% at 8% 0%, rgb(20 60 170 / 0.32) 0%, transparent 52%), linear-gradient(160deg, #040817 0%, #07123a 55%, #050d29 100%)',
      }}
    />
    <svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="bolt" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#b9dc00" />
          <stop offset="1" stopColor="#e6ff55" />
        </linearGradient>
        <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="#ffffff" />
        </pattern>
        <radialGradient id="dotfade" cx="0" cy="0" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="dotmask">
          <rect width="800" height="800" fill="url(#dotfade)" />
        </mask>
        <g id="bolts">
          {/* o raio grande e o menor, como na arte */}
          <polygon points="-20,330 250,70 205,70 470,-30 345,95 395,95 130,300 175,300 -20,420" fill="url(#bolt)" />
          <polygon points="-20,520 150,360 120,360 250,250 190,330 215,330 70,470 100,470 -20,560" fill="url(#bolt)" opacity="0.9" />
          <line x1="60" y1="120" x2="330" y2="-20" stroke="#cdee2a" strokeWidth="1.5" opacity="0.5" />
          <line x1="-10" y1="190" x2="190" y2="60" stroke="#cdee2a" strokeWidth="1" opacity="0.4" />
        </g>
      </defs>
      <rect width="800" height="800" fill="url(#dots)" mask="url(#dotmask)" opacity="0.35" />
      {/* Menores e encostados nos cantos: o centro e o rodapé ficam limpos para ler. */}
      <g transform="scale(0.6)">
        <use href="#bolts" />
      </g>
      <g transform="translate(800 800) rotate(180) scale(0.5)">
        <use href="#bolts" opacity="0.9" />
      </g>
    </svg>
  </div>
)
