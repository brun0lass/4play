import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { adjustStock, listMovements, recordEntry, recordExit, type Balance } from '@/api/inventory'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal, Spinner } from '@/components/ui'
import { UNIT_SHORT, dateTime, qty, toDecimal, toQuantity } from '@/lib/format'
import { errorMessage } from '@/lib/http'

export type MovementKind = 'entry' | 'exit' | 'adjust'

const META: Record<MovementKind, { title: string; verb: string; icon: typeof ArrowDownToLine; what: string }> = {
  entry: { title: 'Entrada', verb: 'Registrar entrada', icon: ArrowDownToLine, what: 'Chegou mercadoria: compra de tecido, tinta, peça pronta.' },
  exit: { title: 'Saída', verb: 'Registrar saída', icon: ArrowUpFromLine, what: 'Usou ou perdeu: consumo na produção, amostra, defeito.' },
  adjust: { title: 'Contagem', verb: 'Gravar contagem', icon: ClipboardCheck, what: 'Contou o que tem de verdade? O sistema acerta a diferença.' },
}

/** Movimentar o estoque de um item — o saldo nunca é digitado, é o resultado. */
export const MovementDialog = ({
  balance,
  kind,
  onClose,
}: {
  balance: Balance | null
  kind: MovementKind
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [quantity, setQuantity] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    setQuantity('')
    setCost('')
    setNote('')
  }, [balance, kind])

  const value = toQuantity(quantity)
  const unit = balance ? UNIT_SHORT[balance.unit] ?? balance.unit : ''
  const current = balance ? Number(balance.onHand) : 0
  const after =
    value === null ? null : kind === 'entry' ? current + Number(value) : kind === 'exit' ? current - Number(value) : Number(value)

  const mutation = useMutation({
    mutationFn: () => {
      const base = { variantId: balance!.variantId, branchId: balance!.branchId, note }
      if (kind === 'entry') return recordEntry({ ...base, quantity: value!, unitCost: toDecimal(cost) })
      if (kind === 'exit') return recordExit({ ...base, quantity: value! })
      return adjustStock({ ...base, counted: value! })
    },
    onSuccess: (r) => {
      toast(`${r.balance.productName}: agora ${qty(r.balance.onHand)} ${unit}.`)
      void queryClient.invalidateQueries({ queryKey: ['inventory'] })
      void queryClient.invalidateQueries({ queryKey: ['catalog'] })
      onClose()
    },
  })

  const meta = META[kind]
  const valid = value !== null && (kind === 'adjust' || Number(value) > 0) && (cost.trim() === '' || toDecimal(cost) !== null)

  return (
    <Modal
      open={balance !== null}
      title={`${meta.title} — ${balance?.productName ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="lime" busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>{meta.verb}</Button>
        </>
      }
    >
      {balance && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{meta.what}</p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-paper p-3">
              <p className="text-[11px] font-bold text-muted uppercase">Tem hoje</p>
              <p className="display text-2xl">{qty(balance.onHand)}</p>
              <p className="text-[11px] text-muted">{unit}</p>
            </div>
            <div className={clsx('rounded-2xl p-3', after !== null && after < 0 ? 'bg-red-100' : 'bg-lime')}>
              <p className="text-[11px] font-bold uppercase">Vai ficar</p>
              <p className="display text-2xl">{after === null ? '—' : qty(String(after))}</p>
              <p className="text-[11px]">{unit}</p>
            </div>
          </div>
          <div className={clsx('grid gap-3', kind === 'entry' && 'sm:grid-cols-2')}>
            <div>
              <label className="label" htmlFor="mv-q">{kind === 'adjust' ? `Quanto você contou (${unit})` : `Quantidade (${unit})`}</label>
              <input id="mv-q" autoFocus inputMode="decimal" className="field text-lg font-extrabold" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            {kind === 'entry' && (
              <div>
                <label className="label" htmlFor="mv-c">Custo por {unit} (R$, opcional)</label>
                <input id="mv-c" inputMode="decimal" className="field" value={cost} onChange={(e) => setCost(e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="mv-n">Observação</label>
            <input id="mv-n" maxLength={500} className="field" placeholder={kind === 'exit' ? 'Ex.: pedido #1041' : kind === 'entry' ? 'Ex.: NF 4521 — Malharia Minas' : 'Ex.: contagem de fim de mês'} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {after !== null && after < 0 && <p className="text-xs font-bold text-red-600">O saldo vai ficar negativo.</p>}
          {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
        </div>
      )}
    </Modal>
  )
}

const KIND_LABEL: Record<string, string> = {
  entry: 'Entrada',
  exit: 'Saída',
  adjustment: 'Contagem',
  transfer_out: 'Transferência (saiu)',
  transfer_in: 'Transferência (chegou)',
}
const SOURCE_LABEL: Record<string, string> = {
  manual: '',
  adjustment: '',
  transfer: '',
  sale: 'venda',
  purchase: 'compra',
  exchange: 'troca',
}

/** O extrato do item: cada entrada, saída e contagem, com quem fez. */
export const HistoryDialog = ({ balance, onClose }: { balance: Balance | null; onClose: () => void }) => {
  const movements = useQuery({
    queryKey: ['inventory', 'movements', balance?.variantId],
    queryFn: ({ signal }) => listMovements(balance!.variantId, signal),
    enabled: balance !== null,
  })
  return (
    <Modal open={balance !== null} wide title={`Histórico — ${balance?.productName ?? ''}`} onClose={onClose}>
      {movements.isPending && <Spinner />}
      {movements.isError && <ErrorBox message={errorMessage(movements.error)} />}
      {movements.data?.length === 0 && <p className="text-sm text-muted">Nenhum movimento ainda.</p>}
      {movements.data && movements.data.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] tracking-wider text-muted uppercase">
            <tr><th className="py-2">Quando</th><th>Movimento</th><th className="text-right">Qtd</th><th className="text-right">Saldo</th><th className="pl-4">Quem / obs.</th></tr>
          </thead>
          <tbody>
            {movements.data.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="py-2 whitespace-nowrap">{dateTime(m.occurredAt)}</td>
                <td>{KIND_LABEL[m.kind] ?? m.kind}{SOURCE_LABEL[m.sourceType] ? ` · ${SOURCE_LABEL[m.sourceType]}` : ''}</td>
                <td className={clsx('text-right font-bold', m.direction === 'in' ? 'text-emerald-700' : 'text-red-600')}>
                  {m.direction === 'in' ? '+' : '−'}{qty(m.quantity)}
                </td>
                <td className="text-right">{qty(m.onHandAfter)}</td>
                <td className="pl-4 text-xs text-muted">{[m.actorName, m.note].filter(Boolean).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
