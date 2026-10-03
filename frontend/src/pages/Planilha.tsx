import { clsx } from 'clsx'
import { Columns3, Printer } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { useStageMover } from '@/components/StageMover'
import { Button, ErrorBox, Modal, Spinner } from '@/components/ui'
import { useAccess } from '@/lib/access'
import { money } from '@/lib/format'
import { linesText } from '@/lib/order-lines'
import { useQueue } from '@/lib/queries'
import {
  FABRIC_LABELS,
  STAGES,
  STAGE_META,
  logisticsText,
  type Order,
  type Stage,
} from '@/lib/uniforms'
import { errorMessage } from '@/lib/http'

/**
 * A FILA DE PRODUÇÃO como a planilha da 4Play: as mesmas colunas, na mesma
 * ordem e com os mesmos nomes — só que alimentada pelo que o atendimento, a
 * arte e a produção lançam no sistema. Na tela vão todas as colunas; na
 * impressão, só as escolhidas (o padrão é a folha que a fábrica imprime).
 */

type Col = {
  key: string
  label: ReactNode
  print: boolean
  /** Coluna de dinheiro: só para quem vê valores. */
  money?: boolean
  className?: string
  cell: (o: Order, dados: string) => ReactNode
}

const SIM = <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">SIM</span>
const NAO = <span className="text-[11px] font-bold text-ink/60">NÃO</span>
const OK = <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">OK</span>
const VAZIO = <span className="text-ink/30">—</span>

const DESIGNER_TONES = ['bg-pink-100 text-pink-800', 'bg-violet-100 text-violet-800', 'bg-sky-100 text-sky-800', 'bg-amber-100 text-amber-800']
const tone = (name: string) => DESIGNER_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % DESIGNER_TONES.length]

const STAGE_TONE: Record<Stage, string> = {
  arte: 'bg-zinc-200 text-zinc-800',
  'iniciar-impressao': 'bg-red-100 text-red-800',
  imprimindo: 'bg-[#3b2f1e] text-amber-200',
  impresso: 'bg-sky-100 text-sky-800',
  cortando: 'bg-zinc-100 text-zinc-700',
  costurando: 'bg-emerald-100 text-emerald-800',
  embalando: 'bg-cyan-100 text-cyan-800',
  pronto: 'bg-lime text-ink',
}

const fullDate = (day: string | null) => {
  if (!day) return '—'
  const [y, m, d] = day.split('-')
  return `${String(Number(d))}/${String(Number(m))}/${y ?? ''}`
}

const COLUMNS: Col[] = [
  { key: 'pedido', label: 'PEDIDO', print: true, cell: (o) => <span className="font-extrabold">{o.number ?? 'RASC.'}</span> },
  { key: 'cliente', label: 'CLIENTE', print: true, className: 'min-w-36', cell: (o) => <span className="font-bold uppercase">{o.customerName}</span> },
  { key: 'cidade', label: 'CIDADE', print: true, cell: (o) => <span className="uppercase">{o.customerCity ?? '—'}</span> },
  {
    key: 'designer',
    label: 'DESIGNER',
    print: true,
    cell: (o) => (o.designerName ? <span className={clsx('rounded px-2 py-0.5 text-[11px] font-bold uppercase', tone(o.designerName))}>{o.designerName.split(' ')[0]}</span> : VAZIO),
  },
  {
    key: 'despacho',
    label: <>DATA DE<br />DESPACHO</>,
    print: true,
    className: 'bg-sky-100/60 print:bg-transparent',
    cell: (o) => <span className={clsx('text-base font-extrabold whitespace-nowrap', o.late && 'text-red-600')}>{fullDate(o.dispatchDate)}</span>,
  },
  { key: 'tecido', label: 'TIPO TECIDO', print: true, cell: (o) => (o.fabric ? <span className="uppercase">{FABRIC_LABELS[o.fabric]}</span> : <span className="rounded bg-ink px-2 text-white">?</span>) },
  { key: 'personalizacao', label: <>PERSONA<br />LIZAÇÃO</>, print: true, cell: (o) => (o.personalized ? SIM : NAO) },
  { key: 'qtde', label: 'QTDE.', print: true, cell: (o) => <span className="font-bold">{o.pieces}</span> },
  { key: 'dados', label: 'DADOS DO PEDIDO', print: true, className: 'min-w-72 max-w-md', cell: (_, dados) => <span className="text-[11px] uppercase">{dados || VAZIO}</span> },
  { key: 'valor', label: <>VALOR<br />FECHADO</>, print: false, money: true, cell: (o) => <span className="whitespace-nowrap">{money(o.totalAmount)}</span> },
  {
    key: 'sinal',
    label: <>SINAL<br />PAGO?</>,
    print: false,
    money: true,
    cell: (o) => {
      const paid = Number(o.paidAmount)
      if (o.paymentMark === 'cortesia') return <span className="rounded bg-violet-200 px-1.5 text-[10px] font-extrabold text-violet-900">MKT</span>
      if (o.paymentMark === 'total' || (paid > 0 && paid >= Number(o.totalAmount))) return <span className="rounded bg-sky-600 px-1.5 text-[10px] font-extrabold text-white">100%</span>
      if (o.paymentMark === 'sinal' || paid > 0) return <span className="rounded bg-emerald-600 px-1.5 text-[10px] font-extrabold text-white">SIM</span>
      return <span className="rounded bg-orange-400 px-1.5 text-[10px] font-extrabold text-white">NÃO</span>
    },
  },
  { key: 'tkt', label: <>TKT MÉDIO/<br />PEÇA</>, print: false, money: true, cell: (o) => <span className="whitespace-nowrap">{money(o.ticketPerPiece)}</span> },
  { key: 'resp', label: 'RESP.', print: false, cell: (o) => <span className="uppercase">{o.salespersonName?.split(' ')[0] ?? '—'}</span> },
  { key: 'impres', label: 'IMPRES.', print: false, cell: (o) => (o.printers.length ? <span className="uppercase">{o.printers.map((p) => p.name).join(', ')}</span> : VAZIO) },
  { key: 'arte', label: <>ARTE<br />DRIVE</>, print: false, cell: (o) => (o.artReady ? OK : VAZIO) },
  { key: 'corel', label: 'COREL', print: false, cell: (o) => (o.productionFileReady ? OK : VAZIO) },
  { key: 'grade', label: <>EXCEL<br />(GRADE)</>, print: false, cell: (o) => (o.gradeChecked ? OK : <span className="rounded bg-orange-200 px-1.5 text-[10px] font-bold text-orange-900">FALTA</span>) },
  { key: 'logistica', label: 'LOGÍSTICA', print: false, cell: (o) => <span className="uppercase">{logisticsText(o.logistics)}</span> },
  {
    key: 'obs',
    label: 'OBSERVAÇÕES',
    print: false,
    className: 'min-w-32',
    cell: (o) => <span className="text-[11px]">{[o.eventNote && `${o.eventNote}${o.eventDate ? ` ${fullDate(o.eventDate)}` : ''}`, o.notes].filter(Boolean).join(' · ') || ''}</span>,
  },
]

const PRINT_KEY = '4play.planilha.impressao'
const readPrint = (): string[] => {
  try {
    const raw = localStorage.getItem(PRINT_KEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    /* sem armazenamento */
  }
  return [...COLUMNS.filter((c) => c.print).map((c) => c.key), 'status']
}

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const monthOptions = () => {
  const now = new Date()
  return [-1, 0, 1, 2].map((offset) => {
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
    const iso = (d: Date) => `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { value: iso(first), from: iso(first), to: iso(last), label: `${MONTHS[first.getMonth()] ?? ''}/${String(first.getFullYear()).slice(2)}` }
  })
}

export const Planilha = () => {
  const navigate = useNavigate()
  const months = useMemo(monthOptions, [])
  const [month, setMonth] = useState('')
  const [printCols, setPrintCols] = useState<string[]>(readPrint)
  const [choosing, setChoosing] = useState(false)
  const mover = useStageMover()
  const { seeMoney } = useAccess()
  const columns = COLUMNS.filter((c) => seeMoney || !c.money)
  const range = months.find((m) => m.value === month)

  const queue = useQueue({
    pageSize: 500,
    sort: 'dispatchDate',
    direction: 'asc',
    dispatchFrom: range?.from,
    dispatchTo: range?.to,
  })
  // Os itens vêm na própria fila (F220): uma chamada só, e sem preço para
  // quem não vê dinheiro.
  const items = queue.data?.items ?? []

  const togglePrint = (key: string) => {
    const next = printCols.includes(key) ? printCols.filter((k) => k !== key) : [...printCols, key]
    setPrintCols(next)
    try {
      localStorage.setItem(PRINT_KEY, JSON.stringify(next))
    } catch {
      /* sem armazenamento */
    }
  }
  const hidePrint = (key: string) => (printCols.includes(key) ? '' : 'print:hidden')

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <select className="field w-auto" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês de despacho">
          <option value="">Todos os pedidos em aberto</option>
          {months.map((m) => <option key={m.value} value={m.value}>Despacho em {m.label}</option>)}
        </select>
        <Button variant="outline" icon={<Columns3 className="h-4 w-4" />} onClick={() => setChoosing(true)}>
          Colunas da impressão ({printCols.length})
        </Button>
        <Button variant="ink" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          Imprimir
        </Button>
        {mover.lastError && <span className="text-xs font-bold text-red-600">{mover.lastError}</span>}
      </div>

      {queue.isPending && <Spinner />}
      {queue.isError && <ErrorBox message={errorMessage(queue.error)} onRetry={() => void queue.refetch()} />}

      {queue.data && (
        <div className="planilha card overflow-hidden print:rounded-none print:border-0">
          {/* Cabeçalho da folha, como o da planilha */}
          <div className="flex items-stretch border-b-2 border-ink">
            <div className="flex items-center gap-2 border-r-2 border-ink bg-lime px-4 py-2">
              <span className="text-3xl font-black text-red-600">{queue.data.total}</span>
              <span className="text-[10px] leading-tight font-extrabold">QTDE DE<br />PEDIDOS</span>
            </div>
            <h2 className="flex flex-1 items-center px-4 text-xl font-black tracking-tight uppercase sm:text-2xl">
              Fila de produção - 4 Play{range ? ` - ${range.label}` : ''}
            </h2>
          </div>
          <div className="scroll-thin overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-paper text-[10px] font-extrabold tracking-wide print:bg-transparent">
                  {columns.map((c) => (
                    <th key={c.key} className={clsx('border border-line px-2 py-1.5 text-center align-middle', hidePrint(c.key))}>{c.label}</th>
                  ))}
                  <th className={clsx('border border-line px-2 py-1.5 text-center', hidePrint('status'))}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id} onClick={() => void navigate(`/pedidos/${o.id}`)} className={clsx('cursor-pointer hover:bg-lime-50 print:break-inside-avoid', o.late && 'bg-red-50/50')}>
                    {columns.map((c) => (
                      <td key={c.key} className={clsx('border border-line px-2 py-1 text-center align-middle', c.className, hidePrint(c.key))}>
                        {c.cell(o, linesText(o.lines, seeMoney))}
                      </td>
                    ))}
                    <td className={clsx('border border-line px-1 py-1 text-center', hidePrint('status'))} onClick={(e) => e.stopPropagation()}>
                      <select
                        aria-label={`Etapa do pedido ${String(o.number ?? '')}`}
                        value={o.stage}
                        onChange={(e) => mover.requestMove(o, e.target.value as Stage)}
                        className={clsx('w-full cursor-pointer appearance-none rounded px-1.5 py-1 text-center text-[10px] font-extrabold uppercase print:bg-transparent print:text-ink', STAGE_TONE[o.stage])}
                      >
                        {STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={columns.length + 1} className="p-8 text-center text-sm text-muted">Nenhum pedido neste filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mover.dialog}

      <Modal open={choosing} title="Colunas da impressão" onClose={() => setChoosing(false)} footer={<Button variant="ink" onClick={() => setChoosing(false)}>Fechar</Button>}>
        <p className="mb-3 text-sm text-muted">Na tela aparecem todas. Marque as que vão para o papel — fica lembrado neste navegador.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[...columns.map((c) => ({ key: c.key, label: c.label })), { key: 'status', label: 'STATUS' }].map((c) => (
            <label key={c.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold hover:bg-paper">
              <input type="checkbox" className="h-4 w-4 accent-ink" checked={printCols.includes(c.key)} onChange={() => togglePrint(c.key)} />
              <span className="[&_br]:hidden">{c.label}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}
