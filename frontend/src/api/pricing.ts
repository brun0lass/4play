import { PriceListCollection, PriceTierList, type PriceTierSummary } from '@/contracts/aeris/pricing.ts'

import { request } from '@/lib/http'

/**
 * `/api/v1/pricing` — a lista de preço do Aeris, só para ler as faixas.
 *
 * O preço da 4Play mora na lista padrão, uma faixa por quantidade mínima em
 * cada variação (o tecido, desde a F258 do Aeris).
 */

const BASE = '/api/v1/pricing'

/** A lista padrão da conta — a que o link e a conferência usam. */
export const fetchDefaultPriceListId = async (signal?: AbortSignal): Promise<string | null> =>
  PriceListCollection.parse(await request(`${BASE}/price-lists`, { signal })).priceLists.find((list) => list.isDefault)?.id ??
  null

export const fetchVariantTiers = async (
  priceListId: string,
  variantId: string,
  signal?: AbortSignal
): Promise<PriceTierSummary[]> =>
  PriceTierList.parse(await request(`${BASE}/price-lists/${priceListId}/items/${variantId}`, { signal })).tiers
