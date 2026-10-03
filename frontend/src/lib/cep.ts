/**
 * Buscar o endereço pelo CEP — o mesmo desenho do Aeris (F089).
 *
 * Um assistente, não uma etapa: preenche o que está vazio e sai do caminho.
 * Sem rede, CEP inexistente ou resposta estranha? Os campos continuam
 * editáveis e a pessoa digita como antes.
 *
 * Direto do navegador para o ViaCEP (que libera CORS para todos), só com os
 * oito dígitos completos e com cache por sessão — o ViaCEP bloqueia uso
 * massivo, então o mesmo CEP nunca é perguntado duas vezes.
 */

export type CepAddress = { street: string; district: string; city: string; uf: string }

const CACHE = new Map<string, CepAddress | null>()

export const cepDigits = (text: string): string => text.replace(/\D/g, '').slice(0, 8)

/** "01310100" → "01310-100", enquanto a pessoa digita. */
export const formatCep = (text: string): string => {
  const d = cepDigits(text)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** `null` para tudo que não for um endereço utilizável. Nunca lança. */
export const lookupCep = async (cep: string, signal?: AbortSignal): Promise<CepAddress | null> => {
  const digits = cepDigits(cep)
  if (digits.length !== 8) return null
  const cached = CACHE.get(digits)
  if (cached !== undefined) return cached
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, signal ? { signal } : {})
    if (!response.ok) return null
    const body = (await response.json()) as Record<string, unknown>
    if (body.erro === true || body.erro === 'true') {
      CACHE.set(digits, null)
      return null
    }
    const address = {
      street: textOf(body.logradouro),
      district: textOf(body.bairro),
      city: textOf(body.localidade),
      uf: textOf(body.uf).toUpperCase(),
    }
    const usable = address.city !== '' && address.uf !== ''
    CACHE.set(digits, usable ? address : null)
    return usable ? address : null
  } catch {
    // Rede fora ou a pessoa continuou digitando: não guarda, tenta de novo depois.
    return null
  }
}

/**
 * Só preenche o campo vazio — ou o que ainda tem exatamente o que a busca
 * ANTERIOR pôs (assim, corrigir o CEP troca o endereço inteiro sem apagar o
 * que a pessoa escreveu por cima).
 */
export const mergeCep = (current: CepAddress, found: CepAddress, previous: CepAddress | null): CepAddress => {
  const merged = { ...current }
  for (const field of ['street', 'district', 'city', 'uf'] as const) {
    const typed = current[field]
    const fromLookup = previous !== null && typed === previous[field] && typed !== ''
    if (typed.trim() === '' || fromLookup) merged[field] = found[field]
  }
  return merged
}
