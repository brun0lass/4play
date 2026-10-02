import { ErrorResponse } from '@/contracts/aeris/http.ts'

/**
 * O transporte até o Aeris One.
 *
 * Mesma origem: `/api` é encaminhado para o Aeris pelo Vite (dev) ou pelo
 * nginx (produção), e o cookie de sessão viaja sozinho. Cada módulo de
 * `src/api` valida a resposta com o contrato Zod do Aeris — um backend que
 * mude de forma quebra alto aqui, não três telas adiante.
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export class UnauthenticatedError extends ApiError {
  constructor(message = 'Sua sessão expirou. Entre de novo.') {
    super(401, 'unauthenticated', message)
    this.name = 'UnauthenticatedError'
  }
}

export class UnreachableError extends Error {
  constructor() {
    super('Não foi possível falar com o servidor. Confira a internet.')
    this.name = 'UnreachableError'
  }
}

/** Recusa escrita pela própria tela, já em português para a pessoa. */
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type Options = {
  method?: Method
  body?: unknown
  signal?: AbortSignal | undefined
}

/** Quem avisa a tela quando a sessão cai — o AuthProvider se inscreve. */
const sessionListeners = new Set<() => void>()
export const onSessionLost = (listener: () => void): (() => void) => {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

/** Gravações idênticas a caminho: o clique triplo vira um pedido só. */
const inFlight = new Map<string, Promise<unknown>>()

export const request = async (path: string, options: Options = {}): Promise<unknown> => {
  const { method = 'GET', body } = options
  if (method === 'GET' || body instanceof FormData) return send(path, options)

  const key = `${method} ${path} ${JSON.stringify(body ?? null)}`
  const pending = inFlight.get(key)
  if (pending) return pending
  const started = send(path, options).finally(() => inFlight.delete(key))
  inFlight.set(key, started)
  return started
}

const send = async (path: string, { method = 'GET', body, signal }: Options): Promise<unknown> => {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(body === undefined || body instanceof FormData
          ? {}
          : { 'content-type': 'application/json' }),
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      signal: signal ?? null,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new UnreachableError()
  }

  const text = response.status === 204 ? '' : await response.text()

  if (response.ok) {
    if (text === '') return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new UnreachableError()
    }
  }

  const parsed = ErrorResponse.safeParse(safeJson(text))
  if (!parsed.success && [404, 502, 503, 504].includes(response.status)) {
    throw new UnreachableError()
  }
  const code = parsed.success ? parsed.data.code : 'request_failed'
  const message = parsed.success ? parsed.data.message : 'A requisição falhou.'

  if (response.status === 401 && !path.endsWith('/auth/login')) {
    sessionListeners.forEach((listener) => listener())
    throw new UnauthenticatedError(message)
  }
  throw new ApiError(response.status, code, message)
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** A frase que a tela mostra para qualquer erro. */
export const errorMessage = (error: unknown): string => {
  if (error instanceof ApiError || error instanceof UnreachableError || error instanceof UserError)
    return error.message
  if (error instanceof Error && error.name === 'ZodError')
    return 'O servidor respondeu num formato inesperado.'
  return 'Algo deu errado. Tente de novo.'
}

/** Monta `?a=1&b=2` sem as chaves vazias. */
export const qs = (query: Record<string, string | number | boolean | undefined | null>): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}
