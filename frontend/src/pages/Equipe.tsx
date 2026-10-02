import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Archive, ArchiveRestore, Plus, Printer, Users } from 'lucide-react'
import { useState } from 'react'

import { createPrinter, replaceMemberFunctions, updatePrinter } from '@/api/uniforms'
import { useAuth } from '@/auth/AuthProvider'
import { Section } from '@/components/ficha/Section'
import { TeamSection } from '@/components/team/TeamSection'
import { Badge, Button, ErrorBox, PageHeader, Spinner } from '@/components/ui'
import { errorMessage } from '@/lib/http'
import { keys, useMembers, usePrinters, useViewer } from '@/lib/queries'
import { FUNCTION_LABELS, type UniformFunction } from '@/lib/uniforms'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  manager: 'Gerente',
  cashier: 'Caixa',
  trocador: 'Trocador',
  salesperson: 'Vendedor',
}

const FUNCTIONS = Object.keys(FUNCTION_LABELS) as UniformFunction[]

export const EquipePage = () => {
  const viewer = useViewer()
  const { can } = useAuth()
  const manages = viewer.data?.manages === true
  const seesTeam = can('identity.user.read')

  return (
    <div>
      <PageHeader kicker="Quem trabalha e com o quê" title="Equipe e máquinas" />
      {!viewer.isPending && !manages && !seesTeam && (
        <p className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          Só quem gerencia a produção muda as funções e as máquinas. Você vê em modo leitura.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        {seesTeam ? <TeamSection canWrite={can('identity.user.write')} /> : <Team manages={manages} />}
        <Printers manages={manages} />
      </div>
    </div>
  )
}

const Team = ({ manages }: { manages: boolean }) => {
  const queryClient = useQueryClient()
  const members = useMembers()
  const mutation = useMutation({
    mutationFn: (input: { userId: string; functions: UniformFunction[] }) =>
      replaceMemberFunctions(input.userId, input.functions),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.members })
      void queryClient.invalidateQueries({ queryKey: keys.viewer })
    },
  })

  return (
    <Section title="Funções na produção" icon={<Users className="h-3.5 w-3.5" />}>
      <p className="mb-4 text-sm text-muted">
        <strong className="text-ink">Atendente</strong> mexe na ficha e na grade,{' '}
        <strong className="text-ink">Designer</strong> na arte e tira o pedido da arte,{' '}
        <strong className="text-ink">Operador</strong> move entre as etapas da fábrica.
      </p>
      {members.isPending && <Spinner />}
      {members.isError && <ErrorBox message={errorMessage(members.error)} />}
      {mutation.isError && <div className="mb-3"><ErrorBox message={errorMessage(mutation.error)} /></div>}
      <ul className="divide-y divide-line">
        {members.data?.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-bold">{member.displayName}</p>
              <p className="text-xs text-muted">{ROLE_LABELS[member.role] ?? member.role}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FUNCTIONS.map((fn) => {
                const on = member.functions.includes(fn)
                return (
                  <button
                    key={fn}
                    type="button"
                    disabled={!manages || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        userId: member.userId,
                        functions: on ? member.functions.filter((f) => f !== fn) : [...member.functions, fn],
                      })
                    }
                    className={clsx(
                      'rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:cursor-default',
                      on ? 'border-ink bg-ink text-lime' : 'border-line bg-white text-muted hover:border-ink/40'
                    )}
                  >
                    {FUNCTION_LABELS[fn].person}
                  </button>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const Printers = ({ manages }: { manages: boolean }) => {
  const queryClient = useQueryClient()
  const printers = usePrinters()
  const [name, setName] = useState('')
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['uniforms', 'printers'] })

  const create = useMutation({
    mutationFn: () => createPrinter(name.trim()),
    onSuccess: () => setName(''),
    onSettled: refresh,
  })
  const toggle = useMutation({
    mutationFn: (input: { id: string; status: 'active' | 'archived'; version: number }) =>
      updatePrinter(input.id, { status: input.status, version: input.version }),
    onSettled: refresh,
  })

  const sorted = [...(printers.data ?? [])].sort((a, b) =>
    a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1
  )

  return (
    <Section title="Impressoras" icon={<Printer className="h-3.5 w-3.5" />}>
      {manages && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <input className="field" maxLength={60} placeholder="Nome da impressora" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="lime" busy={create.isPending} icon={<Plus className="h-4 w-4" />}>
            Cadastrar
          </Button>
        </form>
      )}
      {(create.isError || toggle.isError) && (
        <div className="mb-3"><ErrorBox message={errorMessage(create.error ?? toggle.error)} /></div>
      )}
      {printers.isPending && <Spinner />}
      <ul className="space-y-2">
        {sorted.map((printer) => (
          <li
            key={printer.id}
            className={clsx('flex items-center justify-between gap-3 rounded-2xl px-4 py-3', printer.status === 'active' ? 'bg-paper' : 'bg-paper/50 opacity-60')}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-lime">
                <Printer className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold">{printer.name}</p>
                <p className="text-[11px] text-muted">{printer.usageCount} pedidos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {printer.status === 'archived' && <Badge>Arquivada</Badge>}
              {manages && (
                <button
                  type="button"
                  title={printer.status === 'active' ? 'Arquivar' : 'Reativar'}
                  onClick={() =>
                    toggle.mutate({
                      id: printer.id,
                      status: printer.status === 'active' ? 'archived' : 'active',
                      version: printer.version,
                    })
                  }
                  className="rounded-lg p-2 text-muted hover:bg-black/5 hover:text-ink"
                >
                  {printer.status === 'active' ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
