import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, ArrowLeft, ArrowRight, Grid3x3, Headset, History, Layers, Palette, Printer, Repeat2, Save } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'

import { repeatOrder } from '@/api/uniforms'
import { CustomerHistory } from '@/components/CustomerHistory'
import { ArtForm, PrintersForm } from '@/components/ficha/ArtAndPrinters'
import { ArtMock } from '@/components/ficha/ArtMock'
import { FichaContext, Section, useFichaRegistry } from '@/components/ficha/Section'
import { Attachments } from '@/components/ficha/Attachments'
import { GradeEditor } from '@/components/ficha/GradeEditor'
import { PersonalizationEditor } from '@/components/ficha/PersonalizationEditor'
import { SheetForm } from '@/components/ficha/SheetForm'
import { LevasPanel } from '@/components/order/Levas'
import { OrderIncidents } from '@/components/progress/Incidents'
import { OrderActions } from '@/components/order/OrderActions'
import { Timeline } from '@/components/ficha/Timeline'
import { DispatchChip } from '@/components/OrderCard'
import { useStageMover } from '@/components/StageMover'
import { useToast } from '@/components/Toast'
import { Badge, Button, ErrorBox, Modal, Spinner } from '@/components/ui'
import { day, int, money } from '@/lib/format'
import { useAccess } from '@/lib/access'
import { errorMessage } from '@/lib/http'
import { keys, useOrder, useViewer } from '@/lib/queries'
import {
  ART_STATUS_META,
  STAGES,
  STAGE_META,
  canWork,
  isSplit,
  orderRef,
  partLabel,
  partsNotReady,
  partsOf,
  type Stage,
} from '@/lib/uniforms'

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
  const access = useAccess()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('aba'))?.key ?? defaultTab(access.homeTab)) as TabKey
  const chooseTab = (key: TabKey) => setParams({ aba: key }, { replace: true })

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
  // As levas (F230): o cabeçalho é a leva 1, o restante; o pedido só sai com todas prontas.
  const split = isSplit(order)
  const parts = partsOf(order)
  const restVisible = parts.some((part) => part.batch === null)
  const notReady = partsNotReady(order)
  const blockedReason =
    split && notReady.length > 0
      ? `O pedido só sai com todas as levas prontas. Faltam: ${notReady
          .map((part) => `${partLabel(part)} em ${STAGE_META[part.stage].label}`)
          .join('; ')}.`
      : null

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

          {access.seeMoney ? (
            <div className="grid w-full grid-cols-2 gap-2 text-right sm:w-auto sm:grid-cols-3 sm:gap-3">
              <Stat label="Peças" value={int(pieces)} />
              <Stat label="Total" value={money(order.totalAmount)} />
              <Stat label="Pago" value={money(order.paidAmount)} />
              {order.ticketPerPiece ? <Stat label="Por peça" value={money(order.ticketPerPiece)} /> : <span />}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 text-right">
              <Stat label="Peças" value={int(pieces)} />
            </div>
          )}
        </div>

        {/* Etapas */}
        <ol className="mt-8 grid grid-cols-3 gap-1.5 sm:grid-cols-9">
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
                    'flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl px-0.5 py-2.5 text-center text-[8.5px] font-extrabold uppercase transition sm:px-1 sm:text-[10px] sm:tracking-wide',
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
        {split && (
          <button
            type="button"
            onClick={() => chooseTab('levas')}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-lime hover:bg-white/20"
          >
            <Layers className="h-3.5 w-3.5" />
            Dividido em {parts.length} levas — as etapas acima são do restante. Ver as levas
          </button>
        )}
        {mover.lastError && (
          <p className="mt-3 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold">{mover.lastError}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
          {/* Repetir cria um pedido: é de quem atende (a API recusa os outros). */}
          {access.createOrder && (
            <button
              type="button"
              onClick={() => setConfirmRepeat(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/80 hover:border-white/50 hover:text-white"
            >
              <Repeat2 className="h-4 w-4" /> Repetir pedido
            </button>
          )}
          <Link
            to={`/pedidos/${order.id}/imprimir`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/80 hover:border-white/50 hover:text-white"
          >
            <Printer className="h-4 w-4" /> Imprimir ficha
          </Link>
          </div>
          {open && next && restVisible && (
            <Button
              variant="lime"
              size="lg"
              busy={mover.isMoving(order.id)}
              onClick={() => mover.requestMove(order, next)}
            >
              {split ? 'Avançar o restante para' : 'Avançar para'} {STAGE_META[next].label} <ArrowRight className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {/* As abas: cada uma é um assunto, e todas ficam montadas — trocar de aba
              não perde o que foi digitado, e o "Gravar tudo" enxerga as três. */}
          <div role="tablist" aria-label="Partes do pedido" className="scroll-thin mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-black/[0.05] p-1">
            {TABS.map((t) => {
              const Icon = t.icon
              const pending = t.blocks.some((b) => registry.dirtyIds.includes(b))
              const counter =
                t.key === 'grade' ? pieces : t.key === 'arte' ? attachments.length : t.key === 'levas' && split ? parts.length : t.key === 'ocorrencias' ? order.openIncidents : null
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => chooseTab(t.key)}
                  className={clsx(
                    'relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold whitespace-nowrap transition',
                    tab === t.key ? 'bg-white text-ink shadow' : 'text-muted hover:text-ink'
                  )}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                  {counter !== null && counter > 0 && (
                    <span className={clsx('rounded-full px-1.5 text-[10px]', tab === t.key ? 'bg-lime' : 'bg-black/10')}>{counter}</span>
                  )}
                  {pending && <span className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-amber-500" title="Alteração não gravada" />}
                </button>
              )
            })}
          </div>

          <div role="tabpanel" hidden={tab !== 'atendimento'} className={clsx('grid items-start gap-6', access.seeMoney && 'lg:grid-cols-2')}>
            <SheetForm order={order} editable={open && canWork(viewer, 'atendimento')} readOnlyReason={closedReason} />
            {access.seeMoney && <OrderActions orderId={order.id} blockedReason={blockedReason} />}
          </div>

          <div role="tabpanel" hidden={tab !== 'grade'} className="space-y-6">
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
          </div>

          <div role="tabpanel" hidden={tab !== 'arte'} className="grid items-start gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <ArtForm order={order} editable={open && canWork(viewer, 'arte')} readOnlyReason={closedReason} />
              <PrintersForm order={order} editable={open && canWork(viewer, 'producao')} readOnlyReason={closedReason} />
            </div>
            <Attachments orderId={order.id} attachments={attachments} editable={open} />
          </div>

          <div role="tabpanel" hidden={tab !== 'levas'}>
            <LevasPanel order={order} editable={open} />
          </div>

          <div role="tabpanel" hidden={tab !== 'ocorrencias'}>
            <OrderIncidents order={order} />
          </div>
        </div>

        {/* A conversa da equipe acompanha a pessoa em qualquer aba. */}
        <aside className="space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:scroll-thin xl:rounded-[1.25rem]">
          {/* O mock sempre à vista, em cima da linha do tempo (o dono, 06/10). */}
          <ArtMock attachments={attachments} onGoToArt={() => chooseTab('arte')} />
          <Timeline orderId={order.id} timeline={timeline} />
          {/* Em qual máquina saiu da outra vez (F229): o que se procura quando o cliente repete. */}
          <Section title="Pedidos anteriores do cliente" icon={<History className="h-3.5 w-3.5" />}>
            <CustomerHistory partyId={order.customerPartyId} exceptOrderId={order.id} limit={3} />
          </Section>
        </aside>
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
  <div className={clsx('min-w-0 rounded-2xl bg-white/5 px-4 py-3', className)}>
    <p className="text-[10px] font-bold tracking-widest text-white/50 uppercase">{label}</p>
    <p className={clsx('font-extrabold', small ? 'text-sm' : 'text-lg sm:text-xl')}>{value}</p>
  </div>
)

type TabKey = 'atendimento' | 'grade' | 'arte' | 'levas' | 'ocorrencias'

const TABS: { key: TabKey; label: string; icon: typeof Headset; blocks: string[] }[] = [
  { key: 'atendimento', label: 'Atendimento', icon: Headset, blocks: ['sheet'] },
  { key: 'grade', label: 'Grade e nomes', icon: Grid3x3, blocks: ['grade', 'personalization'] },
  { key: 'arte', label: 'Arte e impressão', icon: Palette, blocks: ['art', 'printers'] },
  { key: 'levas', label: 'Levas', icon: Layers, blocks: [] },
  { key: 'ocorrencias', label: 'Ocorrências', icon: AlertTriangle, blocks: [] },
]

/** O operador precisa dos tamanhos para cortar e costurar: abre na grade. */
const defaultTab = (home: 'atendimento' | 'grade' | 'arte' | 'producao'): TabKey =>
  home === 'producao' ? 'grade' : home
