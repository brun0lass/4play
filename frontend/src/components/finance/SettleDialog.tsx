import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchEntry, fetchOpenCashSession, fetchPaymentMethods, settleEntry, type Entry } from '@/api/finance'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { dateTime, day, decimalToInput, money, toDecimal, todaySP } from '@/lib/format'
import { UserError, errorMessage } from '@/lib/http'

/** `AAAA-MM-DD` → instante ao meio-dia de São Paulo (o Aeris guarda um instante). */
export const dayToInstant = (value: string) => `${value}T12:00:00-03:00`

/**
 * Dar baixa: registrar que o dinheiro entrou (ou saiu).
 * Parcial vale — o título fica aberto com o que falta.
 */
export const SettleDialog = ({ entry, onClose }: { entry: Entry | null; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { session } = useAuth()
  const branchId = session?.context?.branchId ?? null
  const [amount, setAmount] = useState('')
  const [methodId, setMethodId] = useState('')
  const [date, setDate] = useState(todaySP())
  const [extras, setExtras] = useState(false)
  const [interest, setInterest] = useState('')
  const [discount, setDiscount] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!entry) return
    setAmount(decimalToInput(entry.outstanding))
    setMethodId(entry.expectedMethodId ?? '')
    setDate(todaySP())
    setExtras(false)
    setInterest('')
    setDiscount('')
    setNote('')
  }, [entry])

  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: ({ signal }) => fetchPaymentMethods(signal), staleTime: 300_000, enabled: entry !== null })
  const detail = useQuery({
    queryKey: ['finance', 'entry', entry?.id],
    queryFn: ({ signal }) => fetchEntry(entry!.id, signal),
    enabled: entry !== null && entry.settlementCount > 0,
  })

  const method = methods.data?.find((m) => m.id === methodId)

  const mutation = useMutation({
    mutationFn: async () => {
      if (!entry || !branchId) throw new UserError('Escolha uma filial no Aeris antes de dar baixa.')
      let cashSessionId: string | null = null
      if (method?.kind === 'cash') {
        cashSessionId = await fetchOpenCashSession(branchId).catch(() => null)
        if (!cashSessionId) throw new UserError('Baixa em dinheiro precisa de um caixa aberto. Abra o caixa no Aeris ou escolha outra forma.')
      }
      return settleEntry(entry.id, {
        version: entry.version,
        branchId,
        paymentMethodId: methodId,
        amount: toDecimal(amount) ?? '0.00',
        interestAmount: toDecimal(interest) ?? '0.00',
        discountAmount: toDecimal(discount) ?? '0.00',
        settledOn: dayToInstant(date),
        note: note.trim() || null,
        cashSessionId,
      })
    },
    onSuccess: (updated) => {
      toast(
        updated.status === 'settled'
          ? `Baixa feita — ${updated.partyName} quitado.`
          : `Baixa parcial feita — faltam ${money(updated.outstanding)}.`
      )
      void queryClient.invalidateQueries({ queryKey: ['finance'] })
      onClose()
    },
  })

  const value = toDecimal(amount)
  const tooMuch = value !== null && entry !== null && Number(value) > Number(entry.outstanding)
  const valid = value !== null && Number(value) > 0 && methodId !== '' && !tooMuch
  const receiving = entry?.direction === 'receivable'

  return (
    <Modal
      open={entry !== null}
      title={receiving ? 'Receber' : 'Pagar'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="lime" busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>
            {receiving ? 'Confirmar recebimento' : 'Confirmar pagamento'}
          </Button>
        </>
      }
    >
      {entry && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-paper p-4">
            <p className="font-extrabold">{entry.partyName}</p>
            <p className="text-sm text-muted">
              {entry.description}
              {entry.instalmentCount > 1 && ` · parcela ${String(entry.instalmentNumber)}/${String(entry.instalmentCount)}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>Vence <strong>{day(entry.dueAt)}</strong></span>
              <span>Valor <strong>{money(entry.amount)}</strong></span>
              <span>Em aberto <strong className="text-ink">{money(entry.outstanding)}</strong></span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-amount">{receiving ? 'Valor recebido (R$)' : 'Valor pago (R$)'}</label>
              <input id="s-amount" inputMode="decimal" className={clsx('field text-lg font-extrabold', (value === null || tooMuch) && 'border-red-400')} value={amount} onChange={(e) => setAmount(e.target.value)} />
              {tooMuch && <p className="mt-1 text-xs font-bold text-red-600">Maior do que o que está em aberto.</p>}
              {value !== null && !tooMuch && Number(value) < Number(entry.outstanding) && (
                <p className="mt-1 text-xs font-semibold text-amber-700">Baixa parcial: ficam {money((Number(entry.outstanding) - Number(value)).toFixed(2))} em aberto.</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="s-date">Data</label>
              <input id="s-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <span className="label">Forma de pagamento</span>
            <div className="flex flex-wrap gap-1.5">
              {methods.data?.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethodId(m.id)}
                  className={clsx(
                    'rounded-full border px-3.5 py-2 text-xs font-bold transition',
                    methodId === m.id ? 'border-ink bg-ink text-lime' : 'border-line bg-white hover:border-ink/40'
                  )}
                >
                  {m.name}
                </button>
              ))}
              {methods.isPending && <span className="text-xs text-muted">Carregando…</span>}
              {methods.isError && <span className="text-xs text-red-600">{errorMessage(methods.error)}</span>}
            </div>
          </div>

          <button type="button" onClick={() => setExtras((v) => !v)} className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-ink">
            <ChevronDown className={clsx('h-4 w-4 transition', extras && 'rotate-180')} /> Juros, desconto ou observação
          </button>
          {extras && (
            <div className="grid gap-3 rounded-2xl bg-paper p-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="s-int">Juros / multa (R$)</label>
                <input id="s-int" inputMode="decimal" className="field" value={interest} onChange={(e) => setInterest(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="s-disc">Desconto (R$)</label>
                <input id="s-disc" inputMode="decimal" className="field" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="s-note">Observação</label>
                <input id="s-note" maxLength={500} className="field" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          )}

          {detail.data && detail.data.settlements.length > 0 && (
            <div>
              <span className="label">Baixas anteriores</span>
              <ul className="space-y-1 text-xs">
                {detail.data.settlements.map((s) => (
                  <li key={s.id} className={clsx('flex justify-between rounded-lg bg-paper px-3 py-2', s.isReversed && 'line-through opacity-50')}>
                    <span>{dateTime(s.settledOn)} · {s.paymentMethodName ?? '—'}</span>
                    <strong>{money(s.paidAmount)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
        </div>
      )}
    </Modal>
  )
}
