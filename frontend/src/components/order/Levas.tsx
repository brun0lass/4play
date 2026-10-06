import { clsx } from 'clsx'
import { Layers, Printer, Scissors } from 'lucide-react'
import { useState } from 'react'

import { Section } from '@/components/ficha/Section'
import { SplitBatchDialog } from '@/components/order/SplitBatch'
import { useStageMover } from '@/components/StageMover'
import { Badge, Button, ErrorBox } from '@/components/ui'
import { daysSince, int } from '@/lib/format'
import {
  STAGES,
  STAGE_META,
  isSplit,
  partLabel,
  partsOf,
  piecesText,
  type Order,
  type Part,
} from '@/lib/uniforms'

/**
 * As levas do pedido (F230 do Aeris): cada parte com a etapa, as peças e as
 * máquinas dela. Daqui se separa uma leva e se move uma leva inteira.
 */
export const LevasPanel = ({ order, editable }: { order: Order; editable: boolean }) => {
  const mover = useStageMover()
  const [splitting, setSplitting] = useState<Part | null>(null)
  const parts = partsOf(order)
  const split = isSplit(order)

  return (
    <Section title="Levas" icon={<Layers className="h-3.5 w-3.5" />}>
      <p className="mb-4 text-sm text-muted">
        {split
          ? `Pedido dividido em ${String(parts.length)} levas. Ele só sai quando todas estiverem prontas.`
          : 'O pedido anda inteiro. Para mandar uma parte na frente — ou dividir entre duas costureiras —, separe uma leva: escolha quantas peças de cada vão para outra etapa.'}
      </p>

      {mover.lastError && (
        <div className="mb-3">
          <ErrorBox message={mover.lastError} onRetry={mover.clearError} />
        </div>
      )}

      <div className="space-y-3">
        {parts.map((part) => {
          const meta = STAGE_META[part.stage]
          const Icon = meta.icon
          const stuck = daysSince(part.stageChangedAt)
          return (
            <article key={part.key} className="rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">{split ? partLabel(part) : 'O pedido inteiro'}</p>
                  <p className="mt-0.5 text-sm">{piecesText(part.pieces)}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {int(part.total)} peças · {stuck === 0 ? 'hoje nesta etapa' : `${String(stuck)}d nesta etapa`}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-xs font-extrabold text-white">
                  <span className={clsx('h-2 w-2 rounded-full', meta.dot)} />
                  <Icon className="h-3.5 w-3.5" /> {meta.label}
                </span>
              </div>

              {part.printers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {part.printers.map((printer) => (
                    <Badge key={printer.id} tone="info">
                      <Printer className="h-3 w-3" aria-hidden /> {printer.name}
                    </Badge>
                  ))}
                </div>
              )}

              {editable && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Scissors className="h-3.5 w-3.5" />}
                    disabled={part.total < 2}
                    onClick={() => setSplitting(part)}
                  >
                    Separar leva
                  </Button>
                  {split && (
                    <label className="flex items-center gap-2 text-xs font-bold">
                      Mover {part.batch === null ? 'o restante' : 'a leva'} para
                      <select
                        value=""
                        disabled={mover.isMoving(order.id)}
                        onChange={(event) => {
                          const to = event.target.value as Part['stage']
                          if (to) mover.requestMove(order, to, part.batch)
                        }}
                        className="field h-8 w-auto py-0 text-xs"
                      >
                        <option value="">escolha…</option>
                        {STAGES.filter((stage) => stage !== part.stage).map((stage) => (
                          <option key={stage} value={stage}>
                            {STAGE_META[stage].label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {mover.dialog}
      <SplitBatchDialog part={splitting} onClose={() => setSplitting(null)} />
    </Section>
  )
}
