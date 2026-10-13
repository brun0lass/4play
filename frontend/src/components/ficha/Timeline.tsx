import type { ProductionTimelineEntryType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { History, Send } from 'lucide-react'
import { useState } from 'react'

import { fetchSalesHistory } from '@/api/orders'
import { addComment } from '@/api/uniforms'
import { useAuth } from '@/auth/AuthProvider'
import { Section } from '@/components/ficha/Section'
import { Avatar, Button, ErrorBox } from '@/components/ui'
import { useAccess } from '@/lib/access'
import { ago, dateTime, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys } from '@/lib/queries'
import { STAGE_META, piecesText } from '@/lib/uniforms'

const EVENT_TEXT: Record<string, string> = {
  ficha: 'mexeu no atendimento',
  grade: 'mexeu na grade',
  personalizados: 'mexeu nos personalizados',
  arte: 'mexeu na arte',
  'imagem-adicionada': 'enviou uma imagem',
  'imagem-removida': 'tirou uma imagem',
  impressoras: 'trocou as impressoras',
  repetido: 'repetiu o pedido',
  link: 'criou o pedido pelo link do cliente',
}

/** Os campos do atendimento, como a frase da linha do tempo os diz. */
const SHEET_FIELDS: Record<string, string> = {
  dispatchDate: 'despacho',
  fabric: 'tecido',
  personalized: 'personalizado',
  logistics: 'logística',
  eventDate: 'data do evento',
  eventNote: 'evento',
  paymentMark: 'pagamento',
  gradeChecked: 'grade conferida',
  notes: 'observações',
  deliveryAddress: 'local de entrega',
}

type Revision = Awaited<ReturnType<typeof fetchSalesHistory>>[number]

const qty = (value: string) => String(Number(value))

/**
 * Uma alteração do pedido de vendas (F147 do Aeris), linha por linha:
 * "60 → 70 Conjunto…", "+ 10 Camiseta", "− 5 Regata". O preço só para quem vê
 * dinheiro (F220).
 */
const revisionLines = (revision: Revision, seeMoney: boolean): string[] => [
  ...revision.lines.changed.map((line) => {
    const quantity =
      line.quantityFrom === line.quantityTo ? qty(line.quantityTo) : `${qty(line.quantityFrom)} → ${qty(line.quantityTo)}`
    const price =
      seeMoney && line.unitPriceFrom !== line.unitPriceTo
        ? ` (por peça ${money(line.unitPriceFrom)} → ${money(line.unitPriceTo)})`
        : ''
    return `${quantity} ${line.description}${price}`
  }),
  ...revision.lines.added.map(
    (line) => `+ ${qty(line.quantity)} ${line.description}${seeMoney ? ` a ${money(line.unitPrice)}` : ''}`
  ),
  ...revision.lines.removed.map((line) => `− ${qty(line.quantity)} ${line.description}`),
]

const HEADER_FIELDS: Record<string, string> = {
  customer: 'o cliente',
  salesperson: 'o vendedor',
  courier: 'o entregador',
  notes: 'a observação',
  validUntil: 'a validade',
  discount: 'o desconto',
  priceList: 'a tabela de preço',
}

const RevisionEntry = ({ revision, seeMoney }: { revision: Revision; seeMoney: boolean }) => {
  const lines = revisionLines(revision, seeMoney)
  const headers = Object.keys(revision.header)
    .map((key) => HEADER_FIELDS[key])
    .filter(Boolean)
  const what =
    revision.action === 'cancelled'
      ? 'cancelou o pedido'
      : lines.length > 0
        ? 'alterou os itens do pedido'
        : headers.length > 0
          ? `trocou ${headers.join(', ')}`
          : 'alterou o pedido'
  const total =
    seeMoney && revision.totalBefore !== null && revision.totalAfter !== null && revision.totalBefore !== revision.totalAfter
      ? `Total ${money(revision.totalBefore)} → ${money(revision.totalAfter)}`
      : null
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
      <p>
        <strong className="font-extrabold">{revision.actorName ?? 'Sistema'}</strong> {what}
        <span className="ml-2 text-[11px] text-muted" title={dateTime(revision.occurredAt)}>
          {ago(revision.occurredAt)}
        </span>
      </p>
      {lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {lines.length > 0 && headers.length > 0 && <p className="mt-1 text-xs">Também trocou {headers.join(', ')}.</p>}
      {total && <p className="mt-1 text-xs font-bold">{total}</p>}
      {revision.reason && (
        <p className="mt-1 text-xs">
          <span className="font-bold">Motivo:</span> {revision.reason}
        </p>
      )}
    </div>
  )
}

const describe = (entry: ProductionTimelineEntryType): string => {
  if (entry.type === 'stage') {
    const to = STAGE_META[entry.to].label
    const printers = entry.printers.length > 0 ? ` (${entry.printers.map((p) => p.name).join(', ')})` : ''
    const forced = entry.forced ? ' — sem a arte aprovada' : ''
    // A leva (F230): separada de outra, ou movida inteira.
    if (entry.split && entry.batch) {
      const source = entry.split.from === 1 ? 'do restante' : `da leva ${String(entry.split.from)}`
      const where = entry.from === entry.to ? `em ${to}` : `para ${to}`
      return `separou a leva ${String(entry.batch.number)} ${source} (${piecesText(entry.split.pieces)}) ${where}${printers}${forced}`
    }
    const who = entry.batch ? `a leva ${String(entry.batch.number)} ` : ''
    return entry.from === null
      ? `pôs ${who}em ${to}${printers}`
      : `moveu ${who}de ${STAGE_META[entry.from].label} para ${to}${printers}${forced}`
  }
  if (entry.type === 'event') {
    const text = EVENT_TEXT[entry.kind] ?? entry.kind
    const fields = Array.isArray(entry.detail.fields)
      ? (entry.detail.fields as unknown[]).flatMap((f) => (typeof f === 'string' && SHEET_FIELDS[f] ? [SHEET_FIELDS[f]] : []))
      : []
    return entry.kind === 'ficha' && fields.length > 0 ? `${text} (${fields.join(', ')})` : text
  }
  return ''
}

export const Timeline = ({
  orderId,
  timeline,
}: {
  orderId: string
  timeline: readonly ProductionTimelineEntryType[]
}) => {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')
  const { can } = useAuth()
  const { seeMoney } = useAccess()
  // As alterações do pedido de vendas (itens, total, motivo). Fica sob a chave
  // do pedido: gravar qualquer coisa nele recarrega a linha do tempo inteira.
  const history = useQuery({
    queryKey: [...keys.order(orderId), 'sales-history'],
    queryFn: ({ signal }) => fetchSalesHistory(orderId, signal),
    enabled: can('sales.read'),
    staleTime: 30_000,
  })
  const revisions = (history.data ?? []).filter((r) => r.action === 'edited' || r.action === 'cancelled')
  const merged = [
    ...timeline.map((entry) => ({ at: entry.occurredAt, entry, revision: null })),
    ...revisions.map((revision) => ({ at: revision.occurredAt, entry: null, revision })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const mutation = useMutation({
    mutationFn: () => addComment(orderId, { body }),
    onSuccess: () => {
      setBody('')
      void queryClient.invalidateQueries({ queryKey: keys.order(orderId) })
    },
  })

  return (
    <Section title="Linha do tempo" icon={<History className="h-3.5 w-3.5" />}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (body.trim()) mutation.mutate()
        }}
        className="mb-5"
      >
        <textarea
          rows={2}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim()) mutation.mutate()
          }}
          placeholder="Escreva um recado para a equipe…"
          className="field resize-y"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted">Ctrl + Enter envia</span>
          <Button type="submit" size="sm" variant="ink" busy={mutation.isPending} disabled={!body.trim()} icon={<Send className="h-3.5 w-3.5" />}>
            Comentar
          </Button>
        </div>
        {mutation.isError && <div className="mt-2"><ErrorBox message={errorMessage(mutation.error)} /></div>}
      </form>

      <ol className="relative space-y-4 border-l-2 border-line pl-5">
        {merged.map(({ entry, revision }) =>
          revision ? (
            <li key={`revision-${revision.id}`} className="relative">
              <span className="absolute top-1 -left-[27px] h-3 w-3 rounded-full bg-amber-400 ring-4 ring-white" />
              <RevisionEntry revision={revision} seeMoney={seeMoney} />
            </li>
          ) : entry ? (
          <li key={`${entry.type}-${entry.id}`} className="relative">
            <span
              className={clsx(
                'absolute top-1 -left-[27px] h-3 w-3 rounded-full ring-4 ring-white',
                entry.type === 'stage' ? 'bg-lime ring-offset-0 outline outline-1 outline-ink' : entry.type === 'comment' ? 'bg-ink' : 'bg-zinc-300'
              )}
            />
            {entry.type === 'comment' ? (
              <div className="rounded-2xl bg-paper p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Avatar name={entry.actorName} />
                  <span className="text-xs font-extrabold">{entry.actorName ?? 'Alguém'}</span>
                  <span className="text-[11px] text-muted" title={dateTime(entry.occurredAt)}>{ago(entry.occurredAt)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
              </div>
            ) : (
              <p className="text-sm">
                <strong className="font-extrabold">{entry.actorName ?? 'Sistema'}</strong>{' '}
                <span className={entry.type === 'stage' && entry.forced ? 'text-red-700' : ''}>{describe(entry)}</span>
                <span className="ml-2 text-[11px] text-muted" title={dateTime(entry.occurredAt)}>{ago(entry.occurredAt)}</span>
              </p>
            )}
          </li>
          ) : null
        )}
        {merged.length === 0 && <li className="text-sm text-muted">Nada registrado ainda.</li>}
      </ol>
    </Section>
  )
}
