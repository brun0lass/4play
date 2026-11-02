import { clsx } from 'clsx'
import { Check } from 'lucide-react'

import { PRODUCTION_PROFILES, PROFILE_META, type ProfileKey } from '@/lib/profiles'
import type { UniformFunction } from '@/lib/uniforms'

export type ProfileValue = { exclusive: ProfileKey | null; production: UniformFunction[] }

export const profileValid = (value: ProfileValue): boolean =>
  value.exclusive !== null || value.production.length > 0

const EXCLUSIVE: ProfileKey[] = ['financeiro', 'gerente', 'admin']

/** O link do cliente. Ligado para todo mundo, até alguém desligar. */
export const ClientLinkToggle = ({
  on,
  onChange,
}: {
  on: boolean
  onChange: (on: boolean) => void
}) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={() => onChange(!on)}
    className={clsx(
      'flex w-full items-start gap-3 rounded-2xl border-2 p-3 text-left transition',
      on ? 'border-ink bg-lime' : 'border-line bg-white hover:border-ink/30'
    )}
  >
    <span
      className={clsx(
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-ink',
        on && 'bg-ink text-lime'
      )}
    >
      {on && <Check className="h-3 w-3" strokeWidth={4} />}
    </span>
    <span>
      <span className="block text-sm font-extrabold">Pode gerar o link do cliente</span>
      <span className="text-[11px] leading-snug text-ink/70">
        Ligado para todo mundo. Desligue só quem não deve mandar o link.
      </span>
    </span>
  </button>
)

/**
 * Escolher o perfil: os três da produção se combinam (quem atende também
 * pode desenhar). Gerente também: o cargo fica e as funções de cima
 * continuam. Financeiro e Administrador são um só.
 */
export const ProfilePicker = ({
  value,
  onChange,
}: {
  value: ProfileValue
  onChange: (value: ProfileValue) => void
}) => (
  <div className="space-y-3">
    <div>
      <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
        Produção — pode marcar mais de um
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {PRODUCTION_PROFILES.map(({ key, fn }) => {
          const on = value.production.includes(fn)
          return (
            <Card
              key={key}
              on={on}
              square
              title={PROFILE_META[key].label}
              what={PROFILE_META[key].what}
              onClick={() =>
                onChange({
                  exclusive: value.exclusive === 'gerente' ? 'gerente' : null,
                  production: on ? value.production.filter((f) => f !== fn) : [...value.production, fn],
                })
              }
            />
          )
        })}
      </div>
    </div>
    <div>
      <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">Escritório e gestão</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {EXCLUSIVE.map((key) => (
          <Card
            key={key}
            on={value.exclusive === key}
            title={PROFILE_META[key].label}
            what={PROFILE_META[key].what}
            onClick={() =>
              onChange(
                key === 'gerente'
                  ? {
                      exclusive: value.exclusive === 'gerente' ? null : 'gerente',
                      production: value.production,
                    }
                  : { exclusive: key, production: [] }
              )
            }
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] font-semibold text-muted">
        O gerente também pode ser atendente, designer ou operador. Clique de novo em Gerente para tirar só o cargo.
      </p>
    </div>
  </div>
)

const Card = ({
  on,
  title,
  what,
  onClick,
  square = false,
}: {
  on: boolean
  title: string
  what: string
  onClick: () => void
  square?: boolean
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={clsx(
      'flex h-full flex-col gap-1 rounded-2xl border-2 p-3 text-left transition',
      on ? 'border-ink bg-lime' : 'border-line bg-white hover:border-ink/30'
    )}
  >
    <span className="flex items-center gap-2 text-sm font-extrabold">
      <span
        className={clsx(
          'flex h-4 w-4 shrink-0 items-center justify-center border-2 border-ink',
          square ? 'rounded' : 'rounded-full',
          on && 'bg-ink text-lime'
        )}
      >
        {on && <Check className="h-3 w-3" strokeWidth={4} />}
      </span>
      {title}
    </span>
    <span className="text-[11px] leading-snug text-ink/70">{what}</span>
  </button>
)
