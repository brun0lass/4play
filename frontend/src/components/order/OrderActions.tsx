import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Ban, CircleDollarSign, HandCoins, PackageCheck, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchPaymentMethods } from '@/api/finance'
import {
  cancelOrder,
  depositOrder,
  dispatchOrder,
  fetchDepositOptions,
  pickupOrder,
  updateOrderLines,
} from '@/api/orders'
import { confirmOrder } from '@/api/sales'
import { fetchParties } from '@/api/store'
import { useAuth } from '@/auth/AuthProvider'
import { Section } from '@/components/ficha/Section'
import { cents, newRow, PaymentRows, rowsTotal, rowsValid, toTenders, type PayRow } from '@/components/order/PaymentRows'
import { ProductPicker } from '@/components/ProductPicker'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { decimalToInput, int, money, toDecimal } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys } from '@/lib/queries'
import { useSalesDocument } from '@/lib/order-lines'

type Action = 'deposit' | 'dispatch' | 'pickup' | 'edit' | 'cancel' | null

/**
 * Pagamento e saída do pedido: receber o sinal, despachar, o cliente retirar,
 * editar os itens ou cancelar.
 *
 * Quem pode o quê é regra do Aeris, e a tela só esconde o que o servidor
 * recusaria:
 *  - sinal e retirada: `sales.deposit` (o atendente) — mas sem caixa só se a
 *    empresa estiver como "loja sem caixa"; com caixa, é do caixa/gerente;
 *  - despachar: `pos.operate` (caixa, gerente, administrador, dono) — e, na
 *    loja sem caixa, também quem recebe o sinal (F220 do Aeris);
 *  - cancelar: `sales.cancel`.
 */
export const OrderActions = ({
  orderId,
  blockedReason = null,
}: {
  orderId: string
  /** Por que o pedido ainda não pode sair — as levas que faltam (F230). */
  blockedReason?: string | null
}) => {
  const { can } = useAuth()
  const doc = useSalesDocument(orderId)
  const options = useQuery({
    queryKey: ['deposit-options'],
    queryFn: ({ signal }) => fetchDepositOptions(signal),
    enabled: can('sales.deposit'),
    staleTime: 60_000,
  })
  const [action, setAction] = useState<Action>(null)

  if (doc.isPending) return null
  if (doc.isError) return <Section title="Pagamento e saída"><ErrorBox message={errorMessage(doc.error)} /></Section>

  const d = doc.data
  const open = d.status === 'confirmed' || d.status === 'draft'
  const total = d.totalAmount
  const paid = d.paidAmount
  const remaining = d.outstandingAmount
  const usesTill = options.data?.usesTill ?? true
  const openTill = options.data?.tills[0]?.id ?? null
  const canDeposit = can('sales.deposit')
  const blocked = blockedReason !== null
  const canPickup = !blocked && ((can('pos.operate') && can('payment.write')) || (!usesTill && canDeposit))
  const canDispatch = !blocked && (can('pos.operate') || (!usesTill && canDeposit))
  const confirmed = d.status === 'confirmed'

  return (
    <Section title="Pagamento e saída" icon={<CircleDollarSign className="h-3.5 w-3.5" />}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Figure label="Total" value={money(total)} />
        <Figure label="Já pago" value={money(paid)} good={Number(paid) > 0} />
        <Figure label="Falta" value={money(remaining)} warn={Number(remaining) > 0} />
      </div>

      {!open ? (
        <p className="mt-4 text-xs font-semibold text-muted">Este pedido já saiu da fila. Para mexer, use o Aeris.</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {d.status === 'draft' && <ConfirmButton id={orderId} version={d.version} />}
          {confirmed && canDeposit && Number(remaining) > 0 && (
            <Button variant="lime" icon={<HandCoins className="h-4 w-4" />} onClick={() => setAction('deposit')}>Receber sinal / pagamento</Button>
          )}
          {confirmed && canPickup && (
            <Button variant="ink" icon={<PackageCheck className="h-4 w-4" />} onClick={() => setAction('pickup')}>Cliente retirou</Button>
          )}
          {confirmed && canDispatch && (
            <Button variant="ink" icon={<Send className="h-4 w-4" />} onClick={() => setAction('dispatch')}>Despachar (Correios, Uber, van)</Button>
          )}
          {confirmed && blocked && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">{blockedReason}</p>
          )}
          {confirmed && !blocked && !canPickup && !canDispatch && (
            <p className="text-xs font-semibold text-muted">Despachar e dar a retirada é com o financeiro/caixa ou o gerente.</p>
          )}
          <div className="flex gap-2">
            {d.editScope === 'lines' && (
              <Button variant="outline" size="sm" className="flex-1" icon={<Pencil className="h-4 w-4" />} onClick={() => setAction('edit')}>Editar itens</Button>
            )}
            {d.allowedTransitions.includes('cancelled') && can('sales.cancel') && (
              <Button variant="outline" size="sm" className="flex-1 text-red-700" icon={<Ban className="h-4 w-4" />} onClick={() => setAction('cancel')}>Cancelar pedido</Button>
            )}
          </div>
        </div>
      )}

      {canDeposit && !usesTill ? null : canDeposit && options.data && usesTill && !openTill && open && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">
          Esta empresa está configurada para exigir <strong>caixa aberto</strong> para receber. Como a 4Play não usa caixa,
          peça ao dono para marcar "loja sem caixa" em <em>Configurações → Empresa</em> no Aeris.
        </p>
      )}

      <PayDialog kind="deposit" open={action === 'deposit'} onClose={() => setAction(null)} orderId={orderId} version={d.version} remaining={remaining} till={usesTill ? openTill : null} />
      <PayDialog kind="pickup" open={action === 'pickup'} onClose={() => setAction(null)} orderId={orderId} version={d.version} remaining={remaining} till={usesTill ? openTill : null} />
      <DispatchDialog open={action === 'dispatch'} onClose={() => setAction(null)} orderId={orderId} version={d.version} remaining={remaining} />
      <CancelDialog open={action === 'cancel'} onClose={() => setAction(null)} orderId={orderId} version={d.version} paid={paid} />
      <EditDialog open={action === 'edit'} onClose={() => setAction(null)} orderId={orderId} version={d.version} lines={d.lines} />
    </Section>
  )
}

const Figure = ({ label, value, good, warn }: { label: string; value: string; good?: boolean; warn?: boolean }) => (
  <div className={clsx('rounded-2xl p-3', warn ? 'bg-amber-100' : good ? 'bg-lime' : 'bg-paper')}>
    <p className="text-[10px] font-extrabold tracking-wide uppercase opacity-70">{label}</p>
    <p className="text-sm font-extrabold">{value}</p>
  </div>
)

/** Depois de qualquer ação: o pedido, a fila e o financeiro se atualizam. */
const useRefresh = (orderId: string) => {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['sales-document', orderId] })
    void queryClient.invalidateQueries({ queryKey: keys.order(orderId) })
    void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    void queryClient.invalidateQueries({ queryKey: ['finance'] })
  }
}

const ConfirmButton = ({ id, version }: { id: string; version: number }) => {
  const refresh = useRefresh(id)
  const toast = useToast()
  const m = useMutation({
    mutationFn: () => confirmOrder(id, version),
    onSuccess: (doc) => {
      toast(`Pedido #${String(doc.number)} confirmado — entrou na fila.`)
      refresh()
    },
  })
  return (
    <>
      <Button variant="lime" busy={m.isPending} onClick={() => m.mutate()}>Confirmar pedido (rascunho)</Button>
      {m.isError && <ErrorBox message={errorMessage(m.error)} />}
    </>
  )
}

/** Sinal ou retirada: o mesmo formulário de pagamento, com consequências diferentes. */
const PayDialog = ({
  kind,
  open,
  onClose,
  orderId,
  version,
  remaining,
  till,
}: {
  kind: 'deposit' | 'pickup'
  open: boolean
  onClose: () => void
  orderId: string
  version: number
  remaining: string
  till: string | null
}) => {
  const refresh = useRefresh(orderId)
  const toast = useToast()
  const [rows, setRows] = useState<PayRow[]>([newRow()])
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: ({ signal }) => fetchPaymentMethods(signal), staleTime: 300_000, enabled: open })
  const due = cents(remaining)
  const nothingToPay = kind === 'pickup' && due <= 0

  useEffect(() => {
    if (open) setRows([newRow(due > 0 ? decimalToInput(remaining) : '')])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const m = useMutation({
    mutationFn: () => {
      const payments = nothingToPay ? [] : toTenders(rows)
      return kind === 'deposit'
        ? depositOrder(orderId, { payments, cashSessionId: till })
        : pickupOrder(orderId, { version, payments, cashSessionId: till })
    },
    onSuccess: () => {
      toast(kind === 'deposit' ? 'Pagamento registrado.' : 'Retirada registrada — o pedido saiu da fila.')
      refresh()
      onClose()
    },
  })

  const total = rowsTotal(rows)
  // Sinal pode ser parcial; a retirada fecha o pedido, então tem de cobrir o que falta.
  const valid = nothingToPay || (rowsValid(rows) && total > 0 && (kind === 'deposit' ? total <= due : total === due))

  return (
    <Modal
      open={open}
      title={kind === 'deposit' ? 'Receber sinal / pagamento' : 'Cliente retirou'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="lime" busy={m.isPending} disabled={!valid} onClick={() => m.mutate()}>
            {kind === 'deposit' ? 'Registrar pagamento' : nothingToPay ? 'Confirmar retirada' : 'Receber e dar saída'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {kind === 'deposit'
            ? 'Registra o dinheiro que o cliente pagou. O pedido continua na fila.'
            : 'O cliente leva o pedido agora. Ele sai da fila e a mercadoria sai do estoque.'}
        </p>
        <div className="rounded-2xl bg-paper p-4 text-center">
          <p className="text-[11px] font-bold text-muted uppercase">Falta pagar</p>
          <p className="display text-3xl">{money(remaining)}</p>
        </div>
        {nothingToPay ? (
          <p className="rounded-xl bg-lime-50 p-3 text-sm font-semibold">Este pedido já está pago por inteiro. É só confirmar a retirada.</p>
        ) : (
          <PaymentRows methods={methods.data ?? []} rows={rows} onChange={setRows} target={kind === 'pickup' ? due : null} />
        )}
        {kind === 'deposit' && total > due && <p className="text-xs font-bold text-red-600">O sinal não pode passar do que falta pagar.</p>}
        {m.isError && <ErrorBox message={errorMessage(m.error)} />}
      </div>
    </Modal>
  )
}

const DispatchDialog = ({
  open,
  onClose,
  orderId,
  version,
  remaining,
}: {
  open: boolean
  onClose: () => void
  orderId: string
  version: number
  remaining: string
}) => {
  const refresh = useRefresh(orderId)
  const toast = useToast()
  const [courier, setCourier] = useState('')
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: ({ signal }) => fetchParties({ role: 'courier', pageSize: 30 }, signal), enabled: open, staleTime: 300_000 })

  useEffect(() => {
    if (open) setCourier('')
  }, [open])

  const m = useMutation({
    mutationFn: () => dispatchOrder(orderId, version, courier || null),
    onSuccess: () => {
      toast('Pedido despachado — saiu da fila.')
      refresh()
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title="Despachar pedido"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="lime" busy={m.isPending} onClick={() => m.mutate()}>Despachar</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p>
          A mercadoria sai, o pedido <strong>sai da fila de produção</strong>
          {Number(remaining) > 0 ? (
            <> e o que ainda falta ({money(remaining)}) vira uma <strong>conta a receber</strong> no Financeiro.</>
          ) : (
            <>. O pedido já está pago por inteiro.</>
          )}
        </p>
        {(couriers.data?.items.length ?? 0) > 0 && (
          <div>
            <label className="label" htmlFor="courier">Quem levou (opcional)</label>
            <select id="courier" className="field" value={courier} onChange={(e) => setCourier(e.target.value)}>
              <option value="">Correios / transportadora / não informar</option>
              {couriers.data?.items.map((c) => <option key={c.id} value={c.id}>{c.tradeName ?? c.legalName}</option>)}
            </select>
          </div>
        )}
        {m.isError && <ErrorBox message={errorMessage(m.error)} />}
      </div>
    </Modal>
  )
}

const CancelDialog = ({
  open,
  onClose,
  orderId,
  version,
  paid,
}: {
  open: boolean
  onClose: () => void
  orderId: string
  version: number
  paid: string
}) => {
  const refresh = useRefresh(orderId)
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [resolution, setResolution] = useState<'refund' | 'voucher'>('voucher')
  const hasPaid = Number(paid) > 0

  useEffect(() => {
    if (open) {
      setReason('')
      setResolution('voucher')
    }
  }, [open])

  const m = useMutation({
    mutationFn: () => cancelOrder(orderId, { version, reason: reason.trim(), paidResolution: hasPaid ? resolution : null }),
    onSuccess: () => {
      toast('Pedido cancelado.')
      refresh()
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      title="Cancelar pedido"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button variant="danger" busy={m.isPending} disabled={reason.trim() === ''} onClick={() => m.mutate()}>Cancelar o pedido</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">O pedido sai da fila e <strong>não dá para desfazer</strong>.</p>
        <div>
          <label className="label" htmlFor="cancel-reason">Motivo *</label>
          <input id="cancel-reason" autoFocus maxLength={500} className="field" placeholder="Ex.: cliente desistiu" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {hasPaid && (
          <div>
            <span className="label">O cliente já pagou {money(paid)}. O que fazer com o dinheiro?</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['voucher', 'Vira vale', 'Fica de crédito para uma próxima compra.'],
                  ['refund', 'Devolver', 'O dinheiro volta ao cliente.'],
                ] as const
              ).map(([key, title, what]) => (
                <button key={key} type="button" onClick={() => setResolution(key)} className={clsx('rounded-2xl border-2 p-3 text-left transition', resolution === key ? 'border-ink bg-lime' : 'border-line hover:border-ink/30')}>
                  <p className="text-sm font-extrabold">{title}</p>
                  <p className="text-[11px] text-ink/70">{what}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        {m.isError && <ErrorBox message={errorMessage(m.error)} />}
      </div>
    </Modal>
  )
}

type EditLine = {
  key: string
  variantId: string
  description: string
  unit: string
  quantity: string
  price: string
  discountAmount: string
  priceListId: string | null
}

const EditDialog = ({
  open,
  onClose,
  orderId,
  version,
  lines,
}: {
  open: boolean
  onClose: () => void
  orderId: string
  version: number
  lines: { variantId: string; description: string; unit: string; quantity: string; unitPrice: string; discountAmount: string; priceListId: string | null }[]
}) => {
  const refresh = useRefresh(orderId)
  const toast = useToast()
  const { can } = useAuth()
  const [rows, setRows] = useState<EditLine[]>([])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!open) return
    setAdding(false)
    setRows(
      lines.map((l) => ({
        key: crypto.randomUUID(),
        variantId: l.variantId,
        description: l.description,
        unit: l.unit,
        quantity: String(Number(l.quantity)),
        price: decimalToInput(l.unitPrice),
        discountAmount: l.discountAmount,
        priceListId: l.priceListId,
      }))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (key: string, patch: Partial<EditLine>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const m = useMutation({
    mutationFn: () =>
      updateOrderLines(orderId, {
        version,
        lines: rows.map((r) => ({
          variantId: r.variantId,
          description: r.description,
          unit: r.unit,
          unitPrice: toDecimal(r.price) ?? '0.00',
          quantity: String(Number(r.quantity)),
          discountAmount: r.discountAmount,
          priceListId: r.priceListId,
          priceBasis: 'manual' as const,
        })),
      }),
    onSuccess: () => {
      toast('Itens do pedido atualizados.')
      refresh()
      onClose()
    },
  })

  const valid = rows.length > 0 && rows.every((r) => Number(r.quantity) > 0 && toDecimal(r.price) !== null)
  const total = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * Number(toDecimal(r.price) ?? 0), 0)
  const pieces = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)

  return (
    <Modal
      open={open}
      wide
      title="Editar itens do pedido"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="lime" busy={m.isPending} disabled={!valid} onClick={() => m.mutate()}>Salvar itens</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">Mude a quantidade ou o preço, tire um item ou acrescente outro. O total é recalculado.</p>
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-2xl bg-paper p-3 sm:grid-cols-[1fr_90px_120px_auto]">
            <div className="col-span-2 sm:col-span-1">
              <span className="label">Produto</span>
              <p className="text-sm font-bold">{r.description}</p>
            </div>
            <div>
              <label className="label" htmlFor={`eq-${r.key}`}>Peças</label>
              <input id={`eq-${r.key}`} inputMode="numeric" className="field text-center font-bold" value={r.quantity} onChange={(e) => set(r.key, { quantity: e.target.value.replace(/\D/g, '') })} />
            </div>
            <div>
              <label className="label" htmlFor={`ep-${r.key}`}>R$ por peça</label>
              <input id={`ep-${r.key}`} inputMode="decimal" className={clsx('field', toDecimal(r.price) === null && 'border-red-400')} value={r.price} onChange={(e) => set(r.key, { price: e.target.value })} />
            </div>
            <button type="button" title="Tirar" aria-label={`Tirar ${r.description}`} disabled={rows.length === 1} onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))} className="mb-1 rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {adding ? (
          <ProductPicker
            onPick={(p) => {
              setRows((all) => [...all, { key: crypto.randomUUID(), variantId: p.variantId, description: p.description, unit: p.unit, quantity: '1', price: decimalToInput(p.basePrice), discountAmount: '0.00', priceListId: null }])
              setAdding(false)
            }}
          />
        ) : (
          <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Outro produto</Button>
        )}
        {!can('catalog.write') && adding && <p className="text-[11px] text-muted">Produto que não existe só o gerente ou o dono cadastram.</p>}
        <div className="flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white">
          <span className="text-sm font-bold">{int(pieces)} peças</span>
          <span className="display text-2xl text-lime">{money(total.toFixed(2))}</span>
        </div>
        {m.isError && <ErrorBox message={errorMessage(m.error)} />}
      </div>
    </Modal>
  )
}
