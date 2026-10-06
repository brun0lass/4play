import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, History, Mail, MapPin, Phone, Search, UserPlus } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { fetchCustomers } from '@/api/store'
import { CustomerHistory } from '@/components/CustomerHistory'
import { NewCustomerDialog } from '@/components/NewCustomerDialog'
import { Badge, Button, Empty, ErrorBox, Modal, PageHeader, Spinner } from '@/components/ui'
import { useAuth } from '@/auth/AuthProvider'
import { day, int } from '@/lib/format'
import { errorMessage } from '@/lib/http'

const PAGE_SIZE = 30

const whatsapp = (phone: string) => `https://wa.me/55${phone.replace(/\D/g, '').replace(/^55/, '')}`

export const ClientesPage = () => {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null)
  const { can } = useAuth()
  const deferred = useDeferredValue(search.trim())

  const customers = useQuery({
    queryKey: ['customers', deferred, page],
    queryFn: ({ signal }) =>
      fetchCustomers({ search: deferred || undefined, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  })

  const pages = customers.data ? Math.max(1, Math.ceil(customers.data.total / PAGE_SIZE)) : 1

  return (
    <div>
      <PageHeader
        kicker="Times, escolas e eventos"
        title="Clientes"
        actions={
          <Button variant="lime" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            Novo cliente
          </Button>
        }
      >
        {customers.data && (
          <p className="mt-2 text-sm font-semibold text-muted">{int(customers.data.total)} clientes ativos</p>
        )}
      </PageHeader>

      <div className="relative mb-5 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Nome, documento ou código"
          className="field pl-9"
        />
      </div>

      {customers.isPending && <Spinner />}
      {customers.isError && <ErrorBox message={errorMessage(customers.error)} onRetry={() => void customers.refetch()} />}
      {customers.data?.items.length === 0 && (
        <Empty title={deferred ? 'Ninguém encontrado' : 'Nenhum cliente ainda'}>
          <p>{deferred ? `Não há cliente com "${deferred}".` : 'Cadastre o primeiro time, escola ou pessoa.'}</p>
          <Button variant="lime" className="mt-4" icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            {deferred ? `Cadastrar "${deferred}"` : 'Novo cliente'}
          </Button>
        </Empty>
      )}
      <NewCustomerDialog open={creating} initialName={deferred} onClose={() => setCreating(false)} />
      <Modal
        open={viewing !== null}
        wide
        title={viewing ? `Pedidos de ${viewing.name}` : ''}
        onClose={() => setViewing(null)}
        footer={<Button variant="ink" onClick={() => setViewing(null)}>Fechar</Button>}
      >
        <p className="mb-4 text-sm text-muted">
          Do mais novo para o mais velho, com as impressoras em que cada pedido saiu. Abra um pedido para repetir.
        </p>
        {viewing && <CustomerHistory partyId={viewing.id} />}
      </Modal>

      {customers.data && customers.data.items.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {customers.data.items.map((party) => (
              <article key={party.id} className="card p-4 transition hover:border-ink/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{party.tradeName ?? party.legalName}</p>
                    {party.tradeName && <p className="truncate text-xs text-muted">{party.legalName}</p>}
                  </div>
                  {party.code != null && <Badge tone="neutral">#{party.code}</Badge>}
                </div>
                <div className="mt-3 space-y-1 text-xs font-semibold text-ink/80">
                  {party.mainCity && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted" /> {party.mainCity}
                      {party.mainUf ? `/${party.mainUf}` : ''}
                    </p>
                  )}
                  {party.mainPhone && (
                    <a href={whatsapp(party.mainPhone)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline">
                      <Phone className="h-3.5 w-3.5 text-muted" /> {party.mainPhone}
                    </a>
                  )}
                  {party.mainEmail && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Mail className="h-3.5 w-3.5 text-muted" /> {party.mainEmail}
                    </p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {party.tags.map((tag) => (
                    <Badge key={tag.id} tone={tag.tone === 'neutral' ? 'neutral' : tag.tone}>{tag.name}</Badge>
                  ))}
                  {party.lastPurchaseAt && (
                    <span className="text-[11px] text-muted">Última compra {day(party.lastPurchaseAt)}</span>
                  )}
                </div>
                {can('uniforms.read') && (
                  <button
                    type="button"
                    onClick={() => setViewing({ id: party.id, name: party.tradeName ?? party.legalName })}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-ink/30"
                  >
                    <History className="h-3.5 w-3.5" /> Pedidos e máquinas
                  </button>
                )}
              </article>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between text-sm">
            <span className="font-semibold text-muted">Página {page} de {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
