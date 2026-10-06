import type { ProductionTimelineEntryType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { History, Send } from 'lucide-react'
import { useState } from 'react'

import { addComment } from '@/api/uniforms'
import { Section } from '@/components/ficha/Section'
import { Avatar, Button, ErrorBox } from '@/components/ui'
import { ago, dateTime } from '@/lib/format'
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
  if (entry.type === 'event') return EVENT_TEXT[entry.kind] ?? entry.kind
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
        {timeline.map((entry) => (
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
        ))}
        {timeline.length === 0 && <li className="text-sm text-muted">Nada registrado ainda.</li>}
      </ol>
    </Section>
  )
}
