import type { PublicIntakeResponseType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { CheckCircle2, ClipboardPaste, Loader2, Minus, Plus, Send, Shirt, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'

import { fetchPublicIntake, submitPublicIntake } from '@/api/uniforms'
import { Logo } from '@/components/Logo'
import { Button, ErrorBox, Spinner } from '@/components/ui'
import { cepDigits, formatCep, lookupCep } from '@/lib/cep'
import { day, int, money } from '@/lib/format'
import { ApiError, errorMessage } from '@/lib/http'

type Size = PublicIntakeResponseType['sizes'][number]
type NamedRow = { key: number; name: string; number: string; size: Size | ''; quantity: string }
type Item = { named: NamedRow[]; bySize: Partial<Record<Size, string>> }

const ADULT: readonly string[] = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG']

let nextKey = 1
const blankRow = (): NamedRow => ({ key: nextKey++, name: '', number: '', size: '', quantity: '1' })

/**
 * O link do pedido (F232 do Aeris) — a página que o CLIENTE abre, sem login.
 *
 * Ele escolhe as peças, preenche nome, número e tamanho de cada atleta (ou só
 * as quantidades por tamanho), e o cadastro se ainda não é cliente. Depois de
 * enviar não muda mais: quem atende confere e transforma em pedido.
 */
export const LinkPedidoPage = () => {
  const { token = '' } = useParams()
  const page = useQuery({
    queryKey: ['public-intake', token],
    queryFn: ({ signal }) => fetchPublicIntake(token, signal),
    retry: false,
  })

  return (
    <div className="min-h-full bg-paper">
      <header className="bg-ink px-4 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Logo className="h-9" />
          <span className="text-right text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">Monte o seu pedido</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        {page.isPending && <Spinner label="Abrindo o seu pedido…" />}
        {page.isError && (
          <Closed
            title="Link não encontrado"
            text={
              page.error instanceof ApiError && page.error.status === 404
                ? 'Este link não existe ou foi trocado. Peça um novo para quem te atendeu.'
                : errorMessage(page.error)
            }
          />
        )}
        {page.data && <Content token={token} data={page.data} onSent={() => void page.refetch()} />}
      </main>
    </div>
  )
}

const Closed = ({ title, text, good = false }: { title: string; text: string; good?: boolean }) => (
  <section className="card p-8 text-center">
    {good && <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />}
    <h1 className="display text-3xl">{title}</h1>
    <p className="mx-auto mt-3 max-w-md text-sm text-muted">{text}</p>
  </section>
)

const Content = ({ token, data, onSent }: { token: string; data: PublicIntakeResponseType; onSent: () => void }) => {
  if (data.status === 'enviado' || data.status === 'convertido')
    return (
      <Closed
        good
        title="Pedido enviado!"
        text={`Recebemos o seu pedido${data.submittedAt ? ` em ${day(data.submittedAt)}` : ''}. Quem te atendeu vai conferir e te chamar. Para mudar alguma coisa, fale com essa pessoa.`}
      />
    )
  if (data.status === 'expirado')
    return <Closed title="Este link venceu" text="Peça um novo link para quem te atendeu." />
  if (data.status === 'cancelado')
    return <Closed title="Este link foi cancelado" text="Fale com quem te atendeu para fazer o pedido." />
  return <IntakeForm token={token} data={data} onSent={onSent} />
}

const IntakeForm = ({ token, data, onSent }: { token: string; data: PublicIntakeResponseType; onSent: () => void }) => {
  const [items, setItems] = useState<Record<string, Item>>({})
  const [notes, setNotes] = useState('')
  const [customer, setCustomer] = useState({
    kind: 'person' as 'person' | 'company',
    name: '',
    document: '',
    phone: data.contactPhone ?? '',
    email: data.contactEmail ?? '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    uf: '',
  })
  const setField = (key: keyof typeof customer, value: string) => setCustomer((c) => ({ ...c, [key]: value }))

  // CEP completo → preenche o endereço vazio.
  const lastCep = useRef('')
  useEffect(() => {
    const digits = cepDigits(customer.cep)
    if (digits.length !== 8 || digits === lastCep.current) return
    lastCep.current = digits
    void lookupCep(digits).then((found) => {
      if (!found) return
      setCustomer((c) => ({
        ...c,
        street: c.street || found.street,
        district: c.district || found.district,
        city: c.city || found.city,
        uf: c.uf || found.uf,
      }))
    })
  }, [customer.cep])

  const rowsOf = (item: Item) => [
    ...item.named
      .filter((row) => row.size !== '' && Number(row.quantity) > 0)
      .map((row) => ({
        size: row.size as Size,
        quantity: Number(row.quantity),
        name: row.name.trim() || null,
        number: row.number.trim() || null,
      })),
    ...Object.entries(item.bySize)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([size, quantity]) => ({ size: size as Size, quantity: Number(quantity), name: null, number: null })),
  ]

  const chosen = data.products.filter((product) => items[product.id] !== undefined)
  const totals = useMemo(
    () =>
      chosen.map((product) => {
        const item = items[product.id]
        const pieces = item ? rowsOf(item).reduce((sum, row) => sum + row.quantity, 0) : 0
        return { product, pieces, value: product.unitPrice === null ? null : pieces * Number(product.unitPrice) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, chosen.length]
  )
  const pieces = totals.reduce((sum, entry) => sum + entry.pieces, 0)
  const value = data.showPrices ? totals.reduce((sum, entry) => sum + (entry.value ?? 0), 0) : null
  const incomplete = chosen.flatMap((product) =>
    (items[product.id]?.named ?? []).filter((row) => (row.name.trim() !== '' || row.number.trim() !== '') && row.size === '').map(() => product.name)
  )

  const send = useMutation({
    mutationFn: () => {
      const hasAddress = customer.street.trim() !== '' || customer.city.trim() !== ''
      return submitPublicIntake(token, {
        customer: data.needsRegistration
          ? {
              kind: customer.kind,
              name: customer.name,
              document: customer.document.trim() || null,
              phone: customer.phone,
              email: customer.email.trim() || null,
              address: hasAddress
                ? {
                    cep: cepDigits(customer.cep) || null,
                    street: customer.street,
                    number: customer.number.trim() || null,
                    complement: customer.complement.trim() || null,
                    district: customer.district.trim() || null,
                    city: customer.city,
                    uf: customer.uf,
                  }
                : null,
            }
          : null,
        items: chosen
          .map((product) => ({ productId: product.id, rows: rowsOf(items[product.id] ?? { named: [], bySize: {} }) }))
          .filter((item) => item.rows.length > 0),
        notes: notes.trim() || null,
      })
    },
    onSuccess: () => {
      window.scrollTo({ top: 0 })
      onSent()
    },
  })

  const registrationMissing =
    data.needsRegistration && (customer.name.trim().length < 2 || customer.phone.replace(/\D/g, '').length < 10)

  return (
    <div className="space-y-6">
      <section>
        <h1 className="display text-3xl sm:text-4xl">
          {data.customerFirstName ? `Olá, ${data.customerFirstName}!` : 'Olá!'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Escolha as peças e preencha a grade do seu time: nome, número e tamanho de cada um — ou só quantas peças de
          cada tamanho. Depois de enviar, quem te atendeu confere tudo. O link vale até {day(data.expiresAt)}.
        </p>
        {data.message && <p className="mt-4 rounded-2xl bg-lime/40 p-4 text-sm font-semibold">{data.message}</p>}
      </section>

      {data.needsRegistration && (
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-extrabold tracking-wider uppercase">Seus dados</h2>
          <div className="flex gap-2">
            {(
              [
                ['person', 'Pessoa'],
                ['company', 'Empresa / time com CNPJ'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setField('kind', key)}
                className={clsx('rounded-full border-2 px-3 py-1.5 text-xs font-extrabold', customer.kind === key ? 'border-ink bg-lime' : 'border-line')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={customer.kind === 'company' ? 'Razão social / nome do time' : 'Seu nome (ou do time)'} required>
              <input value={customer.name} onChange={(e) => setField('name', e.target.value)} maxLength={200} className="field" autoComplete="name" />
            </Field>
            <Field label={customer.kind === 'company' ? 'CNPJ (opcional)' : 'CPF (opcional)'}>
              <input value={customer.document} onChange={(e) => setField('document', e.target.value)} maxLength={20} inputMode="numeric" className="field" />
            </Field>
            <Field label="WhatsApp com DDD" required>
              <input value={customer.phone} onChange={(e) => setField('phone', e.target.value)} maxLength={30} inputMode="tel" className="field" autoComplete="tel" placeholder="(11) 98765-4321" />
            </Field>
            <Field label="E-mail (opcional)">
              <input value={customer.email} onChange={(e) => setField('email', e.target.value)} maxLength={200} inputMode="email" className="field" autoComplete="email" />
            </Field>
          </div>
          <p className="pt-2 text-xs font-extrabold tracking-wide text-muted uppercase">Endereço de entrega (opcional)</p>
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label="CEP" className="sm:col-span-2">
              <input value={customer.cep} onChange={(e) => setField('cep', formatCep(e.target.value))} inputMode="numeric" className="field" placeholder="00000-000" />
            </Field>
            <Field label="Rua" className="sm:col-span-4">
              <input value={customer.street} onChange={(e) => setField('street', e.target.value)} maxLength={200} className="field" />
            </Field>
            <Field label="Número" className="sm:col-span-2">
              <input value={customer.number} onChange={(e) => setField('number', e.target.value)} maxLength={20} className="field" />
            </Field>
            <Field label="Complemento" className="sm:col-span-4">
              <input value={customer.complement} onChange={(e) => setField('complement', e.target.value)} maxLength={120} className="field" />
            </Field>
            <Field label="Bairro" className="sm:col-span-2">
              <input value={customer.district} onChange={(e) => setField('district', e.target.value)} maxLength={120} className="field" />
            </Field>
            <Field label="Cidade" className="sm:col-span-3">
              <input value={customer.city} onChange={(e) => setField('city', e.target.value)} maxLength={120} className="field" />
            </Field>
            <Field label="UF" className="sm:col-span-1">
              <input value={customer.uf} onChange={(e) => setField('uf', e.target.value.toUpperCase().slice(0, 2))} className="field uppercase" />
            </Field>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-extrabold tracking-wider uppercase">As peças</h2>
        {data.products.length === 0 && <p className="text-sm text-muted">Nenhuma peça disponível neste link. Fale com quem te atendeu.</p>}
        {data.products.map((product) => {
          const item = items[product.id]
          return (
            <article key={product.id} className={clsx('card p-4', item && 'ring-2 ring-ink')}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-lime">
                    <Shirt className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-extrabold">{product.name}</p>
                    {product.unitPrice !== null && <p className="text-xs font-semibold text-muted">{money(product.unitPrice)} a peça</p>}
                  </div>
                </div>
                {item ? (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setItems((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== product.id)))}>
                    Tirar
                  </Button>
                ) : (
                  <Button size="sm" variant="lime" icon={<Plus className="h-4 w-4" />} onClick={() => setItems((all) => ({ ...all, [product.id]: { named: [blankRow()], bySize: {} } }))}>
                    Quero esta
                  </Button>
                )}
              </div>
              {item && (
                <ItemEditor
                  sizes={data.sizes}
                  item={item}
                  onChange={(next) => setItems((all) => ({ ...all, [product.id]: next }))}
                />
              )}
            </article>
          )
        })}
      </section>

      <section className="card p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-extrabold tracking-wider uppercase">Observação</span>
          <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className="field resize-y" placeholder="Data do evento, cor, detalhes da gola, quem vai retirar…" />
        </label>
      </section>

      <section className="brush-bg sticky bottom-2 rounded-3xl px-4 py-3 text-white shadow-xl sm:bottom-3 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="display text-2xl sm:text-3xl">{int(pieces)} peças</p>
            {value !== null && pieces > 0 && (
              <p className="text-xs text-white/70 sm:text-sm">Cerca de {money(value.toFixed(2))} — o valor final vem na conferência.</p>
            )}
          </div>
          <Button
            variant="lime"
            icon={send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            disabled={pieces === 0 || registrationMissing || incomplete.length > 0 || send.isPending}
            onClick={() => {
              if (window.confirm('Enviar o pedido? Depois de enviado, só quem te atendeu consegue mudar.')) send.mutate()
            }}
          >
            Enviar pedido
          </Button>
        </div>
        {registrationMissing && <p className="mt-2 text-xs font-semibold text-lime">Preencha o seu nome e o WhatsApp com DDD.</p>}
        {incomplete.length > 0 && <p className="mt-2 text-xs font-semibold text-lime">Falta o tamanho em alguma linha de {incomplete[0]}.</p>}
        {send.isError && (
          <div className="mt-3">
            <ErrorBox message={send.error instanceof ApiError ? send.error.message : errorMessage(send.error)} />
          </div>
        )}
      </section>
    </div>
  )
}

const Field = ({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) => (
  <label className={clsx('block', className)}>
    <span className="label">
      {label}
      {required && <span className="text-red-600"> *</span>}
    </span>
    {children}
  </label>
)

/** Uma peça: os atletas com nome e número, e as que vão sem nome, só por tamanho. */
const ItemEditor = ({ sizes, item, onChange }: { sizes: readonly Size[]; item: Item; onChange: (item: Item) => void }) => {
  const [allSizes, setAllSizes] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const shownSizes = allSizes ? sizes : sizes.filter((size) => ADULT.includes(size))
  const updateRow = (key: number, patch: Partial<NamedRow>) =>
    onChange({ ...item, named: item.named.map((row) => (row.key === key ? { ...row, ...patch } : row)) })

  /** Nome, Número, Tamanho, Qtde — separados por tabulação (Excel) ou ponto e vírgula. */
  const applyPaste = () => {
    const rows: NamedRow[] = []
    const bad: number[] = []
    pasted.split(/\r?\n/).forEach((line, index) => {
      if (line.trim() === '') return
      const [name = '', number = '', sizeText = '', quantity = ''] = (line.includes('\t') ? line.split('\t') : line.split(';')).map((cell) => cell.trim())
      if (index === 0 && name.toLowerCase() === 'nome') return
      const size = sizeText.toUpperCase() as Size
      if (!sizes.includes(size) || (quantity !== '' && !/^\d{1,5}$/.test(quantity))) {
        bad.push(index + 1)
        return
      }
      rows.push({ key: nextKey++, name, number, size, quantity: quantity || '1' })
    })
    if (rows.length === 0) {
      setPasteError('Não consegui ler nenhuma linha. Use: Nome, Número, Tamanho, Qtde.')
      return
    }
    onChange({ ...item, named: [...item.named.filter((row) => row.name || row.number || row.size), ...rows] })
    setPasteError(bad.length > 0 ? `Linhas que não li: ${bad.join(', ')} (confira o tamanho).` : null)
    setPasted('')
    setPasting(bad.length > 0)
  }

  return (
    <div className="mt-4 space-y-5 border-t border-line pt-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-extrabold tracking-wide uppercase">Com nome e número</p>
          <button type="button" onClick={() => setPasting((v) => !v)} className="inline-flex items-center gap-1 text-xs font-bold hover:underline">
            <ClipboardPaste className="h-3.5 w-3.5" /> Colar do Excel
          </button>
        </div>
        {pasting && (
          <div className="mb-3 rounded-2xl bg-paper p-3">
            <p className="mb-2 text-xs text-muted">Copie da planilha as colunas <strong>Nome, Número, Tamanho, Qtde</strong> e cole aqui.</p>
            <textarea rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} className="field font-mono text-xs" placeholder={'Ana\t10\tM\t1\nBeto\t7\tG\t1'} />
            {pasteError && <p className="mt-1 text-xs font-semibold text-amber-800">{pasteError}</p>}
            <Button size="sm" variant="ink" className="mt-2" onClick={applyPaste} disabled={pasted.trim() === ''}>
              Usar estas linhas
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {item.named.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_4.5rem] gap-2 sm:grid-cols-[1fr_5rem_6rem_5rem_auto]">
              <input value={row.name} onChange={(e) => updateRow(row.key, { name: e.target.value })} maxLength={80} placeholder="Nome na camisa" className="field" aria-label="Nome" />
              <input value={row.number} onChange={(e) => updateRow(row.key, { number: e.target.value })} maxLength={10} placeholder="Nº" className="field" aria-label="Número" />
              <select value={row.size} onChange={(e) => updateRow(row.key, { size: e.target.value as Size })} className={clsx('field', row.size === '' && (row.name || row.number) && 'border-red-500')} aria-label="Tamanho">
                <option value="">Tamanho</option>
                {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <input value={row.quantity} onChange={(e) => updateRow(row.key, { quantity: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="field" aria-label="Quantidade" />
              <button type="button" onClick={() => onChange({ ...item, named: item.named.filter((r) => r.key !== row.key) })} className="col-span-2 inline-flex items-center gap-1 justify-self-start rounded-full px-1 text-xs font-bold text-muted hover:text-red-700 sm:col-span-1 sm:p-2" aria-label="Tirar linha">
                <Minus className="h-4 w-4" /> <span className="sm:hidden">Tirar esta pessoa</span>
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange({ ...item, named: [...item.named, blankRow()] })}>
          Mais uma pessoa
        </Button>
      </div>

      <div>
        <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Sem nome — só quantas de cada tamanho</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {shownSizes.map((size) => (
            <label key={size} className="block text-center">
              <span className="text-xs font-extrabold">{size}</span>
              <input
                value={item.bySize[size] ?? ''}
                onChange={(e) => onChange({ ...item, bySize: { ...item.bySize, [size]: e.target.value.replace(/\D/g, '') } })}
                inputMode="numeric"
                placeholder="0"
                className="field mt-1 text-center"
                aria-label={`Quantas ${size} sem nome`}
              />
            </label>
          ))}
        </div>
        {!allSizes && (
          <button type="button" onClick={() => setAllSizes(true)} className="mt-2 text-xs font-bold hover:underline">
            Mais tamanhos (G1–G4, infantil)
          </button>
        )}
      </div>
    </div>
  )
}
