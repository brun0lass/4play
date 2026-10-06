import type { ProductionProgressResponseType, ProgressEntryType, ProgressLineType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, CheckCheck, ListChecks, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { saveProgress } from '@/api/uniforms'
import { Section } from '@/components/ficha/Section'
import { IncidentDialog, IncidentRow, useCanReport, type IncidentDraft } from '@/components/progress/Incidents'
import { Button, ErrorBox, Spinner } from '@/components/ui'
import { useAccess } from '@/lib/access'
import { int } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys, useOrderIncidents, useProgress } from '@/lib/queries'
import { PROGRESS_STEPS, STEP_LABELS, partsOf, type Order, type ProgressStep } from '@/lib/uniforms'

const doneOf = (data: ProductionProgressResponseType, lineKey: string, step: ProgressStep): number =>
  data.progress.find((entry) => entry.lineKey === lineKey && entry.step === step)?.done ?? 0

/**
 * O andamento da grade (F234 do Aeris): cada linha — o atleta, ou a peça sem
 * nome num tamanho — marcada em cada passo da fábrica. Em cima, o que está
 * faltando em cada passo. "Refazer" abre a ocorrência já com a linha.
 */
export const GradeProgress = ({ order, editable }: { order: Order; editable: boolean }) => {
  const queryClient = useQueryClient()
  const access = useAccess()
  const progress = useProgress(order.id)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [draft, setDraft] = useState<IncidentDraft | null>(null)
  const [typing, setTyping] = useState<Record<string, string>>({})
  const canMark = editable && (access.isManager || access.functions.includes('producao'))
  const canReport = useCanReport()

  // A grade gravada de novo muda as linhas: o andamento relê.
  const refetch = progress.refetch
  useEffect(() => {
    void refetch()
  }, [order.sheetVersion, refetch])

  const save = useMutation({
    mutationFn: (entries: ProgressEntryType[]) => saveProgress(order.id, entries),
    onSuccess: (data) => queryClient.setQueryData(keys.progress(order.id), data),
  })

  if (progress.isPending) return <Spinner label="Carregando o andamento…" />
  if (progress.isError) return <ErrorBox message={errorMessage(progress.error)} onRetry={() => void progress.refetch()} />
  const data = progress.data
  if (data.lines.length === 0)
    return (
      <Section title="Andamento da grade" icon={<ListChecks className="h-3.5 w-3.5" />}>
        <p className="text-sm text-muted">Sem grade ainda. Quando a grade e os nomes forem preenchidos, cada linha aparece aqui para marcar.</p>
      </Section>
    )

  const missing = (line: ProgressLineType) => PROGRESS_STEPS.some((step) => doneOf(data, line.key, step) < line.quantity)
  const shown = onlyMissing ? data.lines.filter(missing) : data.lines
  const set = (line: ProgressLineType, step: ProgressStep, done: number) =>
    save.mutate([{ lineKey: line.key, step, done: Math.max(0, Math.min(done, line.quantity)) }])

  return (
    <Section
      title="Andamento da grade"
      icon={<ListChecks className="h-3.5 w-3.5" />}
      aside={
        <label className="flex items-center gap-1.5 text-xs font-bold">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Só o que falta
        </label>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PROGRESS_STEPS.map((step) => {
          const total = data.totals[step]
          const left = total.total - total.done
          return (
            <div key={step} className={clsx('rounded-2xl px-3 py-2', left === 0 ? 'bg-lime/40' : 'bg-paper')}>
              <p className="text-[10px] font-extrabold tracking-wide text-muted uppercase">{STEP_LABELS[step]}</p>
              <p className="text-sm font-extrabold">
                {left === 0 ? 'Tudo feito' : `Faltam ${int(left)}`}
                <span className="font-semibold text-muted"> · {int(total.done)}/{int(total.total)}</span>
              </p>
            </div>
          )
        })}
      </div>

      <div className="scroll-thin -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-[10px] font-extrabold tracking-wide text-muted uppercase">
              <th className="py-1.5">Linha</th>
              {PROGRESS_STEPS.map((step) => (
                <th key={step} className="px-1 text-center">
                  {STEP_LABELS[step]}
                  {canMark && (
                    <button
                      type="button"
                      title={`Marcar tudo em ${STEP_LABELS[step]}`}
                      onClick={() => save.mutate(data.lines.map((line) => ({ lineKey: line.key, step, done: line.quantity })))}
                      className="ml-1 inline-flex rounded-full p-0.5 text-muted hover:bg-black/5 hover:text-ink"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </button>
                  )}
                </th>
              ))}
              {canReport && <th />}
            </tr>
          </thead>
          <tbody>
            {shown.map((line) => (
              <tr key={line.key} className="border-t border-line">
                <td className="py-1.5 pr-2">
                  <span className="font-semibold">{line.label}</span>
                  {line.kind === 'nome' && <span className="text-[11px] text-muted"> · {line.piece}</span>}
                  {line.quantity > 1 && <span className="text-[11px] text-muted"> · {line.quantity} pç</span>}
                </td>
                {PROGRESS_STEPS.map((step) => {
                  const done = doneOf(data, line.key, step)
                  const full = done >= line.quantity
                  const cell = `${line.key}|${step}`
                  return (
                    <td key={step} className={clsx('px-1 py-1 text-center', full && 'bg-lime/25')}>
                      {line.quantity === 1 ? (
                        <input
                          type="checkbox"
                          checked={full}
                          disabled={!canMark || save.isPending}
                          onChange={(e) => set(line, step, e.target.checked ? 1 : 0)}
                          aria-label={`${line.label}: ${STEP_LABELS[step]}`}
                          className="h-4 w-4"
                        />
                      ) : canMark ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            value={typing[cell] ?? String(done)}
                            onChange={(e) => setTyping((all) => ({ ...all, [cell]: e.target.value.replace(/\D/g, '') }))}
                            onBlur={() => {
                              const value = typing[cell]
                              if (value !== undefined && Number(value) !== done) set(line, step, Number(value || '0'))
                              setTyping((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== cell)))
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                            }}
                            inputMode="numeric"
                            className="field h-7 w-12 px-1 text-center text-xs"
                            aria-label={`${line.label}: ${STEP_LABELS[step]}`}
                          />
                          <button
                            type="button"
                            title="Todas"
                            onClick={() => set(line, step, full ? 0 : line.quantity)}
                            className={clsx('rounded-full p-0.5', full ? 'text-ink' : 'text-muted hover:text-ink')}
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ) : (
                        <span className={clsx('text-xs font-bold', full ? 'text-ink' : 'text-muted')}>
                          {done}/{line.quantity}
                        </span>
                      )}
                    </td>
                  )
                })}
                {canReport && (
                  <td className="pl-1 text-right">
                    <button
                      type="button"
                      title="Refazer esta linha"
                      onClick={() => setDraft({ kind: 'refazer', sector: 'impressao', lines: { [line.key]: line.quantity } })}
                      className="rounded-full p-1 text-muted hover:bg-red-50 hover:text-red-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="py-3 text-center text-sm font-semibold text-muted">Tudo feito em todos os passos.</p>}
      {save.isError && <div className="mt-3"><ErrorBox message={errorMessage(save.error)} /></div>}

      <IncidentDialog orderId={order.id} lines={data.lines} parts={partsOf(order)} draft={draft} onClose={() => setDraft(null)} />
    </Section>
  )
}

/** As ocorrências do pedido: abrir, ver e resolver (F234 do Aeris). */
export const OrderIncidents = ({ order }: { order: Order }) => {
  const incidents = useOrderIncidents(order.id)
  const progress = useProgress(order.id)
  const canReport = useCanReport()
  const [draft, setDraft] = useState<IncidentDraft | null>(null)

  return (
    <Section
      title="Ocorrências"
      icon={<AlertTriangle className="h-3.5 w-3.5" />}
      aside={
        canReport && (
          <Button size="sm" variant="ink" icon={<AlertTriangle className="h-3.5 w-3.5" />} onClick={() => setDraft({ kind: 'problema', sector: 'impressao', lines: {} })}>
            Nova ocorrência
          </Button>
        )
      }
    >
      <p className="mb-3 text-sm text-muted">
        O que precisa ser refeito e os problemas do pedido. Refazer desmarca as linhas no andamento da grade; resolver fecha a ocorrência.
      </p>
      {incidents.isPending && <Spinner />}
      {incidents.isError && <ErrorBox message={errorMessage(incidents.error)} />}
      {incidents.data?.length === 0 && <p className="text-sm text-muted">Nenhuma ocorrência neste pedido.</p>}
      <div className="space-y-2">
        {incidents.data?.map((incident) => <IncidentRow key={incident.id} incident={incident} />)}
      </div>
      <IncidentDialog
        orderId={order.id}
        lines={progress.data?.lines ?? []}
        parts={partsOf(order)}
        draft={draft}
        onClose={() => setDraft(null)}
      />
    </Section>
  )
}
