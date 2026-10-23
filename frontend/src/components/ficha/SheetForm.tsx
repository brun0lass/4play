import type { ProductionOrderResponseType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Headset } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchFabrics, storeKeys } from '@/api/uniform-store'
import { changeOrderSalesperson } from '@/api/orders'
import { assignDesigner, saveSheet } from '@/api/uniforms'
import { useAuth } from '@/auth/AuthProvider'
import {
  SaveBar,
  DraftRecovery,
  Section,
  tracked,
  useDraft,
  useFichaSection,
} from '@/components/ficha/Section'
import {
  DeliveryAddressFields,
  addressDraftOf,
  addressToSave,
  type AddressDraft,
} from '@/components/ficha/DeliveryAddress'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox } from '@/components/ui'
import { useAccess } from '@/lib/access'
import { decimalToInput, money, toDecimal } from '@/lib/format'
import { UserError, errorMessage } from '@/lib/http'
import { useSalesDocument } from '@/lib/order-lines'
import { keys, useMembers } from '@/lib/queries'
import {
  LOGISTICS_LABELS,
  PAYMENT_MARK_META,
  type Fabric,
  type Logistics,
  type PaymentMark,
  totalWithFreight,
} from '@/lib/uniforms'

type Order = ProductionOrderResponseType['order']

type Draft = {
  dispatchDate: string
  fabric: Fabric | ''
  /** O acabamento do tecido (F303); vazio é "não marcado". */
  finish: string
  personalized: boolean
  logistics: Logistics[]
  eventDate: string
  eventNote: string
  paymentMark: PaymentMark
  gradeChecked: boolean
  notes: string
  /** O local de entrega (F280). */
  address: AddressDraft
  /** O frete (F296), como a pessoa digita: "90,50". Vazio é sem frete. */
  freight: string
  freightCharged: boolean
}

const fromOrder = (order: Order): Draft => ({
  dispatchDate: order.dispatchDate ?? '',
  fabric: order.fabricId ?? '',
  finish: order.fabricFinish ?? '',
  personalized: order.personalized,
  logistics: [...order.logistics],
  eventDate: order.eventDate ?? '',
  eventNote: order.eventNote ?? '',
  paymentMark: order.paymentMark,
  gradeChecked: order.gradeChecked,
  notes: order.notes ?? '',
  address: addressDraftOf(order.deliveryAddress),
  freight: decimalToInput(order.freight?.amount),
  freightCharged: order.freight?.charged ?? false,
})

/** O frete que vai para o Aeris: nulo sem valor (ou zero); `'invalido'` se não é um valor. */
const freightToSave = (draft: Draft): { amount: string; charged: boolean } | null | 'invalido' => {
  if (draft.freight.trim() === '') return null
  const amount = toDecimal(draft.freight)
  if (amount === null) return 'invalido'
  return Number(amount) > 0 ? { amount, charged: draft.freightCharged } : null
}

/**
 * Como o atendimento fica gravado: o Aeris apara os textos (um Enter no fim da
 * observação) e o endereço. Endereço pela metade não grava — fica como está.
 */
const asSaved = (draft: Draft): Draft => {
  const address = addressToSave(draft.address)
  const freight = freightToSave(draft)
  return {
    ...draft,
    eventNote: draft.eventNote.trim(),
    notes: draft.notes.trim(),
    address: address === 'incompleto' ? draft.address : addressDraftOf(address),
    ...(freight === 'invalido'
      ? {}
      : { freight: decimalToInput(freight?.amount), freightCharged: freight?.charged ?? false }),
  }
}

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
  const { draft, setDraft, dirty, reset, recovery } = useDraft<Draft>(
    fromOrder(order),
    { orderId: order.id, section: 'atendimento' },
    asSaved
  )
  const { seeMoney } = useAccess()
  const { can } = useAuth()
  // O endereço do cadastro, para começar dele (só quem lê vendas o vê).
  const doc = useSalesDocument(can('sales.read') ? order.id : undefined)
  const parts = doc.data?.customerContact?.addressParts ?? null
  const customerAddress =
    parts?.street && parts.city && parts.state
      ? {
          cep: parts.postalCode?.replace(/\D/g, '') || null,
          street: parts.street,
          number: parts.number,
          complement: parts.complement,
          district: parts.district,
          city: parts.city,
          uf: parts.state,
        }
      : null

  const toast = useToast()
  const send = tracked(order.id, 'atendimento', (version: number) =>
    saveSheet(order.id, {
      version,
      dispatchDate: draft.dispatchDate || null,
      fabricId: draft.fabric || null,
      fabricFinish: draft.finish || null,
      personalized: draft.personalized,
      logistics: draft.logistics,
      eventDate: draft.eventDate || null,
      eventNote: draft.eventNote || null,
      paymentMark: draft.paymentMark,
      gradeChecked: draft.gradeChecked,
      notes: draft.notes || null,
      deliveryAddress: addressToSave(draft.address) as Exclude<ReturnType<typeof addressToSave>, 'incompleto'>,
      // Quem não vê dinheiro não mexe no frete (o Aeris também ignora).
      ...(seeMoney ? { freight: freightToSave(draft) as Exclude<ReturnType<typeof freightToSave>, 'invalido'> } : {}),
    })
  )
  // Endereço pela metade não grava calado (F280): diz o que falta.
  const doSave = (version: number) =>
    addressToSave(draft.address) === 'incompleto'
      ? Promise.reject(
          new UserError('Para gravar o local de entrega, preencha a rua, a cidade e a UF (ou deixe o endereço todo em branco).')
        )
      : seeMoney && freightToSave(draft) === 'invalido'
        ? Promise.reject(new UserError('O frete precisa ser um valor, como 90 ou 90,50 (ou fique em branco).'))
        : send(version)
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

  // Os acabamentos do tecido escolhido (F303) — e o já marcado, mesmo que o
  // tecido não tenha mais.
  const finishes = [
    ...(fabrics.data?.find((f) => f.id === draft.fabric)?.finishes ?? []),
  ]
  if (
    draft.finish &&
    draft.fabric === (order.fabricId ?? '') &&
    draft.finish === order.fabricFinish &&
    !finishes.includes(draft.finish)
  )
    finishes.push(draft.finish)
  const pickFabric = (fabric: Fabric | '') =>
    setDraft((current) => {
      const next = fabrics.data?.find((f) => f.id === fabric)?.finishes ?? []
      return {
        ...current,
        fabric,
        finish: next.includes(current.finish) ? current.finish : '',
      }
    })

  return (
    <Section title="Atendimento" icon={<Headset className="h-3.5 w-3.5" />}>
      {editable && <DraftRecovery recovery={recovery} />}
      <SalespersonField order={order} />
      <DesignerField order={order} editable={editable} />
      <div className="mt-3 grid grid-cols-2 gap-3">
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
            onChange={(e) => pickFabric(e.target.value as Fabric | '')}
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

      {finishes.length > 0 && (
        <div className="mt-3">
          <span className="label">Acabamento do tecido</span>
          <div className="flex flex-wrap gap-1.5">
            {finishes.map((value) => {
              const on = draft.finish === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  // Tocar no marcado desmarca: vazio é "não marcado".
                  onClick={() => set('finish', on ? '' : value)}
                  className={clsx(
                    'rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-60',
                    on
                      ? 'border-ink bg-ink text-lime'
                      : 'border-line bg-white hover:border-ink/40'
                  )}
                >
                  {value}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
        <span className="label">Local de entrega</span>
        <DeliveryAddressFields
          value={draft.address}
          onChange={(address) => setDraft((current) => ({ ...current, address }))}
          disabled={disabled}
          customerAddress={customerAddress}
        />
      </div>

      {seeMoney && (
        <div className="mt-3">
          <label className="label" htmlFor="freight">
            Frete
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-36">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">R$</span>
              <input
                id="freight"
                inputMode="decimal"
                className="field pl-9"
                maxLength={14}
                disabled={disabled}
                placeholder="0,00"
                value={draft.freight}
                onChange={(e) => set('freight', e.target.value)}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink"
                disabled={disabled || draft.freight.trim() === ''}
                checked={draft.freightCharged && draft.freight.trim() !== ''}
                onChange={(e) => set('freightCharged', e.target.checked)}
              />
              Repassar ao cliente (soma no total)
            </label>
          </div>
          <p className="mt-1 text-xs text-muted">
            {draft.freightCharged && draft.freight.trim() !== '' && order.totalAmount !== null && toDecimal(draft.freight) !== null
              ? `Total com frete: ${money(totalWithFreight({ totalAmount: order.totalAmount, freight: { amount: toDecimal(draft.freight) ?? '0', charged: true } }))}.`
              : 'Sem repassar, o frete fica só como custo, para a loja saber.'}
          </p>
        </div>
      )}

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

/**
 * O vendedor do pedido. Não é da ficha: é do pedido de vendas do Aeris, que
 * tem a versão dele — por isso grava sozinho, fora do "Gravar" do bloco.
 *
 * Num pedido já confirmado, só quem altera pedido (`sales.amend`: gerente,
 * admin, dono) troca; o Aeris guarda o antes e o depois na auditoria.
 */
const SalespersonField = ({ order }: { order: Order }) => {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()
  const members = useMembers()
  const doc = useSalesDocument(order.id)
  const current = order.salespersonUserId ?? ''
  const [choice, setChoice] = useState(current)
  useEffect(() => setChoice(current), [current])

  const canChange =
    doc.data !== undefined &&
    (doc.data.status === 'draft' || can('sales.amend'))

  const mutation = useMutation({
    mutationFn: () =>
      changeOrderSalesperson(order.id, {
        version: doc.data!.version,
        salespersonUserId: choice || null,
        reason: 'Vendedor trocado na ficha do pedido',
      }),
    onSuccess: () => toast('Vendedor trocado.'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales-document', order.id] })
      void queryClient.invalidateQueries({ queryKey: keys.order(order.id) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  const known = members.data?.some((m) => m.userId === current) ?? false
  const changed = choice !== current

  return (
    <div>
      <label className="label" htmlFor="salesperson">
        Vendedor
      </label>
      <div className="flex gap-2">
        <select
          id="salesperson"
          className="field"
          disabled={!canChange || mutation.isPending}
          value={choice}
          onChange={(e) => {
            mutation.reset()
            setChoice(e.target.value)
          }}
        >
          <option value="">Ninguém</option>
          {current && !known && (
            <option value={current}>{order.salespersonName ?? 'Vendedor atual'}</option>
          )}
          {members.data?.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        {changed && (
          <>
            <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => setChoice(current)}>
              Desfazer
            </Button>
            <Button variant="lime" size="sm" busy={mutation.isPending} onClick={() => mutation.mutate()}>
              Trocar
            </Button>
          </>
        )}
      </div>
      {doc.data && !canChange && (
        <p className="mt-1 text-[11px] font-semibold text-muted">
          Só o gerente, o admin ou o dono trocam o vendedor de um pedido confirmado.
        </p>
      )}
      {mutation.isError && (
        <div className="mt-2">
          <ErrorBox message={errorMessage(mutation.error)} />
        </div>
      )}
    </div>
  )
}

/**
 * Quem vai fazer a arte (F304), escolhido já no atendimento: quando o pedido
 * for para a arte, cai na fila dele. Grava na hora, como o vendedor.
 */
const DesignerField = ({ order, editable }: { order: Order; editable: boolean }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const members = useMembers()
  const current = order.designerUserId ?? ''
  const [choice, setChoice] = useState(current)
  useEffect(() => setChoice(current), [current])

  const mutation = useMutation({
    mutationFn: () => assignDesigner(order.id, choice || null),
    onSuccess: () => toast(choice ? 'Designer escolhido.' : 'Designer tirado.'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.order(order.id) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  const designers = members.data?.filter((m) => m.functions.includes('arte') || m.userId === current) ?? []
  const known = designers.some((m) => m.userId === current)
  const changed = choice !== current

  return (
    <div className="mt-3">
      <label className="label" htmlFor="sheet-designer">
        Designer
      </label>
      <div className="flex gap-2">
        <select
          id="sheet-designer"
          className="field"
          disabled={!editable || mutation.isPending}
          value={choice}
          onChange={(e) => {
            mutation.reset()
            setChoice(e.target.value)
          }}
        >
          <option value="">Ninguém ainda</option>
          {current && !known && <option value={current}>{order.designerName ?? 'Designer atual'}</option>}
          {designers.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        {changed && (
          <>
            <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => setChoice(current)}>
              Desfazer
            </Button>
            <Button variant="lime" size="sm" busy={mutation.isPending} onClick={() => mutation.mutate()}>
              Gravar
            </Button>
          </>
        )}
      </div>
      {mutation.isError && (
        <div className="mt-2">
          <ErrorBox message={errorMessage(mutation.error)} />
        </div>
      )}
    </div>
  )
}
