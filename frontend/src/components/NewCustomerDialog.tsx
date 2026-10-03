import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Building2, CheckCircle2, ChevronDown, Loader2, MapPin, User } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { createCustomer, type Party } from '@/api/sales'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { UF_VALUES } from '@/contracts/aeris/party.ts'
import { cepDigits, formatCep, lookupCep, mergeCep, type CepAddress } from '@/lib/cep'
import { errorMessage } from '@/lib/http'

/**
 * Cadastro rápido de cliente: o que o atendimento sabe na hora do WhatsApp.
 * Nome e telefone bastam; documento e endereço ficam em "Mais dados".
 */

type Uf = (typeof UF_VALUES)[number]

const EMPTY = {
  kind: 'company' as 'company' | 'person',
  name: '',
  tradeName: '',
  whatsapp: '',
  email: '',
  document: '',
  street: '',
  number: '',
  district: '',
  city: '',
  uf: 'SP' as Uf,
  cep: '',
  notes: '',
}

export const NewCustomerDialog = ({
  open,
  initialName = '',
  role = 'customer',
  onClose,
  onCreated,
}: {
  open: boolean
  initialName?: string
  /** Fornecedor: quem a 4Play paga (tecido, tinta, aluguel). */
  role?: 'customer' | 'supplier'
  onClose: () => void
  onCreated?: (party: Party) => void
}) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [more, setMore] = useState(false)
  const [cepState, setCepState] = useState<'idle' | 'busy' | 'found' | 'missing'>('idle')
  // o que a última busca preencheu (para corrigir o CEP trocar o endereço)
  const lastLookup = useRef<CepAddress | null>(null)
  // UF trocada à mão: a busca não passa por cima
  const ufTouched = useRef(false)
  const numberRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, name: initialName })
      setMore(false)
      setCepState('idle')
      lastLookup.current = null
      ufTouched.current = false
    }
  }, [open, initialName])

  // CEP completo → busca o endereço e preenche o que estiver vazio.
  useEffect(() => {
    const digits = cepDigits(form.cep)
    if (digits.length !== 8) {
      setCepState('idle')
      return undefined
    }
    const controller = new AbortController()
    setCepState('busy')
    void lookupCep(digits, controller.signal).then((found) => {
      if (controller.signal.aborted) return
      if (!found) {
        setCepState('missing')
        return
      }
      setForm((current) => {
        const merged = mergeCep(
          { street: current.street, district: current.district, city: current.city, uf: ufTouched.current ? current.uf : '' },
          found,
          lastLookup.current
        )
        const uf = (UF_VALUES as readonly string[]).includes(merged.uf) ? (merged.uf as Uf) : current.uf
        return { ...current, street: merged.street, district: merged.district, city: merged.city, uf }
      })
      lastLookup.current = found
      setCepState('found')
      // o que falta é o número: o cursor já vai para lá
      setTimeout(() => numberRef.current?.focus(), 0)
    })
    return () => controller.abort()
  }, [form.cep])

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const hasAddress = form.street.trim() !== '' && form.city.trim() !== ''
  const partialAddress = !hasAddress && (form.street.trim() !== '' || form.city.trim() !== '')

  const mutation = useMutation({
    mutationFn: () =>
      createCustomer({
        kind: form.kind,
        legalName: form.name.trim(),
        tradeName: form.kind === 'company' ? form.tradeName : '',
        document: form.document,
        notes: form.notes,
        roles: [role],
        contacts: [
          ...(form.whatsapp.trim() ? [{ kind: 'whatsapp' as const, value: form.whatsapp.trim(), isMain: true }] : []),
          ...(form.email.trim() ? [{ kind: 'email' as const, value: form.email.trim() }] : []),
        ],
        ...(hasAddress
          ? {
              address: {
                kind: 'delivery' as const,
                street: form.street,
                number: form.number,
                district: form.district,
                city: form.city,
                uf: form.uf,
                cep: cepDigits(form.cep),
                isMain: true,
              },
            }
          : {}),
      }),
    onSuccess: (party) => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast(`${role === 'supplier' ? 'Fornecedor' : 'Cliente'} ${party.tradeName ?? party.legalName} cadastrado.`)
      onCreated?.(party)
      onClose()
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (form.name.trim() && !partialAddress) mutation.mutate()
  }

  return (
    <Modal
      open={open}
      title={role === 'supplier' ? 'Novo fornecedor' : 'Novo cliente'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="lime"
            busy={mutation.isPending}
            disabled={!form.name.trim() || partialAddress}
            onClick={() => mutation.mutate()}
          >
            {role === 'supplier' ? 'Cadastrar fornecedor' : 'Cadastrar cliente'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['company', role === 'supplier' ? 'Empresa' : 'Time, escola ou empresa', Building2],
              ['person', 'Pessoa', User],
            ] as const
          ).map(([kind, label, Icon]) => (
            <button
              key={kind}
              type="button"
              onClick={() => set('kind', kind)}
              className={clsx(
                'flex items-center gap-2 rounded-2xl border-2 px-3 py-3 text-left text-sm font-bold transition',
                form.kind === kind ? 'border-ink bg-lime' : 'border-line hover:border-ink/30'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" /> {label}
            </button>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="c-name">
            {form.kind === 'company' ? (role === 'supplier' ? 'Nome da empresa' : 'Nome do time / escola / empresa') : 'Nome completo'} *
          </label>
          <input id="c-name" autoFocus required maxLength={200} className="field" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-wa">WhatsApp</label>
            <input id="c-wa" inputMode="tel" placeholder="(31) 99999-0000" className="field" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="c-mail">E-mail</label>
            <input id="c-mail" type="email" className="field" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMore((value) => !value)}
          className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-ink"
        >
          <ChevronDown className={clsx('h-4 w-4 transition', more && 'rotate-180')} />
          Mais dados (documento, endereço, observações)
        </button>

        {more && (
          <div className="space-y-3 rounded-2xl bg-paper p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {form.kind === 'company' && (
                <div>
                  <label className="label" htmlFor="c-trade">Nome fantasia</label>
                  <input id="c-trade" maxLength={200} className="field" value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} />
                </div>
              )}
              <div>
                <label className="label" htmlFor="c-doc">{form.kind === 'company' ? 'CNPJ' : 'CPF'}</label>
                <input id="c-doc" inputMode="numeric" maxLength={20} className="field" value={form.document} onChange={(e) => set('document', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="c-cep">CEP</label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-40">
                  <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="c-cep"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="00000-000"
                    className="field pl-9 font-bold tracking-wide"
                    value={form.cep}
                    onChange={(e) => set('cep', formatCep(e.target.value))}
                  />
                </div>
                <span className="text-xs font-semibold" aria-live="polite">
                  {cepState === 'busy' && <span className="inline-flex items-center gap-1 text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando endereço…</span>}
                  {cepState === 'found' && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Endereço encontrado — confira e complete o número.</span>}
                  {cepState === 'missing' && <span className="text-amber-700">CEP não encontrado. Preencha o endereço à mão.</span>}
                  {cepState === 'idle' && <span className="text-muted">Digite o CEP que o endereço se preenche sozinho.</span>}
                </span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
              <div>
                <label className="label" htmlFor="c-street">Rua</label>
                <input id="c-street" className="field" value={form.street} onChange={(e) => set('street', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="c-num">Número</label>
                <input id="c-num" ref={numberRef} className="field" value={form.number} onChange={(e) => set('number', e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_80px]">
              <div>
                <label className="label" htmlFor="c-district">Bairro</label>
                <input id="c-district" className="field" value={form.district} onChange={(e) => set('district', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="c-city">Cidade</label>
                <input id="c-city" className="field" value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="c-uf">UF</label>
                <select id="c-uf" className="field px-2" value={form.uf} onChange={(e) => {
                    ufTouched.current = true
                    set('uf', e.target.value as Uf)
                  }}>
                  {UF_VALUES.map((uf) => <option key={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
            {partialAddress && (
              <p className="text-xs font-bold text-amber-700">Para gravar o endereço, preencha a rua e a cidade (ou deixe os dois em branco).</p>
            )}
            <div>
              <label className="label" htmlFor="c-notes">Observações</label>
              <textarea id="c-notes" rows={2} maxLength={2000} className="field" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        )}

        {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
