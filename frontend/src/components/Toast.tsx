import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/**
 * O aviso de canto: toda ação que grava diz que gravou.
 * Sem isso a pessoa não sabe se o clique pegou — e clica de novo.
 */

type Toast = { id: number; kind: 'success' | 'error'; text: string }

const ToastContext = createContext<(text: string, kind?: Toast['kind']) => void>(() => undefined)

let sequence = 0

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = (id: number) => setToasts((list) => list.filter((toast) => toast.id !== id))

  const push = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    sequence += 1
    const id = sequence
    setToasts((list) => [...list.slice(-2), { id, kind, text }])
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold shadow-2xl',
              toast.kind === 'success' ? 'bg-ink text-white' : 'bg-red-600 text-white'
            )}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-lime" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0" />
            )}
            <span className="flex-1">{toast.text}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Fechar aviso" className="opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
