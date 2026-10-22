import type { PublicIntakeResponseType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Loader2,
  Minus,
  Plus,
  Ruler,
  Send,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'

import { fetchPublicIntake, submitPublicIntake } from '@/api/uniforms'
import { Logo } from '@/components/Logo'
import { SizeChartTable } from '@/components/catalog/SizeChartTable'
import { ColorPanel } from '@/components/ficha/ColorPicker'
import {
  KitEditor,
  kitChargeRows,
  kitProblem,
  kitToSubmit,
  kitTotals,
  newKit,
  type KitDraft,
} from '@/components/intake/KitEditor'
import { Button, ErrorBox, Modal, Spinner } from '@/components/ui'
import { cepDigits, formatCep, lookupCep } from '@/lib/cep'
import {
  madeIn,
  personalizationCharges,
  priceAt,
  tiersOf,
} from '@/lib/intake-offer'
import { day, int, money } from '@/lib/format'
import { ColorDot, parseColors, serializeColors, swatchOf } from '@/lib/grade-color'
import { ApiError, errorMessage } from '@/lib/http'

type Size = PublicIntakeResponseType['sizes'][number]
type Fabric = string
type Product = PublicIntakeResponseType['products'][number]
type Tier = Product['tiers'][number]

/** "1–10", "11–50", "151+": a faixa como a tabela da loja escreve. */
const tierLabel = (tiers: readonly Tier[], index: number): string => {
  const from = Math.max(tiers[index]?.minQuantity ?? 1, 1)
  const next = tiers[index + 1]
  return next === undefined
    ? `${String(from)}+`
    : `${String(from)}–${String(next.minQuantity - 1)}`
}

/** `AAAA-MM-DD` mais (ou menos) dias, como o Aeris calcula (`addDays`). */
const shiftDay = (day: string, days: number): string =>
  new Date(new Date(`${day}T12:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
type NamedRow = {
  key: number
  name: string
  number: string
  size: Size | ''
  quantity: string
}
type Item = {
  named: NamedRow[]
  bySize: Partial<Record<Size, string>>
  options: string[]
  /** A peça com partes (F300): o conjunto preenchido parte por parte. */
  kit?: KitDraft
  /** A cor escolhida (F302): o mesmo texto da cor da grade; vazio, a loja define. */
  color?: string
}

const ADULT: readonly string[] = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG']

/** O que costuma acompanhar um uniforme: vem primeiro nas sugestões do link. */
const ACCESSORY = /^(manga longa|manguito|mei[aã]o|meia|bandeira|bon[eé]|toalha|squeeze|viseira)/i

// As chaves sobrevivem ao rascunho guardado no celular: começam do relógio.
let nextKey = Date.now()
const blankRow = (): NamedRow => ({
  key: nextKey++,
  name: '',
  number: '',
  size: '',
  quantity: '1',
})

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
          <span className="text-right text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">
            Monte o seu pedido
          </span>
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
        {page.data && (
          <Content
            token={token}
            data={page.data}
            onSent={() => void page.refetch()}
          />
        )}
      </main>
    </div>
  )
}

const Closed = ({
  title,
  text,
  good = false,
}: {
  title: string
  text: string
  good?: boolean
}) => (
  <section className="card p-8 text-center">
    {good && (
      <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
    )}
    <h1 className="display text-3xl">{title}</h1>
    <p className="mx-auto mt-3 max-w-md text-sm text-muted">{text}</p>
  </section>
)

const Content = ({
  token,
  data,
  onSent,
}: {
  token: string
  data: PublicIntakeResponseType
  onSent: () => void
}) => {
  if (data.status === 'enviado' || data.status === 'convertido')
    return (
      <Closed
        good
        title="Pedido enviado!"
        text={`Recebemos o seu pedido${data.submittedAt ? ` em ${day(data.submittedAt)}` : ''}. Quem te atendeu vai conferir e te chamar. Para mudar alguma coisa, fale com essa pessoa.`}
      />
    )
  if (data.status === 'expirado')
    return (
      <Closed
        title="Este link venceu"
        text="Peça um novo link para quem te atendeu."
      />
    )
  if (data.status === 'cancelado')
    return (
      <Closed
        title="Este link foi cancelado"
        text="Fale com quem te atendeu para fazer o pedido."
      />
    )
  return <IntakeForm token={token} data={data} onSent={onSent} />
}

const IntakeForm = ({
  token,
  data,
  onSent,
}: {
  token: string
  data: PublicIntakeResponseType
  onSent: () => void
}) => {
  // O que o cliente já preencheu fica neste celular: fechou o navegador,
  // caiu a internet, volta de onde parou.
  const storageKey = `4play.link.v2.${token}`
  const [saved] = useState<Partial<Draft> | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as Partial<Draft>) : null
    } catch {
      return null
    }
  })
  const [items, setItems] = useState<Record<string, Item>>(() =>
    // Só as peças que o link ainda oferece.
    Object.fromEntries(
      Object.entries(saved?.items ?? {}).filter(([id]) => data.products.some((product) => product.id === id))
    )
  )
  const [notes, setNotes] = useState(saved?.notes ?? '')
  // Para quando (F233): evento com data, ou o prazo do link.
  const [isEvent, setIsEvent] = useState<boolean | null>(saved?.isEvent ?? null)
  const [eventDate, setEventDate] = useState(saved?.eventDate ?? '')
  const [eventName, setEventName] = useState(saved?.eventName ?? '')
  const [fabric, setFabric] = useState<Fabric | null>(
    saved?.fabric != null && data.fabrics.some((f) => f.id === saved.fabric) ? saved.fabric : null
  )
  const resumed = Object.keys(items).length > 0
  const [measuring, setMeasuring] = useState<Product | null>(null)
  // Voltou com peças escolhidas: começa pelo pedido.
  const [screen, setScreen] = useState<Screen>(resumed ? { kind: 'pedido' } : { kind: 'escolher' })
  const [welcomeBack, setWelcomeBack] = useState(resumed)
  // Cada tela começa do topo.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])
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
    ...saved?.customer,
  })
  const setField = (key: keyof typeof customer, value: string) =>
    setCustomer((c) => ({ ...c, [key]: value }))
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ items, notes, isEvent, eventDate, eventName, fabric, customer } satisfies Draft)
      )
    } catch {
      /* sem armazenamento: só não guarda */
    }
  }, [storageKey, items, notes, isEvent, eventDate, eventName, fabric, customer])

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
      .map(([size, quantity]) => ({
        size: size as Size,
        quantity: Number(quantity),
        name: null,
        number: null,
      })),
  ]

  const chosen = data.products.filter(
    (product) => items[product.id] !== undefined
  )
  const totals = useMemo(
    () =>
      chosen.map((product) => {
        const item = items[product.id]
        const rows = item ? rowsOf(item) : []
        // O conjunto por partes (F300) conta os conjuntos (ou a parte maior, até baterem).
        const kit = item?.kit ? kitTotals(product, item.kit) : null
        const pieces = kit
          ? (kit.count ?? kit.biggest)
          : rows.reduce((sum, row) => sum + row.quantity, 0)
        // A faixa é pela quantidade desta peça, no tecido escolhido (F258).
        const unit =
          priceAt(tiersOf(product, fabric), pieces) ??
          (product.unitPrice === null ? null : Number(product.unitPrice))
        const personalized = rows
          .filter((row) => row.name !== null || row.number !== null)
          .reduce((sum, row) => sum + row.quantity, 0)
        return {
          product,
          pieces,
          personalized,
          value: unit === null ? null : pieces * unit,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, chosen.length, fabric]
  )
  const pieces = totals.reduce((sum, entry) => sum + entry.pieces, 0)
  const charges = personalizationCharges(
    data.personalizationTypes,
    chosen.map((product) => {
      const item = items[product.id] ?? { named: [], bySize: {}, options: [] }
      // No conjunto por partes, a personalização é por peça e as opções por conjunto.
      return item.kit
        ? {
            typeIds: product.personalizationTypeIds,
            options: item.options,
            rows: kitChargeRows(product, item.kit),
            pieces: totals.find((entry) => entry.product.id === product.id)?.pieces ?? 0,
          }
        : {
            typeIds: product.personalizationTypeIds,
            options: item.options,
            rows: rowsOf(item),
          }
    })
  )
  const personalizationValue = charges.reduce(
    (sum, charge) => sum + charge.value,
    0
  )
  const piecesValue = totals.reduce((sum, entry) => sum + (entry.value ?? 0), 0)
  const value = data.showPrices ? piecesValue + personalizationValue : null
  const send = useMutation({
    mutationFn: () => {
      const hasAddress =
        customer.street.trim() !== '' || customer.city.trim() !== ''
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
          .map((product) => {
            const item = items[product.id] ?? { named: [], bySize: {}, options: [] }
            if (item.kit) {
              const kit = kitToSubmit(product, item.kit)
              return {
                productId: product.id,
                rows: [],
                options: item.options,
                color: item.color?.trim() || null,
                kit,
                filled: kit.people.length + kit.counts.length > 0,
              }
            }
            const rows = rowsOf(item)
            return {
              productId: product.id,
              rows,
              options: item.options,
              color: item.color?.trim() || null,
              filled: rows.length > 0,
            }
          })
          .filter((item) => item.filled)
          .map(({ filled: _filled, ...item }) => item),
        notes: notes.trim() || null,
        event:
          isEvent === true
            ? { date: eventDate, name: eventName.trim() || null }
            : null,
        fabricId: fabric,
      })
    },
    onSuccess: () => {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        /* nada */
      }
      window.scrollTo({ top: 0 })
      onSent()
    },
  })

  const dispatch =
    isEvent === true
      ? eventDate === ''
        ? null
        : shiftDay(eventDate, -data.eventLeadDays)
      : shiftDay(data.today, data.leadDays)
  const eventPast =
    isEvent === true && eventDate !== '' && eventDate < data.today
  const eventTight =
    isEvent === true &&
    dispatch !== null &&
    !eventPast &&
    dispatch <= data.today
  const whenMissing =
    isEvent === null || (isEvent && (eventDate === '' || eventPast))

  const registrationMissing =
    data.needsRegistration &&
    (customer.name.trim().length < 2 ||
      customer.phone.replace(/\D/g, '').length < 10)

  // ---------------------------------------------------------------------------
  // As telas do link, uma de cada vez (pensado para o celular): escolher as
  // peças → o pedido (o carrinho) → montar cada peça → para quando → os dados
  // → conferir e enviar. O cliente volta ao pedido e acrescenta peças quando
  // quiser.
  // ---------------------------------------------------------------------------

  const statusOf = (product: Product) => {
    const item = items[product.id]
    const entry = totals.find((total) => total.product.id === product.id)
    const kitIssue = item?.kit ? kitProblem(product, item.kit) : null
    const sizeIssue =
      !item?.kit &&
      (item?.named ?? []).some(
        (row) => (row.name.trim() !== '' || row.number.trim() !== '') && row.size === ''
      )
        ? `Falta o tamanho de alguma pessoa em ${product.name}.`
        : null
    const fabricIssue =
      !madeIn(product, fabric) && fabric !== null
        ? `${product.name} não é feita em ${data.fabrics.find((f) => f.id === fabric)?.name ?? 'este tecido'}.`
        : null
    return {
      pieces: entry?.pieces ?? 0,
      value: entry?.value ?? null,
      problem: kitIssue ?? sizeIssue ?? fabricIssue,
    }
  }
  /** O que já tem: "5 conjuntos · 2 com nome". */
  const describe = (product: Product) => {
    const item = items[product.id]
    const { pieces: count } = statusOf(product)
    if (!item || count === 0) return 'Falta montar'
    const named = item.kit
      ? item.kit.people.filter((person) =>
          Object.values(person.pieces).some((piece) => piece.name.trim() !== '' || piece.number.trim() !== '')
        ).length
      : item.named.filter((row) => row.name.trim() !== '' || row.number.trim() !== '').length
    const unit = item.kit ? (count === 1 ? 'conjunto' : 'conjuntos') : count === 1 ? 'peça' : 'peças'
    return `${int(count)} ${unit}${named > 0 ? ` · ${int(named)} com nome` : ''}`
  }
  const pending = chosen.filter((product) => statusOf(product).pieces === 0)
  const problems = chosen.flatMap((product) => {
    const { problem, pieces: count } = statusOf(product)
    return problem !== null ? [problem] : count === 0 ? [`Falta montar ${product.name}.`] : []
  })
  const startItem = (product: Product): Item => ({
    named: [],
    bySize: {},
    options: [],
    ...(product.parts.length > 0 ? { kit: newKit(product) } : {}),
  })
  const toggle = (product: Product) => {
    if (items[product.id]) {
      if (
        statusOf(product).pieces > 0 &&
        !window.confirm(`Tirar ${product.name} do pedido? O que você preencheu nela some.`)
      )
        return
      setItems((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== product.id)))
    } else {
      setItems((all) => ({ ...all, [product.id]: startItem(product) }))
    }
  }
  /** A próxima peça escolhida que falta montar, ou o pedido. */
  const next = (after?: string): Screen => {
    const left = pending.filter((product) => product.id !== after)
    return left[0] ? { kind: 'montar', productId: left[0].id } : { kind: 'pedido' }
  }
  // O que costuma vir junto: primeiro os acessórios (manga longa, manguito,
  // meião…), depois as peças simples; outro conjunto ou kit por último.
  const suggestions = data.products
    .filter((product) => !items[product.id] && madeIn(product, fabric))
    .map((product) => ({
      product,
      score: ACCESSORY.test(product.name) ? 0 : product.parts.length >= 2 || /^(kit|conjunto)/i.test(product.name) ? 3 : 2,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((entry) => entry.product)
  const go = (to: Screen) => setScreen(to)

  const stepIndex =
    screen.kind === 'prazo' ? 1 : screen.kind === 'dados' ? 2 : screen.kind === 'revisar' ? (data.needsRegistration ? 3 : 2) : 0
  const steps = ['Peças', 'Prazo', ...(data.needsRegistration ? ['Seus dados'] : []), 'Conferir']
  const fabricName =
    fabric === null ? 'Não sei — a loja ajuda' : (data.fabrics.find((f) => f.id === fabric)?.name ?? 'Tecido')

  const fabricPicker = data.fabrics.length > 0 && (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-extrabold tracking-wider uppercase">Tecido</h2>
        {data.showPrices && <p className="mt-1 text-xs text-muted">O preço de cada peça muda com o tecido.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {[...data.fabrics.map((value) => [value.id, value.name] as const), [null, 'Não sei — a loja ajuda'] as const].map(
          ([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setFabric(value)}
              className={clsx(
                'rounded-full border-2 px-3 py-1.5 text-xs font-extrabold',
                fabric === value ? 'border-ink bg-lime' : 'border-line bg-white'
              )}
            >
              {label}
            </button>
          )
        )}
      </div>
    </section>
  )

  const product = screen.kind === 'montar' || screen.kind === 'pronto' ? data.products.find((p) => p.id === screen.productId) : undefined
  const item = product ? items[product.id] : undefined

  return (
    <div className="space-y-5 pb-36">
      <ol className="flex gap-1" aria-label="Etapas">
        {steps.map((label, index) => (
          <li key={label} className="flex-1">
            <span className={clsx('block h-1.5 rounded-full', index <= stepIndex ? 'bg-ink' : 'bg-line')} />
            <span className={clsx('mt-1 block text-[11px] font-bold', index === stepIndex ? 'text-ink' : 'text-muted')}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {screen.kind === 'escolher' && (
        <>
          <section>
            <h1 className="display text-3xl sm:text-4xl">
              {data.customerFirstName ? `Olá, ${data.customerFirstName}!` : 'Olá!'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Marque as peças que o time vai usar — quantas quiser. Depois você monta cada uma: tamanhos, nomes e números. O link
              vale até {day(data.expiresAt)}.
            </p>
            {data.message && <p className="mt-4 rounded-2xl bg-lime/40 p-4 text-sm font-semibold">{data.message}</p>}
          </section>
          {fabricPicker}
          <section className="space-y-2">
            <h2 className="text-sm font-extrabold tracking-wider uppercase">As peças</h2>
            {data.products.length === 0 && (
              <p className="text-sm text-muted">Nenhuma peça disponível neste link. Fale com quem te atendeu.</p>
            )}
            {data.products.map((entry) => {
              const picked = items[entry.id] !== undefined
              const made = madeIn(entry, fabric)
              const tiers = tiersOf(entry, fabric)
              const from = tiers.length > 0 ? Math.min(...tiers.map((tier) => Number(tier.unitPrice))) : entry.unitPrice === null ? null : Number(entry.unitPrice)
              return (
                <article
                  key={entry.id}
                  className={clsx('card flex items-start gap-3 p-4', picked && 'ring-2 ring-ink', !made && !picked && 'opacity-60')}
                >
                  <button
                    type="button"
                    disabled={!made && !picked}
                    onClick={() => toggle(entry)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    aria-pressed={picked}
                  >
                    <span
                      className={clsx(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2',
                        picked ? 'border-ink bg-ink text-lime' : 'border-line bg-white'
                      )}
                    >
                      {picked && <Check className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-extrabold">{entry.name}</span>
                      {entry.parts.length > 0 && (
                        <span className="line-clamp-2 block text-xs text-muted">
                          {entry.parts.map((part) => part.options.map((option) => option.piece).join(' ou ')).join(' + ')}
                        </span>
                      )}
                      {from !== null && made && <span className="block text-xs font-semibold text-muted">a partir de {money(from.toFixed(2))}</span>}
                      {!made && fabric !== null && (
                        <span className="block text-xs font-bold text-amber-800">Não é feita em {fabricName}.</span>
                      )}
                      {picked && <span className="mt-1 block text-xs font-bold">{describe(entry)}</span>}
                    </span>
                  </button>
                  {entry.sizeChartIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMeasuring(entry)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-bold"
                    >
                      <Ruler className="h-3.5 w-3.5" /> Medidas
                    </button>
                  )}
                </article>
              )
            })}
          </section>
          <BottomBar
            title={chosen.length === 0 ? 'Marque as peças' : `${int(chosen.length)} ${chosen.length === 1 ? 'escolhida' : 'escolhidas'}`}
            action={
              <Button variant="lime" disabled={chosen.length === 0} onClick={() => go(pending[0] ? next() : { kind: 'pedido' })}>
                {chosen.length > 0 && pending.length === 0 ? 'Ver o pedido' : 'Montar'}
              </Button>
            }
          />
        </>
      )}

      {screen.kind === 'pedido' && (
        <>
          {welcomeBack && (
            <p className="flex items-center justify-between gap-2 rounded-2xl bg-lime/40 p-3 text-sm font-semibold">
              Voltamos de onde você parou.
              <button type="button" className="text-xs underline" onClick={() => setWelcomeBack(false)}>
                ok
              </button>
            </p>
          )}
          <section>
            <h1 className="display text-3xl">Seu pedido</h1>
            <p className="mt-1 text-sm text-muted">Toque numa peça para montar ou mudar. Pode acrescentar quantas quiser.</p>
          </section>
          <section className="space-y-2">
            {chosen.map((entry) => {
              const status = statusOf(entry)
              return (
                <div key={entry.id} className="card flex items-center gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => go({ kind: 'montar', productId: entry.id })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block font-extrabold">{entry.name}</span>
                    <span
                      className={clsx(
                        'mt-0.5 block text-xs font-bold',
                        status.problem || status.pieces === 0 ? 'text-amber-800' : 'text-emerald-700'
                      )}
                    >
                      {status.problem ?? describe(entry)}
                    </span>
                  </button>
                  <Button size="sm" variant="outline" onClick={() => go({ kind: 'montar', productId: entry.id })}>
                    {status.pieces === 0 ? 'Montar' : 'Editar'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => toggle(entry)}
                    className="rounded-full p-2 text-muted hover:text-red-700"
                    aria-label={`Tirar ${entry.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => go({ kind: 'escolher' })}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/30 p-4 text-sm font-extrabold hover:border-ink"
            >
              <Plus className="h-4 w-4" /> Adicionar outra peça
            </button>
          </section>
          <p className="text-xs text-muted">
            Tecido: <strong>{fabricName}</strong>{' '}
            <button type="button" className="font-bold underline" onClick={() => go({ kind: 'escolher' })}>
              trocar
            </button>
          </p>
          <BottomBar
            title={`${int(pieces)} peças`}
            detail={value !== null && pieces > 0 ? `Cerca de ${money(value.toFixed(2))}` : undefined}
            hint={chosen.length > 0 ? problems[0] : 'Escolha pelo menos uma peça.'}
            action={
              <Button variant="lime" disabled={chosen.length === 0 || problems.length > 0 || pieces === 0} onClick={() => go({ kind: 'prazo' })}>
                Continuar
              </Button>
            }
          />
        </>
      )}

      {screen.kind === 'montar' && product && item && (
        <>
          <section>
            <button type="button" onClick={() => go({ kind: 'pedido' })} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-muted">
              <ArrowLeft className="h-3.5 w-3.5" /> Seu pedido
            </button>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="display text-2xl sm:text-3xl">{product.name}</h1>
                {product.parts.length > 0 && (
                  <p className="text-xs text-muted">
                    {product.parts.map((part) => part.options.map((option) => option.piece).join(' ou ')).join(' + ')}
                  </p>
                )}
              </div>
              {product.sizeChartIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMeasuring(product)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-bold"
                >
                  <Ruler className="h-3.5 w-3.5" /> Medidas
                </button>
              )}
            </div>
            <Tiers product={product} fabric={fabric} quantity={statusOf(product).pieces} />
          </section>
          <ColorChoice
            value={item.color ?? ''}
            onChange={(color) => setItems((all) => ({ ...all, [product.id]: { ...item, color } }))}
            kit={product.parts.length > 1}
          />
          <section className="card p-4">
            {data.personalizationTypes
              .filter((type) => product.personalizationTypeIds.includes(type.id) && type.kind === 'dados')
              .map((type) => (
                <p key={type.id} className="text-xs text-muted">
                  {type.name}
                  {type.unitPrice !== null && type.charge !== 'nenhuma' && `: ${money(type.unitPrice)} ${type.charge === 'por-pedido' ? 'por pedido' : 'por peça'}`}
                </p>
              ))}
            {item.kit ? (
              <KitEditor
                product={product}
                sizes={data.sizes}
                sizesOf={(sizeChartId) => {
                  const chart = data.sizeCharts.find((entry) => entry.id === sizeChartId)
                  if (!chart) return null
                  const all = chart.sections.flatMap((section) => section.rows.map((row) => row.size))
                  return data.sizes.filter((size) => all.includes(size))
                }}
                kit={item.kit}
                onChange={(kit) => setItems((all) => ({ ...all, [product.id]: { ...item, kit } }))}
              />
            ) : (
              <ItemEditor
                fields={product.fields}
                sizes={data.sizes}
                item={item}
                onChange={(changed) => setItems((all) => ({ ...all, [product.id]: changed }))}
              />
            )}
          </section>
          {data.personalizationTypes.some((type) => product.personalizationTypeIds.includes(type.id) && type.kind === 'opcao') && (
            <section className="card space-y-2 p-4">
              <h2 className="text-xs font-extrabold tracking-wide uppercase">Extras</h2>
              {data.personalizationTypes
                .filter((type) => product.personalizationTypeIds.includes(type.id) && type.kind === 'opcao')
                .map((type) => (
                  <label key={type.id} className="flex gap-2 rounded-xl bg-paper p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-ink"
                      checked={item.options.includes(type.id)}
                      onChange={(e) =>
                        setItems((all) => ({
                          ...all,
                          [product.id]: {
                            ...item,
                            options: e.target.checked ? [...item.options, type.id] : item.options.filter((id) => id !== type.id),
                          },
                        }))
                      }
                    />
                    <span>
                      <span className="block font-bold">{type.name}</span>
                      {type.unitPrice !== null && type.charge !== 'nenhuma' && (
                        <span className="block text-xs">
                          {money(type.unitPrice)} {type.charge === 'por-pedido' ? 'por pedido' : 'por peça'}
                        </span>
                      )}
                      {type.description && <span className="block text-xs text-muted">{type.description}</span>}
                    </span>
                  </label>
                ))}
            </section>
          )}
          <BottomBar
            title={describe(product).split(' · ')[0] ?? ''}
            detail={
              [
                describe(product).split(' · ')[1],
                data.showPrices && statusOf(product).value !== null && statusOf(product).pieces > 0
                  ? `cerca de ${money((statusOf(product).value ?? 0).toFixed(2))}`
                  : undefined,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
            hint={statusOf(product).problem ?? undefined}
            action={
              <Button
                variant="lime"
                disabled={statusOf(product).problem !== null || statusOf(product).pieces === 0}
                // As sugestões só depois da última peça a montar: no meio, segue para a próxima.
                onClick={() =>
                  go(
                    suggestions.length > 0 && pending.every((entry) => entry.id === product.id)
                      ? { kind: 'pronto', productId: product.id }
                      : next(product.id)
                  )
                }
              >
                Pronto
              </Button>
            }
          />
        </>
      )}

      {screen.kind === 'pronto' && product && (
        <>
          <section className="card p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />
            <h1 className="display text-2xl">{product.name}</h1>
            <p className="mt-1 text-sm font-bold">{describe(product)}</p>
          </section>
          {suggestions.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-extrabold tracking-wider uppercase">Quer acrescentar?</h2>
              {suggestions.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setItems((all) => ({ ...all, [entry.id]: startItem(entry) }))
                    go({ kind: 'montar', productId: entry.id })
                  }}
                  className="card flex w-full items-center gap-3 p-4 text-left"
                >
                  <Plus className="h-5 w-5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-extrabold">{entry.name}</span>
                    {entry.parts.length > 0 && (
                      <span className="block text-xs text-muted">
                        {entry.parts.map((part) => part.options.map((option) => option.piece).join(' ou ')).join(' + ')}
                      </span>
                    )}
                  </span>
                </button>
              ))}
              <button type="button" onClick={() => go({ kind: 'escolher' })} className="w-full p-2 text-sm font-bold underline">
                Ver todas as peças
              </button>
            </section>
          )}
          <BottomBar
            title={`${int(pieces)} peças no pedido`}
            action={
              <Button variant="lime" onClick={() => go(next(product.id))}>
                {pending.filter((entry) => entry.id !== product.id).length > 0 ? 'Próxima peça' : 'Ver o pedido'}
              </Button>
            }
          />
        </>
      )}

      {screen.kind === 'prazo' && (
        <>
          <button type="button" onClick={() => go({ kind: 'pedido' })} className="inline-flex items-center gap-1 text-xs font-bold text-muted">
            <ArrowLeft className="h-3.5 w-3.5" /> Seu pedido
          </button>
          <>      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-extrabold tracking-wider uppercase">
          Para quando?
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              [
                false,
                'Não é para um evento',
                `A gente produz em até ${String(data.leadDays)} dias.`,
              ],
              [
                true,
                'É para um evento',
                'Diga a data: o pedido sai uma semana antes.',
              ],
            ] as const
          ).map(([value, label, what]) => (
            <button
              key={label}
              type="button"
              onClick={() => setIsEvent(value)}
              className={clsx(
                'rounded-2xl border-2 px-4 py-3 text-left transition',
                isEvent === value
                  ? 'border-ink bg-lime'
                  : 'border-line hover:border-ink/30'
              )}
            >
              <span className="block text-sm font-extrabold">{label}</span>
              <span className="text-xs text-ink/70">{what}</span>
            </button>
          ))}
        </div>
        {isEvent === true && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data do evento" required>
              <input
                type="date"
                min={data.today}
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="field"
              />
            </Field>
            <Field label="Qual evento (opcional)">
              <input
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                maxLength={200}
                className="field"
                placeholder="Copa, corrida, formatura…"
              />
            </Field>
          </div>
        )}
        {isEvent !== null && dispatch !== null && !eventPast && (
          <p
            className={clsx(
              'rounded-2xl p-3 text-sm font-semibold',
              eventTight ? 'bg-amber-100 text-amber-900' : 'bg-paper'
            )}
          >
            {eventTight
              ? `O evento é em menos de uma semana. Envie mesmo assim: quem te atendeu vai ver se dá tempo.`
              : `Previsão de despacho: ${day(dispatch)}. Quem te atendeu confirma na conferência.`}
          </p>
        )}
        {eventPast && (
          <p className="text-sm font-semibold text-red-700">
            Essa data já passou.
          </p>
        )}
      </section>

      <section className="card p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-extrabold tracking-wider uppercase">
            Observação
          </span>
          <textarea
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="field resize-y"
            placeholder="Cor, detalhes da gola, quem vai retirar…"
          />
        </label>
      </section>
</>
          <BottomBar
            title="Para quando?"
            hint={whenMissing ? 'Diga se é para um evento ou não.' : undefined}
            action={
              <Button variant="lime" disabled={whenMissing} onClick={() => go({ kind: data.needsRegistration ? 'dados' : 'revisar' })}>
                Continuar
              </Button>
            }
          />
        </>
      )}

      {screen.kind === 'dados' && (
        <>
          <button type="button" onClick={() => go({ kind: 'prazo' })} className="inline-flex items-center gap-1 text-xs font-bold text-muted">
            <ArrowLeft className="h-3.5 w-3.5" /> Para quando
          </button>
          
        <section className="card space-y-4 p-5">
          <h2 className="text-sm font-extrabold tracking-wider uppercase">
            Seus dados
          </h2>
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
                className={clsx(
                  'rounded-full border-2 px-3 py-1.5 text-xs font-extrabold',
                  customer.kind === key ? 'border-ink bg-lime' : 'border-line'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={
                customer.kind === 'company'
                  ? 'Razão social / nome do time'
                  : 'Seu nome (ou do time)'
              }
              required
            >
              <input
                value={customer.name}
                onChange={(e) => setField('name', e.target.value)}
                maxLength={200}
                className="field"
                autoComplete="name"
              />
            </Field>
            <Field
              label={
                customer.kind === 'company'
                  ? 'CNPJ (opcional)'
                  : 'CPF (opcional)'
              }
            >
              <input
                value={customer.document}
                onChange={(e) => setField('document', e.target.value)}
                maxLength={20}
                inputMode="numeric"
                className="field"
              />
            </Field>
            <Field label="WhatsApp com DDD" required>
              <input
                value={customer.phone}
                onChange={(e) => setField('phone', e.target.value)}
                maxLength={30}
                inputMode="tel"
                className="field"
                autoComplete="tel"
                placeholder="(11) 98765-4321"
              />
            </Field>
            <Field label="E-mail (opcional)">
              <input
                value={customer.email}
                onChange={(e) => setField('email', e.target.value)}
                maxLength={200}
                inputMode="email"
                className="field"
                autoComplete="email"
              />
            </Field>
          </div>
          <p className="pt-2 text-xs font-extrabold tracking-wide text-muted uppercase">
            Endereço de entrega (opcional)
          </p>
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label="CEP" className="sm:col-span-2">
              <input
                value={customer.cep}
                onChange={(e) => setField('cep', formatCep(e.target.value))}
                inputMode="numeric"
                className="field"
                placeholder="00000-000"
              />
            </Field>
            <Field label="Rua" className="sm:col-span-4">
              <input
                value={customer.street}
                onChange={(e) => setField('street', e.target.value)}
                maxLength={200}
                className="field"
              />
            </Field>
            <Field label="Número" className="sm:col-span-2">
              <input
                value={customer.number}
                onChange={(e) => setField('number', e.target.value)}
                maxLength={20}
                className="field"
              />
            </Field>
            <Field label="Complemento" className="sm:col-span-4">
              <input
                value={customer.complement}
                onChange={(e) => setField('complement', e.target.value)}
                maxLength={120}
                className="field"
              />
            </Field>
            <Field label="Bairro" className="sm:col-span-2">
              <input
                value={customer.district}
                onChange={(e) => setField('district', e.target.value)}
                maxLength={120}
                className="field"
              />
            </Field>
            <Field label="Cidade" className="sm:col-span-3">
              <input
                value={customer.city}
                onChange={(e) => setField('city', e.target.value)}
                maxLength={120}
                className="field"
              />
            </Field>
            <Field label="UF" className="sm:col-span-1">
              <input
                value={customer.uf}
                onChange={(e) =>
                  setField('uf', e.target.value.toUpperCase().slice(0, 2))
                }
                className="field uppercase"
              />
            </Field>
          </div>
        </section>
          <BottomBar
            title="Seus dados"
            hint={registrationMissing ? 'Preencha o seu nome e o WhatsApp com DDD.' : undefined}
            action={
              <Button variant="lime" disabled={registrationMissing} onClick={() => go({ kind: 'revisar' })}>
                Continuar
              </Button>
            }
          />
        </>
      )}

      {screen.kind === 'revisar' && (
        <>
          <section>
            <h1 className="display text-3xl">Confira e envie</h1>
            <p className="mt-1 text-sm text-muted">Depois de enviado, só quem te atendeu consegue mudar.</p>
          </section>
          <section className="space-y-2">
            {chosen.map((entry) => (
              <ReviewRow
                key={entry.id}
                title={entry.name}
                text={`${describe(entry)} · cor: ${colorLabel(items[entry.id]?.color) ?? 'a loja define'}`}
                onEdit={() => go({ kind: 'montar', productId: entry.id })}
              />
            ))}
            <button
              type="button"
              onClick={() => go({ kind: 'escolher' })}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/30 p-3 text-sm font-extrabold"
            >
              <Plus className="h-4 w-4" /> Adicionar outra peça
            </button>
            {data.fabrics.length > 0 && <ReviewRow title="Tecido" text={fabricName} onEdit={() => go({ kind: 'escolher' })} />}
            <ReviewRow
              title="Para quando"
              text={
                isEvent
                  ? `Evento em ${day(eventDate)}${eventName.trim() ? ` · ${eventName.trim()}` : ''}`
                  : `Sem evento · produção em até ${String(data.leadDays)} dias`
              }
              onEdit={() => go({ kind: 'prazo' })}
            />
            {notes.trim() && <ReviewRow title="Observação" text={notes.trim()} onEdit={() => go({ kind: 'prazo' })} />}
            {data.needsRegistration && (
              <ReviewRow title="Seus dados" text={`${customer.name} · ${customer.phone}`} onEdit={() => go({ kind: 'dados' })} />
            )}
            {value !== null && pieces > 0 && (
              <div className="card p-4 text-sm">
                <p className="text-xs text-muted">
                  Peças {money(piecesValue.toFixed(2))}
                  {charges.map((charge) => ` · ${charge.type.name} ${money(charge.value.toFixed(2))}`).join('')}
                </p>
                <p className="mt-1 font-extrabold">Cerca de {money(value.toFixed(2))}</p>
                <p className="text-xs text-muted">O valor final vem na conferência.</p>
              </div>
            )}
            {send.isError && (
              <ErrorBox message={send.error instanceof ApiError ? send.error.message : errorMessage(send.error)} />
            )}
          </section>
          <BottomBar
            title={`${int(pieces)} peças`}
            detail={value !== null && pieces > 0 ? `Cerca de ${money(value.toFixed(2))}` : undefined}
            hint={problems[0] ?? (registrationMissing ? 'Preencha os seus dados.' : whenMissing ? 'Diga para quando.' : undefined)}
            action={
              <Button
                variant="lime"
                icon={send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                disabled={pieces === 0 || problems.length > 0 || registrationMissing || whenMissing || send.isPending}
                onClick={() => {
                  if (window.confirm('Enviar o pedido? Depois de enviado, só quem te atendeu consegue mudar.')) send.mutate()
                }}
              >
                Enviar pedido
              </Button>
            }
          />
        </>
      )}

      <Modal
        open={measuring !== null}
        title={measuring ? `Medidas — ${measuring.name}` : 'Medidas'}
        onClose={() => setMeasuring(null)}
        wide
      >
        <div className="space-y-6">
          {data.sizeCharts
            .filter((chart) => measuring?.sizeChartIds.includes(chart.id))
            .map((chart) => (
              <SizeChartTable key={chart.id} chart={chart} />
            ))}
        </div>
      </Modal>
    </div>
  )
}

/** O rascunho guardado no celular. */
type Draft = {
  items: Record<string, Item>
  notes: string
  isEvent: boolean | null
  eventDate: string
  eventName: string
  fabric: Fabric | null
  customer: Record<string, string>
}

type Screen =
  | { kind: 'escolher' }
  | { kind: 'pedido' }
  | { kind: 'montar'; productId: string }
  | { kind: 'pronto'; productId: string }
  | { kind: 'prazo' }
  | { kind: 'dados' }
  | { kind: 'revisar' }

/** A barra de baixo: o que já tem e o botão de seguir. Sempre à mão no celular. */
const BottomBar = ({
  title,
  detail,
  hint,
  action,
}: {
  title: string
  detail?: string | undefined
  hint?: string | undefined
  action: React.ReactNode
}) => (
  <section className="brush-bg fixed inset-x-0 bottom-0 z-20 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white shadow-xl sm:bottom-3 sm:mx-auto sm:max-w-3xl sm:rounded-3xl">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="display truncate text-lg sm:text-2xl">{title}</p>
        {detail && <p className="text-xs text-white/70">{detail}</p>}
      </div>
      {action}
    </div>
    {hint && <p className="mt-1.5 text-xs font-semibold text-lime">{hint}</p>}
  </section>
)

/** "Preto e Vermelho", "Azul piscina", "#00cfd5" — nulo sem cor. */
const colorLabel = (block: string | undefined): string | null => {
  const colors = parseColors(block ?? '')
  return colors.length === 0 ? null : colors.map((c) => c.name || c.hex).join(' e ')
}

/**
 * A cor do uniforme (F302): as cores comuns ou qualquer outra pelo RGB, com
 * o aviso de que a tela engana. Aberta na própria tela — no celular, uma
 * janela por cima atrapalha.
 */
const ColorChoice = ({ value, onChange, kit }: { value: string; onChange: (block: string) => void; kit: boolean }) => {
  const [open, setOpen] = useState(false)
  const colors = parseColors(value)
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold">Cor</p>
          {colors.length > 0 ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="inline-flex shrink-0 -space-x-1">
                {colors.map((c, i) => (
                  <ColorDot key={i} color={swatchOf(c)} className="h-4 w-4" />
                ))}
              </span>
              <span className="truncate">{colorLabel(value)}</span>
            </p>
          ) : (
            <p className="text-xs text-muted">Opcional — se não escolher, a loja combina com você.</p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((current) => !current)}>
          {open ? 'Fechar' : colors.length > 0 ? 'Trocar' : 'Escolher'}
        </Button>
      </div>
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <ColorPanel colors={colors} onChange={(next) => onChange(serializeColors(next))} onDone={() => setOpen(false)} />
        </div>
      )}
      <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
        A cor na tela do celular é diferente da cor do tecido de verdade. Quem te atendeu confirma a cor com você antes de
        produzir.
        {kit && ' Se cada peça do conjunto for de uma cor, conte na observação.'}
      </p>
    </section>
  )
}

/** Uma linha da conferência, com o "editar" que volta à tela dela. */
const ReviewRow = ({ title, text, onEdit }: { title: string; text: string; onEdit: () => void }) => (
  <div className="card flex items-center justify-between gap-3 p-4">
    <div className="min-w-0">
      <p className="font-extrabold">{title}</p>
      <p className="text-xs text-muted">{text}</p>
    </div>
    <button type="button" onClick={onEdit} className="shrink-0 text-xs font-bold underline">
      editar
    </button>
  </div>
)

/** As faixas de preço da peça, com a da quantidade de agora em destaque. */
const Tiers = ({ product, fabric, quantity }: { product: Product; fabric: Fabric | null; quantity: number }) => {
  const tiers = tiersOf(product, fabric)
  if (tiers.length === 0) return null
  const current = tiers.reduce((at, tier, index) => (Math.max(quantity, 1) >= tier.minQuantity ? index : at), 0)
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {tiers.map((tier, index) => (
        <span
          key={tier.minQuantity}
          className={clsx(
            'rounded-full px-2 py-0.5 text-[11px] font-bold',
            quantity > 0 && index === current ? 'bg-lime text-ink' : 'bg-white text-muted'
          )}
        >
          {tierLabel(tiers, index)} pç · {money(tier.unitPrice)}
        </span>
      ))}
    </div>
  )
}

const Field = ({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) => (
  <label className={clsx('block', className)}>
    <span className="label">
      {label}
      {required && <span className="text-red-600"> *</span>}
    </span>
    {children}
  </label>
)

/** Uma peça: os atletas com nome e número, e as que vão sem nome, só por tamanho. */
const ItemEditor = ({
  sizes,
  fields,
  item,
  onChange,
}: {
  sizes: readonly Size[]
  fields: readonly ('nome' | 'numero')[]
  item: Item
  onChange: (item: Item) => void
}) => {
  const [allSizes, setAllSizes] = useState(false)
  // "Vai ter nome ou número?": só abre as linhas de pessoa quando sim.
  const filledRow = (row: NamedRow) => row.name.trim() !== '' || row.number.trim() !== ''
  const [named, setNamed] = useState(item.named.some(filledRow))
  const chooseNamed = (value: boolean) => {
    if (value === named) return
    if (!value && item.named.some(filledRow) && !window.confirm('Tirar os nomes e números já preenchidos?')) return
    setNamed(value)
    onChange({ ...item, named: value ? (item.named.length > 0 ? item.named : [blankRow()]) : [] })
  }
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const shownSizes = allSizes
    ? sizes
    : sizes.filter((size) => ADULT.includes(size))
  const updateRow = (key: number, patch: Partial<NamedRow>) =>
    onChange({
      ...item,
      named: item.named.map((row) =>
        row.key === key ? { ...row, ...patch } : row
      ),
    })

  /** Nome, Número, Tamanho, Qtde — separados por tabulação (Excel) ou ponto e vírgula. */
  const applyPaste = () => {
    const rows: NamedRow[] = []
    const bad: number[] = []
    pasted.split(/\r?\n/).forEach((line, index) => {
      if (line.trim() === '') return
      const [name = '', number = '', sizeText = '', quantity = ''] = (
        line.includes('\t') ? line.split('\t') : line.split(';')
      ).map((cell) => cell.trim())
      if (index === 0 && name.toLowerCase() === 'nome') return
      const size = sizeText.toUpperCase() as Size
      if (
        !sizes.includes(size) ||
        (quantity !== '' && !/^\d{1,5}$/.test(quantity))
      ) {
        bad.push(index + 1)
        return
      }
      rows.push({
        key: nextKey++,
        name: fields.includes('nome') ? name : '',
        number: fields.includes('numero') ? number : '',
        size,
        quantity: quantity || '1',
      })
    })
    if (rows.length === 0) {
      setPasteError(
        'Não consegui ler nenhuma linha. Use: Nome, Número, Tamanho, Qtde.'
      )
      return
    }
    onChange({
      ...item,
      named: [
        ...item.named.filter((row) => row.name || row.number || row.size),
        ...rows,
      ],
    })
    setPasteError(
      bad.length > 0
        ? `Linhas que não li: ${bad.join(', ')} (confira o tamanho).`
        : null
    )
    setPasted('')
    setPasting(bad.length > 0)
  }

  return (
    <div className="mt-4 space-y-5 border-t border-line pt-4">
      {fields.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-extrabold">Vai ter nome ou número?</p>
          <div className="flex gap-2">
            {(
              [
                [true, 'Sim'],
                [false, 'Não'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => chooseNamed(value)}
                className={clsx(
                  'flex-1 rounded-2xl border-2 px-4 py-2.5 text-sm font-extrabold',
                  named === value ? 'border-ink bg-lime' : 'border-line bg-white'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {fields.length > 0 && named && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-extrabold tracking-wide uppercase">
              Personalização:{' '}
              {fields
                .map((f) => (f === 'nome' ? 'nome' : 'número'))
                .join(' e ')}
            </p>
            <button
              type="button"
              onClick={() => setPasting((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> Colar do Excel
            </button>
          </div>
          {pasting && (
            <div className="mb-3 rounded-2xl bg-paper p-3">
              <p className="mb-2 text-xs text-muted">
                Copie da planilha as colunas{' '}
                <strong>Nome, Número, Tamanho, Qtde</strong> e cole aqui.
              </p>
              <textarea
                rows={4}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                className="field font-mono text-xs"
                placeholder={'Ana\t10\tM\t1\nBeto\t7\tG\t1'}
              />
              {pasteError && (
                <p className="mt-1 text-xs font-semibold text-amber-800">
                  {pasteError}
                </p>
              )}
              <Button
                size="sm"
                variant="ink"
                className="mt-2"
                onClick={applyPaste}
                disabled={pasted.trim() === ''}
              >
                Usar estas linhas
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {item.named.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_4.5rem] gap-2 sm:grid-cols-[1fr_5rem_6rem_5rem_auto]"
              >
                {fields.includes('nome') && (
                  <input
                    value={row.name}
                    onChange={(e) =>
                      updateRow(row.key, { name: e.target.value })
                    }
                    maxLength={80}
                    placeholder="Nome na camisa"
                    className="field"
                    aria-label="Nome"
                  />
                )}
                {fields.includes('numero') && (
                  <input
                    value={row.number}
                    onChange={(e) =>
                      updateRow(row.key, { number: e.target.value })
                    }
                    maxLength={10}
                    placeholder="Nº"
                    className="field"
                    aria-label="Número"
                  />
                )}
                <select
                  value={row.size}
                  onChange={(e) =>
                    updateRow(row.key, { size: e.target.value as Size })
                  }
                  className={clsx(
                    'field',
                    row.size === '' &&
                      (row.name || row.number) &&
                      'border-red-500'
                  )}
                  aria-label="Tamanho"
                >
                  <option value="">Tamanho</option>
                  {sizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <input
                  value={row.quantity}
                  onChange={(e) =>
                    updateRow(row.key, {
                      quantity: e.target.value.replace(/\D/g, ''),
                    })
                  }
                  inputMode="numeric"
                  className="field"
                  aria-label="Quantidade"
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...item,
                      named: item.named.filter((r) => r.key !== row.key),
                    })
                  }
                  className="col-span-2 inline-flex items-center gap-1 justify-self-start rounded-full px-1 text-xs font-bold text-muted hover:text-red-700 sm:col-span-1 sm:p-2"
                  aria-label="Tirar linha"
                >
                  <Minus className="h-4 w-4" />{' '}
                  <span className="sm:hidden">Tirar esta pessoa</span>
                </button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() =>
              onChange({ ...item, named: [...item.named, blankRow()] })
            }
          >
            Mais uma pessoa
          </Button>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">
          Sem nome — quantas por tamanho
        </p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {shownSizes.map((size) => (
            <label key={size} className="block text-center">
              <span className="text-xs font-extrabold">{size}</span>
              <input
                value={item.bySize[size] ?? ''}
                onChange={(e) =>
                  onChange({
                    ...item,
                    bySize: {
                      ...item.bySize,
                      [size]: e.target.value.replace(/\D/g, ''),
                    },
                  })
                }
                inputMode="numeric"
                placeholder="0"
                className="field mt-1 text-center"
                aria-label={`Quantas ${size} sem nome`}
              />
            </label>
          ))}
        </div>
        {!allSizes && (
          <button
            type="button"
            onClick={() => setAllSizes(true)}
            className="mt-2 text-xs font-bold hover:underline"
          >
            Mais tamanhos (G1–G4, infantil)
          </button>
        )}
      </div>
    </div>
  )
}
