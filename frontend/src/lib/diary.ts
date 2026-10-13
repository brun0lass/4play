import type { ClientEventInputType } from '@/contracts/aeris/uniforms.ts'
import { ApiError, UnreachableError, UserError } from '@/lib/http'

/**
 * O diário da ficha (F279 do Aeris): o que a tela fez — começou a editar,
 * gravou, deu erro, bloqueou uma linha, saiu com alteração pendente,
 * recuperou o rascunho. Vai para o servidor em lotes, para que um "às vezes
 * não grava" possa ser investigado sem o computador de quem passou por ele.
 *
 * A fila mora no navegador até o servidor aceitar: se a sessão caiu (401) ou
 * a internet sumiu, os eventos esperam e vão no próximo envio — inclusive o
 * "erro-ao-gravar" que a própria queda causou. Nada aqui pode atrapalhar a
 * tela: toda falha do diário é engolida.
 */

type Kind = ClientEventInputType['kind']
type Event = {
  kind: Kind
  orderId: string | null
  section: string | null
  detail: Record<string, string | number | boolean | null>
  occurredAt: string
}

const KEY = '4play.diario'
const ENDPOINT = '/api/v1/uniforms/client-events'
/** O servidor aceita até 50 por lote; a fila guarda no máximo 300. */
const BATCH = 50
const KEEP = 300

const read = (): Event[] => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Event[]) : []
  } catch {
    return []
  }
}

const write = (events: Event[]) => {
  try {
    if (events.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(events.slice(-KEEP)))
  } catch {
    /* sem armazenamento: o diário só não guarda */
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let sending = false

const flush = async () => {
  timer = null
  if (sending) return
  const queued = read()
  if (queued.length === 0) return
  const batch = queued.slice(0, BATCH)
  sending = true
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: batch }),
    })
    // 202: tirar da fila. 400: o lote é inválido e nunca vai passar — tirar
    // também. 401/403/429/5xx: esperar a próxima vez.
    if (response.status === 202 || response.status === 400) {
      write(read().slice(batch.length))
      if (read().length > 0) schedule(1000)
    }
  } catch {
    /* sem internet: fica para a próxima */
  } finally {
    sending = false
  }
}

const schedule = (ms = 4000) => {
  if (timer === null) timer = setTimeout(() => void flush(), ms)
}

/** Fechando a página: o navegador garante a entrega do que couber. */
const beacon = () => {
  const queued = read()
  if (queued.length === 0 || typeof navigator.sendBeacon !== 'function') return
  const batch = queued.slice(0, BATCH)
  const sent = navigator.sendBeacon(
    ENDPOINT,
    new Blob([JSON.stringify({ events: batch })], { type: 'application/json' })
  )
  // O beacon não diz se o servidor aceitou: a fila só sai depois, num envio
  // normal. Um evento pode chegar duas vezes — para diagnóstico, tanto faz.
  void sent
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', beacon)
  // Ao voltar a ter sessão ou internet, o que ficou na fila vai.
  window.addEventListener('online', () => schedule(500))
  window.addEventListener('focus', () => schedule(1500))
  schedule(3000)
}

export const logEvent = (
  kind: Kind,
  input: {
    orderId?: string | null
    section?: string | null
    detail?: Record<string, string | number | boolean | null | undefined>
  } = {}
) => {
  const detail: Event['detail'] = {}
  for (const [key, value] of Object.entries(input.detail ?? {})) {
    if (value === undefined) continue
    detail[key.slice(0, 40)] = typeof value === 'string' ? value.slice(0, 300) : value
  }
  write([
    ...read(),
    {
      kind,
      orderId: input.orderId ?? null,
      section: input.section ?? null,
      detail,
      occurredAt: new Date().toISOString(),
    },
  ])
  schedule()
}

/** Fechando a aba agora: manda já, pelo beacon. */
export const flushNow = beacon

/** O erro como o diário guarda: status, código e a mensagem que a pessoa viu. */
export const errorDetail = (error: unknown) => ({
  status:
    error instanceof ApiError
      ? error.status
      : error instanceof UnreachableError
        ? 'sem-internet'
        : error instanceof UserError
          ? 'bloqueio-da-tela'
          : 'desconhecido',
  codigo: error instanceof ApiError ? error.code : null,
  mensagem: error instanceof Error ? error.message : String(error),
})
