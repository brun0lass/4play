import type { ProductionOrderResponseType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Palette, Printer } from 'lucide-react'

import { replacePrinters, saveArt } from '@/api/uniforms'
import { SaveBar, Section, useDraft, useFichaSection } from '@/components/ficha/Section'
import { useToast } from '@/components/Toast'
import { keys, useMembers, usePrinters } from '@/lib/queries'
import { ART_STATUS_META, type ArtStatus } from '@/lib/uniforms'

type Order = ProductionOrderResponseType['order']

type ArtDraft = {
  status: ArtStatus
  designerUserId: string
  artReady: boolean
  productionFileReady: boolean
}

export const ArtForm = ({
  order,
  editable,
  readOnlyReason,
}: {
  order: Order
  editable: boolean
  readOnlyReason: string | null
}) => {
  const queryClient = useQueryClient()
  const members = useMembers()
  const { draft, setDraft, dirty, reset } = useDraft<ArtDraft>({
    status: order.artStatus,
    designerUserId: order.designerUserId ?? '',
    artReady: order.artReady,
    productionFileReady: order.productionFileReady,
  })

  const designers = (members.data ?? []).filter(
    (member) => member.functions.includes('arte') || member.userId === order.designerUserId
  )

  const toast = useToast()
  const doSave = async () => {
    await saveArt(order.id, {
        version: order.artVersion,
        status: draft.status,
        designerUserId: draft.designerUserId || null,
        artReady: draft.artReady,
        productionFileReady: draft.productionFileReady,
      })
  }
  useFichaSection('art', 'Arte', dirty, doSave)

  const mutation = useMutation({
    mutationFn: doSave,
    onSuccess: () => toast('Arte gravada.'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.order(order.id) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  const disabled = !editable

  return (
    <Section title="Arte" icon={<Palette className="h-3.5 w-3.5" />}>
      <span className="label">Andamento</span>
      <div className="grid grid-cols-1 gap-1.5">
        {(Object.keys(ART_STATUS_META) as ArtStatus[]).map((status) => {
          const on = draft.status === status
          return (
            <button
              key={status}
              type="button"
              disabled={disabled}
              onClick={() => setDraft((d) => ({ ...d, status }))}
              className={clsx(
                'flex items-center justify-between rounded-xl border-2 px-3 py-2 text-left transition disabled:cursor-default',
                on
                  ? status === 'aprovada'
                    ? 'border-ink bg-lime'
                    : 'border-ink bg-ink text-white'
                  : 'border-line hover:border-ink/30'
              )}
            >
              <span className="text-sm font-bold">{ART_STATUS_META[status].label}</span>
              <span className={clsx('text-[11px]', on ? 'opacity-80' : 'text-muted')}>
                {ART_STATUS_META[status].what}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="designer">Designer</label>
        <select
          id="designer"
          className="field"
          disabled={disabled}
          value={draft.designerUserId}
          onChange={(e) => setDraft((d) => ({ ...d, designerUserId: e.target.value }))}
        >
          <option value="">Ninguém ainda</option>
          {designers.map((member) => (
            <option key={member.userId} value={member.userId}>{member.displayName}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-ink" disabled={disabled} checked={draft.artReady} onChange={(e) => setDraft((d) => ({ ...d, artReady: e.target.checked }))} />
          Arte pronta
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-ink" disabled={disabled} checked={draft.productionFileReady} onChange={(e) => setDraft((d) => ({ ...d, productionFileReady: e.target.checked }))} />
          Arquivo de produção (Corel) pronto
        </label>
      </div>

      <SaveBar
        dirty={dirty}
        busy={mutation.isPending}
        saved={mutation.isSuccess}
        error={mutation.error}
        onSave={() => mutation.mutate()}
        onDiscard={() => {
          reset()
          mutation.reset()
        }}
        readOnlyReason={readOnlyReason ?? (editable ? null : 'Só o designer (ou quem gerencia) mexe na arte.')}
      />
    </Section>
  )
}

export const PrintersForm = ({
  order,
  editable,
  readOnlyReason,
}: {
  order: Order
  editable: boolean
  readOnlyReason: string | null
}) => {
  const queryClient = useQueryClient()
  const printers = usePrinters('active')
  const { draft, setDraft, dirty, reset } = useDraft<string[]>(order.printers.map((p) => p.id).sort())

  const toast = useToast()
  const doSave = () => replacePrinters(order.id, draft)
  useFichaSection('printers', 'Impressoras', dirty, doSave)

  const mutation = useMutation({
    mutationFn: doSave,
    onSuccess: () => toast('Impressoras gravadas.'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.order(order.id) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  // As máquinas já marcadas continuam na lista mesmo se foram arquivadas.
  const list = [
    ...(printers.data ?? []),
    ...order.printers.filter((p) => !(printers.data ?? []).some((a) => a.id === p.id)),
  ]

  return (
    <Section title="Impressoras" icon={<Printer className="h-3.5 w-3.5" />}>
      {list.length === 0 && <p className="text-sm text-muted">Nenhuma impressora cadastrada.</p>}
      <div className="flex flex-wrap gap-1.5">
        {list.map((printer) => {
          const on = draft.includes(printer.id)
          return (
            <button
              key={printer.id}
              type="button"
              disabled={!editable}
              onClick={() =>
                setDraft((current) =>
                  (on ? current.filter((id) => id !== printer.id) : [...current, printer.id]).sort()
                )
              }
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition',
                on ? 'border-ink bg-ink text-lime' : 'border-line bg-white hover:border-ink/40'
              )}
            >
              <Printer className="h-3.5 w-3.5" /> {printer.name}
            </button>
          )
        })}
      </div>
      <SaveBar
        dirty={dirty}
        busy={mutation.isPending}
        saved={mutation.isSuccess}
        error={mutation.error}
        onSave={() => mutation.mutate()}
        onDiscard={() => {
          reset()
          mutation.reset()
        }}
        readOnlyReason={readOnlyReason ?? (editable ? null : 'Só a produção (ou quem gerencia) corrige as máquinas.')}
      />
    </Section>
  )
}
