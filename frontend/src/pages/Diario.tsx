import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { fetchClientEvents } from '@/api/uniforms'
import { Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import type { ClientEventSummaryType } from '@/contracts/aeris/uniforms.ts'
import { errorMessage } from '@/lib/http'
import { useMembers } from '@/lib/queries'

/**
 * O diário da ficha (F279 do Aeris): o que a tela de cada pessoa fez na
 * ficha — começou a editar, gravou, deu erro, teve linha bloqueada, saiu sem
 * gravar, recuperou o rascunho. É para responder "por que não gravou?" sem
 * precisar do computador de quem passou pelo problema.
 */

type Kind = ClientEventSummaryType['kind']

const KINDS: Record<Kind, { label: string; tone: string }> = {
  editou: { label: 'Começou a editar', tone: 'bg-slate-100 text-slate-700' },
  gravou: { label: 'Gravou', tone: 'bg-emerald-100 text-emerald-800' },
  'erro-ao-gravar': { label: 'Erro ao gravar', tone: 'bg-red-100 text-red-800' },
  'linha-bloqueada': { label: 'Linha incompleta', tone: 'bg-amber-100 text-amber-900' },
  'saiu-sem-gravar': { label: 'Saiu sem gravar', tone: 'bg-orange-100 text-orange-900' },
  'rascunho-recuperado': { label: 'Recuperou o rascunho', tone: 'bg-sky-100 text-sky-800' },
  'rascunho-descartado': { label: 'Descartou o rascunho', tone: 'bg-zinc-200 text-zinc-800' },
}

const SECTIONS: Record<string, string> = {
  grade: 'Grade',
  personalizados: 'Personalizados',
  atendimento: 'Atendimento',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

/** "Chrome 141 · Windows" — o bastante para saber de que computador veio. */
const browserOf = (ua: string | null): string => {
  if (!ua) return ''
  const browser = /Edg\/(\d+)/.exec(ua)
    ? `Edge ${/Edg\/(\d+)/.exec(ua)?.[1] ?? ''}`
    : /Chrome\/(\d+)/.exec(ua)
      ? `Chrome ${/Chrome\/(\d+)/.exec(ua)?.[1] ?? ''}`
      : /Firefox\/(\d+)/.exec(ua)
        ? `Firefox ${/Firefox\/(\d+)/.exec(ua)?.[1] ?? ''}`
        : 'Navegador'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'Mac' : ''
  return [browser, os].filter(Boolean).join(' · ')
}

const detailText = (detail: Record<string, unknown>): string =>
  Object.entries(detail)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ')

export const DiarioPage = () => {
  const [params, setParams] = useSearchParams()
  const orderId = params.get('pedido') ?? undefined
  const [userId, setUserId] = useState('')
  const [kind, setKind] = useState<Kind | ''>('')
  const members = useMembers()

  const events = useQuery({
    queryKey: ['client-events', orderId, userId, kind],
    queryFn: ({ signal }) =>
      fetchClientEvents({ orderId, userId: userId || undefined, kinds: kind || undefined, limit: 300 }, signal),
    refetchInterval: 30_000,
  })

  return (
    <div>
      <PageHeader kicker="Diagnóstico" title="Diário da ficha">
        <p className="mt-2 max-w-3xl text-sm font-semibold text-muted">
          O que a tela de cada pessoa fez na ficha do pedido: quando começou a editar, quando gravou, os erros, as linhas
          incompletas, quem saiu sem gravar e quem recuperou o rascunho. Use para entender um &quot;não gravou&quot;.
        </p>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="field w-auto" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Pessoa">
          <option value="">Todas as pessoas</option>
          {(members.data ?? []).map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        <select className="field w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind | '')} aria-label="O que aconteceu">
          <option value="">Tudo</option>
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KINDS[k].label}
            </option>
          ))}
        </select>
        {orderId && (
          <button
            type="button"
            onClick={() => setParams({})}
            className="rounded-full border-2 border-ink bg-lime px-3 py-1 text-xs font-extrabold"
          >
            Só um pedido · mostrar todos ✕
          </button>
        )}
      </div>

      {events.isPending && <Spinner />}
      {events.isError && <ErrorBox message={errorMessage(events.error)} onRetry={() => void events.refetch()} />}
      {events.data?.length === 0 && (
        <Empty title="Nada registrado ainda">
          <p>O diário começa a encher quando alguém mexe numa ficha.</p>
        </Empty>
      )}
      {events.data && events.data.length > 0 && (
        <div className="card scroll-thin overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-extrabold tracking-wider text-muted uppercase">
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Onde</th>
                <th className="px-3 py-2">O que</th>
                <th className="px-3 py-2">Detalhe</th>
                <th className="px-3 py-2">Computador</th>
              </tr>
            </thead>
            <tbody>
              {events.data.map((e) => {
                // Chegou bem depois: a fila ficou no navegador (sessão caiu, sem internet).
                const late = new Date(e.receivedAt).getTime() - new Date(e.occurredAt).getTime() > 60_000
                return (
                  <tr key={e.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {when(e.occurredAt)}
                      {late && <span className="block text-[10px] text-muted">chegou {when(e.receivedAt)}</span>}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      <button type="button" className="hover:underline" onClick={() => setUserId(e.userId)}>
                        {e.userName}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {e.orderId ? (
                        <span className="flex flex-col">
                          <Link to={`/pedidos/${e.orderId}`} className="font-bold hover:underline">
                            #{e.orderNumber ?? '—'}
                          </Link>
                          <button
                            type="button"
                            className="text-left text-[11px] text-muted hover:underline"
                            onClick={() => setParams({ pedido: e.orderId ?? '' })}
                          >
                            {e.customerName ?? ''}
                          </button>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">{e.section ? (SECTIONS[e.section] ?? e.section) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-extrabold whitespace-nowrap', KINDS[e.kind].tone)}>
                        {KINDS[e.kind].label}
                      </span>
                    </td>
                    <td className="max-w-md px-3 py-2 text-xs break-words text-ink/80">{detailText(e.detail)}</td>
                    <td className="px-3 py-2 text-[11px] whitespace-nowrap text-muted">{browserOf(e.userAgent)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
