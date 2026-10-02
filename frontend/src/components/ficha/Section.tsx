import { clsx } from 'clsx'
import { CheckCircle2 } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { Button, ErrorBox } from '@/components/ui'
import { errorMessage } from '@/lib/http'

/** Um bloco da ficha: título, conteúdo e, quando editável, o botão de gravar. */
export const Section = ({
  title,
  icon,
  aside,
  children,
  className,
}: {
  title: string
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) => (
  <section className={clsx('card p-5', className)}>
    <header className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-wider uppercase">
        {icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-lime">
            {icon}
          </span>
        )}
        {title}
      </h2>
      {aside}
    </header>
    {children}
  </section>
)

/** A barra de gravar: aparece quando há mudança, confirma quando gravou. */
export const SaveBar = ({
  dirty,
  busy,
  saved,
  error,
  onSave,
  onDiscard,
  readOnlyReason,
}: {
  dirty: boolean
  busy: boolean
  saved: boolean
  error: unknown
  onSave: () => void
  onDiscard: () => void
  readOnlyReason?: string | null
}) => {
  if (readOnlyReason)
    return <p className="mt-4 text-xs font-semibold text-muted">{readOnlyReason}</p>

  return (
    <div className="mt-4 space-y-3">
      {error ? <ErrorBox message={errorMessage(error)} /> : null}
      <div className="flex items-center justify-end gap-2">
        {saved && !dirty && (
          <span className="mr-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Gravado
          </span>
        )}
        {dirty && (
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={busy}>
            Descartar
          </Button>
        )}
        <Button variant="lime" size="sm" onClick={onSave} disabled={!dirty} busy={busy}>
          Gravar
        </Button>
      </div>
    </div>
  )
}

/**
 * O rascunho de um bloco da ficha.
 *
 * Quando o servidor manda uma versão nova (a fila se atualiza sozinha), o
 * rascunho acompanha — a menos que a pessoa esteja no meio de uma edição, que
 * não pode sumir debaixo dela.
 */
export const useDraft = <T,>(initial: T) => {
  const initialKey = JSON.stringify(initial)
  const [draft, setDraft] = useState<T>(initial)
  const base = useRef(initialKey)
  useEffect(() => {
    if (base.current === initialKey) return
    setDraft((current) =>
      JSON.stringify(current) === base.current ? (JSON.parse(initialKey) as T) : current
    )
    base.current = initialKey
  }, [initialKey])
  return {
    draft,
    setDraft,
    dirty: JSON.stringify(draft) !== initialKey,
    reset: () => setDraft(JSON.parse(initialKey) as T),
  }
}

/**
 * O registro dos blocos da ficha com alteração por gravar.
 *
 * Cada bloco se inscreve com o nome e a função de gravar; a página mostra a
 * barra "Alterações não gravadas" e o "Gravar tudo". A grade, os
 * personalizados e o atendimento dividem a MESMA versão da ficha no Aeris,
 * então o "Gravar tudo" passa a versão que um devolve para o próximo.
 */
export type FichaSave = (sheetVersion: number) => Promise<number | void>

type Entry = { name: string; save: FichaSave }

export const FichaContext = createContext<{
  report: (id: string, entry: Entry | null) => void
}>({ report: () => undefined })

export const useFichaSection = (id: string, name: string, dirty: boolean, save: FichaSave) => {
  const { report } = useContext(FichaContext)
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    report(id, dirty ? { name, save: (v) => saveRef.current(v) } : null)
    return () => report(id, null)
  }, [id, name, dirty, report])
}

export const useFichaRegistry = () => {
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const report = useCallback((id: string, entry: Entry | null) => {
    setEntries((current) => {
      if (entry === null) {
        if (!(id in current)) return current
        const next = { ...current }
        delete next[id]
        return next
      }
      return { ...current, [id]: entry }
    })
  }, [])
  const dirty = Object.values(entries)

  // Fechar a aba ou dar F5 com alteração por gravar pede confirmação.
  useEffect(() => {
    if (dirty.length === 0) return undefined
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty.length])

  return { report, dirty }
}
