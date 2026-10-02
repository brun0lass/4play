import { clsx } from 'clsx'
import { Plus, Trash2 } from 'lucide-react'

import type { PaymentMethod } from '@/api/finance'
import type { Tender } from '@/api/orders'
import { Button } from '@/components/ui'
import { money, toDecimal } from '@/lib/format'

export type PayRow = { key: string; methodId: string; amount: string; instalments: number }

export const newRow = (amount = ''): PayRow => ({ key: crypto.randomUUID(), methodId: '', amount, instalments: 1 })

export const cents = (value: string | null): number => (value === null ? 0 : Math.round(Number(value) * 100))

/** O que foi digitado, em centavos (0 se inválido). */
export const rowsTotal = (rows: PayRow[]): number => rows.reduce((sum, r) => sum + cents(toDecimal(r.amount)), 0)

export const rowsValid = (rows: PayRow[]): boolean =>
  rows.length > 0 && rows.every((r) => r.methodId !== '' && toDecimal(r.amount) !== null && cents(toDecimal(r.amount)) > 0)

export const toTenders = (rows: PayRow[]): Tender[] =>
  rows.map((r) => ({ paymentMethodId: r.methodId, amount: toDecimal(r.amount) ?? '0.00', instalments: r.instalments }))

/**
 * Como o dinheiro entra: uma ou mais formas (Pix, cartão, dinheiro…), cada uma
 * com o seu valor. A soma tem de bater com o que está sendo cobrado.
 */
export const PaymentRows = ({
  methods,
  rows,
  onChange,
  target,
}: {
  methods: PaymentMethod[]
  rows: PayRow[]
  onChange: (rows: PayRow[]) => void
  /** O que deve ser cobrado, em centavos — para mostrar quanto falta. */
  target: number | null
}) => {
  const set = (key: string, patch: Partial<PayRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const left = target === null ? null : target - rowsTotal(rows)

  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const method = methods.find((m) => m.id === row.methodId)
        return (
          <div key={row.key} className="rounded-2xl bg-paper p-3">
            <div className="flex flex-wrap gap-1.5">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => set(row.key, { methodId: m.id, instalments: 1 })}
                  className={clsx(
                    'rounded-full border px-3.5 py-2 text-xs font-bold transition',
                    row.methodId === m.id ? 'border-ink bg-ink text-lime' : 'border-line bg-white hover:border-ink/40'
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-40">
                <label className="label" htmlFor={`pay-${row.key}`}>Valor (R$)</label>
                <input
                  id={`pay-${row.key}`}
                  inputMode="decimal"
                  className={clsx('field font-extrabold', row.amount !== '' && toDecimal(row.amount) === null && 'border-red-400')}
                  value={row.amount}
                  onChange={(e) => set(row.key, { amount: e.target.value })}
                />
              </div>
              {method && method.maxInstalments > 1 && (
                <div>
                  <label className="label" htmlFor={`inst-${row.key}`}>Parcelas</label>
                  <select id={`inst-${row.key}`} className="field" value={row.instalments} onChange={(e) => set(row.key, { instalments: Number(e.target.value) })}>
                    {Array.from({ length: Math.min(method.maxInstalments, 12) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n === 1 ? 'À vista' : `${String(n)}x`}</option>
                    ))}
                  </select>
                </div>
              )}
              {rows.length > 1 && (
                <button type="button" title="Tirar esta forma" aria-label={`Tirar forma ${String(index + 1)}`} onClick={() => onChange(rows.filter((r) => r.key !== row.key))} className="mb-1 rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...rows, newRow(left && left > 0 ? (left / 100).toFixed(2).replace('.', ',') : '')])}>
          Outra forma
        </Button>
        {left !== null && (
          <span className={clsx('text-xs font-extrabold', left === 0 ? 'text-emerald-700' : 'text-amber-700')}>
            {left === 0 ? 'Valor confere' : left > 0 ? `Faltam ${money((left / 100).toFixed(2))}` : `Passou ${money((-left / 100).toFixed(2))}`}
          </span>
        )}
      </div>
    </div>
  )
}
