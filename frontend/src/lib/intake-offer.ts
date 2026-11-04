export type OfferTier = {
  fabricId: string | null
  minQuantity: number
  unitPrice: string
}
export type OfferProduct = {
  fabricIds: string[] | null
  tiers: OfferTier[]
  personalizationTypeIds: string[]
}
export type OfferType = {
  id: string
  name: string
  kind: 'dados' | 'opcao'
  fields: ('nome' | 'numero')[]
  charge: 'por-peca' | 'por-pedido' | 'nenhuma'
  unitPrice: string | null
}
export type OfferRow = {
  quantity: number
  name: string | null
  number: string | null
}

export const tiersOf = (
  product: OfferProduct,
  fabricId: string | null
): OfferTier[] =>
  product.tiers
    .filter(
      (tier) =>
        tier.fabricId ===
        (product.fabricIds === null || fabricId === null ? null : fabricId)
    )
    .sort((a, b) => a.minQuantity - b.minQuantity)

export const priceAt = (
  tiers: readonly { minQuantity: number; unitPrice: string }[],
  quantity: number
): number | null => {
  let price: number | null = null
  let minimum = -1
  for (const tier of tiers)
    if (
      Math.max(quantity, 1) >= tier.minQuantity &&
      tier.minQuantity >= minimum
    ) {
      minimum = tier.minQuantity
      price = Number(tier.unitPrice)
    }
  return price
}

export const madeIn = (
  product: Pick<OfferProduct, 'fabricIds'>,
  fabricId: string | null
): boolean =>
  product.fabricIds === null ||
  fabricId === null ||
  product.fabricIds.includes(fabricId)

/**
 * A grade da tela a partir do que o cliente enviou. O envio pode ter várias
 * linhas do mesmo tamanho (três linhas "M" sem nome), e elas somam: se a última
 * ganhasse, o link reaberto perderia peças sem o cliente mexer em nada.
 */
export const quantitiesBySize = <S extends string>(
  rows: readonly { size: S; quantity: number }[]
): Partial<Record<S, string>> => {
  const totals = new Map<S, number>()
  for (const row of rows) totals.set(row.size, (totals.get(row.size) ?? 0) + row.quantity)
  return Object.fromEntries([...totals].map(([size, quantity]) => [size, String(quantity)])) as Partial<
    Record<S, string>
  >
}

/** "5 conjuntos · 3 peças": cada um só quando tem. */
export const tallyLabel = (sets: number, pieces: number): string =>
  [
    sets > 0 ? `${sets.toLocaleString('pt-BR')} ${sets === 1 ? 'conjunto' : 'conjuntos'}` : null,
    pieces > 0 || sets === 0
      ? `${pieces.toLocaleString('pt-BR')} ${pieces === 1 ? 'peça' : 'peças'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

/** Mesma regra do servidor: opção por item, dados por linha, por-pedido uma vez só. */
export const personalizationCharges = (
  types: readonly OfferType[],
  items: readonly {
    typeIds: string[]
    options: string[]
    rows: OfferRow[]
    /** Quantas peças as opções cobram; ausente, a soma das linhas (F300: os conjuntos). */
    pieces?: number
  }[]
) =>
  types
    .map((type) => {
      let quantity = 0
      for (const item of items) {
        if (!item.typeIds.includes(type.id)) continue
        quantity +=
          type.kind === 'opcao'
            ? item.options.includes(type.id)
              ? (item.pieces ?? item.rows.reduce((sum, row) => sum + row.quantity, 0))
              : 0
            : item.rows
                .filter(
                  (row) =>
                    (type.fields.includes('nome') && row.name !== null) ||
                    (type.fields.includes('numero') && row.number !== null)
                )
                .reduce((sum, row) => sum + row.quantity, 0)
      }
      if (type.charge === 'por-pedido') quantity = quantity > 0 ? 1 : 0
      return {
        type,
        value:
          type.charge === 'nenhuma'
            ? 0
            : quantity * Number(type.unitPrice ?? 0),
      }
    })
    .filter((charge) => charge.value > 0)
