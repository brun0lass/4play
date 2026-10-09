import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Boxes,
  Factory,
  KanbanSquare,
  LayoutDashboard,
  Link2,
  Ruler,
  Scissors,
  Settings2,
  Shield,
  Shirt,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Access } from './access'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  show: (access: Access, can: (permission: string) => boolean) => boolean
}

export type SidebarGroupId = 'production' | 'catalog' | 'administration'
export type SidebarGroups = Record<SidebarGroupId, boolean>
type NavGroup = {
  id: SidebarGroupId
  label: string
  icon: LucideIcon
  items: NavItem[]
}

export const PRIMARY_NAV: NavItem[] = [
  {
    to: '/',
    label: 'Início',
    icon: LayoutDashboard,
    end: true,
    show: (_, can) => can('uniforms.read'),
  },
  {
    to: '/producao',
    label: 'Pedidos',
    icon: KanbanSquare,
    show: (_, can) => can('uniforms.read'),
  },
  { to: '/clientes', label: 'Clientes', icon: Users, show: (a) => a.customers },
  {
    to: '/links',
    label: 'Links do cliente',
    icon: Link2,
    show: (a) => a.createOrder,
  },
  {
    to: '/financeiro',
    label: 'Financeiro',
    icon: Wallet,
    show: (a) => a.finance,
  },
]

export const GROUPED_NAV: NavGroup[] = [
  {
    id: 'production',
    label: 'Produção',
    icon: Factory,
    items: [
      {
        to: '/setores',
        label: 'Setores',
        icon: Factory,
        show: (a) => a.sectors,
      },
      {
        to: '/costureiras',
        label: 'Costureiras',
        icon: Scissors,
        show: (a) => a.seamstresses,
      },
      {
        to: '/estoque',
        label: 'Estoque de rolos',
        icon: Boxes,
        show: (a) => a.stock,
      },
      {
        to: '/ocorrencias',
        label: 'Ocorrências',
        icon: AlertTriangle,
        show: (_, can) => can('uniforms.read'),
      },
      {
        to: '/estatisticas',
        label: 'Relatório por setor',
        icon: BarChart3,
        show: (a) => a.sectors,
      },
    ],
  },
  {
    id: 'catalog',
    label: 'Catálogo',
    icon: BookOpen,
    items: [
      {
        to: '/produtos',
        label: 'Produtos e preços',
        icon: Shirt,
        show: (a) => a.products,
      },
      {
        to: '/tecidos',
        label: 'Tecidos',
        icon: Boxes,
        show: (a) => a.priceTable,
      },
      {
        to: '/personalizacoes',
        label: 'Personalizações',
        icon: Settings2,
        show: (a) => a.priceTable,
      },
      {
        to: '/tabela',
        label: 'Tabelas de medidas',
        icon: Ruler,
        show: (a) => a.priceTable,
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administração',
    icon: Shield,
    items: [
      {
        to: '/equipe',
        label: 'Equipe e máquinas',
        icon: Settings2,
        show: (a) => a.team,
      },
    ],
  },
]

/** Somente reorganiza o menu: os recortes de acesso são os mesmos de antes. */
export const visibleNavigation = (
  access: Access,
  can: (permission: string) => boolean
) => ({
  primary: access.ready
    ? PRIMARY_NAV.filter((item) => item.show(access, can))
    : [],
  groups: access.ready
    ? GROUPED_NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.show(access, can)),
      })).filter((group) => group.items.length > 0)
    : [],
})

export const matchesNavPath = (pathname: string, to: string) =>
  pathname === to || (to !== '/' && pathname.startsWith(`${to}/`))

export const activeSidebarGroup = (pathname: string): SidebarGroupId | null =>
  GROUPED_NAV.find((group) =>
    group.items.some((item) => matchesNavPath(pathname, item.to))
  )?.id ?? null

/** Preferências antigas/corrompidas não devem impedir abrir a aplicação. */
export const parseSidebarGroups = (raw: string | null): SidebarGroups => {
  const groups: SidebarGroups = {
    production: false,
    catalog: false,
    administration: false,
  }
  try {
    const stored: unknown = raw === null ? null : JSON.parse(raw)
    if (stored !== null && typeof stored === 'object')
      for (const id of Object.keys(groups) as SidebarGroupId[])
        if (typeof (stored as Record<string, unknown>)[id] === 'boolean')
          groups[id] = (stored as Record<string, boolean>)[id]!
  } catch {
    // Sem preferência válida, começa compacto.
  }
  return groups
}
