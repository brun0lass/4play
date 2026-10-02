import { clsx } from 'clsx'

/**
 * A marca 4Play desenhada em SVG: "4PLAY" itálico e pesado, com "UNIFORMES"
 * em cima do Y — o mesmo desenho do site. Verde-limão sobre preto por padrão.
 */
export const Logo = ({
  className,
  color = '#d9ff22',
  subColor = '#ffffff',
}: {
  className?: string
  color?: string
  subColor?: string
}) => (
  <svg
    viewBox="0 0 250 80"
    role="img"
    aria-label="4Play Uniformes"
    className={clsx('h-10 w-auto', className)}
  >
    <text
      x="4"
      y="68"
      fontFamily="Montserrat, 'Arial Black', sans-serif"
      fontWeight={900}
      fontStyle="italic"
      fontSize="74"
      letterSpacing="-5"
      fill={color}
    >
      4PLAY
    </text>
    <text
      x="246"
      y="16"
      textAnchor="end"
      fontFamily="Montserrat, 'Arial Black', sans-serif"
      fontWeight={900}
      fontStyle="italic"
      fontSize="13"
      letterSpacing="0.5"
      fill={subColor}
    >
      UNIFORMES
    </text>
  </svg>
)
