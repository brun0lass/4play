/** Formatação brasileira. Dinheiro chega como string decimal (ADR-0016 do Aeris). */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const INT = new Intl.NumberFormat('pt-BR')

export const money = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? BRL.format(n) : value
}

export const int = (value: number): string => INT.format(value)

/** `AAAA-MM-DD` → `dd/mm` (ou `dd/mm/aa` fora do ano corrente). É um dia, não um instante. */
export const day = (value: string | null | undefined): string => {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return y === String(new Date().getFullYear()) ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`
}

export const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export const ago = (iso: string): string => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${String(minutes)} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${String(hours)} h`
  const days = Math.round(hours / 24)
  return days === 1 ? 'ontem' : `há ${String(days)} dias`
}

/** Dias inteiros desde um instante. */
export const daysSince = (iso: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))

/** Hoje em São Paulo, `AAAA-MM-DD`. */
export const todaySP = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/** Quantos dias faltam até um `AAAA-MM-DD` (negativo = atrasado). */
export const daysUntil = (dayText: string): number => {
  const today = new Date(`${todaySP()}T00:00:00`)
  const target = new Date(`${dayText.slice(0, 10)}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export const initials = (name: string | null | undefined): string =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

/**
 * O que a pessoa digita em reais ("35,90", "1.234,5", "R$ 40") no formato da
 * API ("35.90"). `null` quando não é um valor.
 */
export const toDecimal = (text: string): string | null => {
  const clean = text.replace(/[R$\s]/g, '')
  if (clean === '') return null
  const normalised = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalised)) return null
  return Number(normalised).toFixed(2)
}

/** `"35.90"` → `"35,90"`, para pôr de volta num campo. */
export const decimalToInput = (value: string | null | undefined): string =>
  value ? Number(value).toFixed(2).replace('.', ',') : ''

/** Quantidade digitada ("12,5", "3") no formato da API ("12.5"). `null` se inválida. */
export const toQuantity = (text: string): string | null => {
  const clean = text.trim().replace(/\./g, '').replace(',', '.')
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(clean)) return null
  return clean
}

const QTY = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

/** `"12.500000"` → `"12,5"`. */
export const qty = (value: string | null | undefined): string =>
  value === null || value === undefined || value === '' ? '—' : QTY.format(Number(value))

export const UNIT_LABELS: Record<string, string> = {
  UN: 'unidade',
  PC: 'peça',
  CX: 'caixa',
  PAR: 'par',
  KIT: 'kit',
  KG: 'quilo',
  G: 'grama',
  L: 'litro',
  ML: 'ml',
  M: 'metro',
  CM: 'cm',
  M2: 'm²',
  M3: 'm³',
}

/** A unidade abreviada, para ir junto de um número: "62,5 m". */
export const UNIT_SHORT: Record<string, string> = {
  UN: 'un',
  PC: 'pç',
  CX: 'cx',
  PAR: 'par',
  KIT: 'kit',
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'ml',
  M: 'm',
  CM: 'cm',
  M2: 'm²',
  M3: 'm³',
}
