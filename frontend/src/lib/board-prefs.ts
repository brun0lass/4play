import { useCallback, useState } from 'react'

import type { Stage } from '@/lib/uniforms'

/**
 * Como cada pessoa quer ver o quadro — neste navegador.
 *
 * É preferência de VISÃO, não configuração da empresa: o operador da costura
 * esconde "Arte", a designer esconde as etapas da fábrica, e ninguém muda o
 * quadro de ninguém. As etapas em si (nome, ordem, regras) são do Aeris.
 */
export type BoardPrefs = {
  hidden: Stage[]
  collapseEmpty: boolean
  compact: boolean
}

const KEY = '4play.quadro'
const DEFAULT: BoardPrefs = { hidden: [], collapseEmpty: false, compact: false }

const read = (): BoardPrefs => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<BoardPrefs>) } : DEFAULT
  } catch {
    return DEFAULT
  }
}

export const useBoardPrefs = () => {
  const [prefs, setPrefs] = useState<BoardPrefs>(read)
  const update = useCallback((patch: Partial<BoardPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* sem armazenamento: vale só até recarregar */
      }
      return next
    })
  }, [])
  return { prefs, update }
}
