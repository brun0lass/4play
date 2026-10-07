import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Printer, Scissors } from 'lucide-react'
import { useEffect, useState } from 'react'

import { moveBatch, moveStage, splitBatch } from '@/api/uniforms'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { ApiError, errorMessage } from '@/lib/http'
import { keys, usePrinters, useViewer } from '@/lib/queries'
import {
  STAGES,
  STAGE_META,
  STAGE_REFUSALS,
  canMoveStage,
  cellKey,
  cellLabel,
  entersFactory,
  orderRef,
  partLabel,
  piecesTotal,
  type Part,
  type Stage,
} from '@/lib/uniforms'

const SPLIT_REFUSALS: Record<string, string> = {
  ...STAGE_REFUSALS,
  over_available: 'A leva não tem mais tantas peças — alguém separou outra agora há pouco. Feche e abra de novo.',
  takes_everything: 'Essas são todas as peças da leva: mova a leva inteira.',
  nothing_selected: 'Escolha quantas peças vão para a leva nova.',
  batch_not_found: 'Esta leva não existe mais. Recarregue a ficha.',
}

/**
 * Separar uma leva (F230 do Aeris): escolhe quantas peças de cada vão, como
 * leva nova, para outra etapa — o resto fica onde está.
 *
 * Mesma etapa vale: é como se põe duas costureiras no mesmo pedido. Escolher
 * TUDO vira "mover a leva inteira", que é o que isso é.
 */
export const SplitBatchDialog = ({ part, onClose }: { part: Part | null; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const viewer = useViewer().data
  const printers = usePrinters('active')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [to, setTo] = useState<Stage>('atendimento')
  const [selected, setSelected] = useState<string[]>([])
  const [force, setForce] = useState(false)

  // Cada vez que abre: nada escolhido, e a próxima etapa como destino.
  useEffect(() => {
    if (part === null) return
    setAmounts({})
    setSelected([])
    setForce(false)
    setTo(STAGES[STAGES.indexOf(part.stage) + 1] ?? part.stage)
  }, [part])

  // Por célula (F235 do Aeris): "10 Camisa M", não só "10 Camisa".
  const quantityOf = (key: string): number => {
    const value = Number(amounts[key] ?? '')
    return Number.isInteger(value) && value > 0 ? value : 0
  }
  const pieces = part?.pieces ?? []
  const chosen = pieces.filter((count) => quantityOf(cellKey(count)) > 0)
  const over = pieces.find((count) => quantityOf(cellKey(count)) > count.quantity)
  const everything = chosen.length > 0 && pieces.every((count) => quantityOf(cellKey(count)) === count.quantity)
  const moving = piecesTotal(chosen.map((count) => ({ ...count, quantity: quantityOf(cellKey(count)) })))

  const from = part?.stage ?? 'atendimento'
  const allowed = part !== null && canMoveStage(viewer, from, to)
  // Separar dentro de "imprimindo" herda a máquina; ir para lá pede a máquina.
  const needsPrinter = to === 'imprimindo' && from !== 'imprimindo'
  const unapproved = part !== null && entersFactory(from, to) && part.order.artStatus !== 'aprovada'

  const mutation = useMutation({
    mutationFn: async () => {
      if (part === null) return
      const printerIds = needsPrinter ? selected : []
      if (everything) {
        const body = { from, to, printerIds, force }
        if (part.batch === null) await moveStage(part.order.id, body)
        else await moveBatch(part.order.id, part.batch.id, body)
        return
      }
      await splitBatch(part.order.id, {
        sourceBatchId: part.batch?.id ?? null,
        from,
        to,
        pieces: chosen.map((count) => ({ piece: count.piece, size: count.size, quantity: quantityOf(cellKey(count)) })),
        printerIds,
        force,
      })
    },
    onSuccess: () => {
      if (part !== null) {
        toast(
          everything
            ? `${orderRef(part.order)} · ${partLabel(part)} foi para ${STAGE_META[to].label}.`
            : `${orderRef(part.order)}: ${String(moving)} peças separadas em ${STAGE_META[to].label}.`
        )
        void queryClient.invalidateQueries({ queryKey: keys.order(part.order.id) })
      }
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
      onClose()
    },
  })

  const refusal = (() => {
    if (part === null) return null
    if (!allowed)
      return from === 'atendimento' && to !== 'arte'
        ? 'Do atendimento o pedido vai para a arte. Pular a arte é de quem gerencia a produção.'
        : 'Você não tem a função para essa troca de etapa.'
    if (unapproved && viewer?.manages !== true) return STAGE_REFUSALS.art_not_approved ?? null
    if (over) return `A leva só tem ${String(over.quantity)} ${cellLabel(over)}.`
    if (everything && to === from) return 'Escolheu a leva inteira na mesma etapa: não há o que separar.'
    return null
  })()
  const ready =
    chosen.length > 0 &&
    refusal === null &&
    (!needsPrinter || selected.length > 0) &&
    (!unapproved || force)

  const errorText =
    mutation.error instanceof ApiError
      ? (SPLIT_REFUSALS[mutation.error.code] ?? errorMessage(mutation.error))
      : mutation.error
        ? errorMessage(mutation.error)
        : null

  return (
    <Modal
      open={part !== null}
      wide
      title={part === null ? '' : `Separar leva — ${orderRef(part.order)}`}
      onClose={() => {
        mutation.reset()
        onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="lime"
            icon={<Scissors className="h-4 w-4" />}
            busy={mutation.isPending}
            disabled={!ready}
            onClick={() => mutation.mutate()}
          >
            {everything ? `Mover a leva inteira para ${STAGE_META[to].label}` : `Separar ${String(moving)} peças`}
          </Button>
        </>
      }
    >
      {part && (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Saindo da <strong className="text-ink">{partLabel(part)}</strong>, que está em{' '}
            <strong className="text-ink">{STAGE_META[part.stage].label}</strong> com {part.total} peças. O que você
            não separar continua onde está.
          </p>

          <div>
            <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Quantas de cada peça e tamanho</p>
            {pieces.length === 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                Este pedido ainda não tem grade. Preencha a grade e os personalizados antes de dividir.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {pieces.map((count) => (
                <label key={cellKey(count)} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{cellLabel(count)}</span>
                    <span className="text-[11px] text-muted">tem {count.quantity}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={count.quantity}
                      value={amounts[cellKey(count)] ?? ''}
                      onChange={(event) => setAmounts((current) => ({ ...current, [cellKey(count)]: event.target.value }))}
                      placeholder="0"
                      className={clsx('field w-20 text-right', quantityOf(cellKey(count)) > count.quantity && 'border-red-500')}
                      aria-label={`Quantas ${cellLabel(count)}`}
                    />
                    <button
                      type="button"
                      onClick={() => setAmounts((current) => ({ ...current, [cellKey(count)]: String(count.quantity) }))}
                      className="rounded-full px-2 py-1 text-[11px] font-bold text-muted hover:bg-black/5 hover:text-ink"
                    >
                      Todas
                    </button>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Para qual etapa</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setTo(stage)}
                  className={clsx(
                    'rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition',
                    to === stage ? 'border-ink bg-lime' : 'border-line hover:border-ink/30',
                    !canMoveStage(viewer, from, stage) && stage !== from && 'opacity-40'
                  )}
                >
                  {STAGE_META[stage].label}
                  {stage === from && ' (mesma)'}
                </button>
              ))}
            </div>
            {to === from && (
              <p className="mt-2 text-xs text-muted">
                Na mesma etapa a leva nova fica ao lado da outra — é assim que duas costureiras dividem o mesmo pedido.
              </p>
            )}
          </div>

          {needsPrinter && (
            <div>
              <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Em qual máquina</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {printers.data?.map((printer) => {
                  const on = selected.includes(printer.id)
                  return (
                    <button
                      key={printer.id}
                      type="button"
                      onClick={() => setSelected((list) => (on ? list.filter((id) => id !== printer.id) : [...list, printer.id]))}
                      className={clsx(
                        'flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-sm font-bold transition',
                        on ? 'border-ink bg-lime' : 'border-line hover:border-ink/30'
                      )}
                    >
                      <Printer className="h-4 w-4" /> {printer.name}
                    </button>
                  )
                })}
              </div>
              {printers.data?.length === 0 && (
                <p className="text-sm text-muted">Nenhuma impressora cadastrada. Cadastre em Equipe e máquinas.</p>
              )}
            </div>
          )}

          {unapproved && viewer?.manages === true && (
            <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} className="mt-0.5" />
              <span>
                A arte ainda <strong>não foi aprovada</strong>. Mandar para a fábrica mesmo assim (fica escrito na linha
                do tempo).
              </span>
            </label>
          )}

          {refusal && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{refusal}</p>}
          {errorText && <ErrorBox message={errorText} />}
        </div>
      )}
    </Modal>
  )
}
