import { CheckCircle2, Loader2, MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { DeliveryAddressType } from '@/contracts/aeris/uniforms.ts'
import { UF_VALUES } from '@/contracts/aeris/party.ts'
import { cepDigits, formatCep, lookupCep, mergeCep, type CepAddress } from '@/lib/cep'

/**
 * O local de entrega do pedido (F280 do Aeris): do pedido, não do cliente —
 * o time que joga fora recebe lá. O CEP preenche o resto e a pessoa corrige
 * o que vier errado.
 */

export type AddressDraft = {
  cep: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  uf: string
}

export const EMPTY_ADDRESS: AddressDraft = {
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  uf: '',
}

export const addressDraftOf = (address: DeliveryAddressType | null): AddressDraft =>
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

const blank = (a: AddressDraft) => Object.values(a).every((v) => v.trim() === '')

/** O que vai para o Aeris: nulo em branco; `'incompleto'` sem rua ou cidade. */
export const addressToSave = (a: AddressDraft): DeliveryAddressType | null | 'incompleto' => {
  if (blank(a)) return null
  if (!a.street.trim() || !a.city.trim() || !/^[A-Z]{2}$/.test(a.uf)) return 'incompleto'
  const cep = cepDigits(a.cep)
  return {
    cep: cep.length === 8 ? cep : null,
    street: a.street.trim(),
    number: a.number.trim() || null,
    complement: a.complement.trim() || null,
    district: a.district.trim() || null,
    city: a.city.trim(),
    uf: a.uf,
  }
}

/** Uma linha só, para a ficha impressa e para o atalho do cadastro. */
export const addressLine = (a: DeliveryAddressType): string =>
  [
    [a.street, a.number].filter(Boolean).join(', '),
    a.complement,
    a.district,
    `${a.city}/${a.uf}`,
    a.cep ? `CEP ${formatCep(a.cep)}` : null,
  ]
    .filter(Boolean)
    .join(' — ')

export const DeliveryAddressFields = ({
  value,
  onChange,
  disabled,
  customerAddress,
}: {
  value: AddressDraft
  onChange: (next: AddressDraft) => void
  disabled: boolean
  /** O endereço do cadastro do cliente, para começar dele. */
  customerAddress: DeliveryAddressType | null
}) => {
  const [cepState, setCepState] = useState<'idle' | 'busy' | 'found' | 'missing'>('idle')
  const lastLookup = useRef<CepAddress | null>(null)
  const numberRef = useRef<HTMLInputElement>(null)
  // A busca lê o valor mais novo sem disparar de novo a cada letra digitada.
  const latest = useRef(value)
  latest.current = value
  const typedCep = useRef(false)

  const set = (patch: Partial<AddressDraft>) => onChange({ ...latest.current, ...patch })

  // CEP completo e digitado aqui → busca e preenche o que estiver vazio.
  const digits = cepDigits(value.cep)
  useEffect(() => {
    if (!typedCep.current || digits.length !== 8) {
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
      const current = latest.current
      const merged = mergeCep(
        { street: current.street, district: current.district, city: current.city, uf: current.uf },
        found,
        lastLookup.current
      )
      lastLookup.current = found
      onChange({ ...current, ...merged, uf: (UF_VALUES as readonly string[]).includes(merged.uf) ? merged.uf : current.uf })
      setCepState('found')
      setTimeout(() => numberRef.current?.focus(), 0)
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  return (
    <div className="space-y-3 rounded-2xl bg-paper p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <label className="label" htmlFor="d-cep">CEP</label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="d-cep"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              className="field pl-9 font-bold tracking-wide"
              disabled={disabled}
              value={value.cep}
              onChange={(e) => {
                typedCep.current = true
                set({ cep: formatCep(e.target.value) })
              }}
            />
          </div>
        </div>
        <span className="pb-2 text-xs font-semibold" aria-live="polite">
          {cepState === 'busy' && (
            <span className="inline-flex items-center gap-1 text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
            </span>
          )}
          {cepState === 'found' && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Confira e complete o número.
            </span>
          )}
          {cepState === 'missing' && <span className="text-amber-700">CEP não encontrado. Preencha à mão.</span>}
        </span>
        {!disabled && customerAddress && blank(value) && (
          <button
            type="button"
            className="ml-auto pb-2 text-xs font-bold text-ink underline"
            onClick={() => onChange(addressDraftOf(customerAddress))}
            title={addressLine(customerAddress)}
          >
            Usar o endereço do cliente
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
        <div>
          <label className="label" htmlFor="d-street">Rua</label>
          <input id="d-street" maxLength={200} className="field" disabled={disabled} value={value.street} onChange={(e) => set({ street: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="d-number">Número</label>
          <input id="d-number" ref={numberRef} maxLength={20} className="field" disabled={disabled} value={value.number} onChange={(e) => set({ number: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="d-complement">Complemento</label>
          <input id="d-complement" maxLength={120} className="field" placeholder="Sala, ginásio, bloco…" disabled={disabled} value={value.complement} onChange={(e) => set({ complement: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="d-district">Bairro</label>
          <input id="d-district" maxLength={120} className="field" disabled={disabled} value={value.district} onChange={(e) => set({ district: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
        <div>
          <label className="label" htmlFor="d-city">Cidade</label>
          <input id="d-city" maxLength={120} className="field" disabled={disabled} value={value.city} onChange={(e) => set({ city: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="d-uf">UF</label>
          <select id="d-uf" className="field px-2" disabled={disabled} value={value.uf} onChange={(e) => set({ uf: e.target.value })}>
            <option value="">—</option>
            {UF_VALUES.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
