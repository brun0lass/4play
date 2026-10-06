import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Printer } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { moveBatch, moveStage } from '@/api/uniforms'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { ApiError, errorMessage } from '@/lib/http'
import { keys, usePrinters, useViewer } from '@/lib/queries'
import {
  STAGE_META,
  STAGE_REFUSALS,
  canMoveStage,
  entersFactory,
  orderRef,
  type Batch,
  type Order,
  type Stage,
} from '@/lib/uniforms'

type Pending = {
  order: Pick<Order, 'id' | 'number' | 'stage' | 'artStatus' | 'customerName'>
  to: Stage
  /** A leva separada que anda (F230); nulo é a leva 1 — o pedido, se não foi dividido. */
  batch: Pick<Batch, 'id' | 'number' | 'stage'> | null
}

/** De onde a troca sai: a etapa da leva, ou a do pedido. */
const fromOf = (pending: Pick<Pending, 'order' | 'batch'>): Stage => pending.batch?.stage ?? pending.order.stage

/**
 * Trocar a etapa de um pedido, de qualquer tela.
 *
 * As regras são do Aeris; a tela só pergunta antes o que o servidor vai pedir:
 * em qual impressora (para "Imprimindo") e a confirmação de quem gerencia para
 * mandar para a fábrica sem a arte aprovada.
 */
export const useStageMover = (): {
  requestMove: (order: Pending['order'], to: Stage, batch?: Pending['batch']) => void
  dialog: ReactNode
  isMoving: (id: string) => boolean
  lastError: string | null
  clearError: () => void
} => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const viewer = useViewer().data
  const printers = usePrinters('active')
  const [pending, setPending] = useState<Pending | null>(null)
  const [needs, setNeeds] = useState<'printer' | 'force' | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [lastError, setLastError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (input: {
      id: string
      ref: string
      batchId: string | null
      from: Stage
      to: Stage
      printerIds: string[]
      force: boolean
    }) => {
      const body = { from: input.from, to: input.to, printerIds: input.printerIds, force: input.force }
      if (input.batchId === null) await moveStage(input.id, body)
      else await moveBatch(input.id, input.batchId, body)
    },
    onSuccess: (_, input) => {
      toast(`${input.ref} foi para ${STAGE_META[input.to].label}.`)
      setPending(null)
      setNeeds(null)
      setSelected([])
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
      void queryClient.invalidateQueries({ queryKey: keys.order(input.id) })
    },
    onError: (error, input) => {
      const code = error instanceof ApiError ? error.code : ''
      if (code === 'printer_required') {
        setNeeds('printer')
        return
      }
      if (code === 'art_not_approved' && viewer?.manages === true && !input.force) {
        setNeeds('force')
        return
      }
      setPending(null)
      setNeeds(null)
      setLastError(STAGE_REFUSALS[code] ?? errorMessage(error))
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  const run = (target: Pending, printerIds: string[], force: boolean) =>
    mutation.mutate({
      id: target.order.id,
      ref: target.batch === null ? orderRef(target.order) : `${orderRef(target.order)} leva ${String(target.batch.number)}`,
      batchId: target.batch?.id ?? null,
      from: fromOf(target),
      to: target.to,
      printerIds,
      force,
    })

  const requestMove = (order: Pending['order'], to: Stage, batch: Pending['batch'] = null) => {
    const from = fromOf({ order, batch })
    if (from === to) return
    setLastError(null)
    if (!canMoveStage(viewer, from, to)) {
      setLastError(
        from === 'atendimento' && to !== 'arte'
          ? 'Do atendimento o pedido vai para a arte. Pular a arte é de quem gerencia a produção.'
          : 'Você não tem a função para essa troca. O atendimento sai pela atendente, a arte pelo designer e as etapas da fábrica pela produção.'
      )
      return
    }
    const unapprovedArt = entersFactory(from, to) && order.artStatus !== 'aprovada'
    if (unapprovedArt && viewer?.manages !== true) {
      setLastError(STAGE_REFUSALS.art_not_approved ?? null)
      return
    }
    const target = { order, to, batch }
    setPending(target)
    if (to === 'imprimindo') {
      setNeeds('printer')
      return
    }
    if (unapprovedArt) {
      setNeeds('force')
      return
    }
    setNeeds(null)
    run(target, [], false)
  }

  const close = () => {
    setPending(null)
    setNeeds(null)
    setSelected([])
    mutation.reset()
  }

  const title =
    pending === null
      ? ''
      : `${orderRef(pending.order)}${pending.batch ? ` · leva ${String(pending.batch.number)}` : ''} → ${STAGE_META[pending.to].label}`

  const dialog = (
    <Modal
      open={pending !== null && needs !== null}
      title={title}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          {needs === 'printer' ? (
            <Button
              variant="lime"
              busy={mutation.isPending}
              disabled={selected.length === 0}
              onClick={() =>
                pending &&
                run(
                  pending,
                  selected,
                  entersFactory(fromOf(pending), pending.to) &&
                    pending.order.artStatus !== 'aprovada' &&
                    viewer?.manages === true
                )
              }
            >
              Mandar para impressão
            </Button>
          ) : (
            <Button
              variant="danger"
              busy={mutation.isPending}
              onClick={() => pending && run(pending, [], true)}
            >
              Mandar sem aprovação
            </Button>
          )}
        </>
      }
    >
      {pending && needs === 'printer' && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Em qual máquina o pedido de <strong className="text-ink">{pending.order.customerName}</strong>{' '}
            vai imprimir? Pode marcar mais de uma.
          </p>
          {entersFactory(fromOf(pending), pending.to) && pending.order.artStatus !== 'aprovada' && viewer?.manages === true && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">
              A arte ainda não está aprovada. Como você gerencia a produção, a troca fica registrada
              na linha do tempo.
            </p>
          )}
          {printers.isPending && <p className="text-sm">Carregando impressoras…</p>}
          {printers.data?.length === 0 && (
            <p className="text-sm text-muted">
              Nenhuma impressora cadastrada. Cadastre em <strong>Equipe e máquinas</strong>.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {printers.data?.map((printer) => {
              const on = selected.includes(printer.id)
              return (
                <button
                  key={printer.id}
                  type="button"
                  onClick={() =>
                    setSelected((list) =>
                      on ? list.filter((id) => id !== printer.id) : [...list, printer.id]
                    )
                  }
                  className={clsx(
                    'flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold transition',
                    on ? 'border-ink bg-lime' : 'border-line hover:border-ink/30'
                  )}
                >
                  <Printer className="h-5 w-5" />
                  {printer.name}
                </button>
              )
            })}
          </div>
          {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.code === 'printer_required') && (
            <ErrorBox message={errorMessage(mutation.error)} />
          )}
        </div>
      )}
      {pending && needs === 'force' && (
        <div className="space-y-3 text-sm">
          <p>
            A arte deste pedido está{' '}
            <strong>ainda não aprovada</strong>. Imprimir o que o cliente não aprovou pode jogar
            tecido e tinta fora.
          </p>
          <p className="text-muted">
            Você gerencia a produção e pode passar por cima. Isso fica escrito na linha do tempo do
            pedido.
          </p>
          {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
        </div>
      )}
    </Modal>
  )

  return {
    requestMove,
    dialog,
    isMoving: (id) => mutation.isPending && mutation.variables.id === id,
    lastError,
    clearError: () => setLastError(null),
  }
}
