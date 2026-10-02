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

/** Quem pode mover de uma etapa para outra (a regra é do Aeris; a tela só antecipa). */
export const stageMoveFunctions = (from: Stage, to: Stage): UniformFunction[] => {
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
