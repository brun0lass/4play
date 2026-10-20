import { clsx } from 'clsx'
import { CheckCircle2, ChevronDown } from 'lucide-react'
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
import { errorDetail, flushNow, logEvent } from '@/lib/diary'
import { errorMessage } from '@/lib/http'

/** Um bloco da ficha: título, conteúdo e, quando editável, o botão de gravar. */
export const Section = ({
  title,
  icon,
  aside,
  children,
  className,
  collapsible,
}: {
  title: string
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  /**
   * Abre e fecha pelo título; lembra neste navegador pela chave dada. Fechado,
   * o conteúdo continua montado — o que foi digitado não some.
   */
  collapsible?: { key: string; defaultOpen?: boolean }
}) => {
  const storage = collapsible ? `4play.secao.${collapsible.key}` : null
  const [open, setOpen] = useState(() => {
    if (!storage) return true
    try {
      const saved = localStorage.getItem(storage)
      if (saved !== null) return saved === '1'
    } catch {
      /* sem armazenamento */
    }
    return collapsible?.defaultOpen ?? true
  })
  const toggle = () =>
    setOpen((current) => {
      try {
        if (storage) localStorage.setItem(storage, current ? '0' : '1')
      } catch {
        /* sem armazenamento */
      }
      return !current
    })
  const heading = (
    <>
      {icon && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-lime">
          {icon}
        </span>
      )}
      {title}
    </>
  )
  return (
    <section className={clsx('card p-5', className)}>
      <header className={clsx('flex items-center justify-between gap-3', open && 'mb-4')}>
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex items-center gap-2 text-sm font-extrabold tracking-wider uppercase"
          >
            <ChevronDown className={clsx('h-4 w-4 text-muted transition', !open && '-rotate-90')} />
            {heading}
          </button>
        ) : (
          <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-wider uppercase">{heading}</h2>
        )}
        {aside}
      </header>
      <div hidden={!open}>{children}</div>
    </section>
  )
}

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
 * JSON com as chaves em ordem: `{ M: '2', G: '1' }` e `{ G: '1', M: '2' }` são
 * o mesmo rascunho. Sem isso, a linha digitada numa ordem e devolvida pelo
 * servidor em outra deixava o bloco "não gravado" depois de gravar.
 */
const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item
  )

/** Onde o rascunho de um bloco fica guardado no navegador (F279). */
export type DraftPersist = { orderId: string; section: string }

type StoredDraft<T> = { draft: T; base: string; savedAt: string }

const draftKey = (p: DraftPersist) => `4play.rascunho.${p.orderId}.${p.section}`

const loadDraft = <T,>(
  p: DraftPersist | undefined,
  initialKey: string,
  keyOf: (draft: T) => string
): StoredDraft<T> | null => {
  if (!p) return null
  try {
    const raw = localStorage.getItem(draftKey(p))
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredDraft<T>
    // Igual ao que está gravado: não há o que recuperar.
    if (keyOf(stored.draft) === initialKey) {
      localStorage.removeItem(draftKey(p))
      return null
    }
    return stored
  } catch {
    return null
  }
}

/**
 * O rascunho de um bloco da ficha.
 *
 * Quando o servidor manda uma versão nova (a fila se atualiza sozinha), o
 * rascunho acompanha — a menos que a pessoa esteja no meio de uma edição, que
 * não pode sumir debaixo dela.
 *
 * Com `persist`, o que não foi gravado também fica no navegador (F279): sair
 * do pedido, voltar no navegador, a sessão cair ou o computador travar não
 * perde mais o que foi digitado — ao voltar, a ficha oferece recuperar.
 *
 * `normalize` diz como o rascunho fica depois de gravado (o Aeris apara os
 * espaços das pontas, por exemplo). Sem ele, "MATTEO " gravava como "MATTEO"
 * e o bloco ficava "não gravado" para sempre, mesmo gravado.
 */
export const useDraft = <T,>(initial: T, persist?: DraftPersist, normalize?: (draft: T) => T) => {
  const normalizeRef = useRef(normalize)
  normalizeRef.current = normalize
  const keyOf = (value: T) => stableJson(normalizeRef.current ? normalizeRef.current(value) : value)
  const initialKey = keyOf(initial)
  const [draft, setDraft] = useState<T>(initial)
  const base = useRef(initialKey)
  const [recovery, setRecovery] = useState<StoredDraft<T> | null>(() => loadDraft<T>(persist, initialKey, keyOf))
  const initialJson = stableJson(initial)
  useEffect(() => {
    if (base.current === initialKey) return
    // Sem mudança por gravar (ou só o que acabou de ser gravado): fica a versão do servidor.
    setDraft((current) => {
      const key = stableJson(normalizeRef.current ? normalizeRef.current(current) : current)
      return key === base.current || key === initialKey ? (JSON.parse(initialJson) as T) : current
    })
    base.current = initialKey
  }, [initialKey, initialJson])

  const currentKey = stableJson(draft)
  const dirty = keyOf(draft) !== initialKey
  const storage = persist ? draftKey(persist) : null

  // Guarda o rascunho a cada mudança; some quando grava ou descarta. Enquanto
  // a pessoa não decidiu sobre o rascunho antigo, ele não é sobrescrito.
  useEffect(() => {
    if (storage === null || recovery !== null) return
    try {
      if (dirty)
        localStorage.setItem(
          storage,
          JSON.stringify({ draft: JSON.parse(currentKey) as T, base: initialKey, savedAt: new Date().toISOString() })
        )
      else localStorage.removeItem(storage)
    } catch {
      /* sem armazenamento: só não guarda */
    }
  }, [storage, recovery, dirty, currentKey, initialKey])

  // "editou": uma vez por vez que o bloco passa de gravado a alterado.
  const wasDirty = useRef(false)
  const persistOrder = persist?.orderId
  const persistSection = persist?.section
  useEffect(() => {
    if (persistOrder && dirty && !wasDirty.current) logEvent('editou', { orderId: persistOrder, section: persistSection })
    wasDirty.current = dirty
  }, [dirty, persistOrder, persistSection])

  return {
    draft,
    setDraft,
    dirty,
    reset: () => setDraft(JSON.parse(initialJson) as T),
    /** O rascunho que ficou de outra vez, à espera de recuperar ou descartar. */
    recovery: recovery
      ? {
          savedAt: recovery.savedAt,
          /** A ficha foi gravada (por alguém) depois deste rascunho. */
          stale: recovery.base !== initialKey,
          restore: () => {
            setDraft(recovery.draft)
            setRecovery(null)
            if (persist)
              logEvent('rascunho-recuperado', {
                orderId: persist.orderId,
                section: persist.section,
                detail: { desatualizado: recovery.base !== initialKey },
              })
          },
          discard: () => {
            try {
              if (storage) localStorage.removeItem(storage)
            } catch {
              /* nada */
            }
            setRecovery(null)
            if (persist) logEvent('rascunho-descartado', { orderId: persist.orderId, section: persist.section })
          },
        }
      : null,
  }
}

/** "Você tinha alterações não gravadas…": recuperar ou descartar. */
export const DraftRecovery = ({
  recovery,
}: {
  recovery: ReturnType<typeof useDraft>['recovery']
}) => {
  if (!recovery) return null
  const when = new Date(recovery.savedAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <div role="alert" className="mb-4 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-sm">
      <p className="font-bold text-amber-900">
        Você tinha alterações aqui que não foram gravadas ({when}).
      </p>
      {recovery.stale && (
        <p className="mt-1 text-xs text-amber-800">
          A ficha foi gravada depois disso. Ao recuperar, confira antes de gravar: o rascunho substitui o que está na tela.
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button variant="ink" size="sm" onClick={recovery.restore}>
          Recuperar
        </Button>
        <Button variant="ghost" size="sm" onClick={recovery.discard}>
          Descartar
        </Button>
      </div>
    </div>
  )
}

/**
 * Grava pelo diário (F279): o que deu certo e o que deu errado, com o
 * status — é o que a ficha manda gravar, seja pelo botão do bloco, seja pelo
 * "Gravar tudo".
 */
export const tracked =
  <R,>(orderId: string, section: string, save: (sheetVersion: number) => Promise<R>, detail?: () => Record<string, number | string>) =>
  async (sheetVersion: number): Promise<R> => {
    try {
      const result = await save(sheetVersion)
      logEvent('gravou', { orderId, section, detail: detail?.() })
      return result
    } catch (error) {
      logEvent('erro-ao-gravar', { orderId, section, detail: { ...detail?.(), ...errorDetail(error) } })
      throw error
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

export const useFichaRegistry = (orderId: string) => {
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

  // Clicar num link do sistema (menu, outro pedido) também pergunta (F279).
  // O "voltar" do navegador não dá para segurar: para ele fica o rascunho.
  useEffect(() => {
    if (dirty.length === 0) return undefined
    const names = dirty.map((entry) => entry.name).join(', ')
    const guard = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank') return
      const to = new URL(anchor.href, window.location.href)
      if (to.origin !== window.location.origin || to.pathname === window.location.pathname) return
      if (!window.confirm(`Há alterações não gravadas (${names}). Sair sem gravar? O que foi digitado fica guardado neste computador e dá para recuperar ao voltar ao pedido.`)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', guard, true)
    return () => document.removeEventListener('click', guard, true)
  }, [dirty])

  // Saiu do pedido (ou fechou a aba) com alteração pendente: vai para o diário.
  const pending = useRef('')
  pending.current = dirty.map((entry) => entry.name).join(', ')
  useEffect(() => {
    const onHide = () => {
      if (!pending.current) return
      logEvent('saiu-sem-gravar', { orderId, detail: { blocos: pending.current, como: 'fechou-a-aba' } })
      flushNow()
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      if (pending.current) logEvent('saiu-sem-gravar', { orderId, detail: { blocos: pending.current, como: 'saiu-do-pedido' } })
    }
  }, [orderId])

  /** Quais blocos (`sheet`, `grade`, `art`…) têm alteração — para marcar a aba. */
  const dirtyIds = Object.keys(entries)
  return { report, dirty, dirtyIds }
}
