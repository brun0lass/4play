import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Search, UserPlus } from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'

import { createEntry, type Direction } from '@/api/finance'
import { fetchParties } from '@/api/store'
import { useAuth } from '@/auth/AuthProvider'
import { dayToInstant } from '@/components/finance/SettleDialog'
import { NewCustomerDialog } from '@/components/NewCustomerDialog'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { money, toDecimal } from '@/lib/format'
import { errorMessage } from '@/lib/http'

/**
 * Lançar uma conta: a pagar (tecido, tinta, aluguel, luz) ou a receber (fora
 * de um pedido). Parcelado vira um título por mês.
 */
export const NewEntryDialog = ({
  open,
  initialDirection,
  onClose,
}: {
  open: boolean
  initialDirection: Direction
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { session } = useAuth()
  const branchId = session?.context?.branchId ?? null
  const [direction, setDirection] = useState<Direction>(initialDirection)
  const [party, setParty] = useState<{ id: string; name: string } | null>(null)
  const [search, setSearch] = useState('')
  const [creatingParty, setCreatingParty] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState('')
  const [instalments, setInstalments] = useState(1)
  const [doc, setDoc] = useState('')

  useEffect(() => {
    if (!open) return
    setDirection(initialDirection)
    setParty(null)
    setSearch('')
    setDescription('')
    setAmount('')
    setDue('')
    setInstalments(1)
    setDoc('')
  }, [open, initialDirection])

  const deferred = useDeferredValue(search.trim())
  const parties = useQuery({
    queryKey: ['parties', 'any', deferred],
    queryFn: ({ signal }) => fetchParties({ search: deferred || undefined, pageSize: 6 }, signal),
    enabled: open && party === null,
    placeholderData: keepPreviousData,
  })

  const total = toDecimal(amount)
  const valid = party !== null && description.trim() !== '' && total !== null && Number(total) > 0 && due !== '' && branchId !== null

  const mutation = useMutation({
    mutationFn: () =>
      createEntry({
        branchId: branchId!,
        direction,
        partyId: party!.id,
        description: description.trim(),
        documentNumber: doc.trim() || null,
        totalAmount: total!,
        instalmentCount: instalments,
        firstDueAt: dayToInstant(due),
      }),
    onSuccess: (entries) => {
      toast(entries.length > 1 ? `${String(entries.length)} parcelas lançadas.` : 'Conta lançada.')
      void queryClient.invalidateQueries({ queryKey: ['finance'] })
      onClose()
    },
  })

  return (
    <>
      <Modal
        open={open && !creatingParty}
        title="Lançar conta"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="lime" busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>
              Lançar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1">
            {(
              [
                ['payable', 'A pagar'],
                ['receivable', 'A receber'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setDirection(key)}
                className={clsx('rounded-xl py-2 text-sm font-extrabold transition', direction === key ? 'bg-white shadow' : 'text-muted')}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <span className="label">{direction === 'payable' ? 'Para quem (fornecedor)' : 'De quem (cliente)'}</span>
            {party ? (
              <div className="flex items-center justify-between rounded-2xl border-2 border-ink bg-lime px-4 py-2.5">
                <span className="font-bold">{party.name}</span>
                <Button size="sm" variant="outline" onClick={() => setParty(null)}>Trocar</Button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procure pelo nome" className="field pl-9" />
                </div>
                <ul className="mt-1">
                  {parties.data?.items.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setParty({ id: p.id, name: p.tradeName ?? p.legalName })} className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-lime-50">
                        {p.tradeName ?? p.legalName}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setCreatingParty(true)} className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold hover:underline">
                  <UserPlus className="h-3.5 w-3.5" /> Cadastrar {direction === 'payable' ? 'fornecedor' : 'cliente'} novo
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="e-desc">Descrição</label>
            <input id="e-desc" maxLength={200} className="field" placeholder={direction === 'payable' ? 'Ex.: Tecido dry fit — rolo 50 m' : 'Ex.: Serviço de estampa avulso'} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="e-amount">Valor total (R$)</label>
              <input id="e-amount" inputMode="decimal" className="field font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="e-due">{instalments > 1 ? '1º vencimento' : 'Vencimento'}</label>
              <input id="e-due" type="date" className="field" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="e-inst">Parcelas</label>
              <select id="e-inst" className="field" value={instalments} onChange={(e) => setInstalments(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n === 1 ? 'À vista' : `${String(n)}x mensal`}</option>
                ))}
              </select>
            </div>
          </div>
          {instalments > 1 && total && (
            <p className="text-xs font-semibold text-muted">{instalments} parcelas de cerca de {money((Number(total) / instalments).toFixed(2))}, uma por mês.</p>
          )}
          <div>
            <label className="label" htmlFor="e-doc">Nº do documento / nota (opcional)</label>
            <input id="e-doc" maxLength={60} className="field" value={doc} onChange={(e) => setDoc(e.target.value)} />
          </div>
          {branchId === null && <ErrorBox message="Esta sessão não tem filial escolhida no Aeris — não dá para lançar." />}
          {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
        </div>
      </Modal>
      <NewCustomerDialog
        open={open && creatingParty}
        role={direction === 'payable' ? 'supplier' : 'customer'}
        initialName={search.trim()}
        onClose={() => setCreatingParty(false)}
        onCreated={(p) => setParty({ id: p.id, name: p.tradeName ?? p.legalName })}
      />
    </>
  )
}
