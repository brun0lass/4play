/**
 * A peça que está na grade e não está nos itens do pedido (o sócio, 11/11:
 * "o cliente pediu manguito, mas nos itens do pedido não aparece, o sistema
 * não deveria acusar?").
 *
 * A grade escolhe a peça pela tabela de medidas ('Camiseta masculina',
 * 'Manguito (o par)'); o pedido vende o produto ("Conjunto camiseta e
 * shorts"). O produto diz quais tabelas ele usa (`productIds` da tabela), e é
 * por aí que um item 'cobre' uma peça da grade. O nome do próprio produto
 * também cobre — a peça sem tabela, como o manguito.
 *
 * Na dúvida, não acusa: um item que não é peça da loja nem serviço conhecido
 * (o 'Camisa dry' de antes do catálogo) pode ser qualquer coisa, e um aviso
 * errado ensina a ignorar o aviso.
 */

type Line = { readonly description: string; readonly freight?: boolean }
type Piece = { readonly id: string; readonly name: string }
type Chart = { readonly name: string; readonly productIds: readonly string[] }
type Counted = { readonly piece: string; readonly quantity: number }

/** O nome como a grade o guarda: até 40 letras (PieceSelect). */
const GRADE_NAME_LIMIT = 40

const norm = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()

/** 'Regata ou Top — 92/8' é o produto 'Regata ou Top': o tecido vem depois do travessão. */
const startsWithName = (description: string, name: string): boolean => {
  const d = norm(description)
  const n = norm(name)
  return (
    d === n ||
    d.startsWith(`${n} — `) ||
    d.startsWith(`${n} - `) ||
    d.startsWith(`${n} (`)
  )
}

const productOf = (
  description: string,
  pieces: readonly Piece[],
): Piece | null =>
  pieces
    .filter((piece) => startsWithName(description, piece.name))
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null

export type Uncovered = { readonly piece: string; readonly quantity: number }

/**
 * As peças da grade (e dos personalizados) que nenhum item do pedido tem, com
 * a quantidade. Nulo quando não dá para saber: sem item reconhecido, ou com um
 * item que não é peça nem serviço da loja.
 */
export const uncoveredPieces = (input: {
  readonly lines: readonly Line[]
  readonly pieces: readonly Piece[]
  readonly charts: readonly Chart[]
  /** Os serviços (personalização, arte…): itens que não cobrem peça nenhuma. */
  readonly services: readonly string[]
  readonly counted: readonly Counted[]
}): Uncovered[] | null => {
  const products: Piece[] = []
  for (const line of input.lines) {
    if (line.freight) continue
    const product = productOf(line.description, input.pieces)
    if (product !== null) {
      products.push(product)
      continue
    }
    if (input.services.some((name) => startsWithName(line.description, name)))
      continue
    return null
  }
  if (products.length === 0) return null

  const key = (name: string) => norm(name).slice(0, GRADE_NAME_LIMIT)
  const ids = new Set(products.map((product) => product.id))
  const covered = new Set<string>()
  for (const product of products) covered.add(key(product.name))
  for (const chart of input.charts) {
    if (chart.productIds.some((id) => ids.has(id))) covered.add(key(chart.name))
  }
  // Só acusa a peça que diz a que produto pertence: o nome de um produto, ou
  // uma tabela de medidas ligada a algum produto. O nome antigo ("Camiseta
  // babylook") e a tabela solta ("CAMISA INFANTIL MASC") não dizem.
  const productNames = new Set(input.pieces.map((piece) => key(piece.name)))
  const known = new Set([
    ...productNames,
    ...input.charts.filter((chart) => chart.productIds.length > 0).map((chart) => key(chart.name)),
  ])
  // Um item sem tabela nenhuma (a "Camisa polo") pode ser qualquer linha da
  // grade: aí só se acusa o que tem o nome de um produto (o manguito).
  const chartless = products.some((product) => !input.charts.some((chart) => chart.productIds.includes(product.id)))

  const missing = new Map<string, Uncovered>()
  for (const entry of input.counted) {
    const name = entry.piece.trim()
    if (name === '' || entry.quantity <= 0) continue
    const k = key(name)
    if (covered.has(k) || !known.has(k)) continue
    if (chartless && !productNames.has(k)) continue
    const before = missing.get(k)
    missing.set(k, {
      piece: before?.piece ?? name,
      quantity: (before?.quantity ?? 0) + entry.quantity,
    })
  }
  return [...missing.values()]
}

type Offer = {
  readonly id: string
  readonly name: string
  readonly parts: readonly unknown[]
  readonly fabrics: readonly {
    readonly fabricId: string
    readonly tiers: readonly { readonly minQuantity: number; readonly unitPrice: string }[]
  }[]
}

type Tier = { readonly minQuantity: number; readonly unitPrice: string }

/** Um produto que cobre a peça que falta — uma escolha do modal. */
export type PieceOption = {
  readonly productId: string
  readonly name: string
  /** Conjunto ou kit: a grade conta peças, a quantidade é escolha da pessoa. */
  readonly kit: boolean
  /** As faixas de preço no tecido do pedido; nulo se o produto não tem preço nele (ou o pedido não tem tecido). */
  readonly tiers: readonly Tier[] | null
}

/** Uma peça da grade fora dos itens, com os produtos que a cobrem. */
export type MissingGroup = {
  readonly piece: string
  readonly quantity: number
  /** A peça sozinha primeiro ("Regata ou Top"), os conjuntos depois. */
  readonly options: readonly PieceOption[]
}

/**
 * O que o modal oferece para cada peça que está na grade e não nos itens (o
 * sócio, 11/11): os produtos da loja que a cobrem. "Manguito (o par)" tem um
 * só; "Regata masculina machão" está na Regata ou Top, no conjunto e nos kits,
 * e a pessoa escolhe. Quem confere a quantidade e cobra é o Aeris (F422).
 */
export const missingOptions = (input: {
  readonly missing: readonly Uncovered[]
  readonly pieces: readonly Offer[]
  readonly charts: readonly Chart[]
  readonly fabricId: string | null
}): MissingGroup[] => {
  const key = (name: string) => norm(name).slice(0, GRADE_NAME_LIMIT)
  const coverOf = (piece: Offer) =>
    new Set([
      key(piece.name),
      ...input.charts.filter((chart) => chart.productIds.includes(piece.id)).map((chart) => key(chart.name)),
    ])
  const covers = new Map(input.pieces.map((piece) => [piece.id, coverOf(piece)]))
  const tiersOf = (piece: Offer): Tier[] | null => {
    if (input.fabricId === null) return null
    const fabric = piece.fabrics.find((entry) => entry.fabricId === input.fabricId)
    return fabric && fabric.tiers.length > 0 ? [...fabric.tiers].sort((a, b) => a.minQuantity - b.minQuantity) : null
  }

  return input.missing.map((entry) => ({
    piece: entry.piece,
    quantity: entry.quantity,
    options: input.pieces
      .filter((piece) => covers.get(piece.id)?.has(key(entry.piece)))
      .map((piece) => ({ productId: piece.id, name: piece.name, kit: piece.parts.length > 1, tiers: tiersOf(piece) }))
      .sort((a, b) => Number(a.kit) - Number(b.kit) || a.name.localeCompare(b.name, 'pt-BR')),
  }))
}

/** O preço da faixa para essa quantidade; nulo sem faixa. */
export const tierPrice = (tiers: readonly Tier[] | null, quantity: number): string | null =>
  tiers?.filter((tier) => tier.minQuantity <= Math.max(quantity, 1)).at(-1)?.unitPrice ?? null
