/**
 * O que não pode sair do navegador para o PostHog.
 *
 * O token do link do pedido é a única chave da página do cliente: quem tem a
 * URL abre o pedido. Ele não vai em evento nem em gravação; no lugar vai o
 * `link_ref`, um resumo que identifica o link e não abre nada.
 *
 * Sem dependências, para rodar no `node --test`. Sem lookbehind nas expressões:
 * o iPhone antigo não compila e derrubaria a página inteira do cliente.
 */

/** A rota da página e a da API; a URL também vai codificada no texto do WhatsApp. */
const LINK_PATH = /(\/|%2F)(pedido|public\/intakes)(\/|%2F)[\w-]+/gi
const LINK_TOKEN = /\/pedido\/([\w-]+)/

const SENSITIVE: readonly RegExp[] = [
  /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g, // e-mail
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, // CNPJ
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, // CPF
  /\(\d{2}\)[\s-]?9?\d{4}[\s-]?\d{4}\b/g, // telefone com DDD entre parênteses
  /\b(?:55[\s-]?)?\d{2}[\s-]?9?\d{4}[\s-]?\d{4}\b/g, // telefone só com números
  /\b\d{5}-\d{3}\b/g, // CEP
]

/** Mantém a pontuação, para a tela da gravação não mudar de tamanho. */
const stars = (match: string): string => match.replace(/[^\s.\-/()@]/g, '*')

export const hideLinkToken = (text: string): string => text.replace(LINK_PATH, '$1$2$3:token')

/** Para o texto da tela e o das etiquetas de clique: tira token, CPF, CNPJ, telefone, e-mail e CEP. */
export const maskSensitiveText = (text: string): string =>
  SENSITIVE.reduce((current, pattern) => current.replace(pattern, stars), hideLinkToken(text))

export const linkTokenOf = (url: string): string | null => LINK_TOKEN.exec(url)?.[1] ?? null

/**
 * O resumo do token (cyrb53): o mesmo link dá sempre o mesmo valor, na tela da
 * equipe e na do cliente. Tem 53 bits e o token 256: não dá para voltar nele.
 */
export const linkRef = (token: string): string => {
  let a = 0xdeadbeef
  let b = 0x41c6ce57
  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index)
    a = Math.imul(a ^ code, 2654435761)
    b = Math.imul(b ^ code, 1597334677)
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36)
}

/** O texto que o autocapture pega da tela: passa pela limpeza completa. */
const SCREEN_TEXT = new Set(['$el_text', '$elements', '$elements_chain', '$external_click_url', '$exception_list', 'title', 'erro'])

const clean = (value: unknown, mask: (text: string) => string): unknown => {
  if (typeof value === 'string') return mask(value)
  if (Array.isArray(value)) return value.map((item) => clean(item, mask))
  if (value === null || typeof value !== 'object' || value.constructor !== Object) return value
  // A chave também: o mapa de calor agrupa os cliques pela URL da página.
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [mask(key), clean(item, mask)]))
}

const cleanRecord = <T extends Record<string, unknown>>(record: T): T => {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    // A gravação já sai mascarada pelo próprio gravador, e é grande demais para percorrer.
    if (key === '$snapshot_data') cleaned[key] = value
    else cleaned[key] = clean(value, SCREEN_TEXT.has(key) ? maskSensitiveText : hideLinkToken)
  }
  return cleaned as T
}

type Capture = {
  properties: Record<string, unknown>
  $set?: Record<string, unknown> | undefined
  $set_once?: Record<string, unknown> | undefined
}

/**
 * Última parada de todo evento (`before_send`): marca de onde ele veio, ainda
 * com a URL original, e só então limpa. `area` separa o cliente da equipe.
 */
export const prepareEvent = <T extends Capture>(event: T | null): T | null => {
  if (event === null) return null
  const url = event.properties.$current_url
  if (typeof url === 'string') {
    const token = linkTokenOf(url)
    event.properties.area = token === null ? 'sistema' : 'link_cliente'
    if (token !== null) event.properties.link_ref = linkRef(token)
  }
  event.properties = cleanRecord(event.properties)
  if (event.$set) event.$set = cleanRecord(event.$set)
  if (event.$set_once) event.$set_once = cleanRecord(event.$set_once)
  return event
}
