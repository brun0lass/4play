import { clsx } from 'clsx'
import { useState } from 'react'

import { IncidentRow } from '@/components/progress/Incidents'
import { Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/http'
import { useIncidents } from '@/lib/queries'
import { INCIDENT_SECTORS, SECTOR_LABELS, type IncidentSector } from '@/lib/uniforms'

/**
 * As ocorrências de todos os pedidos (F234 do Aeris): o que precisa ser
 * refeito e os problemas, por setor. É o "setor do que está faltando".
 *
 * A lista vem inteira (por situação) e o setor filtra aqui: assim cada setor
 * mostra quantas tem — é por esse número que o dono vê onde a fábrica falha
 * mais (a calandra entrou para isso, F278).
 */
type StatusFilter = 'aberta' | 'resolvida' | 'todas'

export const OcorrenciasPage = () => {
  const [status, setStatus] = useState<StatusFilter>('aberta')
  const [sector, setSector] = useState<IncidentSector | null>(null)
  const all = useIncidents(status === 'todas' ? undefined : status)
  const count = (value: IncidentSector) => all.data?.filter((incident) => incident.sector === value).length ?? 0
  const shown = sector === null ? all.data : all.data?.filter((incident) => incident.sector === sector)
  const worst = Math.max(0, ...INCIDENT_SECTORS.map(count))

  return (
    <div>
      <PageHeader kicker="Refazer e problemas" title="Ocorrências">
        <p className="mt-2 text-sm font-semibold text-muted">
          O que precisa ser refeito e os incidentes de cada pedido. Abra pela ficha do pedido (aba Ocorrências) ou pela tela do setor.
        </p>
      </PageHeader>

      <div className="mb-3 flex flex-wrap gap-2">
        {(['aberta', 'resolvida', 'todas'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={clsx('rounded-full px-3 py-1.5 text-xs font-bold', status === value ? 'bg-ink text-white' : 'bg-black/5')}>
            {value === 'aberta' ? 'Abertas' : value === 'resolvida' ? 'Resolvidas' : 'Todas'}
          </button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setSector(null)} className={clsx('rounded-full border-2 px-3 py-1 text-xs font-extrabold', sector === null ? 'border-ink bg-lime' : 'border-line')}>
          Todos os setores{all.data ? ` (${String(all.data.length)})` : ''}
        </button>
        {INCIDENT_SECTORS.map((value) => {
          const n = count(value)
          return (
            <button
              key={value}
              type="button"
              onClick={() => setSector(value)}
              title={n > 0 && n === worst ? 'O setor com mais ocorrências' : undefined}
              className={clsx(
                'rounded-full border-2 px-3 py-1 text-xs font-extrabold',
                sector === value ? 'border-ink bg-lime' : n > 0 && n === worst ? 'border-red-400 text-red-700' : 'border-line'
              )}
            >
              {SECTOR_LABELS[value]}
              {all.data && <span className={clsx('ml-1', n === 0 && 'opacity-40')}>{n}</span>}
            </button>
          )
        })}
      </div>

      {all.isPending && <Spinner />}
      {all.isError && <ErrorBox message={errorMessage(all.error)} onRetry={() => void all.refetch()} />}
      {shown?.length === 0 && (
        <Empty title={status === 'aberta' ? 'Nada em aberto' : status === 'resolvida' ? 'Nenhuma resolvida ainda' : 'Nenhuma ocorrência'}>
          <p>{status === 'aberta' ? 'Nenhuma peça para refazer e nenhum problema aberto.' : ''}</p>
        </Empty>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {shown?.map((incident) => <IncidentRow key={incident.id} incident={incident} showOrder />)}
      </div>
    </div>
  )
}
