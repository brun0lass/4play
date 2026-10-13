import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Building2, History, Loader2, Mail, MapPin, Pencil, Phone, Plus, Trash2, User, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import {
  addPartyAddress,
  addPartyContact,
  fetchParty,
  removePartyAddress,
  removePartyContact,
  updateParty,
  updatePartyAddress,
  type PartyDetail,
} from '@/api/parties'
import { useAuth } from '@/auth/AuthProvider'
import { CustomerHistory } from '@/components/CustomerHistory'
import { useToast } from '@/components/Toast'
import { Badge, Button, ErrorBox, Modal, Spinner } from '@/components/ui'
import { UF_VALUES } from '@/contracts/aeris/party.ts'
import { cepDigits, formatCep, lookupCep } from '@/lib/cep'
import { day } from '@/lib/format'
import { errorMessage } from '@/lib/http'

/**
 * A ficha do cliente: quem é (nome, empresa, documento), como falar com ele,
 * para onde vai a entrega e os pedidos que já fez. Abre ao clicar no cliente.
 *
 * Quem tem `party.write` edita ali mesmo; os outros só leem. O Consumidor
 * Final é do sistema e não se edita.
 */

type Uf = (typeof UF_VALUES)[number]
type Address = PartyDetail['addresses'][number]
type ContactKind = PartyDetail['contacts'][number]['kind']

const CONTACT_LABELS: Record<ContactKind, string> = {
  whatsapp: 'WhatsApp',
  mobile: 'Celular',
  phone: 'Telefone',
  email: 'E-mail',
}

const digits = (text: string) => text.replace(/\D/g, '')

/** 11 dígitos é CPF, 14 é CNPJ; o resto fica como veio. */
export const formatDocument = (doc: string | null): string => {
  if (!doc) return ''
  const d = digits(doc)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

const formatPhone = (value: string): string => {
  const d = digits(value).replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return value
}

const whatsappLink = (phone: string) => `https://wa.me/55${digits(phone).replace(/^55/, '')}`

export const addressText = (a: Address): string =>
  [
    [a.street, a.number].filter(Boolean).join(', '),
    a.complement,
    a.district,
    `${a.city}/${a.uf}`,
    a.cep ? `CEP ${formatCep(a.cep)}` : null,
  ]
    .filter(Boolean)
    .join(' — ')

const Block = ({ title, icon, aside, children }: { title: string; icon: ReactNode; aside?: ReactNode; children: ReactNode }) => (
  <section className="rounded-2xl border border-line p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-extrabold tracking-wider text-muted uppercase">
        {icon} {title}
      </h3>
      {aside}
    </div>
    {children}
  </section>
)

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <p className="text-[10px] font-extrabold tracking-wider text-muted uppercase">{label}</p>
    <div className="text-sm font-semibold break-words">{children}</div>
  </div>
)

export const CustomerDialog = ({ partyId, onClose }: { partyId: string | null; onClose: () => void }) => {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [showHistory, setShowHistory] = useState(false)
  const query = useQuery({
    queryKey: ['party', partyId],
    queryFn: ({ signal }) => fetchParty(partyId ?? '', signal),
    enabled: partyId !== null,
  })

  useEffect(() => setShowHistory(false), [partyId])

  const party = query.data
  const editable = can('party.write') && party !== undefined && !party.isSystem
  /** Toda resposta traz o cadastro inteiro: guarda e avisa a lista. */
  const saved = (next: PartyDetail) => {
    queryClient.setQueryData(['party', next.id], next)
    void queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  return (
    <Modal
      open={partyId !== null}
      wide
      title={party ? (party.tradeName ?? party.legalName) : 'Cliente'}
      onClose={onClose}
      footer={<Button variant="ink" onClick={onClose}>Fechar</Button>}
    >
      {query.isPending && <Spinner />}
      {query.isError && <ErrorBox message={errorMessage(query.error)} onRetry={() => void query.refetch()} />}
      {party && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="neutral">{party.kind === 'company' ? 'Time, escola ou empresa' : 'Pessoa'}</Badge>
            {party.code != null && <Badge tone="neutral">#{party.code}</Badge>}
            {party.tags.map((tag) => (
              <Badge key={tag.id} tone={tag.tone === 'neutral' ? 'neutral' : tag.tone}>{tag.name}</Badge>
            ))}
            {party.createdAt && <span className="text-muted">Cliente desde {day(party.createdAt)}</span>}
          </div>

          <MainData party={party} editable={editable} onSaved={saved} />
          <Contacts party={party} editable={editable} onSaved={saved} />
          <Addresses party={party} editable={editable} onSaved={saved} />

          {can('uniforms.read') && (
            <Block title="Pedidos e máquinas" icon={<History className="h-3.5 w-3.5" />}>
              {showHistory ? (
                <CustomerHistory partyId={party.id} />
              ) : (
                <Button variant="outline" size="sm" icon={<History className="h-4 w-4" />} onClick={() => setShowHistory(true)}>
                  Ver os pedidos e as impressoras
                </Button>
              )}
            </Block>
          )}
        </div>
      )}
    </Modal>
  )
}

type SectionProps = { party: PartyDetail; editable: boolean; onSaved: (party: PartyDetail) => void }

const MainData = ({ party, editable, onSaved }: SectionProps) => {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const initial = () => ({
    kind: party.kind,
    legalName: party.legalName,
    tradeName: party.tradeName ?? '',
    document: formatDocument(party.document),
    notes: party.notes ?? '',
  })
  const [form, setForm] = useState(initial)
  useEffect(() => {
    if (!editing) setForm(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, editing])

  const m = useMutation({
    mutationFn: () =>
      updateParty(party.id, {
        version: party.version,
        kind: form.kind,
        legalName: form.legalName,
        tradeName: form.kind === 'company' ? form.tradeName : '',
        document: form.document,
        notes: form.notes,
      }),
    onSuccess: (next) => {
      onSaved(next)
      setEditing(false)
      toast('Dados do cliente gravados.')
    },
  })

  if (!editing)
    return (
      <Block
        title="Dados"
        icon={party.kind === 'company' ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
        aside={
          editable && (
            <Button variant="outline" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
              Editar
            </Button>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={party.kind === 'company' ? 'Nome / razão social' : 'Nome completo'}>{party.legalName}</Field>
          {party.kind === 'company' && <Field label="Nome fantasia / empresa">{party.tradeName ?? '—'}</Field>}
          <Field label={party.kind === 'company' ? 'CNPJ' : 'CPF'}>{formatDocument(party.document) || '—'}</Field>
          {party.salespersonName && <Field label="Vendedor">{party.salespersonName}</Field>}
          <div className="sm:col-span-2">
            <Field label="Observações">
              <span className="whitespace-pre-wrap">{party.notes ?? '—'}</span>
            </Field>
          </div>
        </div>
      </Block>
    )

  return (
    <Block title="Dados" icon={<Pencil className="h-3.5 w-3.5" />}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['company', 'Time, escola ou empresa', Building2],
              ['person', 'Pessoa', User],
            ] as const
          ).map(([kind, label, Icon]) => (
            <button
              key={kind}
              type="button"
              onClick={() => setForm((f) => ({ ...f, kind }))}
              className={clsx(
                'flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-sm font-bold transition',
                form.kind === kind ? 'border-ink bg-lime' : 'border-line hover:border-ink/30'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" /> {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-name">{form.kind === 'company' ? 'Nome / razão social' : 'Nome completo'} *</label>
            <input id="p-name" maxLength={200} className="field" value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} />
          </div>
          {form.kind === 'company' && (
            <div>
              <label className="label" htmlFor="p-trade">Nome fantasia / empresa</label>
              <input id="p-trade" maxLength={200} className="field" value={form.tradeName} onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="p-doc">{form.kind === 'company' ? 'CNPJ' : 'CPF'}</label>
            <input id="p-doc" inputMode="numeric" maxLength={20} className="field" value={form.document} onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="p-notes">Observações</label>
          <textarea id="p-notes" rows={2} maxLength={2000} className="field" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        {m.isError && <ErrorBox message={errorMessage(m.error)} />}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(false)
              m.reset()
            }}
          >
            Cancelar
          </Button>
          <Button variant="lime" size="sm" busy={m.isPending} disabled={!form.legalName.trim()} onClick={() => m.mutate()}>
            Gravar
          </Button>
        </div>
      </div>
    </Block>
  )
}

const Contacts = ({ party, editable, onSaved }: SectionProps) => {
  const [kind, setKind] = useState<ContactKind>('whatsapp')
  const [value, setValue] = useState('')
  const add = useMutation({
    mutationFn: () =>
      addPartyContact(party.id, {
        version: party.version,
        kind,
        value: value.trim(),
        isMain: party.contacts.length === 0,
      }),
    onSuccess: (next) => {
      onSaved(next)
      setValue('')
    },
  })
  const remove = useMutation({
    mutationFn: (contactId: string) => removePartyContact(party.id, contactId, party.version),
    onSuccess: onSaved,
  })

  return (
    <Block title="Contatos" icon={<Phone className="h-3.5 w-3.5" />}>
      {party.contacts.length === 0 && <p className="text-sm text-muted">Nenhum contato.</p>}
      <ul className="space-y-1.5">
        {party.contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-sm">
            {c.kind === 'email' ? <Mail className="h-4 w-4 text-muted" /> : <Phone className="h-4 w-4 text-muted" />}
            <span className="w-20 shrink-0 text-xs font-bold text-muted">{CONTACT_LABELS[c.kind]}</span>
            {c.kind === 'email' ? (
              <a href={`mailto:${c.value}`} className="min-w-0 truncate font-semibold hover:underline">{c.value}</a>
            ) : (
              <a href={whatsappLink(c.value)} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                {formatPhone(c.value)}
              </a>
            )}
            {c.label && <span className="text-xs text-muted">({c.label})</span>}
            {c.isMain && <Badge tone="neutral">Principal</Badge>}
            {editable && (
              <button
                type="button"
                title="Tirar este contato"
                aria-label={`Tirar o contato ${c.value}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Tirar o contato ${c.value}?`)) remove.mutate(c.id)
                }}
                className="ml-auto rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) add.mutate()
          }}
        >
          <select className="field w-auto" value={kind} onChange={(e) => setKind(e.target.value as ContactKind)} aria-label="Tipo de contato">
            {(Object.keys(CONTACT_LABELS) as ContactKind[]).map((k) => (
              <option key={k} value={k}>{CONTACT_LABELS[k]}</option>
            ))}
          </select>
          <input
            className="field min-w-0 flex-1"
            inputMode={kind === 'email' ? 'email' : 'tel'}
            placeholder={kind === 'email' ? 'nome@exemplo.com' : '(11) 99999-0000'}
            maxLength={200}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" variant="outline" size="sm" busy={add.isPending} disabled={!value.trim()} icon={<Plus className="h-4 w-4" />}>
            Contato
          </Button>
        </form>
      )}
      {(add.isError || remove.isError) && <ErrorBox message={errorMessage(add.error ?? remove.error)} />}
    </Block>
  )
}

const EMPTY_ADDRESS = { cep: '', street: '', number: '', complement: '', district: '', city: '', uf: 'SP' as Uf }

const Addresses = ({ party, editable, onSaved }: SectionProps) => {
  // null: fechado; 'new': endereço novo; id: alterando aquele.
  const [editing, setEditing] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: (addressId: string) => removePartyAddress(party.id, addressId, party.version),
    onSuccess: onSaved,
  })

  return (
    <Block
      title="Endereços"
      icon={<MapPin className="h-3.5 w-3.5" />}
      aside={
        editable &&
        editing === null && (
          <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing('new')}>
            Endereço
          </Button>
        )
      }
    >
      {party.addresses.length === 0 && editing !== 'new' && <p className="text-sm text-muted">Nenhum endereço.</p>}
      <ul className="space-y-2">
        {party.addresses.map((a) =>
          editing === a.id ? (
            <li key={a.id}>
              <AddressForm party={party} address={a} onSaved={onSaved} onClose={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <span className="font-semibold">{addressText(a)}</span>
              {a.isMain && <Badge tone="neutral">Principal</Badge>}
              {editable && editing === null && (
                <span className="ml-auto flex shrink-0">
                  <button type="button" title="Alterar este endereço" onClick={() => setEditing(a.id)} className="rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-ink">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Tirar este endereço"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm('Tirar este endereço?')) remove.mutate(a.id)
                    }}
                    className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          )
        )}
      </ul>
      {editing === 'new' && <AddressForm party={party} address={null} onSaved={onSaved} onClose={() => setEditing(null)} />}
      {remove.isError && <ErrorBox message={errorMessage(remove.error)} />}
    </Block>
  )
}

const AddressForm = ({
  party,
  address,
  onSaved,
  onClose,
}: {
  party: PartyDetail
  address: Address | null
  onSaved: (party: PartyDetail) => void
  onClose: () => void
}) => {
  const [form, setForm] = useState(() =>
    address
      ? {
          cep: address.cep ? formatCep(address.cep) : '',
          street: address.street,
          number: address.number ?? '',
          complement: address.complement ?? '',
          district: address.district ?? '',
          city: address.city,
          uf: address.uf,
        }
      : EMPTY_ADDRESS
  )
  const [looking, setLooking] = useState(false)
  const set = <K extends keyof typeof EMPTY_ADDRESS>(key: K, value: (typeof EMPTY_ADDRESS)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // CEP completo → preenche o que estiver vazio (o que a pessoa digitou fica).
  useEffect(() => {
    const cep = cepDigits(form.cep)
    if (cep.length !== 8 || cep === (address?.cep ?? '')) return undefined
    const controller = new AbortController()
    setLooking(true)
    void lookupCep(cep, controller.signal).then((found) => {
      if (controller.signal.aborted) return
      setLooking(false)
      if (!found) return
      setForm((f) => ({
        ...f,
        street: f.street || found.street,
        district: f.district || found.district,
        city: f.city || found.city,
        uf: (UF_VALUES as readonly string[]).includes(found.uf) ? (found.uf as Uf) : f.uf,
      }))
    })
    return () => controller.abort()
  }, [form.cep, address?.cep])

  const m = useMutation({
    mutationFn: () => {
      const body = {
        version: party.version,
        kind: address?.kind ?? ('delivery' as const),
        cep: cepDigits(form.cep),
        street: form.street,
        number: form.number,
        complement: form.complement,
        district: form.district,
        city: form.city,
        uf: form.uf,
        isMain: address?.isMain ?? party.addresses.length === 0,
      }
      return address ? updatePartyAddress(party.id, address.id, body) : addPartyAddress(party.id, body)
    },
    onSuccess: (next) => {
      onSaved(next)
      onClose()
    },
  })

  const ready = form.street.trim() !== '' && form.city.trim() !== ''

  return (
    <div className="mt-2 space-y-3 rounded-2xl bg-paper p-3">
      <div className="flex items-center gap-3">
        <div className="w-36">
          <label className="label" htmlFor="a-cep">CEP</label>
          <input id="a-cep" inputMode="numeric" placeholder="00000-000" className="field font-bold" value={form.cep} onChange={(e) => set('cep', formatCep(e.target.value))} />
        </div>
        {looking && (
          <span className="mt-5 inline-flex items-center gap-1 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
        <div>
          <label className="label" htmlFor="a-street">Rua *</label>
          <input id="a-street" maxLength={200} className="field" value={form.street} onChange={(e) => set('street', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="a-num">Número</label>
          <input id="a-num" maxLength={20} className="field" value={form.number} onChange={(e) => set('number', e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="a-comp">Complemento</label>
          <input id="a-comp" maxLength={120} className="field" value={form.complement} onChange={(e) => set('complement', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="a-district">Bairro</label>
          <input id="a-district" maxLength={120} className="field" value={form.district} onChange={(e) => set('district', e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
        <div>
          <label className="label" htmlFor="a-city">Cidade *</label>
          <input id="a-city" maxLength={120} className="field" value={form.city} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="a-uf">UF</label>
          <select id="a-uf" className="field px-2" value={form.uf} onChange={(e) => set('uf', e.target.value as Uf)}>
            {UF_VALUES.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>
        </div>
      </div>
      {m.isError && <ErrorBox message={errorMessage(m.error)} />}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="lime" size="sm" busy={m.isPending} disabled={!ready} onClick={() => m.mutate()}>
          Gravar endereço
        </Button>
      </div>
    </div>
  )
}
