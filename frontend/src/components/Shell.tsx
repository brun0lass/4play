import { clsx } from 'clsx'
import { ChevronDown, LogOut, Menu, Plus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { useAuth } from '@/auth/AuthProvider'
import { useAccess } from '@/lib/access'
import {
  activeSidebarGroup,
  matchesNavPath,
  parseSidebarGroups,
  visibleNavigation,
  type NavItem,
  type SidebarGroupId,
  type SidebarGroups,
} from '@/lib/sidebar-navigation'
import { CoBrand } from '@/components/CoBrand'
import { Logo } from '@/components/Logo'
import { NewOrderContext, useNewOrder } from '@/components/NewOrderContext'
import { NewOrderWizard } from '@/components/NewOrderWizard'
import { Avatar } from '@/components/ui'

const readSidebarGroups = (key: string, pathname: string): SidebarGroups => {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    /* Armazenamento indisponível. */
  }
  const groups = parseSidebarGroups(raw)
  const active = activeSidebarGroup(pathname)
  if (active) groups[active] = true
  return groups
}

const SidebarLink = ({
  item,
  nested = false,
  onNavigate,
}: {
  item: NavItem
  nested?: boolean
  onNavigate?: () => void
}) => {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline-lime lg:py-2',
          nested ? 'text-[13px] font-semibold' : 'font-bold',
          isActive
            ? nested
              ? 'bg-lime/10 text-lime'
              : 'bg-lime text-ink'
            : 'text-white/65 hover:bg-white/5 hover:text-white'
        )
      }
    >
      <Icon
        className={clsx('shrink-0', nested ? 'h-4 w-4' : 'h-[18px] w-[18px]')}
        aria-hidden
      />
      <span>{item.label}</span>
    </NavLink>
  )
}

const Sidebar = ({
  groups,
  onToggleGroup,
  onNavigate,
}: {
  groups: SidebarGroups
  onToggleGroup: (id: SidebarGroupId) => void
  onNavigate?: () => void
}) => {
  const { session, logout, can } = useAuth()
  const access = useAccess()
  const openNewOrder = useNewOrder()
  const navigation = visibleNavigation(access, can)
  const context = session?.context
  const { pathname } = useLocation()
  const id = useId()

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-white/10 bg-ink text-white">
      <div className="shrink-0 px-5 py-5">
        <CoBrand layout="inline" />
      </div>

      {openNewOrder && (
        <div className="shrink-0 px-3 pb-5">
          <button
            type="button"
            onClick={() => {
              onNavigate?.()
              openNewOrder?.()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-sm font-extrabold text-ink transition hover:bg-lime-600 focus-visible:outline-lime active:translate-y-0.5"
          >
            <Plus className="h-5 w-5" strokeWidth={3} /> Novo pedido
          </button>
        </div>
      )}

      <nav
        aria-label="Menu principal"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-color:rgb(255_255_255/0.3)_transparent] [scrollbar-width:thin]"
      >
        {navigation.primary.length > 0 && (
          <div className="space-y-1">
            <p className="px-3 pb-2 text-[10px] font-bold tracking-[0.16em] text-white/50 uppercase">
              Dia a dia
            </p>
            {navigation.primary.map((item) => (
              <SidebarLink key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        )}
        {navigation.groups.length > 0 && (
          <div
            className={clsx(
              'space-y-1',
              navigation.primary.length > 0 &&
                'mt-5 border-t border-white/10 pt-4'
            )}
          >
            {navigation.groups.map((group) => {
              const Icon = group.icon
              const active = group.items.some((item) =>
                matchesNavPath(pathname, item.to)
              )
              const expanded = groups[group.id]
              const panelId = `${id}-${group.id}`
              return (
                <div key={group.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => onToggleGroup(group.id)}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:bg-white/5 focus-visible:outline-lime lg:py-2',
                      active
                        ? 'bg-white/5 text-white'
                        : 'text-white/65 hover:text-white'
                    )}
                  >
                    <Icon
                      className={clsx(
                        'h-[18px] w-[18px] shrink-0',
                        active && 'text-lime'
                      )}
                      aria-hidden
                    />
                    <span className="flex-1">{group.label}</span>
                    <ChevronDown
                      className={clsx(
                        'h-4 w-4 text-white/40 transition-transform motion-reduce:transition-none',
                        !expanded && '-rotate-90'
                      )}
                      aria-hidden
                    />
                  </button>
                  <div
                    id={panelId}
                    hidden={!expanded}
                    className="mt-1 mb-3 ml-5 space-y-0.5 border-l border-white/10 pl-2"
                  >
                    {group.items.map((item) => (
                      <SidebarLink
                        key={item.to}
                        item={item}
                        nested
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <Avatar
              name={session?.user.displayName ?? null}
              inverted
              className="h-9 w-9 text-xs"
            />
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-bold"
                title={session?.user.displayName}
              >
                {session?.user.displayName}
              </p>
              <p className="truncate text-[11px] text-white/50">
                {context?.companyTradeName ??
                  context?.companyName ??
                  context?.tenantName}
                {context?.branchName ? ` · ${context.branchName}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-lime focus-visible:outline-lime"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
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
  const { pathname } = useLocation()
  // Estado compartilhado pelo desktop e pela gaveta; preferência por pessoa/conta.
  const storageKey = `4play.sidebar.groups.v1:${session?.context?.tenantId ?? 'none'}:${session?.user.id ?? 'none'}`
  const [groups, setGroups] = useState(() =>
    readSidebarGroups(storageKey, pathname)
  )
  useEffect(() => {
    setGroups(readSidebarGroups(storageKey, pathname))
  }, [storageKey, pathname])
  const toggleGroup = (id: SidebarGroupId) => {
    const next = { ...groups, [id]: !groups[id] }
    setGroups(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* Continua sem lembrar. */
    }
  }
  const lacksUniforms =
    session !== null && can('uniforms.read') && !hasFeature('uniformes')

  return (
    <NewOrderContext.Provider
      value={access.createOrder ? () => setNewOrder(true) : null}
    >
      <div className="flex h-full">
        <aside className="no-print hidden w-64 shrink-0 lg:block">
          <div className="fixed inset-y-0 w-64">
            <Sidebar groups={groups} onToggleGroup={toggleGroup} />
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
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-72">
              <Sidebar
                groups={groups}
                onToggleGroup={toggleGroup}
                onNavigate={() => setOpen(false)}
              />
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
              A chave <strong>uniformes</strong> não está ligada nesta conta do
              Aeris. A fila de produção só aparece depois que o suporte do Aeris
              ligar a chave.
            </div>
          )}
          <Outlet />
        </main>
        <NewOrderWizard open={newOrder} onClose={() => setNewOrder(false)} />
      </div>
    </NewOrderContext.Provider>
  )
}
