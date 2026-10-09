import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { confirmOrder, createOrder, uuidv7 } from '@/api/sales'
import { fetchCustomers } from '@/api/store'
import { saveSheet } from '@/api/uniforms'
import { fetchFabrics, storeKeys } from '@/api/uniform-store'
import { useAuth } from '@/auth/AuthProvider'
import { NewCustomerDialog } from '@/components/NewCustomerDialog'
import { ProductPicker, type PickedProduct } from '@/components/ProductPicker'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { decimalToInput, int, money, toDecimal } from '@/lib/format'
import { UserError, errorMessage } from '@/lib/http'
import { keys, useMembers } from '@/lib/queries'
import {
  LOGISTICS_LABELS,
  PAYMENT_MARK_META,
  type Fabric,
  type Logistics,
  type PaymentMark,
} from '@/lib/uniforms'

/**
 * Novo pedido em três passos, na ordem em que o atendimento conversa com o
 * cliente: quem é → o que vai levar → para quando.
 *
 * Por baixo: cria o pedido de venda no Aeris, confirma (é aí que ele ganha
 * número e entra na fila, na etapa Atendimento) e grava a ficha de produção.
 */

type Customer = { id: string; name: string; city: string | null }
type Line = PickedProduct & {
  key: string
  quantity: string
  price: string
  automaticPrice: boolean
}

const STEPS = ['Cliente', 'Peças e valores', 'Prazo e detalhes'] as const

const lineTotal = (line: Line): number =>
  (Number(line.quantity) || 0) * Number(toDecimal(line.price) ?? 0)

export const NewOrderWizard = ({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { session } = useAuth()
  const members = useMembers()
  const fabrics = useQuery({
    queryKey: storeKeys.fabrics,
    queryFn: ({ signal }) => fetchFabrics(signal),
    enabled: open,
  })

  const [step, setStep] = useState(0)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [search, setSearch] = useState('')
  const [newCustomer, setNewCustomer] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [picking, setPicking] = useState(true)
  const [salesperson, setSalesperson] = useState('')
  const [dispatchDate, setDispatchDate] = useState('')
  const [fabric, setFabric] = useState<Fabric | ''>('')
  const [logistics, setLogistics] = useState<Logistics[]>([])
  const [paymentMark, setPaymentMark] = useState<PaymentMark>('nao')
  const [personalized, setPersonalized] = useState(false)
  const [notes, setNotes] = useState('')
  const [orderId, setOrderId] = useState(uuidv7)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setCustomer(null)
    setSearch('')
    setLines([])
    setPicking(true)
    setSalesperson(session?.user.id ?? '')
    setDispatchDate('')
    setFabric('')
    setLogistics([])
    setPaymentMark('nao')
    setPersonalized(false)
    setNotes('')
    setOrderId(uuidv7())
  }, [open, session?.user.id])

  const deferred = useDeferredValue(search.trim())
  const customers = useQuery({
    queryKey: ['customers', deferred, 1],
    queryFn: ({ signal }) =>
      fetchCustomers(
        { search: deferred || undefined, page: 1, pageSize: 8 },
        signal
      ),
    enabled: open && step === 0,
    placeholderData: keepPreviousData,
  })

  const pieces = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0),
    0
  )
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const linesValid =
    lines.length > 0 &&
    lines.every(
      (line) => Number(line.quantity) > 0 && toDecimal(line.price) !== null
    )

  const submit = useMutation({
    mutationFn: async () => {
      if (!customer) throw new UserError('Escolha o cliente.')
      const created = await createOrder({
        id: orderId,
        customerPartyId: customer.id,
        salespersonUserId: salesperson || null,
        notes: null,
        lines: lines.map((line) => ({
          variantId: line.variantId,
          description: line.description,
          unit: line.unit,
          unitPrice: toDecimal(line.price) ?? '0.00',
          quantity: String(Number(line.quantity)),
        })),
      })
      let confirmed = true
      let number = created.number
      try {
        const doc = await confirmOrder(created.id, created.version)
        number = doc.number
      } catch (error) {
        confirmed = false
        toast(
          `O pedido foi criado mas ficou em rascunho: ${errorMessage(error)}`,
          'error'
        )
      }
      if (confirmed) {
        try {
          await saveSheet(created.id, {
            version: 0,
            dispatchDate: dispatchDate || null,
            fabricId: fabric || null,
            personalized,
            logistics,
            eventDate: null,
            eventNote: null,
            paymentMark,
            gradeChecked: false,
            notes: notes.trim() || null,
          })
        } catch (error) {
          toast(
            `Pedido criado, mas a ficha não foi gravada: ${errorMessage(error)}`,
            'error'
          )
        }
      }
      return { id: created.id, number, confirmed }
    },
    onSuccess: ({ id, number, confirmed }) => {
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
      if (confirmed)
        toast(`Pedido #${String(number)} criado — já está na fila, em Arte.`)
      onClose()
      void navigate(`/pedidos/${id}`)
    },
  })

  const canNext =
    step === 0 ? customer !== null : step === 1 ? linesValid : true

  return (
    <>
      <Modal
        open={open && !newCustomer}
        title="Novo pedido"
        wide
        onClose={() => {
          if (submit.isPending) return
          if (
            (customer !== null || lines.length > 0) &&
            !window.confirm(
              'Descartar este pedido? O que foi preenchido será perdido.'
            )
          )
            return
          onClose()
        }}
        footer={
          <>
            {step > 0 && (
              <Button
                variant="ghost"
                className="mr-auto"
                icon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => setStep((s) => s - 1)}
                disabled={submit.isPending}
              >
                Voltar
              </Button>
            )}
            {step < 2 ? (
              <Button
                variant="ink"
                disabled={!canNext}
                onClick={() => setStep((s) => s + 1)}
              >
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="lime"
                size="lg"
                busy={submit.isPending}
                icon={<Check className="h-5 w-5" />}
                onClick={() => submit.mutate()}
              >
                Criar pedido
              </Button>
            )}
          </>
        }
      >
        {/* Passos */}
        <ol className="mb-6 grid grid-cols-3 gap-2">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={index > step}
                onClick={() => setStep(index)}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-extrabold tracking-wide uppercase transition',
                  index === step
                    ? 'bg-ink text-lime'
                    : index < step
                      ? 'bg-lime text-ink'
                      : 'bg-paper text-muted'
                )}
              >
                <span
                  className={clsx(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]',
                    index === step ? 'bg-lime text-ink' : 'bg-white/70'
                  )}
                >
                  {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="truncate">{label}</span>
              </button>
            </li>
          ))}
        </ol>

        {/* 1. Cliente */}
        {step === 0 && (
          <div>
            <p className="mb-3 text-sm text-muted">Para quem é o pedido?</p>
            {customer ? (
              <div className="flex items-center justify-between rounded-2xl border-2 border-ink bg-lime px-4 py-3">
                <div>
                  <p className="font-extrabold">{customer.name}</p>
                  {customer.city && <p className="text-xs">{customer.city}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCustomer(null)}
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nome do time, escola ou pessoa"
                    className="field h-12 pl-9"
                  />
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {customers.data?.items.map((party) => (
                    <li key={party.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomer({
                            id: party.id,
                            name: party.tradeName ?? party.legalName,
                            city: party.mainCity ?? null,
                          })
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-lime-50"
                      >
                        <span className="font-bold">
                          {party.tradeName ?? party.legalName}
                        </span>
                        <span className="text-xs text-muted">
                          {[party.mainCity, party.mainPhone]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                  {customers.isSuccess && customers.data.items.length === 0 && (
                    <li className="px-3 py-3 text-sm text-muted">
                      Ninguém com esse nome.
                    </li>
                  )}
                </ul>
                <button
                  type="button"
                  onClick={() => setNewCustomer(true)}
                  className="mt-3 flex w-full items-center gap-2 rounded-2xl border-2 border-dashed border-ink/30 px-4 py-3 text-sm font-bold hover:border-ink hover:bg-lime-50"
                >
                  <UserPlus className="h-5 w-5" /> Cliente novo
                  {search.trim() ? `: cadastrar “${search.trim()}”` : ''}
                </button>
              </>
            )}
          </div>
        )}

        {/* 2. Peças */}
        {step === 1 && (
          <div>
            <p className="mb-3 text-sm text-muted">
              O que o cliente vai levar e por quanto. A grade por tamanho e os
              nomes/números você preenche depois, na ficha.
            </p>
            {lines.length > 0 && (
              <div className="mb-3 space-y-2">
                {lines.map((line) => (
                  <div
                    key={line.key}
                    className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-2xl bg-paper p-3 sm:grid-cols-[1fr_100px_130px_auto]"
                  >
                    <div className="col-span-2 sm:col-span-1">
                      <span className="label">Produto</span>
                      <p className="text-sm font-bold">{line.description}</p>
                    </div>
                    <div>
                      <label className="label" htmlFor={`q-${line.key}`}>
                        Peças
                      </label>
                      <input
                        id={`q-${line.key}`}
                        inputMode="numeric"
                        className="field text-center font-bold"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((all) =>
                            all.map((l) =>
                              l.key === line.key
                                ? {
                                    ...l,
                                    quantity: e.target.value.replace(/\D/g, ''),
                                    price: l.automaticPrice
                                      ? decimalToInput(
                                          [...l.tiers]
                                            .reverse()
                                            .find(
                                              (tier) =>
                                                Number(
                                                  e.target.value.replace(
                                                    /\D/g,
                                                    ''
                                                  )
                                                ) >=
                                                Math.max(1, tier.minQuantity)
                                            )?.unitPrice ?? l.basePrice
                                        )
                                      : l.price,
                                  }
                                : l
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`p-${line.key}`}>
                        R$ por peça
                      </label>
                      <input
                        id={`p-${line.key}`}
                        inputMode="decimal"
                        className={clsx(
                          'field',
                          toDecimal(line.price) === null && 'border-red-400'
                        )}
                        value={line.price}
                        onChange={(e) =>
                          setLines((all) =>
                            all.map((l) =>
                              l.key === line.key
                                ? {
                                    ...l,
                                    price: e.target.value,
                                    automaticPrice: false,
                                  }
                                : l
                            )
                          )
                        }
                      />
                    </div>
                    <button
                      type="button"
                      title="Tirar"
                      onClick={() => {
                        const remaining = lines.filter(
                          (l) => l.key !== line.key
                        )
                        setLines(remaining)
                        if (remaining.length === 0) setFabric('')
                      }}
                      className="mb-1 rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {picking ? (
              <ProductPicker
                fabricId={fabric || undefined}
                onPick={(product) => {
                  setFabric(product.fabricId)
                  setLines((all) => [
                    ...all,
                    {
                      ...product,
                      key: crypto.randomUUID(),
                      quantity: '10',
                      automaticPrice: true,
                      price: decimalToInput(
                        [...product.tiers]
                          .reverse()
                          .find((tier) => tier.minQuantity <= 10)?.unitPrice ??
                          product.basePrice
                      ),
                    },
                  ])
                  setPicking(false)
                }}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setPicking(true)}
              >
                Outro produto
              </Button>
            )}

            {lines.length > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white">
                <span className="text-sm font-bold">{int(pieces)} peças</span>
                <span className="display text-2xl text-lime">
                  {money(total.toFixed(2))}
                </span>
              </div>
            )}
            {pieces > 0 && pieces < 10 && (
              <p className="mt-2 text-xs font-bold text-amber-700">
                Atenção: o pedido mínimo da 4Play é de 10 peças.
              </p>
            )}
          </div>
        )}

        {/* 3. Detalhes */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="w-dispatch">
                  Data de despacho
                </label>
                <input
                  id="w-dispatch"
                  type="date"
                  className="field"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                />
                {!dispatchDate && (
                  <p className="mt-1 text-[11px] font-semibold text-muted">
                    Sem data, o pedido não aparece como atrasado.
                  </p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="w-seller">
                  Vendedor
                </label>
                <select
                  id="w-seller"
                  className="field"
                  value={salesperson}
                  onChange={(e) => setSalesperson(e.target.value)}
                >
                  <option value="">Ninguém</option>
                  {members.data?.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <span className="label">Tecido</span>
              <p className="text-sm font-bold">
                {fabrics.data?.find((f) => f.id === fabric)?.name ??
                  'A definir'}
              </p>
              <p className="text-xs text-muted">
                Definido pelo tecido das peças escolhidas.
              </p>
            </div>
            <div>
              <span className="label">Entrega (pode marcar mais de uma)</span>
              <Chips
                options={
                  Object.entries(LOGISTICS_LABELS) as [Logistics, string][]
                }
                value={logistics}
                onToggle={(value) =>
                  setLogistics((all) =>
                    all.includes(value as Logistics)
                      ? all.filter((v) => v !== value)
                      : [...all, value as Logistics]
                  )
                }
              />
            </div>
            <div>
              <span className="label">Pagamento</span>
              <Chips
                options={(Object.keys(PAYMENT_MARK_META) as PaymentMark[]).map(
                  (k) => [k, PAYMENT_MARK_META[k].label]
                )}
                value={[paymentMark]}
                onToggle={(value) => setPaymentMark(value as PaymentMark)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-ink"
                checked={personalized}
                onChange={(e) => setPersonalized(e.target.checked)}
              />
              Tem nome e número personalizados
            </label>
            <div>
              <label className="label" htmlFor="w-notes">
                Observações para a equipe
              </label>
              <textarea
                id="w-notes"
                rows={2}
                maxLength={2000}
                className="field"
                placeholder="Ex.: escudo maior na frente, cor da gola preta"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="rounded-2xl bg-paper p-4 text-sm">
              <p className="font-extrabold">{customer?.name}</p>
              <p className="text-muted">
                {int(pieces)} peças · {money(total.toFixed(2))}
              </p>
            </div>
            {submit.isError && (
              <ErrorBox message={errorMessage(submit.error)} />
            )}
          </div>
        )}
      </Modal>

      <NewCustomerDialog
        open={open && newCustomer}
        initialName={search.trim()}
        onClose={() => setNewCustomer(false)}
        onCreated={(party) =>
          setCustomer({
            id: party.id,
            name: party.tradeName ?? party.legalName,
            city: null,
          })
        }
      />
    </>
  )
}

const Chips = ({
  options,
  value,
  onToggle,
}: {
  options: [string, string][]
  value: string[]
  onToggle: (value: string) => void
}) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map(([key, label]) => (
      <button
        key={key}
        type="button"
        onClick={() => onToggle(key)}
        className={clsx(
          'rounded-full border px-3.5 py-2 text-xs font-bold transition',
          value.includes(key)
            ? 'border-ink bg-ink text-lime'
            : 'border-line bg-white hover:border-ink/40'
        )}
      >
        {label}
      </button>
    ))}
  </div>
)
