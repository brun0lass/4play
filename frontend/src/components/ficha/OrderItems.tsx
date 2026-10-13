import { ClipboardList } from 'lucide-react'

import { Section } from '@/components/ficha/Section'
import type { ProductionOrderResponseType } from '@/contracts/aeris/uniforms.ts'
import { int, money } from '@/lib/format'

type Order = ProductionOrderResponseType['order']

const qty = (value: string) => Number(value)

/**
 * O que o cliente pediu, à vista na aba da grade: é dele que se monta a grade
 * e os personalizados. Os itens vêm do pedido de vendas (F220); o preço só
 * para quem vê dinheiro.
 *
 * O total da grade não é comparado "peça a peça" com o do pedido: um conjunto
 * é um item no pedido e duas linhas na grade (camisa e shorts).
 */
export const OrderItems = ({
  order,
  gradePieces,
  personalizedPieces,
}: {
  order: Order
  gradePieces: number
  personalizedPieces: number
}) => {
  const ordered = order.lines.reduce((sum, line) => sum + qty(line.quantity), 0)
  return (
    <Section
      title="Itens do pedido"
      icon={<ClipboardList className="h-3.5 w-3.5" />}
      collapsible={{ key: 'itens-do-pedido', defaultOpen: true }}
      aside={<span className="rounded-full bg-black/5 px-3 py-1 text-xs font-extrabold">{int(ordered)} no pedido</span>}
    >
      {order.lines.length === 0 ? (
        <p className="text-sm text-muted">O pedido não tem itens.</p>
      ) : (
        <ul className="divide-y divide-line">
          {order.lines.map((line, index) => (
            <li key={index} className="flex items-baseline gap-3 py-2 text-sm">
              <span className="w-12 shrink-0 text-right text-base font-extrabold">{int(qty(line.quantity))}</span>
              <span className="flex-1 font-semibold">{line.description}</span>
              {line.unitPrice !== null && (
                <span className="text-xs whitespace-nowrap text-muted">{money(line.unitPrice)} cada</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-xs font-semibold text-ink/80">
        Na grade: <strong>{int(gradePieces)}</strong> · Personalizados: <strong>{int(personalizedPieces)}</strong> · Total
        montado: <strong>{int(gradePieces + personalizedPieces)}</strong>
        <span className="mt-0.5 block text-[11px] font-normal text-muted">
          Conjunto conta como um item no pedido e como duas peças na grade (camisa e shorts).
        </span>
      </p>
    </Section>
  )
}
