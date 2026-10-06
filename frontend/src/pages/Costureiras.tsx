import type { SeamstressSummaryType, SewingJobSummaryType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Archive, Pencil, Phone, Plus, Shirt, Trash2, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { createSeamstress, updateSeamstress } from '@/api/uniforms'
import { DeliverDialog, SewingJobRow, termText } from '@/components/sewing/Sewing'
import { useToast } from '@/components/Toast'
import { Badge, Button, Empty, ErrorBox, Modal, PageHeader, Spinner } from '@/components/ui'
import { useAccess } from '@/lib/access'
import { int, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys, useSeamstressJobs, useSeamstresses } from '@/lib/queries'

/** As peças que a 4Play faz — as mesmas sugestões da grade do Aeris. */
const PIECES = ['Camisa', 'Regata', 'Shorts', 'Shorts com bolso', 'Longa', 'Manguito', 'Sunga', 'Top', 'Babylook', 'Polo']

const TERMS = [
  { days: 0, label: 'Na entrega' },
  { days: 7, label: '7 dias' },
  { days: 15, label: '15 dias' },
  { days: 30, label: '30 dias' },
]

/**
 * As costureiras (F231 do Aeris): quem são, a tabela de cada uma, o prazo de
 * pagamento e o que está com cada uma agora.
 */
export const CostureirasPage = () => {
  const access = useAccess()
  const [showArchived, setShowArchived] = useState(false)
  const list = useSeamstresses(showArchived ? 'archived' : 'active')
  const [editing, setEditing] = useState<SeamstressSummaryType | 'new' | null>(null)
  const [viewing, setViewing] = useState<SeamstressSummaryType | null>(null)

  return (
    <div>
      <PageHeader
        kicker="Quem costura"
        title="Costureiras"
        actions={
          access.manageSeamstresses && (
            <Button variant="lime" icon={<UserPlus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              Nova costureira
            </Button>
          )
        }
      >
        <p className="mt-2 text-sm font-semibold text-muted">
          A tabela de cada uma, o prazo para pagar e o que está com ela agora. A costura entregue da terceirizada vira conta a pagar.
        </p>
      </PageHeader>

      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => setShowArchived(false)} className={clsx('rounded-full px-3 py-1.5 text-xs font-bold', !showArchived ? 'bg-ink text-white' : 'bg-black/5')}>
          Ativas
        </button>
        <button type="button" onClick={() => setShowArchived(true)} className={clsx('rounded-full px-3 py-1.5 text-xs font-bold', showArchived ? 'bg-ink text-white' : 'bg-black/5')}>
          Arquivadas
        </button>
      </div>

      {list.isPending && <Spinner />}
      {list.isError && <ErrorBox message={errorMessage(list.error)} onRetry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <Empty title={showArchived ? 'Nenhuma arquivada' : 'Nenhuma costureira ainda'}>
          {!showArchived && <p>Cadastre quem costura para a 4Play — terceirizada com a tabela dela, ou CLT.</p>}
        </Empty>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.data?.map((s) => (
          <article key={s.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-extrabold">{s.name}</p>
                {s.phone && (
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Phone className="h-3 w-3" /> {s.phone}
                  </p>
                )}
              </div>
              <Badge tone={s.kind === 'clt' ? 'neutral' : 'info'}>{s.kind === 'clt' ? 'CLT' : 'Terceirizada'}</Badge>
            </div>

            {s.kind === 'terceirizada' && s.paymentTermDays !== null && (
              <p className="mt-2 text-xs font-semibold">Recebe {termText(s.paymentTermDays)}</p>
            )}
            {s.prices.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.prices.map((price) => (
                  <span key={price.piece} className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold">
                    {price.piece}
                    {price.unitPrice !== null && ` ${money(price.unitPrice)}`}
                  </span>
                ))}
              </div>
            )}
            {s.notes && <p className="mt-2 line-clamp-2 text-xs text-muted">{s.notes}</p>}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-xs font-bold">
                {s.openJobs === 0 ? 'Nada com ela agora' : `${String(s.openJobs)} costura(s) · ${int(s.openPieces)} pç com ela`}
              </span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" icon={<Shirt className="h-3.5 w-3.5" />} onClick={() => setViewing(s)}>
                  Costuras
                </Button>
                {access.manageSeamstresses && (
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(s)}>
                    Editar
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <SeamstressForm value={editing} onClose={() => setEditing(null)} />
      <JobsDialog seamstress={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

type PriceRow = { piece: string; unitPrice: string }

const SeamstressForm = ({ value, onClose }: { value: SeamstressSummaryType | 'new' | null; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const editing = value !== null && value !== 'new' ? value : null
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [kind, setKind] = useState<'terceirizada' | 'clt'>('terceirizada')
  const [term, setTerm] = useState('15')
  const [notes, setNotes] = useState('')
  const [prices, setPrices] = useState<PriceRow[]>([])

  useEffect(() => {
    if (value === null) return
    setName(editing?.name ?? '')
    setPhone(editing?.phone ?? '')
    setKind(editing?.kind ?? 'terceirizada')
    setTerm(String(editing?.paymentTermDays ?? 15))
    setNotes(editing?.notes ?? '')
    setPrices(
      editing && editing.prices.length > 0
        ? editing.prices.map((p) => ({ piece: p.piece, unitPrice: (p.unitPrice ?? '').replace('.', ',') }))
        : [{ piece: 'Camisa', unitPrice: '' }, { piece: 'Shorts', unitPrice: '' }]
    )
  }, [value, editing])

  const filled = prices
    .map((p) => ({ piece: p.piece.trim(), unitPrice: p.unitPrice.replace(',', '.').trim() }))
    .filter((p) => p.piece !== '' && p.unitPrice !== '')

  const save = useMutation({
    mutationFn: (status: 'active' | 'archived') => {
      const body = {
        name,
        phone: phone.trim() || null,
        kind,
        paymentTermDays: kind === 'terceirizada' ? Number(term) : null,
        notes: notes.trim() || null,
        prices: filled,
      }
      return editing
        ? updateSeamstress(editing.id, { ...body, version: editing.version, status })
        : createSeamstress(body)
    },
    onSuccess: (saved, status) => {
      toast(status === 'archived' ? `${saved.name} arquivada.` : `${saved.name} gravada.`)
      void queryClient.invalidateQueries({ queryKey: keys.seamstressesAll })
      onClose()
    },
  })

  const termOk = kind === 'clt' || (term !== '' && Number.isInteger(Number(term)) && Number(term) >= 0 && Number(term) <= 180)

  return (
    <Modal
      open={value !== null}
      wide
      title={editing ? `Editar ${editing.name}` : 'Nova costureira'}
      onClose={() => {
        save.reset()
        onClose()
      }}
      footer={
        <>
          {editing && editing.status === 'active' && (
            <Button
              variant="ghost"
              icon={<Archive className="h-4 w-4" />}
              busy={save.isPending && save.variables === 'archived'}
              onClick={() => {
                if (window.confirm(`Arquivar ${editing.name}? Ela some da lista de quem recebe costura; o histórico fica.`)) save.mutate('archived')
              }}
            >
              Arquivar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="lime"
            busy={save.isPending && save.variables === 'active'}
            disabled={name.trim() === '' || !termOk}
            onClick={() => save.mutate('active')}
          >
            {editing?.status === 'archived' ? 'Gravar e reativar' : 'Gravar'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="field" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">WhatsApp</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="field" placeholder="(11) 99999-9999" />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Como trabalha</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['terceirizada', 'Terceirizada', 'Recebe por peça. A costura entregue vira conta a pagar.'],
                ['clt', 'CLT (da empresa)', 'Funcionária. Não gera conta a pagar — o salário é da folha.'],
              ] as const
            ).map(([key, label, what]) => (
              <button
                key={key}
                type="button"
                onClick={() => setKind(key)}
                className={clsx('rounded-2xl border-2 px-3 py-2 text-left transition', kind === key ? 'border-ink bg-lime' : 'border-line hover:border-ink/30')}
              >
                <span className="block text-sm font-bold">{label}</span>
                <span className="text-[11px] text-ink/70">{what}</span>
              </button>
            ))}
          </div>
        </div>

        {kind === 'terceirizada' && (
          <div>
            <p className="mb-2 text-xs font-extrabold tracking-wide uppercase">Paga em</p>
            <div className="flex flex-wrap items-center gap-2">
              {TERMS.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setTerm(String(option.days))}
                  className={clsx('rounded-full border-2 px-3 py-1.5 text-xs font-extrabold', term === String(option.days) ? 'border-ink bg-lime' : 'border-line')}
                >
                  {option.label}
                </button>
              ))}
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                ou
                <input type="number" min={0} max={180} value={term} onChange={(e) => setTerm(e.target.value)} className="field w-20" />
                dias depois da entrega
              </label>
            </div>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-extrabold tracking-wide uppercase">Tabela dela</p>
          <p className="mb-2 text-xs text-muted">Quanto ela cobra por peça de cada tipo. Na hora de mandar a costura dá para combinar outro valor.</p>
          <datalist id="pecas-costura">
            {PIECES.map((piece) => <option key={piece} value={piece} />)}
          </datalist>
          <div className="space-y-2">
            {prices.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  list="pecas-costura"
                  value={row.piece}
                  onChange={(e) => setPrices((list) => list.map((item, i) => (i === index ? { ...item, piece: e.target.value } : item)))}
                  placeholder="Peça"
                  maxLength={40}
                  className="field flex-1"
                  aria-label="Peça"
                />
                <span className="text-xs font-semibold text-muted">R$</span>
                <input
                  inputMode="decimal"
                  value={row.unitPrice}
                  onChange={(e) => setPrices((list) => list.map((item, i) => (i === index ? { ...item, unitPrice: e.target.value } : item)))}
                  placeholder="0,00"
                  className="field w-24 text-right"
                  aria-label={`Preço por ${row.piece || 'peça'}`}
                />
                <button
                  type="button"
                  onClick={() => setPrices((list) => list.filter((_, i) => i !== index))}
                  className="rounded-full p-2 text-muted hover:bg-black/5 hover:text-red-700"
                  aria-label="Tirar da tabela"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-2" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setPrices((list) => [...list, { piece: '', unitPrice: '' }])}>
            Peça
          </Button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-extrabold tracking-wide uppercase">Observação</span>
          <textarea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className="field resize-y" />
        </label>

        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}

const JobsDialog = ({ seamstress, onClose }: { seamstress: SeamstressSummaryType | null; onClose: () => void }) => {
  const [tab, setTab] = useState<'em-andamento' | 'entregue'>('em-andamento')
  const jobs = useSeamstressJobs(seamstress?.id ?? null, tab)
  const [delivering, setDelivering] = useState<SewingJobSummaryType | null>(null)
  const owed = (jobs.data ?? [])
    .filter((job) => job.payable?.status === 'open')
    .reduce((sum, job) => sum + Number(job.total ?? '0'), 0)

  return (
    <Modal
      open={seamstress !== null}
      wide
      title={seamstress ? `Costuras de ${seamstress.name}` : ''}
      onClose={onClose}
      footer={<Button variant="ink" onClick={onClose}>Fechar</Button>}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['em-andamento', 'entregue'] as const).map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={clsx('rounded-full px-3 py-1.5 text-xs font-bold', tab === key ? 'bg-ink text-white' : 'bg-black/5')}>
            {key === 'em-andamento' ? 'Com ela agora' : 'Entregues'}
          </button>
        ))}
        {tab === 'entregue' && owed > 0 && (
          <span className="ml-auto text-xs font-bold">A pagar em aberto: {money(owed.toFixed(2))}</span>
        )}
      </div>
      {jobs.isPending && <Spinner />}
      {jobs.isError && <ErrorBox message={errorMessage(jobs.error)} />}
      {jobs.data?.length === 0 && <p className="text-sm text-muted">{tab === 'em-andamento' ? 'Nada com ela agora.' : 'Nenhuma costura entregue ainda.'}</p>}
      <div className="space-y-2">
        {jobs.data?.map((job) => <SewingJobRow key={job.id} job={job} showOrder onDeliver={setDelivering} />)}
      </div>
      <DeliverDialog job={delivering} onClose={() => setDelivering(null)} />
    </Modal>
  )
}
