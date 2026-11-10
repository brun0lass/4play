/**
 * O que o cliente mudou quando editou o pedido pelo link reaberto: a
 * conferência mostra só a diferença entre o envio de antes e o de agora.
 */

type Row = {
  size: string
  quantity: number
  name: string | null
  number: string | null
}
type Item = {
  productId: string
  productName: string
  rows: Row[]
  color: string | null
  /** O conjunto, com a cor de cada linha (10/11); ausente no envio de antes. */
  kit: {
    people: {
      quantity: number
      pieces: { piece: string; size: string; name: string | null; number: string | null; color?: string | null }[]
    }[]
    counts: { piece: string; size: string; quantity: number; color?: string | null }[]
  } | null
  options: { id: string; name: string }[]
}
export type IntakeSent = {
  items: Item[]
  notes: string | null
  event: { date: string; name: string | null } | null
  fabricName: string | null
  fabricFinish: string | null
}

export type IntakeChange = { title: string; lines: string[] }

const mark = (entry: { name: string | null; number: string | null }) =>
  [entry.name, entry.number].filter(Boolean).join(' ')

/** "Camiseta masculina (Preto) M": a cor entra no nome da linha, e trocar a cor aparece. */
const pieceOf = (entry: { piece: string; size: string; color?: string | null }) =>
  `${entry.piece}${entry.color ? ` (${entry.color})` : ''} ${entry.size}`

/** Cada coisa pedida na peça, como texto, com a quantidade. */
const entriesOf = (item: Item): Map<string, number> => {
  const entries = new Map<string, number>()
  const add = (label: string, quantity: number) =>
    entries.set(label, (entries.get(label) ?? 0) + quantity)
  for (const row of item.rows)
    add(mark(row) ? `${row.size} · ${mark(row)}` : `${row.size} sem nome`, row.quantity)
  for (const person of item.kit?.people ?? [])
    add(
      person.pieces
        .map((piece) => `${pieceOf(piece)}${mark(piece) ? ` · ${mark(piece)}` : ''}`)
        .join(' + '),
      person.quantity
    )
  for (const count of item.kit?.counts ?? [])
    add(`${pieceOf(count)} sem nome`, count.quantity)
  return entries
}

const entryLines = (before: Map<string, number>, after: Map<string, number>): string[] => {
  const lines: string[] = []
  for (const [label, quantity] of after) {
    const old = before.get(label)
    if (old === undefined) lines.push(`+ ${String(quantity)} × ${label}`)
    else if (old !== quantity) lines.push(`${label}: ${String(old)} → ${String(quantity)}`)
  }
  for (const [label, quantity] of before)
    if (!after.has(label)) lines.push(`− ${String(quantity)} × ${label}`)
  return lines
}

const changed = (label: string, before: string, after: string): string[] =>
  before === after ? [] : [`${label}: ${before} → ${after}`]

/** A cor da peça sem partes (a do conjunto vai em cada linha). */
const colorOf = (item: Item): string => item.color ?? 'a loja define'

const fabricOf = (sent: IntakeSent) =>
  sent.fabricName === null
    ? 'não sabe'
    : sent.fabricFinish === null
      ? sent.fabricName
      : `${sent.fabricName} · ${sent.fabricFinish}`

const dayOf = (date: string) => date.split('-').reverse().join('/')

const whenOf = (sent: IntakeSent) =>
  sent.event === null
    ? 'sem evento'
    : `evento em ${dayOf(sent.event.date)}${sent.event.name ? ` (${sent.event.name})` : ''}`

/** Vazio quando o cliente mandou de novo sem mudar nada. */
export const intakeChanges = (before: IntakeSent, after: IntakeSent): IntakeChange[] => {
  const changes: IntakeChange[] = []
  for (const item of after.items) {
    const old = before.items.find((entry) => entry.productId === item.productId)
    if (old === undefined) {
      changes.push({
        title: `${item.productName} — entrou`,
        lines: [
          ...entryLines(new Map(), entriesOf(item)),
          ...(colorOf(item) === 'a loja define' ? [] : [`Cor: ${colorOf(item)}`]),
          ...item.options.map((option) => `+ ${option.name}`),
        ],
      })
      continue
    }
    const oldOptions = old.options.map((option) => option.name)
    const newOptions = item.options.map((option) => option.name)
    const lines = [
      ...entryLines(entriesOf(old), entriesOf(item)),
      ...changed('Cor', colorOf(old), colorOf(item)),
      ...newOptions.filter((name) => !oldOptions.includes(name)).map((name) => `+ ${name}`),
      ...oldOptions.filter((name) => !newOptions.includes(name)).map((name) => `− ${name}`),
    ]
    if (lines.length > 0) changes.push({ title: item.productName, lines })
  }
  for (const item of before.items)
    if (!after.items.some((entry) => entry.productId === item.productId))
      changes.push({ title: `${item.productName} — saiu`, lines: entryLines(entriesOf(item), new Map()) })

  const general = [
    ...changed('Tecido', fabricOf(before), fabricOf(after)),
    ...changed('Para quando', whenOf(before), whenOf(after)),
    ...changed('Observação', before.notes ?? 'nenhuma', after.notes ?? 'nenhuma'),
  ]
  if (general.length > 0) changes.push({ title: 'O pedido', lines: general })
  return changes
}
