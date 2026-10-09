import type { IntakeSummaryType } from '@/contracts/aeris/uniforms.ts'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Check, ClipboardCheck, Copy, ExternalLink, Link2, MessageCircle, Plus, Search, X } from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { fetchCustomers } from '@/api/store'
import { cancelIntake, convertIntake, createIntake, fetchUniformCatalog } from '@/api/uniforms'
import { useToast } from '@/components/Toast'
import { Badge, Button, Empty, ErrorBox, Modal, PageHeader, Spinner } from '@/components/ui'
import { day, int } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys, useIntake, useIntakes } from '@/lib/queries'
import { FABRIC_LABELS, orderRef } from '@/lib/uniforms'

type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success' | 'lime'
type Fabric = IntakeSummaryType['fabrics'][number]

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value) => right.includes(value))

const STATUS_META: Record<IntakeSummaryType['status'], { label: string; tone: Tone }> = {
  aberto: { label: 'Esperando o cliente', tone: 'info' },
  enviado: { label: 'Enviado pelo cliente', tone: 'warning' },
  convertido: { label: 'Virou pedido', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
  expirado: { label: 'Venceu', tone: 'neutral' },
}

const TABS = [
  { key: 'enviado', label: 'Para conferir' },
  { key: 'aberto', label: 'Esperando o cliente' },
  { key: undefined, label: 'Todos' },
] as const

export const linkUrl = (token: string): string => `${window.location.origin}/pedido/${token}`

const whatsappUrl = (intake: IntakeSummaryType): string | null => {
  const digits = intake.contactPhone?.replace(/\D/g, '') ?? ''
  if (digits.length < 10) return null
  const phone = digits.startsWith('55') ? digits : `55${digits}`
  const text = `Oi! Monte o seu pedido da 4Play por aqui: escolha as peças e preencha nome, número e tamanho de cada um. ${linkUrl(intake.token)}`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

/**
 * Os links de pedido para o cliente (F232 do Aeris): gerar, mandar pelo
 * WhatsApp, acompanhar e conferir o que o cliente preencheu.
 */
export const LinksPage = () => {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('enviado')
  const list = useIntakes(tab)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<IntakeSummaryType | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)

  return (
    <div>
      <PageHeader
        kicker="O cliente monta a grade"
        title="Links do cliente"
        actions={
          <Button variant="lime" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            Gerar link
          </Button>
        }
      >
        <p className="mt-2 text-sm font-semibold text-muted">
          Mande o link; o cliente escolhe as peças e preenche nome, número e tamanho (e o cadastro, se for novo). Você confere e o pedido nasce.
        </p>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setTab(option.key)}
            className={clsx('rounded-full px-3 py-1.5 text-xs font-bold', tab === option.key ? 'bg-ink text-white' : 'bg-black/5')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {list.isPending && <Spinner />}
      {list.isError && <ErrorBox message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <Empty title={tab === 'enviado' ? 'Nada para conferir' : 'Nenhum link aqui'}>
          <p>Gere um link e mande para o cliente pelo WhatsApp.</p>
        </Empty>
      )}

      <div className="space-y-2">
        {list.data?.map((intake) => (
          <IntakeRow key={intake.id} intake={intake} onReview={() => setReviewing(intake.id)} />
        ))}
      </div>

      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(intake) => {
          setCreating(false)
          setCreated(intake)
        }}
      />
      <CreatedDialog intake={created} onClose={() => setCreated(null)} />
      <ReviewDialog id={reviewing} onClose={() => setReviewing(null)} />
    </div>
  )
}

const CopyButton = ({ intake }: { intake: IntakeSummaryType }) => {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      onClick={() => {
        void navigator.clipboard.writeText(linkUrl(intake.token)).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
    >
      {copied ? 'Copiado' : 'Copiar link'}
    </Button>
  )
}

const IntakeRow = ({ intake, onReview }: { intake: IntakeSummaryType; onReview: () => void }) => {
  const queryClient = useQueryClient()
  const meta = STATUS_META[intake.status]
  const wa = whatsappUrl(intake)
  const cancel = useMutation({
    mutationFn: () => cancelIntake(intake.id, intake.version),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.intakesAll }),
  })
  const who = intake.submittedName ?? intake.customer?.name ?? intake.contactPhone ?? intake.contactEmail ?? 'Cliente'

  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-extrabold">{who}</p>
          <p className="text-xs text-muted">
            {intake.customer ? 'Cliente cadastrado' : 'Cliente novo'}
            {intake.contactPhone && ` · ${intake.contactPhone}`} · gerado {day(intake.createdAt)}
            {intake.createdByName && ` por ${intake.createdByName}`}
            {intake.status === 'aberto' && ` · vale até ${day(intake.expiresAt)}`}
            {intake.submittedAt && ` · enviado ${day(intake.submittedAt)} · ${int(intake.submittedPieces)} peças`}
          </p>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {intake.status === 'enviado' && (
          <Button size="sm" variant="ink" icon={<ClipboardCheck className="h-3.5 w-3.5" />} onClick={onReview}>
            Conferir
          </Button>
        )}
        {intake.status === 'aberto' && <CopyButton intake={intake} />}
        {intake.status === 'aberto' && wa && (
          <a href={wa} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" icon={<MessageCircle className="h-3.5 w-3.5" />}>
              WhatsApp
            </Button>
          </a>
        )}
        {intake.order && (
          <Link to={`/pedidos/${intake.order.id}`}>
            <Button size="sm" variant="outline" icon={<ExternalLink className="h-3.5 w-3.5" />}>
              Pedido {orderRef(intake.order)}
            </Button>
          </Link>
        )}
        {(intake.status === 'aberto' || intake.status === 'enviado') && (
          <Button
            size="sm"
            variant="ghost"
            icon={<X className="h-3.5 w-3.5" />}
            busy={cancel.isPending}
            onClick={() => {
              if (window.confirm('Cancelar este link? O cliente não consegue mais enviar.')) cancel.mutate()
            }}
          >
            Cancelar
          </Button>
        )}
      </div>
      {cancel.isError && <p className="mt-2 text-xs font-semibold text-red-700">{errorMessage(cancel.error)}</p>}
    </article>
  )
}

const CreateDialog = ({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (intake: IntakeSummaryType) => void
}) => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const deferred = useDeferredValue(search.trim())
  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [showPrices, setShowPrices] = useState(false)
  const [restrict, setRestrict] = useState(false)
  const [productIds, setProductIds] = useState<string[]>([])
  const [fabrics, setFabrics] = useState<Fabric[] | null>(null)
  const [days, setDays] = useState(7)
  const [leadDays, setLeadDays] = useState(30)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    setSearch('')
    setCustomer(null)
    setPhone('')
    setEmail('')
    setShowPrices(false)
    setRestrict(false)
    setProductIds([])
    setFabrics(null)
    setDays(7)
    setLeadDays(30)
    setMessage('')
  }, [open])

  const customers = useQuery({
    queryKey: ['customers', 'intake', deferred],
    queryFn: ({ signal }) => fetchCustomers({ search: deferred, pageSize: 6, page: 1 }, signal),
    enabled: open && deferred.length >= 2 && customer === null,
    placeholderData: keepPreviousData,
  })
  // A tabela da loja (F258 do Aeris): as peças com o descontinuado, e os tecidos.
  const catalog = useQuery({
    queryKey: ['uniform-catalog'],
    queryFn: ({ signal }) => fetchUniformCatalog(signal),
    enabled: open,
    staleTime: 60_000,
  })
  const pieces = catalog.data?.products.filter((product) => product.kind === 'peca') ?? []
  const defaultFabrics = catalog.data?.fabrics.filter((entry) => !entry.discontinued).map((entry) => entry.fabric) ?? []
  const chosenFabrics = fabrics ?? defaultFabrics
  const offeredFabrics = catalog.data?.fabrics.filter((entry) => pieces.some((product) => product.variants.some((variant) => variant.fabric === entry.fabric))) ?? []

  const create = useMutation({
    mutationFn: () =>
      createIntake({
        customerPartyId: customer?.id ?? null,
        phone: customer ? (customer.phone ?? null) : phone.trim() || null,
        email: customer ? null : email.trim() || null,
        showPrices,
        productIds: restrict ? productIds : [],
        // Os tecidos de sempre (os não descontinuados) vão vazios: o link segue a tabela da loja.
        fabrics: fabrics === null || sameSet(fabrics, defaultFabrics) ? [] : fabrics,
        expiresInDays: days,
        leadDays,
        message: message.trim() || null,
      }),
    onSuccess: (intake) => {
      void queryClient.invalidateQueries({ queryKey: keys.intakesAll })
      onCreated(intake)
    },
  })

  const ready =
    (customer !== null || phone.replace(/\D/g, '').length >= 10 || email.includes('@')) &&
    (!restrict || productIds.length > 0) &&
    (offeredFabrics.length === 0 || chosenFabrics.length > 0)

  return (
    <Modal
      open={open}
      wide
      title="Gerar link para o cliente"
      onClose={() => {
        create.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="lime" icon={<Link2 className="h-4 w-4" />} busy={create.isPending} disabled={!ready} onClick={() => create.mutate()}>
            Gerar link
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Cliente</p>
          {customer ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-lime/40 px-4 py-3">
              <span className="text-sm font-bold">{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</span>
              <button type="button" onClick={() => setCustomer(null)} className="text-xs font-bold underline">Trocar</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Já é cliente? Procure pelo nome ou documento" className="field pl-9" />
              </div>
              {customers.data && customers.data.items.length > 0 && (
                <div className="mt-2 space-y-1">
                  {customers.data.items.map((party) => (
                    <button
                      key={party.id}
                      type="button"
                      onClick={() => setCustomer({ id: party.id, name: party.tradeName ?? party.legalName, phone: party.mainPhone ?? null })}
                      className="block w-full rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-ink/30"
                    >
                      <strong>{party.tradeName ?? party.legalName}</strong>
                      {party.mainPhone && <span className="text-muted"> · {party.mainPhone}</span>}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-3 mb-2 text-xs text-muted">Cliente novo? Diga o WhatsApp ou o e-mail — ele preenche o cadastro no link. Se o número já for de um cliente, o link fica no nome dele.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="WhatsApp com DDD" className="field" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="E-mail (opcional)" className="field" />
              </div>
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-2xl border border-line p-3 text-sm">
            <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} className="mt-1" />
            <span>
              <strong>Mostrar o preço</strong>
              <span className="block text-xs text-muted">O cliente vê o preço de cada peça (da tabela).</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-2xl border border-line p-3 text-sm">
            <input
              type="checkbox"
              checked={restrict}
              onChange={(e) => {
                setRestrict(e.target.checked)
                // Começa com as peças da tabela; a descontinuada fica desmarcada (liga quem precisa).
                if (e.target.checked && productIds.length === 0)
                  setProductIds(pieces.filter((product) => !product.discontinued).map((product) => product.id))
              }}
              className="mt-1"
            />
            <span>
              <strong>Escolher as peças</strong>
              <span className="block text-xs text-muted">Sem marcar, ele escolhe entre as peças da tabela (menos as descontinuadas).</span>
            </span>
          </label>
        </div>

        {restrict && (
          <div>
            <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Peças que ele pode escolher</p>
            {catalog.isPending && <Spinner />}
            <div className="grid max-h-60 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {pieces.map((product) => {
                const on = productIds.includes(product.id)
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setProductIds((ids) => (on ? ids.filter((id) => id !== product.id) : [...ids, product.id]))}
                    className={clsx('rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold', on ? 'border-ink bg-lime' : 'border-line')}
                  >
                    {product.name}
                    {product.discontinued && <span className="ml-1 text-[11px] font-bold text-amber-800">· descontinuada</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {offeredFabrics.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Tecidos que ele pode escolher</p>
            <div className="flex flex-wrap gap-2">
              {offeredFabrics.map((entry) => {
                const on = chosenFabrics.includes(entry.fabric)
                return (
                  <button
                    key={entry.fabric}
                    type="button"
                    onClick={() => setFabrics(on ? chosenFabrics.filter((f) => f !== entry.fabric) : [...chosenFabrics, entry.fabric])}
                    className={clsx('rounded-full border-2 px-3 py-1.5 text-xs font-extrabold', on ? 'border-ink bg-lime' : 'border-line')}
                  >
                    {FABRIC_LABELS[entry.fabric]}
                    {entry.discontinued && <span className="ml-1 font-bold text-amber-800">· descontinuado</span>}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-muted">O descontinuado só aparece para o cliente se você marcar aqui.</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold tracking-wide uppercase">Vale por</span>
          {[3, 7, 15, 30].map((option) => (
            <button key={option} type="button" onClick={() => setDays(option)} className={clsx('rounded-full border-2 px-3 py-1 text-xs font-extrabold', days === option ? 'border-ink bg-lime' : 'border-line')}>
              {option} dias
            </button>
          ))}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold tracking-wide uppercase">Prazo de produção</span>
            {[15, 20, 30, 45].map((option) => (
              <button key={option} type="button" onClick={() => setLeadDays(option)} className={clsx('rounded-full border-2 px-3 py-1 text-xs font-extrabold', leadDays === option ? 'border-ink bg-lime' : 'border-line')}>
                {option} dias
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Sem evento, o despacho fica para o dia do envio mais este prazo. Com evento, uma semana antes da data dele.</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">Recado no topo da página (opcional)</span>
          <textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} className="field resize-y" placeholder="Oi! Preencha a grade do time até sexta, por favor." />
        </label>

        {create.isError && <ErrorBox message={errorMessage(create.error)} />}
      </div>
    </Modal>
  )
}

const CreatedDialog = ({ intake, onClose }: { intake: IntakeSummaryType | null; onClose: () => void }) => {
  const wa = intake ? whatsappUrl(intake) : null
  return (
    <Modal open={intake !== null} title="Link pronto" onClose={onClose} footer={<Button variant="ink" onClick={onClose}>Fechar</Button>}>
      {intake && (
        <div className="space-y-4 text-sm">
          <p>
            {intake.customer ? `Link de ${intake.customer.name}` : 'Link de cliente novo'} — vale até <strong>{day(intake.expiresAt)}</strong>.
          </p>
          <p className="rounded-xl bg-paper p-3 font-mono text-xs break-all">{linkUrl(intake.token)}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton intake={intake} />
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer">
                <Button size="sm" variant="lime" icon={<MessageCircle className="h-3.5 w-3.5" />}>
                  Mandar pelo WhatsApp
                </Button>
              </a>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

const ReviewDialog = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const detail = useIntake(id)
  const convert = useMutation({
    mutationFn: () => convertIntake(id ?? '', detail.data?.intake.version ?? 0),
    onSuccess: (order) => {
      toast(`Pedido ${orderRef(order)} criado. Ele está em Atendimento.`)
      void queryClient.invalidateQueries({ queryKey: keys.intakesAll })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
      onClose()
      void navigate(`/pedidos/${order.id}`)
    },
  })
  const submission = detail.data?.submission ?? null
  const customer = submission?.customer ?? null

  return (
    <Modal
      open={id !== null}
      wide
      title="Conferir o pedido do cliente"
      onClose={() => {
        convert.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button variant="lime" icon={<Check className="h-4 w-4" />} busy={convert.isPending} disabled={detail.data?.intake.status !== 'enviado'} onClick={() => convert.mutate()}>
            Está certo — criar o pedido
          </Button>
        </>
      }
    >
      {detail.isPending && <Spinner />}
      {detail.isError && <ErrorBox message={errorMessage(detail.error)} />}
      {detail.data && submission && (
        <div className="space-y-5 text-sm">
          {customer ? (
            <section className="rounded-2xl border border-line p-4">
              <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Cadastro novo — confira</p>
              <p className="font-extrabold">{customer.name}</p>
              <p className="text-xs text-muted">
                {customer.kind === 'company' ? 'Empresa' : 'Pessoa'}
                {customer.document && ` · ${customer.document}`} · {customer.phone}
                {customer.email && ` · ${customer.email}`}
              </p>
              {customer.address && (
                <p className="mt-1 text-xs">
                  {customer.address.street}
                  {customer.address.number && `, ${customer.address.number}`}
                  {customer.address.complement && ` — ${customer.address.complement}`}
                  {customer.address.district && ` · ${customer.address.district}`} · {customer.address.city}/{customer.address.uf}
                  {customer.address.cep && ` · CEP ${customer.address.cep}`}
                </p>
              )}
            </section>
          ) : (
            <p className="rounded-2xl bg-paper p-3">Cliente: <strong>{detail.data.intake.customer?.name}</strong></p>
          )}

          {submission.items.map((item) => {
            // Só o número também é personalizado (F258 do Aeris).
            const named = item.rows.filter((row) => row.name !== null || row.number !== null)
            const plain = item.rows.filter((row) => row.name === null && row.number === null)
            const total = item.rows.reduce((sum, row) => sum + row.quantity, 0)
            return (
              <section key={item.productId} className="rounded-2xl border border-line p-4">
                <p className="mb-2 font-extrabold">
                  {item.productName} <span className="font-semibold text-muted">· {total} peças</span>
                </p>
                {named.length > 0 && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-1">Nome</th>
                        <th>Nº</th>
                        <th>Tam.</th>
                        <th className="text-right">Qtde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {named.map((row, index) => (
                        <tr key={index} className="border-t border-line">
                          <td className="py-1">{row.name ?? '—'}</td>
                          <td>{row.number ?? '—'}</td>
                          <td>{row.size}</td>
                          <td className="text-right">{row.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {plain.length > 0 && (
                  <p className="mt-2 text-xs">
                    Sem nome: {plain.map((row) => `${String(row.quantity)} ${row.size}`).join(' · ')}
                  </p>
                )}
              </section>
            )
          })}
          <section className={clsx('rounded-2xl p-4', submission.tight ? 'bg-amber-100 text-amber-900' : 'bg-paper')}>
            <p className="mb-1 text-xs font-extrabold tracking-wide uppercase">Para quando</p>
            <p>
              {submission.event
                ? <>Evento{submission.event.name ? ` "${submission.event.name}"` : ''} em <strong>{day(submission.event.date)}</strong>. </>
                : <>Sem evento ({detail.data.intake.leadDays} dias de prazo). </>}
              Despacho calculado: <strong>{day(submission.dispatchDate)}</strong>
              {submission.tight && ' — prazo curto, confira se dá tempo.'}
            </p>
            <p className="mt-1">
              Tecido: <strong>{submission.fabric === null ? 'não sabe — a loja ajuda' : FABRIC_LABELS[submission.fabric]}</strong>
            </p>
            {submission.noLogo && <p className="mt-1 font-bold">Sem o logo da 4Play (o acréscimo entra no pedido).</p>}
            {submission.earlyArt && <p className="mt-1 font-bold">Quer aprovar a arte antes do pedido: cobrar a arte e descontar no pedido.</p>}
          </section>
          {submission.notes && <p className="rounded-2xl bg-paper p-3"><strong>Observação:</strong> {submission.notes}</p>}
          <p className="text-xs text-muted">
            Ao criar, {customer ? 'o cadastro do cliente nasce, ' : ''}o pedido é confirmado pelo preço da tabela e entra em Atendimento com a grade e os nomes. Dá para ajustar tudo depois na ficha.
          </p>
          {convert.isError && <ErrorBox message={errorMessage(convert.error)} />}
        </div>
      )}
    </Modal>
  )
}
