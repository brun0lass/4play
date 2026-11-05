import type { QuoteSummaryType, UniformPaymentTermType } from '@/contracts/aeris/uniforms.ts'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Minus, Pencil, Plus, Printer, Search, Star, Trash2 } from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '@/auth/AuthProvider'
import { archiveQuote, createQuote, updateQuote } from '@/api/uniforms'
import { track } from '@/lib/analytics'
import { fetchCustomers } from '@/api/store'
import {
  archivePaymentTerm,
  createPaymentTerm,
  fetchPaymentTerms,
  storeKeys,
  updatePaymentTerm,
} from '@/api/uniform-store'
import { todayLocal } from '@/components/catalog/StoreFields'
import { ProductPicker, type PickedProduct } from '@/components/ProductPicker'
import { Button, Empty, ErrorBox, Modal, PageHeader, Spinner } from '@/components/ui'
import { day, decimalToInput, int, money, toDecimal } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { priceAt } from '@/lib/intake-offer'
import { keys, useMembers, useQuotes } from '@/lib/queries'
import { SIZES } from '@/lib/uniforms'

/**
 * Os orçamentos: o papel que a loja manda antes do link do cliente. Faz, salva
 * e imprime (ou salva em PDF). Não vira pedido nem mexe em nada do financeiro.
 */
export const OrcamentosPage = () => {
  const { can } = useAuth()
  const list = useQuotes()
  const [editing, setEditing] = useState<QuoteSummaryType | 'new' | null>(null)
  const [managingTerms, setManagingTerms] = useState(false)

  return (
    <div>
      <PageHeader
        kicker="Antes do link do cliente"
        title="Orçamentos"
        actions={
          <>
            {can('uniforms.manage') && (
              <Button variant="outline" icon={<ListChecks className="h-4 w-4" />} onClick={() => setManagingTerms(true)}>
                Condições de pagamento
              </Button>
            )}
            <Button variant="lime" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              Novo orçamento
            </Button>
          </>
        }
      >
        <p className="mt-2 text-sm font-semibold text-muted">
          Monte o orçamento e mande em PDF. Ele não vira pedido: quando o cliente fechar, gere o link.
        </p>
      </PageHeader>

      {list.isPending && <Spinner />}
      {list.isError && <ErrorBox message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <Empty title="Nenhum orçamento ainda">
          <p>Faça o primeiro em "Novo orçamento".</p>
        </Empty>
      )}

      <div className="space-y-2">
        {list.data?.map((quote) => (
          <QuoteRow key={quote.id} quote={quote} onEdit={() => setEditing(quote)} />
        ))}
      </div>

      <QuoteDialog
        open={editing !== null}
        quote={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
      <PaymentTermsDialog open={managingTerms} onClose={() => setManagingTerms(false)} />
    </div>
  )
}

/** A lista de condições de pagamento: é da loja, sem limite de opções. */
const PaymentTermsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const client = useQueryClient()
  const list = useQuery({
    queryKey: storeKeys.paymentTerms,
    queryFn: ({ signal }) => fetchPaymentTerms(signal),
    enabled: open,
  })
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<UniformPaymentTermType | null>(null)
  const refresh = () => void client.invalidateQueries({ queryKey: storeKeys.paymentTerms })
  const add = useMutation({
    mutationFn: () => createPaymentTerm({ name }),
    onSuccess: () => {
      setName('')
      refresh()
    },
  })
  const rename = useMutation({
    mutationFn: (term: UniformPaymentTermType) =>
      updatePaymentTerm(term.id, { name: term.name, isDefault: term.isDefault, version: term.version }),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
  })
  const toggleDefault = useMutation({
    mutationFn: (term: UniformPaymentTermType) =>
      updatePaymentTerm(term.id, { name: term.name, isDefault: !term.isDefault, version: term.version }),
    onSuccess: () => {
      // Marcar uma desmarca a outra, e a que estava aberta para editar pode ser ela.
      setEditing(null)
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (term: UniformPaymentTermType) => archivePaymentTerm(term.id, term.version),
    onSuccess: refresh,
  })
  const error = add.error ?? rename.error ?? toggleDefault.error ?? remove.error

  return (
    <Modal
      open={open}
      title="Condições de pagamento"
      onClose={onClose}
      footer={
        <Button variant="ink" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          A lista que aparece no orçamento. A que tem a estrela é a padrão e já vem escolhida no orçamento novo; sem
          estrela, o campo vem vazio. Mudar a lista não altera os orçamentos já feitos.
        </p>
        {/* Acima da lista: ela é longa, e acrescentar não pode ficar lá embaixo, fora da tela. */}
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Nova condição"
            aria-label="Nova condição de pagamento"
            className="field min-w-0 flex-1"
          />
          <Button
            variant="lime"
            icon={<Plus className="h-4 w-4" />}
            busy={add.isPending}
            disabled={name.trim() === ''}
            onClick={() => add.mutate()}
          >
            Acrescentar
          </Button>
        </div>
        {list.isPending && <Spinner />}
        {list.data?.length === 0 && <p className="font-semibold">Nenhuma condição ainda. Acrescente a primeira.</p>}
        <ul className="space-y-2">
          {list.data?.map((term) => (
            <li key={term.id} className="flex items-center gap-2 rounded-2xl border border-line p-2 pl-4">
              {editing?.id === term.id ? (
                <>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    maxLength={200}
                    aria-label="Nome da condição"
                    autoFocus
                    className="field min-w-0 flex-1"
                  />
                  <Button
                    size="sm"
                    variant="lime"
                    busy={rename.isPending}
                    disabled={editing.name.trim() === ''}
                    onClick={() => rename.mutate(editing)}
                  >
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 font-bold">
                    <span className="min-w-0 break-words">{term.name}</span>
                    {term.isDefault && (
                      <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase">
                        Padrão
                      </span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant={term.isDefault ? 'lime' : 'outline'}
                    busy={toggleDefault.isPending && toggleDefault.variables.id === term.id}
                    aria-pressed={term.isDefault}
                    aria-label={term.isDefault ? `Tirar ${term.name} como padrão` : `Deixar ${term.name} como padrão`}
                    title={term.isDefault ? 'Tirar a padrão' : 'Deixar como padrão'}
                    onClick={() => toggleDefault.mutate(term)}
                  >
                    <Star className={term.isDefault ? 'h-4 w-4 fill-current' : 'h-4 w-4'} />
                  </Button>
                  <Button size="sm" variant="outline" aria-label={`Editar ${term.name}`} onClick={() => setEditing(term)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    busy={remove.isPending && remove.variables.id === term.id}
                    aria-label={`Tirar ${term.name}`}
                    onClick={() => {
                      if (window.confirm(`Tirar "${term.name}" da lista?`)) remove.mutate(term)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        {(list.isError || error) && <ErrorBox message={errorMessage(list.error ?? error)} />}
      </div>
    </Modal>
  )
}

const OTHER = '__outra__'

/**
 * Escolher da lista, ou "Outra" e escrever: a lista é o caminho rápido, mas o
 * orçamento guarda texto e nada aqui prende a pessoa nela.
 */
const ChoiceField = ({
  label,
  options,
  value,
  onChange,
  maxLength,
  otherLabel = 'Outra (escrever)',
}: {
  label: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  maxLength: number
  otherLabel?: string
}) => {
  const [typing, setTyping] = useState(false)
  // O valor fora da lista (de um orçamento salvo, ou opção apagada) também é "Outra".
  const other = typing || (value !== '' && !options.includes(value))
  return (
    <div className="space-y-2">
      <select
        value={other ? OTHER : value}
        onChange={(e) => {
          const choice = e.target.value
          setTyping(choice === OTHER)
          onChange(choice === OTHER ? '' : choice)
        }}
        aria-label={label}
        className="field bg-white"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={OTHER}>{otherLabel}</option>
      </select>
      {other && (
        <input
          value={value}
          onChange={(e) => {
            setTyping(true)
            onChange(e.target.value)
          }}
          maxLength={maxLength}
          autoFocus={typing}
          placeholder="Escreva aqui"
          aria-label={`${label}: escrever`}
          className="field bg-white"
        />
      )}
    </div>
  )
}

const QuoteRow = ({ quote, onEdit }: { quote: QuoteSummaryType; onEdit: () => void }) => {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => archiveQuote(quote.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.quotes }),
  })
  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-extrabold">
            Nº {int(quote.number)} · {quote.customerName}
          </p>
          <p className="text-xs text-muted">
            {day(quote.date)} · vale até {day(quote.validUntil)}
            {quote.customerCity && ` · ${quote.customerCity}`}
            {quote.salespersonName && ` · ${quote.salespersonName}`}
            {` · ${int(quote.lines.length)} ${quote.lines.length === 1 ? 'item' : 'itens'}`}
          </p>
        </div>
        <p className="display text-xl">{money(quote.total)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/orcamentos/${quote.id}/imprimir`}>
          <Button size="sm" variant="ink" icon={<Printer className="h-3.5 w-3.5" />}>
            Imprimir / PDF
          </Button>
        </Link>
        <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          busy={remove.isPending}
          onClick={() => {
            if (window.confirm(`Apagar o orçamento nº ${int(quote.number)}? O número não volta a ser usado.`))
              remove.mutate()
          }}
        >
          Apagar
        </Button>
      </div>
      {remove.isError && <p className="mt-2 text-xs font-semibold text-red-700">{errorMessage(remove.error)}</p>}
    </article>
  )
}

type LineDraft = {
  key: number
  quantity: string
  description: string
  size: string
  unitPrice: string
  /** As faixas do produto escolhido da tabela. Nulo: o preço é o que a pessoa escreveu. */
  tiers: PickedProduct['tiers'] | null
}

let nextKey = 1
const blankLine = (): LineDraft => ({
  key: nextKey++,
  quantity: '',
  description: '',
  size: 'VÁRIOS',
  unitPrice: '',
  tiers: null,
})

/** O preço da tabela para a quantidade, como vai no campo. */
const tablePrice = (tiers: PickedProduct['tiers'], quantity: string): string =>
  decimalToInput(String(priceAt(tiers, Number(quantity) || 1) ?? ''))

/** Em centavos: a soma da tela não acumula erro. Quem manda no total é o servidor. */
const cents = (text: string): number => Math.round(Number(toDecimal(text) ?? '0') * 100)
const lineCents = (line: LineDraft): number => (Number(line.quantity) || 0) * cents(line.unitPrice)
const fromCents = (value: number): string => money((value / 100).toFixed(2))

const SIZE_OPTIONS = ['VÁRIOS', ...SIZES]

const QuoteDialog = ({
  open,
  quote,
  onClose,
}: {
  open: boolean
  quote: QuoteSummaryType | null
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { session } = useAuth()
  const members = useMembers()
  const paymentTerms = useQuery({
    queryKey: storeKeys.paymentTerms,
    queryFn: ({ signal }) => fetchPaymentTerms(signal),
    enabled: open,
  })
  const defaultTerm = paymentTerms.data?.find((term) => term.isDefault)?.name
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search.trim())
  const [date, setDate] = useState('')
  const [validDays, setValidDays] = useState('30')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [seller, setSeller] = useState('')
  const [project, setProject] = useState('')
  const [terms, setTerms] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [conditions, setConditions] = useState('')
  const [other, setOther] = useState('')
  const [freight, setFreight] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  // O item com a tabela de produtos aberta.
  const [picking, setPicking] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setPicking(null)
    setDate(quote?.date ?? todayLocal())
    setValidDays(String(quote?.validDays ?? 30))
    setName(quote?.customerName ?? '')
    setAddress(quote?.customerAddress ?? '')
    setCity(quote?.customerCity ?? '')
    setPhone(quote?.customerPhone ?? '')
    setEmail(quote?.customerEmail ?? '')
    setSeller(quote ? (quote.salespersonName ?? '') : (session?.user.displayName ?? ''))
    setProject(quote?.project ?? '')
    setTerms(quote?.paymentTerms ?? '')
    setPaymentDate(quote?.paymentDate ?? '')
    setConditions(quote?.conditions ?? '')
    setOther(quote && Number(quote.otherAmount) > 0 ? decimalToInput(quote.otherAmount) : '')
    setFreight(quote && Number(quote.freightAmount) > 0 ? decimalToInput(quote.freightAmount) : '')
    setLines(
      quote
        ? quote.lines.map((line) => ({
            key: nextKey++,
            quantity: String(line.quantity),
            description: line.description,
            size: line.size ?? '',
            unitPrice: decimalToInput(line.unitPrice),
            // O preço já salvo não muda sozinho, mesmo que a tabela tenha mudado.
            tiers: null,
          }))
        : [blankLine()]
    )
    // Só ao abrir: o que a pessoa digita não pode ser refeito por um refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // O orçamento novo já vem com a condição padrão da loja (quando a lista chegar).
  useEffect(() => {
    if (open && quote === null && defaultTerm !== undefined) setTerms((current) => current || defaultTerm)
  }, [open, quote, defaultTerm])

  const customers = useQuery({
    queryKey: ['customers', 'quote', deferred],
    queryFn: ({ signal }) => fetchCustomers({ search: deferred, pageSize: 6, page: 1 }, signal),
    enabled: open && deferred.length >= 2,
    placeholderData: keepPreviousData,
  })

  const filled = lines.filter((line) => line.description.trim() !== '' || line.quantity !== '' || line.unitPrice !== '')
  const lineIssue = filled.some(
    (line) =>
      line.description.trim() === '' || !(Number(line.quantity) >= 1) || toDecimal(line.unitPrice) === null
  )
  const moneyIssue = (other !== '' && toDecimal(other) === null) || (freight !== '' && toDecimal(freight) === null)
  const daysIssue = !(Number(validDays) >= 1 && Number(validDays) <= 365)
  const ready = name.trim().length >= 2 && date !== '' && !daysIssue && filled.length > 0 && !lineIssue && !moneyIssue
  const subtotal = filled.reduce((sum, line) => sum + lineCents(line), 0)
  const total = subtotal + cents(other) + cents(freight)

  const save = useMutation({
    mutationFn: () => {
      const body = {
        date,
        validDays: Number(validDays),
        customerName: name,
        customerAddress: address,
        customerCity: city,
        customerPhone: phone,
        customerEmail: email,
        salespersonName: seller,
        project,
        paymentTerms: terms,
        paymentDate: paymentDate || null,
        conditions,
        otherAmount: toDecimal(other) ?? '0',
        freightAmount: toDecimal(freight) ?? '0',
        lines: filled.map((line) => ({
          quantity: Number(line.quantity),
          description: line.description,
          size: line.size,
          unitPrice: toDecimal(line.unitPrice) ?? '0',
        })),
      }
      return quote ? updateQuote(quote.id, { ...body, version: quote.version }) : createQuote(body)
    },
    onSuccess: (saved) => {
      track(quote ? 'orcamento_editado' : 'orcamento_criado')
      void queryClient.invalidateQueries({ queryKey: keys.quotes })
      onClose()
      void navigate(`/orcamentos/${saved.id}/imprimir`)
    },
  })

  const close = () => {
    // Esc também passa por aqui, e são muitos campos para perder sem querer.
    if ((name.trim() !== '' || filled.length > 0) && !window.confirm('Sair sem salvar este orçamento?')) return
    save.reset()
    onClose()
  }
  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((all) => all.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  const pickProduct = (line: LineDraft, product: PickedProduct) => {
    updateLine(line.key, {
      description: product.description,
      tiers: product.tiers,
      unitPrice: tablePrice(product.tiers, line.quantity),
    })
    setPicking(null)
  }

  return (
    <Modal
      open={open}
      wide
      title={quote ? `Orçamento nº ${int(quote.number)}` : 'Novo orçamento'}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="lime" busy={save.isPending} disabled={!ready} onClick={() => save.mutate()}>
            Salvar e ver o PDF
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        <section className="space-y-3">
          <h3 className="text-xs font-extrabold tracking-wide uppercase">Cliente</h3>
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Já é cliente? Procure para preencher"
                className="field pl-9"
              />
            </div>
            {deferred.length >= 2 && customers.data && customers.data.items.length > 0 && (
              <div className="mt-2 space-y-1">
                {customers.data.items.map((party) => (
                  <button
                    key={party.id}
                    type="button"
                    onClick={() => {
                      setName(party.tradeName ?? party.legalName)
                      setPhone(party.mainPhone ?? '')
                      setEmail(party.mainEmail ?? '')
                      setSearch('')
                    }}
                    className="block w-full rounded-xl border border-line px-3 py-2 text-left hover:border-ink/30"
                  >
                    <strong>{party.tradeName ?? party.legalName}</strong>
                    {party.mainPhone && <span className="text-muted"> · {party.mainPhone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome *">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="field" />
            </Field>
            <Field label="Contato/Telefone">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} inputMode="tel" className="field" />
            </Field>
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} inputMode="email" className="field" />
            </Field>
            <Field label="Cidade/Estado/CEP">
              <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={200} className="field" />
            </Field>
            <Field label="Endereço" wide>
              <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} className="field" />
            </Field>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-4">
          <Field label="Data *">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          </Field>
          <Field label="Validade (dias) *">
            <input
              value={validDays}
              onChange={(e) => setValidDays(e.target.value.replace(/\D/g, ''))}
              maxLength={3}
              inputMode="numeric"
              className={daysIssue ? 'field border-red-500' : 'field'}
            />
          </Field>
          <Field label="Vendedor">
            <ChoiceField
              label="Vendedor"
              options={members.data?.map((member) => member.displayName) ?? []}
              value={seller}
              onChange={setSeller}
              maxLength={120}
              otherLabel="Outro (escrever)"
            />
          </Field>
          <Field label="Projeto">
            <input value={project} onChange={(e) => setProject(e.target.value)} maxLength={200} className="field" />
          </Field>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-extrabold tracking-wide uppercase">Itens</h3>
          {lines.map((line) => (
            <div key={line.key} className="grid grid-cols-[4.5rem_1fr_auto] gap-2 rounded-2xl bg-paper p-3 sm:grid-cols-[4.5rem_1fr_6rem_6.5rem_auto]">
              <input
                value={line.quantity}
                onChange={(e) => {
                  const quantity = e.target.value.replace(/\D/g, '')
                  // Com o preço da tabela, a quantidade muda a faixa.
                  updateLine(line.key, {
                    quantity,
                    ...(line.tiers ? { unitPrice: tablePrice(line.tiers, quantity) } : {}),
                  })
                }}
                inputMode="numeric"
                placeholder="Qtd."
                aria-label="Quantidade"
                className="field bg-white text-center"
              />
              <textarea
                rows={2}
                value={line.description}
                onChange={(e) => updateLine(line.key, { description: e.target.value })}
                maxLength={300}
                placeholder="Escreva o item, ou escolha um produto da tabela"
                aria-label="Descrição"
                className="field resize-y bg-white"
              />
              <button
                type="button"
                onClick={() => setLines((all) => all.filter((entry) => entry.key !== line.key))}
                disabled={lines.length === 1}
                className="self-start rounded-full p-2 text-muted hover:text-red-700 disabled:opacity-30 sm:col-start-5 sm:row-start-1"
                aria-label="Tirar este item"
              >
                <Minus className="h-4 w-4" />
              </button>
              {/* No celular, meio a meio na linha de baixo; no computador, colunas da linha. */}
              <div className="col-span-full grid grid-cols-2 gap-2 sm:contents">
                <ChoiceField
                  label="Tamanho"
                  options={SIZE_OPTIONS}
                  value={line.size}
                  onChange={(size) => updateLine(line.key, { size })}
                  maxLength={40}
                  otherLabel="Outro"
                />
                <input
                  value={line.unitPrice}
                  // O preço escrito à mão fica: a quantidade não muda mais ele.
                  onChange={(e) => updateLine(line.key, { unitPrice: e.target.value, tiers: null })}
                  inputMode="decimal"
                  placeholder="Preço unit."
                  aria-label="Preço unitário"
                  className="field self-start bg-white text-right"
                />
              </div>
              <div className="col-span-full flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPicking(picking === line.key ? null : line.key)}
                  className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
                >
                  <Search className="h-3.5 w-3.5" />
                  {picking === line.key ? 'Fechar a tabela' : 'Escolher da tabela'}
                </button>
                <p className="text-right text-xs font-bold text-muted">
                  {line.tiers && 'Preço da tabela · '}Montante: {fromCents(lineCents(line))}
                </p>
              </div>
              {picking === line.key && (
                <div className="col-span-full">
                  <ProductPicker onPick={(product) => pickProduct(line, product)} />
                </div>
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setLines((all) => [...all, blankLine()])}
          >
            Mais um item
          </Button>
          {lineIssue && (
            <p className="text-xs font-semibold text-amber-800">
              Cada item precisa de quantidade, descrição e preço (como 69,00).
            </p>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Termos de pagamento">
            <ChoiceField
              label="Termos de pagamento"
              options={paymentTerms.data?.map((term) => term.name) ?? []}
              value={terms}
              onChange={setTerms}
              maxLength={200}
            />
          </Field>
          <Field label="Data de pagamento">
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="field" />
          </Field>
          <Field label="Esta proposta inclui as seguintes condições" wide>
            <textarea
              rows={2}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              maxLength={2000}
              className="field resize-y"
            />
          </Field>
          <Field label="Outros (R$)">
            <input value={other} onChange={(e) => setOther(e.target.value)} inputMode="decimal" className="field" />
          </Field>
          <Field label="Frete (R$)">
            <input value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" className="field" />
          </Field>
        </section>

        <div className="rounded-2xl bg-paper p-4 text-right">
          <p className="text-xs text-muted">Subtotal {fromCents(subtotal)}</p>
          <p className="display mt-1 text-2xl">Total {fromCents(total)}</p>
        </div>

        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}

const Field = ({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) => (
  <label className={wide ? 'block sm:col-span-full' : 'block'}>
    <span className="label">{label}</span>
    {children}
  </label>
)
