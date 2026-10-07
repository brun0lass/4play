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
 */
export const OcorrenciasPage = () => {
  const [status, setStatus] = useState<'aberta' | 'resolvida'>('aberta')
  const [sector, setSector] = useState<IncidentSector | null>(null)
  const list = useIncidents(status, sector ?? undefined)

  return (
    <div>
      <PageHeader kicker="Refazer e problemas" title="Ocorrências">
        <p className="mt-2 text-sm font-semibold text-muted">
          O que precisa ser refeito e os incidentes de cada pedido. Abra pela ficha do pedido (aba Ocorrências) ou pela tela do setor.
        </p>
      </PageHeader>

      <div className="mb-3 flex flex-wrap gap-2">
        {(['aberta', 'resolvida'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={clsx('rounded-full px-3 py-1.5 text-xs font-bold', status === value ? 'bg-ink text-white' : 'bg-black/5')}>
            {value === 'aberta' ? 'Abertas' : 'Resolvidas'}
          </button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setSector(null)} className={clsx('rounded-full border-2 px-3 py-1 text-xs font-extrabold', sector === null ? 'border-ink bg-lime' : 'border-line')}>
          Todos os setores
        </button>
        {INCIDENT_SECTORS.map((value) => (
          <button key={value} type="button" onClick={() => setSector(value)} className={clsx('rounded-full border-2 px-3 py-1 text-xs font-extrabold', sector === value ? 'border-ink bg-lime' : 'border-line')}>
            {SECTOR_LABELS[value]}
          </button>
        ))}
      </div>

      {list.isPending && <Spinner />}
      {list.isError && <ErrorBox message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <Empty title={status === 'aberta' ? 'Nada em aberto' : 'Nenhuma resolvida ainda'}>
          <p>{status === 'aberta' ? 'Nenhuma peça para refazer e nenhum problema aberto.' : ''}</p>
        </Empty>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.data?.map((incident) => <IncidentRow key={incident.id} incident={incident} showOrder />)}
      </div>
    </div>
  )
}
