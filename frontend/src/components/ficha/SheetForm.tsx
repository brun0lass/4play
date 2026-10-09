import type { ProductionOrderResponseType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Headset } from 'lucide-react'

import { fetchFabrics, storeKeys } from '@/api/uniform-store'
import { saveSheet } from '@/api/uniforms'
import {
  SaveBar,
  Section,
  useDraft,
  useFichaSection,
} from '@/components/ficha/Section'
import { useToast } from '@/components/Toast'
import { useAccess } from '@/lib/access'
import { keys } from '@/lib/queries'
import {
  LOGISTICS_LABELS,
  PAYMENT_MARK_META,
  type Fabric,
  type Logistics,
  type PaymentMark,
} from '@/lib/uniforms'

type Order = ProductionOrderResponseType['order']

type Draft = {
  dispatchDate: string
  fabric: Fabric | ''
  personalized: boolean
  logistics: Logistics[]
  eventDate: string
  eventNote: string
  paymentMark: PaymentMark
  gradeChecked: boolean
  notes: string
}

const fromOrder = (order: Order): Draft => ({
  dispatchDate: order.dispatchDate ?? '',
  fabric: order.fabricId ?? '',
  personalized: order.personalized,
  logistics: [...order.logistics],
  eventDate: order.eventDate ?? '',
  eventNote: order.eventNote ?? '',
  paymentMark: order.paymentMark,
  gradeChecked: order.gradeChecked,
  notes: order.notes ?? '',
})

/** O cabeçalho da ficha — a parte do ATENDIMENTO. */
export const SheetForm = ({
  order,
  editable,
  readOnlyReason,
}: {
  order: Order
  editable: boolean
  readOnlyReason: string | null
}) => {
  const queryClient = useQueryClient()
  const fabrics = useQuery({
    queryKey: storeKeys.fabrics,
    queryFn: ({ signal }) => fetchFabrics(signal),
  })
  const { draft, setDraft, dirty, reset } = useDraft<Draft>(fromOrder(order))
  const { seeMoney } = useAccess()

  const toast = useToast()
  const doSave = (version: number) =>
    saveSheet(order.id, {
      version,
      dispatchDate: draft.dispatchDate || null,
      fabricId: draft.fabric || null,
      personalized: draft.personalized,
      logistics: draft.logistics,
      eventDate: draft.eventDate || null,
      eventNote: draft.eventNote || null,
      paymentMark: draft.paymentMark,
      gradeChecked: draft.gradeChecked,
      notes: draft.notes || null,
    })
  useFichaSection('sheet', 'Atendimento', dirty, doSave)

  const mutation = useMutation({
    mutationFn: () => doSave(order.sheetVersion),
    onSuccess: () => toast('Atendimento gravado.'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.order(order.id) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const disabled = !editable

  return (
    <Section title="Atendimento" icon={<Headset className="h-3.5 w-3.5" />}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="dispatch">
            Despacho
          </label>
          <input
            id="dispatch"
            type="date"
            className="field"
            disabled={disabled}
            value={draft.dispatchDate}
            onChange={(e) => set('dispatchDate', e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="fabric">
            Tecido
          </label>
          <select
            id="fabric"
            className="field"
            disabled={disabled}
            value={draft.fabric}
            onChange={(e) => set('fabric', e.target.value as Fabric | '')}
          >
            <option value="">? A definir</option>
            {order.fabricId &&
              !fabrics.data?.some((f) => f.id === order.fabricId) && (
                <option value={order.fabricId}>
                  {order.fabricName ?? 'Tecido arquivado'}
                </option>
              )}
            {fabrics.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.discontinued ? ' (descontinuado)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <span className="label">Logística</span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LOGISTICS_LABELS) as Logistics[]).map((value) => {
            const on = draft.logistics.includes(value)
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() =>
                  set(
                    'logistics',
                    on
                      ? draft.logistics.filter((v) => v !== value)
                      : [...draft.logistics, value]
                  )
                }
                className={clsx(
                  'rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-60',
                  on
                    ? 'border-ink bg-ink text-lime'
                    : 'border-line bg-white hover:border-ink/40'
                )}
              >
                {LOGISTICS_LABELS[value]}
              </button>
            )
          })}
        </div>
      </div>

      {seeMoney && (
        <div className="mt-3">
          <span className="label">Pagamento (anotação)</span>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-paper p-1">
            {(Object.keys(PAYMENT_MARK_META) as PaymentMark[]).map((value) => (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => set('paymentMark', value)}
                className={clsx(
                  'rounded-lg px-2 py-1.5 text-[11px] font-bold transition',
                  draft.paymentMark === value
                    ? 'bg-white shadow ring-1 ring-ink/10'
                    : 'text-muted hover:text-ink'
                )}
              >
                {PAYMENT_MARK_META[value].label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="eventDate">
            Data do evento
          </label>
          <input
            id="eventDate"
            type="date"
            className="field"
            disabled={disabled}
            value={draft.eventDate}
            onChange={(e) => set('eventDate', e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="eventNote">
            Evento
          </label>
          <input
            id="eventNote"
            className="field"
            maxLength={200}
            disabled={disabled}
            placeholder="Copa, torneio…"
            value={draft.eventNote}
            onChange={(e) => set('eventNote', e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4 accent-ink"
            disabled={disabled}
            checked={draft.personalized}
            onChange={(e) => set('personalized', e.target.checked)}
          />
          Personalizado (nome/número)
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4 accent-ink"
            disabled={disabled}
            checked={draft.gradeChecked}
            onChange={(e) => set('gradeChecked', e.target.checked)}
          />
          Grade conferida
        </label>
      </div>

      <div className="mt-3">
        <label className="label" htmlFor="notes">
          Observações
        </label>
        <textarea
          id="notes"
          rows={3}
          maxLength={2000}
          className="field resize-y"
          disabled={disabled}
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <SaveBar
        dirty={dirty}
        busy={mutation.isPending}
        saved={mutation.isSuccess}
        error={mutation.error}
        onSave={() => mutation.mutate()}
        onDiscard={() => {
          reset()
          mutation.reset()
        }}
        readOnlyReason={
          readOnlyReason ??
          (editable ? null : 'Só quem atende (ou gerencia) mexe aqui.')
        }
      />
    </Section>
  )
}
