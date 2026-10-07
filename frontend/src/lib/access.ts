import { useAuth } from '@/auth/AuthProvider'
import { useViewer } from '@/lib/queries'
import type { UniformFunction } from '@/lib/uniforms'

/**
 * O que cada pessoa da 4Play vê — pela FUNÇÃO, não só pelo papel do Aeris.
 *
 * No Aeris, atendente, designer e operador são o mesmo papel (`salesperson`),
 * e esse papel enxerga valores e cadastros. Para a fábrica isso é demais: o
 * designer não precisa saber quanto o cliente pagou, nem mexer em clientes ou
 * estoque. A regra aqui recorta a tela:
 *
 *  - Dono, administrador, gerente: tudo.
 *  - Financeiro (`cashier`): valores, financeiro, clientes.
 *  - Atendente: valores (é quem fecha o preço e recebe o sinal), novo pedido,
 *    clientes, produtos.
 *  - Designer: a fila e a arte. Sem valores.
 *  - Operador: a fila, a produção e o estoque (só ver). Sem valores.
 *
 * Desde a F220 do Aeris a API também recorta: quem está só na arte e/ou na
 * fábrica recebe o valor nulo na fila e perde da sessão as permissões de
 * vendas, preços e PDV. Esta regra é a da tela, e é um pouco mais estrita: o
 * vendedor sem função nenhuma também não vê valor aqui.
 */
export type Access = {
  ready: boolean
  isManager: boolean
  isFinance: boolean
  functions: readonly UniformFunction[]
  /** Valores do pedido: total, pago, preço por peça, sinal, financeiro. */
  seeMoney: boolean
  createOrder: boolean
  customers: boolean
  products: boolean
  stock: boolean
  finance: boolean
  team: boolean
  /** A tela das costureiras (F231): quem gerencia e a produção. */
  seamstresses: boolean
  /** As telas dos setores da fábrica (F239): quem gerencia e a produção. */
  sectors: boolean
  /** Cadastrar costureira, mudar tabela e prazo, marcar a costura entregue. */
  manageSeamstresses: boolean
  /** A aba que abre primeiro na ficha do pedido. */
  homeTab: 'atendimento' | 'grade' | 'arte' | 'producao'
}

export const useAccess = (): Access => {
  const { session, can } = useAuth()
  const viewer = useViewer()
  const role = session?.context?.role ?? null
  const isManager = role === 'owner' || role === 'admin' || role === 'manager'
  const isFinance = role === 'cashier'
  const functions = viewer.data?.functions ?? []
  const has = (fn: UniformFunction) => isManager || functions.includes(fn)
  const seesProduction = can('uniforms.read')
  // Quem não vê a produção (financeiro) não chama /uniforms/me: nada a esperar.
  const ready = !seesProduction || isManager || !viewer.isPending

  return {
    ready,
    isManager,
    isFinance,
    functions,
    seeMoney: isManager || isFinance || has('atendimento'),
    createOrder: (isManager || functions.includes('atendimento')) && can('sales.write') && can('uniforms.write'),
    customers: can('party.read') && (isManager || isFinance || has('atendimento')),
    products: can('catalog.read') && (isManager || has('atendimento')),
    stock: can('inventory.read') && (isManager || has('producao')),
    finance: can('finance.read'),
    team: can('identity.user.read') || viewer.data?.manages === true,
    seamstresses: can('uniforms.read') && (isManager || viewer.data?.manages === true || has('producao')),
    sectors: can('uniforms.read') && (isManager || has('producao')),
    manageSeamstresses: viewer.data?.manages === true || (isManager && can('uniforms.manage')),
    homeTab: isManager || has('atendimento') ? 'atendimento' : functions.includes('arte') ? 'arte' : functions.includes('producao') ? 'producao' : 'atendimento',
  }
}
