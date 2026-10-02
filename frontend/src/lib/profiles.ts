import type { Role } from '@/api/team'
import type { UniformFunction } from '@/lib/uniforms'

/**
 * Os perfis da 4Play, traduzidos para o Aeris.
 *
 * O Aeris tem PAPÉIS (o que a pessoa pode fazer na conta) e, na produção,
 * FUNÇÕES (atendimento, arte, produção). A 4Play fala em cargos. Esta tabela é
 * a ponte — e segue o que cada papel do Aeris realmente libera:
 *
 * - `salesperson` é o único papel "de chão" que vê a produção
 *   (`uniforms.read/write`), então Atendente, Designer e Operador usam ele,
 *   com a função certa. Os três podem ser combinados na mesma pessoa.
 * - `cashier` tem o financeiro (títulos, baixas, cobrança, gastos) e NÃO tem a
 *   produção: é o Financeiro.
 * - `manager` vê e mexe em tudo, menos cadastrar a equipe.
 * - `admin` é como o dono.
 */

export type ProfileKey = 'atendente' | 'designer' | 'operador' | 'financeiro' | 'gerente' | 'admin'

export const PRODUCTION_PROFILES: { key: ProfileKey; fn: UniformFunction }[] = [
  { key: 'atendente', fn: 'atendimento' },
  { key: 'designer', fn: 'arte' },
  { key: 'operador', fn: 'producao' },
]

export const PROFILE_META: Record<
  ProfileKey,
  { label: string; what: string; role: Role; production: boolean }
> = {
  atendente: {
    label: 'Atendente',
    what: 'Cria pedidos e clientes, preenche a ficha e a grade.',
    role: 'salesperson',
    production: true,
  },
  designer: {
    label: 'Designer',
    what: 'Cuida da arte e tira o pedido da arte quando o cliente aprova.',
    role: 'salesperson',
    production: true,
  },
  operador: {
    label: 'Operador de produção',
    what: 'Move os pedidos entre as etapas da fábrica: impressão, corte, costura.',
    role: 'salesperson',
    production: true,
  },
  financeiro: {
    label: 'Financeiro',
    what: 'Contas a receber e a pagar, dar baixa e cobrança. Não mexe na produção.',
    role: 'cashier',
    production: false,
  },
  gerente: {
    label: 'Gerente',
    what: 'Vê e mexe em tudo: produção, pedidos e financeiro. Não cadastra a equipe.',
    role: 'manager',
    production: false,
  },
  admin: {
    label: 'Administrador',
    what: 'Tudo, inclusive cadastrar e remover funcionários. Para sócios.',
    role: 'admin',
    production: false,
  },
}

const FN_LABEL: Record<UniformFunction, string> = {
  atendimento: 'Atendente',
  arte: 'Designer',
  producao: 'Operador',
}

/** Como a tela chama uma pessoa, a partir do papel e das funções no Aeris. */
export const profileLabel = (role: Role, functions: readonly UniformFunction[]): string => {
  switch (role) {
    case 'owner':
      return 'Dono'
    case 'admin':
      return 'Administrador'
    case 'manager':
      return 'Gerente'
    case 'cashier':
      return 'Financeiro'
    case 'trocador':
      return 'Trocador'
    case 'salesperson':
      return functions.length === 0 ? 'Sem função na produção' : functions.map((fn) => FN_LABEL[fn]).join(' + ')
  }
}

/** O perfil que a tela marca ao editar alguém. */
export const profileOf = (
  role: Role,
  functions: readonly UniformFunction[]
): { exclusive: ProfileKey | null; production: UniformFunction[] } => {
  if (role === 'cashier') return { exclusive: 'financeiro', production: [] }
  if (role === 'manager') return { exclusive: 'gerente', production: [] }
  if (role === 'admin' || role === 'owner') return { exclusive: 'admin', production: [] }
  return { exclusive: null, production: [...functions] }
}
