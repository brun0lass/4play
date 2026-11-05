import type { PostHog } from 'posthog-js'

import type { Session } from '@/api/auth'
import { hideLinkToken, linkRef, maskSensitiveText, prepareEvent } from '@/lib/analytics-privacy'
import { profileLabel } from '@/lib/profiles'
import type { UniformFunction } from '@/lib/uniforms'

/**
 * O PostHog: como o cliente faz o pedido pelo link e como a equipe usa o sistema.
 *
 * As variáveis estão em `.env.production`, então só o build de produção manda
 * dados. O `npm run dev` não manda nada, a não ser que estejam no `.env.local`.
 *
 * A biblioteca vem em arquivo separado, sem atrasar a primeira tela de quem abre
 * o link no celular. Se ela não carregar, o sistema segue igual, só sem eventos.
 */
const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined
const host = import.meta.env.VITE_POSTHOG_HOST as string | undefined

let client: Promise<PostHog | null> = Promise.resolve(null)

export const initAnalytics = (): void => {
  if (!token || !host) return
  client = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(token, {
        api_host: host,
        defaults: '2026-08-30',
        // O cliente do link fica anônimo; só a equipe, que faz login, vira pessoa.
        person_profiles: 'identified_only',
        capture_exceptions: true,
        // O clique que não dá em nada: o botão desabilitado onde o cliente empaca.
        capture_dead_clicks: true,
        // Sem pesquisas por aqui: o celular do cliente não baixa o script delas.
        disable_surveys: true,
        before_send: prepareEvent,
        session_recording: {
          // O que se digita nunca vai. No resto da tela, `*` faz todo texto passar pela limpeza.
          maskAllInputs: true,
          maskTextSelector: '*',
          maskTextFn: maskSensitiveText,
          // Vale para a URL da página na gravação e para as chamadas de rede.
          maskCapturedNetworkRequestFn: (request) =>
            request.name === undefined ? request : { ...request, name: hideLinkToken(request.name) },
        },
      })
      return posthog
    })
    .catch(() => null)
}

export const track = (event: string, properties?: Record<string, unknown>): void => {
  void client.then((posthog) => posthog?.capture(event, properties))
}

/** Para os eventos da equipe sobre um link: casa com os do cliente naquele link. */
export const linkProps = (linkToken: string): { link_ref: string } => ({ link_ref: linkRef(linkToken) })

/**
 * Quem está usando. Sem sessão, a pessoa que estava neste navegador sai; o
 * cliente do link nunca foi identificado e segue com o mesmo id anônimo.
 */
export const syncAnalyticsUser = (session: Session | null, functions: readonly UniformFunction[]): void => {
  void client.then((posthog) => {
    if (posthog === null) return
    const identified = posthog.get_property('$user_state') === 'identified'
    if (session === null) {
      if (identified) posthog.reset()
      return
    }
    if (identified && posthog.get_distinct_id() !== session.user.id) posthog.reset()
    const role = session.context?.role
    const perfil = session.support ? 'Suporte' : role ? profileLabel(role, functions) : 'Sem contexto'
    posthog.identify(session.user.id, { name: session.user.displayName, perfil, papel: role ?? null })
    // Também em cada evento: tira a equipe da conta quando ela abre o link de um cliente.
    posthog.register({ perfil })
  })
}
