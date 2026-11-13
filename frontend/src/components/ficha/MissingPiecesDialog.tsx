import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { addGradePiece } from '@/api/uniforms'
import { useToast } from '@/components/Toast'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { int, money } from '@/lib/format'
import { tierPrice, type MissingGroup, type PieceOption } from '@/lib/grade-coverage'
import { errorMessage } from '@/lib/http'
import { keys } from '@/lib/queries'

/**
 * A peça que está na grade e não nos itens do pedido, num modal (o Bruno,
 * 13/11: "ao invés do aviso, um modal alertando, com um botão que adicione
 * nos itens mais fácil").
 *
 * Uma escolha por peça: os produtos da loja que a cobrem (a peça sozinha
 * primeiro, o conjunto depois), a quantidade (a da grade, que dá para mudar) e
 * o preço da tabela no tecido do pedido. O Aeris confere a quantidade com a
 * grade e cobra o preço da tabela (F422).
 */
export const MissingPiecesDialog = ({
  open,
  onClose,
  orderId,
  groups,
}: {
  open: boolean
  onClose: () => void
  orderId: string
  groups: readonly MissingGroup[]
}) => (
  <Modal
    open={open}
    wide
    title="Peça na grade que não está no pedido"
    onClose={onClose}
    footer={
      <Button variant="ghost" onClick={onClose}>
        Agora não
      </Button>
    }
  >
    <div className="space-y-4">
      <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          A grade tem {groups.length === 1 ? 'uma peça' : `${int(groups.length)} peças`} que nenhum item do pedido cobra. Se
          o cliente pediu, ponha no pedido para cobrar; se não pediu, tire da grade.
        </span>
      </p>
      {groups.map((group) => (
        <GroupCard key={group.piece} orderId={orderId} group={group} />
      ))}
    </div>
  </Modal>
)

const preselect = (options: readonly PieceOption[]): string => {
  const alone = options.filter((option) => !option.kit && option.tiers !== null)
  if (alone.length === 1) return alone[0]?.productId ?? ''
  return options.length === 1 ? (options[0]?.productId ?? '') : ''
}

const GroupCard = ({ orderId, group }: { orderId: string; group: MissingGroup }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [chosen, setChosen] = useState(() => preselect(group.options))
  const [quantity, setQuantity] = useState(String(group.quantity))

  // A grade mudou (outra quantidade, outros produtos): a escolha recomeça.
  const signature = `${String(group.quantity)}|${group.options.map((entry) => entry.productId).join(',')}`
  useEffect(() => {
    setChosen(preselect(group.options))
    setQuantity(String(group.quantity))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const option = group.options.find((entry) => entry.productId === chosen)
  const amount = Number(quantity)
  const validAmount = Number.isSafeInteger(amount) && amount >= 1 && amount <= group.quantity
  const price = option ? tierPrice(option.tiers, amount) : null

  const add = useMutation({
    mutationFn: () => addGradePiece(orderId, { productId: chosen, quantity: amount }),
    onSuccess: (added) => {
      toast(`${int(added.quantity)} ${added.description} no pedido, a ${money(added.unitPrice)} cada.`)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.order(orderId) })
      void queryClient.invalidateQueries({ queryKey: keys.queueAll })
      void queryClient.invalidateQueries({ queryKey: ['sales-document', orderId] })
    },
  })

  return (
    <section className="rounded-2xl border border-line p-4">
      <p className="text-sm">
        <strong className="text-base">{group.piece}</strong>{' '}
        <span className="text-muted">— {int(group.quantity)} na grade</span>
      </p>

      {group.options.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nenhum produto da loja tem esta peça. Acrescente pelo <em>Editar itens</em> (aba Atendimento) ou cadastre a peça no
          produto em Produtos.
        </p>
      ) : (
        <>
          <p className="label mt-3">Qual produto o cliente pediu?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.options.map((entry) => {
              const each = tierPrice(entry.tiers, validAmount ? amount : group.quantity)
              return (
                <button
                  key={entry.productId}
                  type="button"
                  disabled={entry.tiers === null}
                  onClick={() => setChosen(entry.productId)}
                  className={clsx(
                    'rounded-2xl border-2 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                    chosen === entry.productId ? 'border-ink bg-lime' : 'border-line hover:border-ink/30'
                  )}
                >
                  <span className="block text-sm font-extrabold">{entry.name}</span>
                  <span className="block text-[11px] text-ink/70">
                    {entry.tiers === null
                      ? 'Sem preço no tecido deste pedido'
                      : `${money(each)} cada${entry.kit ? ' · conjunto' : ''}`}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor={`missing-${group.piece}`}>
                {option?.kit ? 'Quantos conjuntos' : 'Quantas'}
              </label>
              <input
                id={`missing-${group.piece}`}
                inputMode="numeric"
                className={clsx('field w-24 text-center font-bold', !validAmount && 'border-red-400')}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <Button
              variant="lime"
              icon={<Plus className="h-4 w-4" />}
              disabled={!option || !validAmount || option.tiers === null}
              busy={add.isPending}
              onClick={() => add.mutate()}
            >
              Pôr no pedido{option && validAmount && price !== null ? ` — ${int(amount)} × ${money(price)}` : ''}
            </Button>
          </div>
          {!validAmount && (
            <p className="mt-1 text-xs font-bold text-red-600">De 1 a {int(group.quantity)}: é o que a grade tem fora dos itens.</p>
          )}
          {option?.kit && validAmount && (
            <p className="mt-1 text-[11px] text-muted">A grade conta peças, não conjuntos: confira quantos conjuntos são.</p>
          )}
          {add.isError && (
            <div className="mt-2">
              <ErrorBox message={errorMessage(add.error)} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
