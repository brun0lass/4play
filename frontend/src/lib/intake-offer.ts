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
  product.tiers.filter(
    (tier) =>
      tier.fabricId ===
      (product.fabricIds === null || fabricId === null ? null : fabricId)
  )

export const priceAt = (
  tiers: readonly { minQuantity: number; unitPrice: string }[],
  quantity: number
): number | null => {
  let price: number | null = null
  for (const tier of tiers)
    if (Math.max(quantity, 1) >= tier.minQuantity)
      price = Number(tier.unitPrice)
  return price
}

export const madeIn = (
  product: Pick<OfferProduct, 'fabricIds'>,
  fabricId: string | null
): boolean =>
  product.fabricIds === null ||
  fabricId === null ||
  product.fabricIds.includes(fabricId)

/** Mesma regra do servidor: opção por item, dados por linha, por-pedido uma vez só. */
export const personalizationCharges = (
  types: readonly OfferType[],
  items: readonly { typeIds: string[]; options: string[]; rows: OfferRow[] }[]
) =>
  types
    .map((type) => {
      let quantity = 0
      for (const item of items) {
        if (!item.typeIds.includes(type.id)) continue
        quantity +=
          type.kind === 'opcao'
            ? item.options.includes(type.id)
              ? item.rows.reduce((sum, row) => sum + row.quantity, 0)
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
