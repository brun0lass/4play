import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Building2, ChevronDown, User } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { createCustomer, type Party } from '@/api/sales'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { UF_VALUES } from '@/contracts/aeris/party.ts'
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
  uf: 'MG' as Uf,
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

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, name: initialName })
      setMore(false)
    }
  }, [open, initialName])

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
                cep: form.cep,
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
            <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
              <div>
                <label className="label" htmlFor="c-street">Rua</label>
                <input id="c-street" className="field" value={form.street} onChange={(e) => set('street', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="c-num">Número</label>
                <input id="c-num" className="field" value={form.number} onChange={(e) => set('number', e.target.value)} />
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
                <select id="c-uf" className="field px-2" value={form.uf} onChange={(e) => set('uf', e.target.value as Uf)}>
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
