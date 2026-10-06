import type { IncidentSummaryType, ProgressLineType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, Check, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { createIncident, resolveIncident } from '@/api/uniforms'
import { useToast } from '@/components/Toast'
import { Badge, Button, ErrorBox, Modal } from '@/components/ui'
import { useAccess } from '@/lib/access'
import { ago, day } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys } from '@/lib/queries'
import {
  INCIDENT_SECTORS,
  SECTOR_LABELS,
  STEP_LABELS,
  orderRef,
  partLabel,
  stepsToRedo,
  type IncidentSector,
  type Part,
} from '@/lib/uniforms'

/** Depois de qualquer mudança numa ocorrência: o andamento, o pedido, as listas. */
export const useIncidentInvalidate = () => {
  const queryClient = useQueryClient()
  return (orderId: string) => {
    void queryClient.invalidateQueries({ queryKey: keys.orderIncidents(orderId) })
    void queryClient.invalidateQueries({ queryKey: keys.progress(orderId) })
    void queryClient.invalidateQueries({ queryKey: keys.order(orderId) })
    void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    void queryClient.invalidateQueries({ queryKey: keys.incidentsAll })
  }
}

/** Quem é da equipe da produção (qualquer função) registra e resolve ocorrência. */
export const useCanReport = () => {
  const access = useAccess()
  return access.isManager || access.functions.length > 0
}

export type IncidentDraft = {
  kind: 'refazer' | 'problema'
  sector: IncidentSector
  /** Linhas já escolhidas, com a quantidade. */
  lines: Record<string, number>
}

/**
 * Abrir uma ocorrência (F234 do Aeris): refazer — as linhas escolhidas voltam
 * do setor em diante — ou um problema qualquer, com ou sem linhas.
 */
export const IncidentDialog = ({
  orderId,
  lines,
  parts,
  draft,
  onClose,
}: {
  orderId: string
  lines: readonly ProgressLineType[]
  parts: readonly Part[]
  draft: IncidentDraft | null
  onClose: () => void
}) => {
  const toast = useToast()
  const invalidate = useIncidentInvalidate()
  const [kind, setKind] = useState<'refazer' | 'problema'>('refazer')
  const [sector, setSector] = useState<IncidentSector>('impressao')
  const [batchId, setBatchId] = useState<string>('')
  const [description, setDescription] = useState('')
  const [chosen, setChosen] = useState<Record<string, string>>({})

  useEffect(() => {
    if (draft === null) return
    setKind(draft.kind)
    setSector(draft.sector)
    setBatchId('')
    setDescription('')
    setChosen(Object.fromEntries(Object.entries(draft.lines).map(([key, quantity]) => [key, String(quantity)])))
  }, [draft])

  const picked = lines
    .map((line) => ({ line, quantity: Number(chosen[line.key] ?? '0') }))
    .filter((entry) => Number.isInteger(entry.quantity) && entry.quantity > 0)
  const over = picked.find((entry) => entry.quantity > entry.line.quantity)

  const save = useMutation({
    mutationFn: () =>
      createIncident(orderId, {
        kind,
        sector,
        batchId: batchId || null,
        description,
        lines: picked.map((entry) => ({ lineKey: entry.line.key, quantity: entry.quantity })),
      }),
    onSuccess: () => {
      toast(kind === 'refazer' ? 'Refazer registrado.' : 'Problema registrado.')
      invalidate(orderId)
      onClose()
    },
  })

  const redo = stepsToRedo(sector)

  return (
    <Modal
      open={draft !== null}
      wide
      title="Nova ocorrência"
      onClose={() => {
        save.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="lime"
            icon={<AlertTriangle className="h-4 w-4" />}
            busy={save.isPending}
            disabled={description.trim() === '' || over !== undefined}
            onClick={() => save.mutate()}
          >
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['refazer', 'Refazer', 'Peças que precisam ser refeitas: voltam do setor em diante.'],
              ['problema', 'Problema', 'Um incidente qualquer, para ficar registrado e ser resolvido.'],
            ] as const
          ).map(([value, label, what]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={clsx('rounded-2xl border-2 px-3 py-2 text-left', kind === value ? 'border-ink bg-lime' : 'border-line')}
            >
              <span className="block text-sm font-extrabold">{label}</span>
              <span className="text-[11px] text-ink/70">{what}</span>
            </button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Em qual setor</p>
          <div className="flex flex-wrap gap-1.5">
            {INCIDENT_SECTORS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSector(value)}
                className={clsx('rounded-full border-2 px-3 py-1 text-xs font-extrabold', sector === value ? 'border-ink bg-lime' : 'border-line')}
              >
                {SECTOR_LABELS[value]}
              </button>
            ))}
          </div>
          {kind === 'refazer' && (
            <p className="mt-2 text-xs text-muted">
              {redo.length === 0
                ? 'Na expedição a peça não volta para a fábrica: nada é desmarcado.'
                : `As linhas escolhidas voltam em: ${redo.map((step) => STEP_LABELS[step]).join(', ')}.`}
            </p>
          )}
        </div>

        {parts.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">Leva (opcional)</span>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="field">
              <option value="">O pedido / a leva 1</option>
              {parts.filter((part) => part.batch !== null).map((part) => (
                <option key={part.key} value={part.batch?.id ?? ''}>{partLabel(part)}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">O que aconteceu</span>
          <textarea rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className="field resize-y" placeholder="Nome errado na camisa, tinta manchou, faltou peça…" />
        </label>

        {lines.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">
              {kind === 'refazer' ? 'O que refazer' : 'Linhas afetadas (opcional)'}
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {lines.map((line) => {
                const value = chosen[line.key] ?? ''
                const on = Number(value) > 0
                return (
                  <div key={line.key} className={clsx('flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5', on ? 'border-ink bg-lime/30' : 'border-line')}>
                    <label className="flex min-w-0 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => setChosen((all) => ({ ...all, [line.key]: e.target.checked ? String(line.quantity) : '' }))}
                      />
                      <span className="truncate">{line.label}</span>
                    </label>
                    {line.quantity > 1 && (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <input
                          value={value}
                          onChange={(e) => setChosen((all) => ({ ...all, [line.key]: e.target.value.replace(/\D/g, '') }))}
                          inputMode="numeric"
                          className="field h-8 w-16 text-right"
                          aria-label={`Quantas ${line.label}`}
                        />
                        de {line.quantity}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {over && <p className="mt-1 text-xs font-semibold text-red-700">{over.line.label} só tem {over.line.quantity}.</p>}
          </div>
        )}

        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}

/** Uma ocorrência: o que, onde, quem, e resolver. */
export const IncidentRow = ({ incident, showOrder = false }: { incident: IncidentSummaryType; showOrder?: boolean }) => {
  const invalidate = useIncidentInvalidate()
  const canReport = useCanReport()
  const [resolving, setResolving] = useState(false)
  const [resolution, setResolution] = useState('')
  const resolve = useMutation({
    mutationFn: () => resolveIncident(incident.id, incident.version, resolution.trim() || null),
    onSuccess: () => {
      setResolving(false)
      invalidate(incident.salesDocumentId)
    },
  })
  const open = incident.status === 'aberta'

  return (
    <article className={clsx('rounded-2xl border p-3', open ? (incident.kind === 'refazer' ? 'border-red-300 bg-red-50/40' : 'border-amber-300 bg-amber-50/40') : 'border-line opacity-75')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold">
            {incident.kind === 'refazer' ? <RotateCcw className="mr-1 inline h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
            {incident.kind === 'refazer' ? 'Refazer' : 'Problema'} · {SECTOR_LABELS[incident.sector]}
            {incident.batchNumber !== null && ` · leva ${String(incident.batchNumber)}`}
          </p>
          {showOrder && (
            <Link to={`/pedidos/${incident.salesDocumentId}?aba=ocorrencias`} className="text-xs font-bold hover:underline">
              {orderRef({ number: incident.orderNumber })} · {incident.customerName}
            </Link>
          )}
        </div>
        <Badge tone={open ? (incident.kind === 'refazer' ? 'danger' : 'warning') : 'success'}>{open ? 'Aberta' : 'Resolvida'}</Badge>
      </div>
      <p className="mt-1 text-sm">{incident.description}</p>
      {incident.lines.length > 0 && (
        <p className="mt-1 text-xs text-ink/80">{incident.lines.map((line) => `${String(line.quantity)}× ${line.label}`).join(' · ')}</p>
      )}
      <p className="mt-1 text-[11px] text-muted">
        {incident.createdByName ?? 'Alguém'} · {ago(incident.createdAt)}
        {incident.resolvedAt && ` · resolvida por ${incident.resolvedByName ?? 'alguém'} em ${day(incident.resolvedAt)}`}
      </p>
      {incident.resolution && <p className="mt-1 text-xs"><strong>Como resolveu:</strong> {incident.resolution}</p>}
      {open && canReport && !resolving && (
        <Button size="sm" variant="ink" className="mt-2" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setResolving(true)}>
          Resolver
        </Button>
      )}
      {resolving && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={1000} placeholder="O que foi feito (opcional)" className="field h-9 flex-1" />
          <Button size="sm" variant="lime" busy={resolve.isPending} onClick={() => resolve.mutate()}>Resolvida</Button>
          <Button size="sm" variant="ghost" onClick={() => setResolving(false)}>Cancelar</Button>
        </div>
      )}
      {resolve.isError && <p className="mt-1 text-xs font-semibold text-red-700">{errorMessage(resolve.error)}</p>}
    </article>
  )
}
