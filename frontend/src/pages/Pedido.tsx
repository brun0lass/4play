import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, ArrowRight, Printer, Repeat2, Save } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { repeatOrder } from '@/api/uniforms'
import { ArtForm, PrintersForm } from '@/components/ficha/ArtAndPrinters'
import { FichaContext, useFichaRegistry } from '@/components/ficha/Section'
import { Attachments } from '@/components/ficha/Attachments'
import { GradeEditor } from '@/components/ficha/GradeEditor'
import { PersonalizationEditor } from '@/components/ficha/PersonalizationEditor'
import { SheetForm } from '@/components/ficha/SheetForm'
import { OrderActions } from '@/components/order/OrderActions'
import { Timeline } from '@/components/ficha/Timeline'
import { DispatchChip } from '@/components/OrderCard'
import { useStageMover } from '@/components/StageMover'
import { useToast } from '@/components/Toast'
import { Badge, Button, ErrorBox, Modal, Spinner } from '@/components/ui'
import { day, int, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys, useOrder, useViewer } from '@/lib/queries'
import { ART_STATUS_META, STAGES, STAGE_META, canWork, orderRef, type Stage } from '@/lib/uniforms'

export const PedidoPage = () => {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const detail = useOrder(id)
  const viewer = useViewer().data
  const mover = useStageMover()
  const [confirmRepeat, setConfirmRepeat] = useState(false)
  const [jumpTo, setJumpTo] = useState<Stage | null>(null)
  const registry = useFichaRegistry()
  const toast = useToast()

  // "Gravar tudo": um bloco por vez; a versão da ficha passa de um para o outro.
  const saveAll = useMutation({
    mutationFn: async () => {
      let version = detail.data?.order.sheetVersion ?? 0
      for (const entry of registry.dirty) {
        const next = await entry.save(version)
        if (typeof next === 'number') version = next
      }
    },
    onSuccess: () => toast('Tudo gravado.'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.order(id) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
    },
  })

  const leave = (to: string) => {
    if (
      registry.dirty.length > 0 &&
      !window.confirm('Há alterações não gravadas nesta ficha. Sair mesmo assim e perder o que foi digitado?')
    )
      return
    void navigate(to)
  }

  const repeat = useMutation({
    mutationFn: () => repeatOrder(id, { id: crypto.randomUUID() }),
    onSuccess: (created) => {
      setConfirmRepeat(false)
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
      void navigate(`/pedidos/${created.id}`)
    },
  })

  if (detail.isPending) return <Spinner label="Abrindo a ficha…" />
  if (detail.isError)
    return <ErrorBox message={errorMessage(detail.error)} onRetry={() => void detail.refetch()} />

  const { order, grade, personalization, attachments, timeline, repeatedFrom } = detail.data
  const open = order.status === 'confirmed' || order.status === 'draft'
  const closedReason = open ? null : 'Este pedido já saiu da fila. A ficha fica só para consulta.'
  const current = STAGES.indexOf(order.stage)
  const next = STAGES[current + 1]
  const pieces = order.pieces

  return (
    <FichaContext.Provider value={{ report: registry.report }}>
    <div className={registry.dirty.length > 0 ? 'pb-24' : undefined}>
      <button type="button" onClick={() => leave('/producao')} className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Voltar para os pedidos
      </button>

      {/* Cabeçalho */}
      <div className="brush-bg mb-6 overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="display text-5xl text-lime">{orderRef(order)}</span>
              {order.status === 'draft' && <Badge tone="warning">Rascunho</Badge>}
              {order.status === 'fulfilled' && <Badge tone="success">Entregue</Badge>}
              {order.status === 'cancelled' && <Badge tone="danger">Cancelado</Badge>}
            </div>
            <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{order.customerName}</h1>
            <p className="mt-1 text-sm text-white/60">
              {[order.customerCity, order.salespersonName && `Vendedor: ${order.salespersonName}`, `Emitido ${day(order.issuedAt)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <DispatchChip order={order} />
              <Badge tone={ART_STATUS_META[order.artStatus].tone}>Arte: {ART_STATUS_META[order.artStatus].label}</Badge>
              {order.eventDate && <Badge tone="neutral">Evento {day(order.eventDate)}{order.eventNote ? ` · ${order.eventNote}` : ''}</Badge>}
              {repeatedFrom && (
                <Link to={`/pedidos/${repeatedFrom.id}`}>
                  <Badge tone="info">
                    Repetição do {orderRef(repeatedFrom)}
                    {repeatedFrom.printers.length > 0 && ` · saiu em ${repeatedFrom.printers.map((p) => p.name).join(', ')}`}
                  </Badge>
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-right">
            <Stat label="Peças" value={int(pieces)} />
            <Stat label="Total" value={money(order.totalAmount)} />
            <Stat label="Pago" value={money(order.paidAmount)} />
            {order.ticketPerPiece && <Stat label="Por peça" value={money(order.ticketPerPiece)} className="col-span-3" small />}
          </div>
        </div>

        {/* Etapas */}
        <ol className="mt-8 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {STAGES.map((stage, index) => {
            const meta = STAGE_META[stage]
            const Icon = meta.icon
            const done = index < current
            const here = index === current
            return (
              <li key={stage}>
                <button
                  type="button"
                  disabled={!open || here || mover.isMoving(order.id)}
                  onClick={() => setJumpTo(stage)}
                  title={here ? meta.what : `Mover para ${meta.label}`}
                  className={clsx(
                    'flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center text-[10px] font-extrabold tracking-wide uppercase transition',
                    here && 'bg-lime text-ink shadow-[0_3px_0_0_rgb(0_0_0/0.8)]',
                    done && 'bg-white/10 text-lime hover:bg-white/20',
                    !here && !done && 'bg-white/5 text-white/50 hover:bg-white/15 hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </button>
              </li>
            )
          })}
        </ol>
        {mover.lastError && (
          <p className="mt-3 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold">{mover.lastError}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirmRepeat(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/80 hover:border-white/50 hover:text-white"
          >
            <Repeat2 className="h-4 w-4" /> Repetir pedido
          </button>
          <Link
            to={`/pedidos/${order.id}/imprimir`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/80 hover:border-white/50 hover:text-white"
          >
            <Printer className="h-4 w-4" /> Imprimir ficha
          </Link>
          </div>
          {open && next && (
            <Button
              variant="lime"
              size="lg"
              busy={mover.isMoving(order.id)}
              onClick={() => mover.requestMove(order, next)}
            >
              Avançar para {STAGE_META[next].label} <ArrowRight className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <GradeEditor
            orderId={order.id}
            version={order.sheetVersion}
            grade={grade}
            editable={open && canWork(viewer, 'atendimento')}
            readOnlyReason={closedReason}
          />
          <PersonalizationEditor
            orderId={order.id}
            version={order.sheetVersion}
            rows={personalization}
            editable={open && canWork(viewer, 'atendimento')}
            readOnlyReason={closedReason}
          />
          <Attachments orderId={order.id} attachments={attachments} editable={open} />
          <Timeline orderId={order.id} timeline={timeline} />
        </div>
        <div className="space-y-6">
          <OrderActions orderId={order.id} />
          <SheetForm order={order} editable={open && canWork(viewer, 'atendimento')} readOnlyReason={closedReason} />
          <ArtForm order={order} editable={open && canWork(viewer, 'arte')} readOnlyReason={closedReason} />
          <PrintersForm order={order} editable={open && canWork(viewer, 'producao')} readOnlyReason={closedReason} />
        </div>
      </div>

      {mover.dialog}

      <Modal
        open={jumpTo !== null}
        title="Mudar a etapa?"
        onClose={() => setJumpTo(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setJumpTo(null)}>Cancelar</Button>
            <Button
              variant="lime"
              onClick={() => {
                if (jumpTo) mover.requestMove(order, jumpTo)
                setJumpTo(null)
              }}
            >
              Mover para {jumpTo ? STAGE_META[jumpTo].label : ''}
            </Button>
          </>
        }
      >
        {jumpTo && (
          <p className="text-sm">
            O pedido <strong>{orderRef(order)}</strong> sai de <strong>{STAGE_META[order.stage].label}</strong> e vai para{' '}
            <strong>{STAGE_META[jumpTo].label}</strong>
            {STAGES.indexOf(jumpTo) < current ? ' (volta uma etapa)' : STAGES.indexOf(jumpTo) > current + 1 ? ' (pulando etapas)' : ''}.
            Fica registrado na linha do tempo.
          </p>
        )}
      </Modal>

      {registry.dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-lime px-4 py-3 lg:left-64">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink">
              Alterações não gravadas: {registry.dirty.map((entry) => entry.name).join(', ')}
            </p>
            <div className="flex items-center gap-2">
              {saveAll.isError && <span className="text-xs font-bold text-red-700">{errorMessage(saveAll.error)}</span>}
              <Button variant="ink" busy={saveAll.isPending} icon={<Save className="h-4 w-4" />} onClick={() => saveAll.mutate()}>
                Gravar tudo
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={confirmRepeat}
        title={`Repetir ${orderRef(order)}`}
        onClose={() => setConfirmRepeat(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRepeat(false)}>Cancelar</Button>
            <Button variant="lime" busy={repeat.isPending} onClick={() => repeat.mutate()}>
              Criar pedido igual
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Cria e confirma um pedido novo para <strong>{order.customerName}</strong>, com a mesma ficha (grade,
          personalizados e arte). As impressoras não são copiadas — ficam como referência.
        </p>
        {repeat.isError && <div className="mt-3"><ErrorBox message={errorMessage(repeat.error)} /></div>}
      </Modal>
    </div>
    </FichaContext.Provider>
  )
}

const Stat = ({
  label,
  value,
  className,
  small,
}: {
  label: string
  value: string
  className?: string
  small?: boolean
}) => (
  <div className={clsx('rounded-2xl bg-white/5 px-4 py-3', className)}>
    <p className="text-[10px] font-bold tracking-widest text-white/50 uppercase">{label}</p>
    <p className={clsx('font-extrabold', small ? 'text-sm' : 'text-xl')}>{value}</p>
  </div>
)
