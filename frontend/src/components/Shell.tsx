import { clsx } from 'clsx'
import {
  AlertTriangle,
  BarChart3,
  Factory,
  KanbanSquare,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Plus,
  Settings2,
  Users,
  Wallet,
  Shirt,
  Boxes,
  Scissors,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'

import { useAuth } from '@/auth/AuthProvider'
import { useAccess, type Access } from '@/lib/access'
import { CoBrand } from '@/components/CoBrand'
import { Logo } from '@/components/Logo'
import { NewOrderContext, useNewOrder } from '@/components/NewOrderContext'
import { NewOrderWizard } from '@/components/NewOrderWizard'
import { Avatar } from '@/components/ui'

/**
 * Cada item aparece para quem precisa dele, pela função na 4Play (ver
 * `lib/access.ts`): o designer vê a fila; o financeiro, o financeiro.
 */
type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; show: (a: Access, can: (p: string) => boolean) => boolean }

const NAV: NavItem[] = [
  { to: '/', label: 'Início', icon: LayoutDashboard, end: true, show: (_, can) => can('uniforms.read') },
  { to: '/producao', label: 'Pedidos e produção', icon: KanbanSquare, show: (_, can) => can('uniforms.read') },
  { to: '/setores', label: 'Setores', icon: Factory, show: (a) => a.sectors },
  { to: '/estatisticas', label: 'Produção por setor', icon: BarChart3, show: (a) => a.sectors },
  { to: '/links', label: 'Links do cliente', icon: Link2, show: (a) => a.createOrder },
  { to: '/ocorrencias', label: 'Ocorrências', icon: AlertTriangle, show: (_, can) => can('uniforms.read') },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, show: (a) => a.finance },
  { to: '/clientes', label: 'Clientes', icon: Users, show: (a) => a.customers },
  { to: '/produtos', label: 'Produtos', icon: Shirt, show: (a) => a.products },
  { to: '/estoque', label: 'Estoque', icon: Boxes, show: (a) => a.stock },
  { to: '/costureiras', label: 'Costureiras', icon: Scissors, show: (a) => a.seamstresses },
  { to: '/equipe', label: 'Equipe e máquinas', icon: Settings2, show: (a) => a.team },
]

const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { session, logout, can } = useAuth()
  const access = useAccess()
  const openNewOrder = useNewOrder()
  const items = access.ready ? NAV.filter((item) => item.show(access, can)) : []
  const context = session?.context

  return (
    <div className="brush-bg flex h-full flex-col text-white">
      <div className="px-6 pt-7 pb-6">
        <CoBrand size="sm" />
      </div>

      {openNewOrder && (
      <div className="px-3 pb-5">
        <button
          type="button"
          onClick={() => {
            onNavigate?.()
            openNewOrder?.()
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-lime px-4 py-3.5 text-sm font-extrabold text-ink shadow-[0_3px_0_0_rgb(0_0_0/0.8)] transition hover:bg-lime-600 active:translate-y-0.5 active:shadow-none"
        >
          <Plus className="h-5 w-5" strokeWidth={3} /> Novo pedido
        </button>
      </div>
      )}

      <nav className="flex-1 space-y-1 px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end ?? false}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition',
                isActive
                  ? 'bg-lime text-ink shadow-[0_2px_0_0_rgb(0_0_0/0.6)]'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-2xl bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <Avatar name={session?.user.displayName ?? null} inverted className="h-9 w-9 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{session?.user.displayName}</p>
            <p className="truncate text-[11px] text-white/50">
              {context?.companyTradeName ?? context?.companyName ?? context?.tenantName}
              {context?.branchName ? ` · ${context.branchName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-lime"
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export const Shell = () => {
  const [open, setOpen] = useState(false)
  const [newOrder, setNewOrder] = useState(false)
  const { hasFeature, session, can } = useAuth()
  const access = useAccess()
  const lacksUniforms = session !== null && can('uniforms.read') && !hasFeature('uniformes')

  return (
    <NewOrderContext.Provider value={access.createOrder ? () => setNewOrder(true) : null}>
    <div className="flex h-full">
      <aside className="no-print hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-64">
          <Sidebar />
        </div>
      </aside>

      {/* Celular: barra de cima e gaveta */}
      <div className="no-print fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 lg:hidden">
        <Logo className="h-8" />
        <div className="flex items-center gap-1">
        {access.createOrder && (
        <button
          type="button"
          onClick={() => setNewOrder(true)}
          className="inline-flex items-center gap-1 rounded-full bg-lime px-3 py-1.5 text-xs font-extrabold text-ink"
        >
          <Plus className="h-4 w-4" strokeWidth={3} /> Pedido
        </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-white"
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-5 right-4 rounded-lg p-2 text-white"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pt-20 pb-10 sm:px-8 lg:pt-8 print:p-0">
        {lacksUniforms && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            A chave <strong>uniformes</strong> não está ligada nesta conta do Aeris. A fila de
            produção só aparece depois que o suporte do Aeris ligar a chave.
          </div>
        )}
        <Outlet />
      </main>
      <NewOrderWizard open={newOrder} onClose={() => setNewOrder(false)} />
    </div>
    </NewOrderContext.Provider>
  )
}
