import { clsx } from 'clsx'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'

import type { Tone } from '@/lib/uniforms'

export { clsx as cx }

type ButtonVariant = 'lime' | 'ink' | 'ghost' | 'outline' | 'danger'

export const Button = ({
  variant = 'ink',
  size = 'md',
  busy = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  busy?: boolean
  icon?: ReactNode
}) => (
  <button
    type="button"
    disabled={disabled === true || busy}
    className={clsx(
      'inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' && 'h-8 px-3 text-xs',
      size === 'md' && 'h-10 px-4 text-sm',
      size === 'lg' && 'h-12 px-6 text-base',
      variant === 'lime' && 'bg-lime text-ink shadow-[0_2px_0_0_rgb(0_0_0/0.9)] hover:bg-lime-600',
      variant === 'ink' && 'bg-ink text-white hover:bg-ink-700',
      variant === 'ghost' && 'text-ink hover:bg-black/5',
      variant === 'outline' && 'border border-ink/15 bg-white text-ink hover:border-ink/40',
      variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
      className
    )}
    {...rest}
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
    {children}
  </button>
)

const TONES: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  lime: 'bg-lime text-ink ring-lime-600',
}

export const Badge = ({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  title?: string
}) => (
  <span
    title={title}
    className={clsx(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ring-1 ring-inset',
      TONES[tone],
      className
    )}
  >
    {children}
  </span>
)

export const Spinner = ({ label = 'Carregando…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-muted">
    <Loader2 className="h-5 w-5 animate-spin text-ink" aria-hidden />
    {label}
  </div>
)

export const ErrorBox = ({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) => (
  <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
    <div className="flex-1">
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 font-bold underline">
          Tentar de novo
        </button>
      )}
    </div>
  </div>
)

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
    <p className="display text-xl text-ink/80">{title}</p>
    {children && <div className="max-w-md text-sm text-muted">{children}</div>}
  </div>
)

export const Modal = ({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) => {
  const ref = useRef<HTMLDialogElement>(null)
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={() => {
        // O navegador pode fechar sem perguntar (Esc repetido). Se a tela
        // ainda quer a janela aberta, ela volta.
        setTimeout(() => {
          if (openRef.current && ref.current && !ref.current.open) ref.current.showModal()
        }, 0)
      }}
      onKeyDown={(event) => {
        // Esc: quem decide se fecha é a tela (pode ter coisa digitada). Pego a
        // tecla antes do navegador, que às vezes fecha sem deixar cancelar.
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={clsx(
        'm-auto w-[calc(100%-2rem)] rounded-3xl bg-white p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm',
        wide ? 'max-w-3xl' : 'max-w-lg'
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
            <h2 className="display text-xl">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 hover:bg-black/5"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="scroll-thin overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}

export const PageHeader = ({
  title,
  kicker,
  actions,
  children,
}: {
  title: string
  kicker?: string
  actions?: ReactNode
  children?: ReactNode
}) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      {kicker && (
        <p className="mb-1 text-xs font-bold tracking-[0.18em] text-muted uppercase">{kicker}</p>
      )}
      <h1 className="display text-3xl sm:text-4xl">{title}</h1>
      {children}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
)

export const Avatar = ({
  name,
  className,
  inverted = false,
}: {
  name: string | null
  className?: string
  inverted?: boolean
}) => (
  <span
    title={name ?? undefined}
    className={clsx(
      'inline-flex shrink-0 items-center justify-center rounded-full font-extrabold',
      inverted ? 'bg-lime text-ink' : 'bg-ink text-lime',
      className ?? 'h-6 w-6 text-[10px]'
    )}
  >
    {(name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('')}
  </span>
)
