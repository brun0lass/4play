import type {
  ProductionOrderSummaryType,
  UNIFORM_ART_STATUS_VALUES,
  UNIFORM_FABRIC_VALUES,
  UNIFORM_FUNCTION_VALUES,
  UNIFORM_LOGISTICS_VALUES,
  UNIFORM_PAYMENT_MARK_VALUES,
  UNIFORM_SIZE_VALUES,
  UNIFORM_STAGE_VALUES,
} from '@/contracts/aeris/uniforms.ts'
import {
  CheckCheck,
  MessagesSquare,
  Package,
  PackageCheck,
  Palette,
  Play,
  Printer,
  Scissors,
  Shirt,
  type LucideIcon,
} from 'lucide-react'

/**
 * O vocabulário da produção — as mesmas palavras do Aeris (e da planilha da
 * fábrica), com as cores da 4Play.
 */

export type Stage = (typeof UNIFORM_STAGE_VALUES)[number]
export type Fabric = (typeof UNIFORM_FABRIC_VALUES)[number]
export type Logistics = (typeof UNIFORM_LOGISTICS_VALUES)[number]
export type PaymentMark = (typeof UNIFORM_PAYMENT_MARK_VALUES)[number]
export type ArtStatus = (typeof UNIFORM_ART_STATUS_VALUES)[number]
export type UniformFunction = (typeof UNIFORM_FUNCTION_VALUES)[number]
export type Size = (typeof UNIFORM_SIZE_VALUES)[number]
export type Order = ProductionOrderSummaryType

export const STAGES: readonly Stage[] = [
  'atendimento',
  'arte',
  'iniciar-impressao',
  'imprimindo',
  'impresso',
  'cortando',
  'costurando',
  'embalando',
  'pronto',
]

export const SIZES: readonly Size[] = [
  'PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG', 'ESP',
  'G1', 'G2', 'G3', 'G4',
  '2', '4', '6', '8', '10', '12', '14', '16',
]

/** Os tamanhos que a grade mostra por padrão; os outros abrem sob demanda. */
export const ADULT_SIZES: readonly Size[] = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG']

type StageMeta = { label: string; icon: LucideIcon; what: string; dot: string }

export const STAGE_META: Record<Stage, StageMeta> = {
  atendimento: {
    label: 'Atendimento',
    icon: MessagesSquare,
    what: 'A atendente conversando com o cliente. Ela diz quando vai para a arte.',
    dot: 'bg-slate-500',
  },
  arte: {
    label: 'Arte',
    icon: Palette,
    what: 'Arte, Corel e grade sendo fechados com o cliente.',
    dot: 'bg-violet-500',
  },
  'iniciar-impressao': {
    label: 'Iniciar impressão',
    icon: Play,
    what: 'Tudo pronto para ir para a máquina.',
    dot: 'bg-amber-500',
  },
  imprimindo: {
    label: 'Imprimindo',
    icon: Printer,
    what: 'Na impressora — a ficha diz em qual.',
    dot: 'bg-sky-500',
  },
  impresso: {
    label: 'Impresso',
    icon: CheckCheck,
    what: 'Saiu da impressora e espera o corte.',
    dot: 'bg-cyan-500',
  },
  cortando: { label: 'Cortando', icon: Scissors, what: 'No corte.', dot: 'bg-orange-500' },
  costurando: { label: 'Costurando', icon: Shirt, what: 'Na costura.', dot: 'bg-pink-500' },
  embalando: { label: 'Embalando', icon: Package, what: 'Embalando para sair.', dot: 'bg-yellow-500' },
  pronto: {
    label: 'Pronto',
    icon: PackageCheck,
    what: 'Pronto para despachar ou retirar. Sai da fila quando sair da fábrica.',
    dot: 'bg-lime-600',
  },
}

export const FABRIC_LABELS: Record<Fabric, string> = {
  elastano: 'Elastano',
  furadinho: 'Furadinho',
  'cem-por-cento': '100%',
}

export const LOGISTICS_LABELS: Record<Logistics, string> = {
  correios: 'Correios',
  van: 'Van',
  uber: 'Uber',
  retirada: 'Retirada',
}

export type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success' | 'lime'

export const PAYMENT_MARK_META: Record<PaymentMark, { label: string; tone: Tone }> = {
  nao: { label: 'Não pago', tone: 'danger' },
  sinal: { label: 'Sinal', tone: 'warning' },
  total: { label: '100% pago', tone: 'success' },
  cortesia: { label: 'Cortesia', tone: 'neutral' },
}

export const ART_STATUS_META: Record<ArtStatus, { label: string; tone: Tone; what: string }> = {
  aguardando: { label: 'Aguardando', tone: 'neutral', what: 'Ninguém começou a arte ainda.' },
  criando: { label: 'Criando', tone: 'info', what: 'O designer está fazendo a arte.' },
  enviada: {
    label: 'Com o cliente',
    tone: 'warning',
    what: 'Arte enviada para o cliente aprovar.',
  },
  ajuste: { label: 'Ajuste pedido', tone: 'danger', what: 'O cliente pediu mudança na arte.' },
  aprovada: { label: 'Aprovada', tone: 'lime', what: 'Aprovada. Pode ir para a impressão.' },
}

export const FUNCTION_LABELS: Record<UniformFunction, { person: string; sector: string }> = {
  atendimento: { person: 'Atendente', sector: 'Atendimento' },
  arte: { person: 'Designer', sector: 'Arte' },
  producao: { person: 'Operador', sector: 'Produção' },
}

export const logisticsText = (list: readonly Logistics[]): string =>
  list.length === 0
    ? '—'
    : list
        .map((value, index) =>
          index === 0 ? LOGISTICS_LABELS[value] : LOGISTICS_LABELS[value].toLowerCase()
        )
        .join(' ou ')

/** O número do pedido como a fábrica fala: "#1234", ou "Rascunho". */
export const orderRef = (order: Pick<Order, 'number'>): string =>
  order.number === null ? 'Rascunho' : `#${String(order.number)}`

/** Etapas antes da fábrica: sair delas para a fábrica pede a arte aprovada (F228). */
export const PRE_FACTORY: readonly Stage[] = ['atendimento', 'arte']

export const entersFactory = (from: Stage, to: Stage): boolean =>
  PRE_FACTORY.includes(from) && !PRE_FACTORY.includes(to)

/** Quem pode mover de uma etapa para outra (a regra é do Aeris; a tela só antecipa). */
export const stageMoveFunctions = (from: Stage, to: Stage): UniformFunction[] => {
  // Do atendimento só a atendente tira, e só para a arte; pular a arte é de quem gerencia (F228).
  if (from === 'atendimento') return to === 'arte' ? ['atendimento'] : []
  if (to === 'atendimento') return ['atendimento', 'arte']
  if (from === 'arte') return ['arte']
  if (to === 'arte') return ['arte', 'producao']
  return ['producao']
}

export type Viewer = { manages: boolean; functions: readonly UniformFunction[] }

export const canWork = (viewer: Viewer | undefined, fn: UniformFunction): boolean =>
  viewer !== undefined && (viewer.manages || viewer.functions.includes(fn))

export const canMoveStage = (viewer: Viewer | undefined, from: Stage, to: Stage): boolean =>
  viewer !== undefined &&
  (viewer.manages || stageMoveFunctions(from, to).some((fn) => viewer.functions.includes(fn)))

/** Mensagens das recusas de troca de etapa, pelo `code` do Aeris. */
export const STAGE_REFUSALS: Record<string, string> = {
  stage_changed: 'Alguém mexeu neste pedido agora há pouco. A fila foi atualizada — confira e tente de novo.',
  printer_required: 'Para ir a "Imprimindo", escolha em qual impressora.',
  art_not_approved: 'A arte ainda não foi aprovada pelo cliente.',
  same_stage: 'O pedido já está nesta etapa.',
}

// ---------------------------------------------------------------------------
// As levas (F230 do Aeris)
// ---------------------------------------------------------------------------

export type Batch = Order['batches'][number]
export type PieceCount = Order['remainingPieces'][number]

/**
 * Uma parte do pedido no quadro: a leva 1 (o restante, `batch` nulo) ou uma
 * leva separada. O pedido que nunca foi dividido é uma parte só — ele inteiro.
 */
export type Part = {
  key: string
  order: Order
  batch: Batch | null
  number: number
  stage: Stage
  stageChangedAt: string
  pieces: PieceCount[]
  total: number
  printers: Order['printers']
}

export const piecesTotal = (pieces: readonly PieceCount[]): number =>
  pieces.reduce((sum, count) => sum + count.quantity, 0)

/** A célula como chave — a mesma regra do Aeris (`cellKey`): "camisa|M". */
export const cellKey = (count: Pick<PieceCount, 'piece' | 'size'>): string => `${pieceKey(count.piece)}|${count.size ?? ''}`

/** "Camisa M", ou só "Camisa" quando a leva antiga não sabe o tamanho. */
export const cellLabel = (count: Pick<PieceCount, 'piece' | 'size'>): string =>
  count.size === null ? count.piece : `${count.piece} ${count.size}`

/** "10 Camisa (1 P · 9 M) · 5 Shorts (M)": por peça, e os tamanhos dela. */
export const piecesText = (pieces: readonly PieceCount[]): string => {
  if (pieces.length === 0) return 'Sem grade'
  const groups: { piece: string; total: number; sizes: PieceCount[] }[] = []
  for (const count of pieces) {
    const group = groups.find((item) => pieceKey(item.piece) === pieceKey(count.piece))
    if (group) {
      group.total += count.quantity
      group.sizes.push(count)
    } else groups.push({ piece: count.piece, total: count.quantity, sizes: [count] })
  }
  return groups
    .map((group) => {
      if (group.sizes.every((count) => count.size === null)) return `${String(group.total)} ${group.piece}`
      const sizes =
        group.sizes.length === 1
          ? (group.sizes[0]?.size ?? '')
          : group.sizes.map((count) => `${String(count.quantity)} ${count.size ?? 's/ tam.'}`).join(' · ')
      return `${String(group.total)} ${group.piece} (${sizes})`
    })
    .join(' · ')
}

export const isSplit = (order: Pick<Order, 'batches'>): boolean => order.batches.length > 0

/** As partes do pedido: o restante (se ainda tem peça) e as levas separadas. */
export const partsOf = (order: Order): Part[] => {
  const rest: Part = {
    key: order.id,
    order,
    batch: null,
    number: 1,
    stage: order.stage,
    stageChangedAt: order.stageChangedAt,
    pieces: order.remainingPieces,
    total: isSplit(order) ? piecesTotal(order.remainingPieces) : order.pieces,
    // Sem divisão, as máquinas do pedido são as dele; dividido, cada leva diz as suas.
    printers: isSplit(order) ? [] : order.printers,
  }
  const batches: Part[] = order.batches.map((batch) => ({
    key: `${order.id}:${batch.id}`,
    order,
    batch,
    number: batch.number,
    stage: batch.stage,
    stageChangedAt: batch.stageChangedAt,
    pieces: batch.pieces,
    total: batch.total,
    printers: batch.printers,
  }))
  return !isSplit(order) || rest.total > 0 ? [rest, ...batches] : batches
}

/** O pedido só sai com tudo pronto: as levas que ainda não chegaram em Pronto. */
export const partsNotReady = (order: Order): Part[] => partsOf(order).filter((part) => part.stage !== 'pronto')

export const partLabel = (part: Pick<Part, 'number' | 'batch'>): string =>
  part.batch === null ? 'Leva 1 (restante)' : `Leva ${String(part.number)}`

/** As células do pedido inteiro (peça e tamanho): o restante mais as levas. */
export const orderPieces = (order: Pick<Order, 'remainingPieces' | 'batches'>): PieceCount[] => {
  const merged: PieceCount[] = []
  for (const count of [...order.remainingPieces, ...order.batches.flatMap((batch) => batch.pieces)]) {
    const found = merged.find((item) => cellKey(item) === cellKey(count))
    if (found) found.quantity += count.quantity
    else merged.push({ ...count })
  }
  return merged
}

/** A peça como chave — a mesma regra do Aeris (`pieceKey`): "Camisa" = " camisa". */
export const pieceKey = (piece: string): string => piece.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')

// ---------------------------------------------------------------------------
// O andamento da grade e as ocorrências (F234 do Aeris)
// ---------------------------------------------------------------------------

export type IncidentSector = 'atendimento' | 'arte' | 'impressao' | 'corte' | 'costura' | 'embalagem' | 'expedicao'

export const INCIDENT_SECTORS: readonly IncidentSector[] = [
  'atendimento',
  'arte',
  'impressao',
  'corte',
  'costura',
  'embalagem',
  'expedicao',
]

export const SECTOR_LABELS: Record<IncidentSector, string> = {
  atendimento: 'Atendimento',
  arte: 'Arte',
  impressao: 'Impressão',
  corte: 'Corte',
  costura: 'Costura',
  embalagem: 'Embalagem',
  expedicao: 'Expedição',
}

// ---------------------------------------------------------------------------
// O setor e a grade (F235 do Aeris)
// ---------------------------------------------------------------------------

export type FactorySector = 'impressao' | 'corte' | 'costura' | 'embalagem'

export const FACTORY_SECTORS: readonly FactorySector[] = ['impressao', 'corte', 'costura', 'embalagem']

export const isFactorySector = (value: string | null): value is FactorySector =>
  value !== null && (FACTORY_SECTORS as readonly string[]).includes(value)
