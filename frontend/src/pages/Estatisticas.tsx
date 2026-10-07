import { clsx } from 'clsx'
import { BarChart3, Users } from 'lucide-react'
import { useState } from 'react'

import { Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { int, todaySP } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { useSectorStats } from '@/lib/queries'
import { SECTOR_LABELS } from '@/lib/uniforms'

type Group = 'day' | 'week' | 'month'
type Sector = 'atendimento' | 'arte' | 'impressao' | 'corte' | 'costura' | 'embalagem'

const SECTORS: readonly Sector[] = ['atendimento', 'arte', 'impressao', 'corte', 'costura', 'embalagem']

/** O que cada período quer dizer, e quantos para trás a tela mostra. */
const PERIODS: Record<Group, { label: string; options: readonly number[]; unit: (n: number) => string }> = {
  day: { label: 'Por dia', options: [7, 14, 30], unit: (n) => `Últimos ${String(n)} dias` },
  week: { label: 'Por semana', options: [4, 8, 12], unit: (n) => `Últimas ${String(n)} semanas` },
  month: { label: 'Por mês', options: [3, 6, 12], unit: (n) => `Últimos ${String(n)} meses` },
}

const DAY_MS = 86_400_000
const asTime = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const asDay = (time: number): string => new Date(time).toISOString().slice(0, 10)

/** O primeiro dia do período que contém `day`: ele mesmo, a segunda-feira, ou o dia 1. */
const startOf = (day: string, group: Group): string => {
  if (group === 'day') return day
  if (group === 'month') return `${day.slice(0, 8)}01`
  const weekday = (new Date(asTime(day)).getUTCDay() + 6) % 7
  return asDay(asTime(day) - weekday * DAY_MS)
}

/** Os períodos de trás para a frente, terminando no de hoje. */
const bucketsUntil = (today: string, group: Group, count: number): string[] => {
  const starts: string[] = []
  let cursor = startOf(today, group)
  for (let index = 0; index < count; index += 1) {
    starts.unshift(cursor)
    if (group === 'day') cursor = asDay(asTime(cursor) - DAY_MS)
    else if (group === 'week') cursor = asDay(asTime(cursor) - 7 * DAY_MS)
    else {
      const date = new Date(asTime(cursor))
      date.setUTCMonth(date.getUTCMonth() - 1)
      cursor = asDay(date.getTime())
    }
  }
  return starts
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const bucketLabel = (start: string, group: Group): string => {
  const [year, month, date] = start.split('-')
  if (group === 'month') return `${MONTHS[Number(month) - 1] ?? month ?? ''}/${(year ?? '').slice(2)}`
  const label = `${date ?? ''}/${month ?? ''}`
  if (group === 'week') return `Semana de ${label}`
  return `${WEEKDAYS[new Date(asTime(start)).getUTCDay()] ?? ''} ${label}`
}

/**
 * A produção de cada setor (F236 do Aeris): as peças que saíram de cada setor
 * para a frente, por dia, semana ou mês — e, para quem gerencia, por pessoa.
 * "Atendimento" e "Arte" contam as peças dos pedidos que eles mandaram adiante.
 */
export const EstatisticasPage = () => {
  const [group, setGroup] = useState<Group>('day')
  const [count, setCount] = useState<number>(14)
  const today = todaySP()
  const starts = bucketsUntil(today, group, count)
  const from = starts[0] ?? today
  const stats = useSectorStats(from, today, group)

  const choose = (next: Group) => {
    setGroup(next)
    setCount(PERIODS[next].options[1] ?? 1)
  }

  const data = stats.data
  const cell = (start: string, sector: Sector): number =>
    data?.buckets.find((bucket) => bucket.start === start)?.sectors.find((item) => item.sector === sector)?.pieces ?? 0
  const max = (sector: Sector): number => Math.max(1, ...starts.map((start) => cell(start, sector)))
  const total = (sector: Sector) => data?.totals.find((item) => item.sector === sector) ?? { pieces: 0, moves: 0 }

  return (
    <div>
      <PageHeader kicker="Chão de fábrica" title="Produção">
        <p className="mt-2 max-w-2xl text-sm font-semibold text-muted">
          Quantas peças cada setor fez — as que saíram dele para a próxima etapa. Andar dentro do setor ou voltar não conta.
        </p>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(Object.keys(PERIODS) as Group[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => choose(value)}
            className={clsx('rounded-full px-4 py-2 text-xs font-bold', group === value ? 'bg-ink text-lime' : 'border border-line bg-white')}
          >
            {PERIODS[value].label}
          </button>
        ))}
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="field h-9 w-auto text-xs font-bold">
          {PERIODS[group].options.map((option) => (
            <option key={option} value={option}>
              {PERIODS[group].unit(option)}
            </option>
          ))}
        </select>
      </div>

      {stats.isPending && <Spinner label="Somando a produção…" />}
      {stats.isError && <ErrorBox message={errorMessage(stats.error)} onRetry={() => void stats.refetch()} />}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {SECTORS.map((sector) => {
              const sum = total(sector)
              return (
                <div key={sector} className="card p-4">
                  <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">{SECTOR_LABELS[sector]}</p>
                  <p className="display text-3xl">{int(sum.pieces)}</p>
                  <p className="text-[11px] font-semibold text-muted">
                    peças · {int(Math.round(sum.pieces / Math.max(1, starts.length)))} por{' '}
                    {group === 'day' ? 'dia' : group === 'week' ? 'semana' : 'mês'}
                  </p>
                </div>
              )
            })}
          </div>

          {data.totals.every((item) => item.pieces === 0) ? (
            <Empty title="Nada no período">
              <p>Quando uma leva sair de um setor para o próximo, ela conta aqui.</p>
            </Empty>
          ) : (
            <div className="card overflow-hidden">
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-ink text-[11px] tracking-wider text-white/70 uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold">
                        <BarChart3 className="mr-1 inline h-3.5 w-3.5" /> Período
                      </th>
                      {SECTORS.map((sector) => (
                        <th key={sector} className="px-3 py-3 text-left font-bold">
                          {SECTOR_LABELS[sector]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...starts].reverse().map((start) => (
                      <tr key={start} className="border-t border-line">
                        <td className="px-4 py-2 font-bold whitespace-nowrap">{bucketLabel(start, group)}</td>
                        {SECTORS.map((sector) => {
                          const value = cell(start, sector)
                          return (
                            <td key={sector} className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                                  <div className="h-full rounded-full bg-lime-600" style={{ width: `${String((value / max(sector)) * 100)}%` }} />
                                </div>
                                <span className={clsx('w-10 text-right text-xs font-extrabold', value === 0 && 'text-muted')}>{int(value)}</span>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.people.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold tracking-wide uppercase">
                <Users className="h-4 w-4" /> Quem mandou adiante
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SECTORS.map((sector) => {
                  const people = data.people.filter((person) => person.sector === sector)
                  if (people.length === 0) return null
                  const top = Math.max(1, ...people.map((person) => person.pieces))
                  return (
                    <div key={sector} className="card p-4">
                      <p className="mb-2 text-[11px] font-extrabold tracking-wide text-muted uppercase">{SECTOR_LABELS[sector]}</p>
                      <ul className="space-y-1.5">
                        {people.map((person) => (
                          <li key={person.userId ?? 'ninguem'} className="text-sm">
                            <div className="flex justify-between gap-2">
                              <span className="truncate font-bold">{person.name ?? 'Sem registro'}</span>
                              <span className="font-extrabold">{int(person.pieces)}</span>
                            </div>
                            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/5">
                              <div className="h-full rounded-full bg-ink" style={{ width: `${String((person.pieces / top) * 100)}%` }} />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted">Conta para quem mandou a leva para a próxima etapa no sistema.</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
