import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { Logo } from '@/components/Logo'
import { Button, ErrorBox, Spinner } from '@/components/ui'
import type { GradeEntryType } from '@/contracts/aeris/uniforms.ts'
import { errorMessage } from '@/lib/http'
import { useAuth } from '@/auth/AuthProvider'
import { useSalesDocument } from '@/lib/order-lines'
import { useOrder } from '@/lib/queries'
import { ADULT_SIZES, SIZES, type Size } from '@/lib/uniforms'

/**
 * A ficha do pedido para imprimir ou mandar ao cliente — o "PEDIDO - 3226"
 * da 4Play: cabeçalho, logística marcada, a grade por modelo (com linhas em
 * branco para o cliente preencher), os personalizados e as imagens da arte.
 */

const fullDate = (day: string | null) => {
  if (!day) return ''
  const [y, m, d] = day.slice(0, 10).split('-')
  return `${String(Number(d))}/${String(Number(m))}/${y ?? ''}`
}

type Block = {
  name: string
  rows: { piece: string; q: Partial<Record<Size, number>> }[]
  sizes: Size[]
}

const blocksOf = (grade: readonly GradeEntryType[]): Block[] => {
  const byBlock = new Map<
    string,
    Map<number, { piece: string; q: Partial<Record<Size, number>> }>
  >()
  for (const e of [...grade].sort((a, b) => a.position - b.position)) {
    const rows = byBlock.get(e.block) ?? new Map()
    const row = rows.get(e.position) ?? { piece: e.piece, q: {} }
    row.q[e.size] = e.quantity
    rows.set(e.position, row)
    byBlock.set(e.block, rows)
  }
  return [...byBlock.entries()].map(([name, rows]) => {
    const used = new Set(
      [...rows.values()].flatMap((r) => Object.keys(r.q) as Size[])
    )
    return {
      name,
      rows: [...rows.values()],
      sizes: SIZES.filter((s) => ADULT_SIZES.includes(s) || used.has(s)),
    }
  })
}

const Cell = ({
  label,
  value,
  wide,
}: {
  label: string
  value: string
  wide?: boolean
}) => (
  <>
    <th className="border border-ink bg-white px-2 py-1 text-left text-[11px] font-extrabold whitespace-nowrap uppercase">
      {label}:
    </th>
    <td
      className={`border border-ink px-2 py-1 text-center text-xs uppercase ${wide ? 'min-w-48' : 'min-w-24'}`}
    >
      {value}
    </td>
  </>
)

const GradeTable = ({
  block,
  blankRows,
}: {
  block: Block
  blankRows: number
}) => {
  const total = (q: Partial<Record<Size, number>>) =>
    Object.values(q).reduce((a, b) => a + (b ?? 0), 0)
  return (
    <table className="mb-4 border-collapse text-xs">
      <thead>
        <tr>
          <th className="w-28" />
          <th
            colSpan={block.sizes.length + 1}
            className="border border-ink bg-sky-200 py-1.5 text-sm font-extrabold"
          >
            {block.name || 'Modelo'}
          </th>
        </tr>
        <tr>
          <th />
          {block.sizes.map((s) => (
            <th
              key={s}
              className="w-10 border border-ink bg-sky-50 py-1 font-extrabold"
            >
              {s}
            </th>
          ))}
          <th className="w-12 border border-ink bg-yellow-300 py-1 font-extrabold">
            TOTAL
          </th>
        </tr>
      </thead>
      <tbody>
        {block.rows.map((row, i) => (
          <tr key={i}>
            <td className="border border-ink px-2 py-1 text-left">
              {row.piece}
            </td>
            {block.sizes.map((s) => (
              <td
                key={s}
                className="border border-ink py-1 text-center font-bold"
              >
                {row.q[s] ?? ''}
              </td>
            ))}
            <td className="border border-ink py-1 text-center font-extrabold">
              {total(row.q)}
            </td>
          </tr>
        ))}
        {Array.from({ length: blankRows }, (_, i) => (
          <tr key={`b${String(i)}`}>
            <td className="h-6 border border-ink" />
            {block.sizes.map((s) => (
              <td key={s} className="border border-ink" />
            ))}
            <td className="border border-ink" />
          </tr>
        ))}
        <tr>
          <td colSpan={block.sizes.length + 1} />
          <td className="border border-ink py-1 text-center font-extrabold">
            {block.rows.reduce((a, r) => a + total(r.q), 0)}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export const FichaImpressaoPage = () => {
  const { id = '' } = useParams()
  const detail = useOrder(id)
  const { can } = useAuth()
  // O endereço vem do pedido de vendas, que o designer e o operador não leem
  // (F220): para eles fica a cidade.
  const doc = useSalesDocument(can('sales.read') ? id : undefined)

  if (detail.isPending) return <Spinner label="Montando a ficha…" />
  if (detail.isError)
    return (
      <div className="p-8">
        <ErrorBox message={errorMessage(detail.error)} />
      </div>
    )

  const { order, grade, personalization, attachments } = detail.data
  const blocks = blocksOf(grade)
  const address = doc.data?.customerContact?.address ?? order.customerCity ?? ''
  const mark = (on: boolean) => (on ? 'X' : '')

  return (
    <div className="min-h-full bg-white p-6 text-ink print:p-0">
      <div className="no-print mb-6 flex items-center justify-between">
        <Link
          to={`/pedidos/${id}`}
          className="inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para a ficha
        </Link>
        <Button
          variant="lime"
          icon={<Printer className="h-4 w-4" />}
          onClick={() => window.print()}
        >
          Imprimir / salvar PDF
        </Button>
      </div>

      <div className="mx-auto max-w-[1100px]">
        <h1 className="mb-2 text-center text-2xl font-black">
          PEDIDO - {order.number ?? 'RASCUNHO'}
        </h1>

        <div className="flex items-start gap-4">
          <div className="rounded bg-ink px-3 py-2">
            <Logo className="h-8" />
          </div>
          <table className="border-collapse">
            <tbody>
              <tr>
                <Cell label="Cliente" value={order.customerName} wide />
                <Cell label="Designer" value={order.designerName ?? ''} />
                <Cell label="Entrega" value={fullDate(order.dispatchDate)} />
                <Cell
                  label="Evento?"
                  value={
                    order.eventDate
                      ? `Sim — ${fullDate(order.eventDate)}`
                      : 'Não'
                  }
                />
              </tr>
              <tr>
                <Cell label="Endereço" value={address} wide />
                <Cell label="Responsável" value={order.salespersonName ?? ''} />
                <Cell label="Qtd peças" value={String(order.pieces)} />
                <Cell
                  label="Tecido"
                  value={order.fabricName ? order.fabricName : 'A definir'}
                />
              </tr>
            </tbody>
          </table>
          <table className="ml-auto border-collapse text-xs">
            <tbody>
              <tr>
                <th
                  colSpan={2}
                  className="border border-ink py-1 font-extrabold"
                >
                  LOGÍSTICA
                </th>
              </tr>
              {(
                [
                  ['correios', 'CORREIOS'],
                  ['van', 'VAN'],
                  ['uber', 'UBER'],
                  ['retirada', 'RETIRAR NA 4PLAY'],
                ] as const
              ).map(([key, label]) => (
                <tr key={key}>
                  <td className="border border-ink px-3 py-0.5 text-center">
                    {label}
                  </td>
                  <td className="w-10 border border-ink text-center font-extrabold">
                    {mark(order.logistics.includes(key))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-center text-sm font-bold text-red-600">
          Prezado cliente, gentileza preencher abaixo os tamanhos desejados para
          cada modelo específico!
        </p>
        <p className="mb-5 text-center text-[11px] font-semibold text-red-600">
          Note que a entrega será feita conforme o preenchimento realizado,
          futuras alterações não serão de responsabilidade da 4Play Uniformes.
        </p>

        <div className="flex flex-wrap items-start gap-6">
          <div>
            {/*
              Grade vazia: a tabela em branco é para o cliente preencher à mão.
              Com os personalizados já preenchidos, ela só ocupa a folha.
            */}
            {blocks.length === 0 ? (
              personalization.length > 0 ? null : (
              <GradeTable
                block={{ name: 'Modelo', rows: [], sizes: [...ADULT_SIZES] }}
                blankRows={6}
              />
              )
            ) : (
              blocks.map((b) => (
                <GradeTable
                  key={b.name}
                  block={b}
                  blankRows={order.gradeChecked ? 0 : 2}
                />
              ))
            )}

            {(order.personalized || personalization.length > 0) && (
              <table className="mb-4 border-collapse text-xs">
                <thead>
                  <tr>
                    <th
                      colSpan={5}
                      className="border border-ink bg-red-200 py-1.5 text-sm font-extrabold"
                    >
                      Personalizados (nome e número)
                    </th>
                  </tr>
                  <tr className="bg-red-50">
                    {['NOME', 'NÚMERO', 'PEÇA', 'TAMANHO', 'QTD'].map((h) => (
                      <th
                        key={h}
                        className="border border-ink px-3 py-1 font-extrabold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {personalization.map((p, i) => (
                    <tr key={i}>
                      <td className="min-w-40 border border-ink px-2 py-1 font-bold uppercase">
                        {p.name}
                      </td>
                      <td className="border border-ink px-2 py-1 text-center font-extrabold">
                        {p.number}
                      </td>
                      <td className="border border-ink px-2 py-1">{p.piece}</td>
                      <td className="border border-ink px-2 py-1 text-center">
                        {p.size}
                      </td>
                      <td className="border border-ink px-2 py-1 text-center">
                        {p.quantity}
                      </td>
                    </tr>
                  ))}
                  {Array.from(
                    { length: personalization.length === 0 ? 6 : 0 },
                    (_, i) => (
                      <tr key={`b${String(i)}`}>
                        {[0, 1, 2, 3, 4].map((c) => (
                          <td key={c} className="h-6 border border-ink" />
                        ))}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>

          {attachments.length > 0 && (
            <div className="flex max-w-[480px] flex-1 flex-wrap items-start gap-3">
              {attachments.slice(0, 4).map((a) => (
                <img
                  key={a.id}
                  src={a.url}
                  alt={a.caption ?? 'Imagem do pedido'}
                  className="max-h-64 max-w-[230px] rounded border border-line object-contain"
                />
              ))}
            </div>
          )}
        </div>

        <table className="mt-2 w-full max-w-[560px] border-collapse text-xs">
          <tbody>
            <tr>
              <th className="w-32 border border-ink px-2 py-2 text-left font-extrabold">
                OBSERVAÇÕES
              </th>
              <td className="border border-ink px-2 py-2 whitespace-pre-wrap">
                {order.notes ?? ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
