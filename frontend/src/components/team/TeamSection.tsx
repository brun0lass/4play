import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { KeyRound, Pencil, UserCheck, UserPlus, UserX, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import { addMember, changeRole, fetchTeam, resetPassword, setMemberActive, type TeamMember } from '@/api/team'
import { replaceMemberFunctions } from '@/api/uniforms'
import { Section } from '@/components/ficha/Section'
import { InviteCard } from '@/components/team/InviteCard'
import { ProfilePicker, profileValid, type ProfileValue } from '@/components/team/ProfilePicker'
import { useToast } from '@/components/Toast'
import { Badge, Button, ErrorBox, Modal, Spinner } from '@/components/ui'
import { ago } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { PROFILE_META, profileLabel, profileOf } from '@/lib/profiles'
import { keys, useMembers } from '@/lib/queries'
import type { UniformFunction } from '@/lib/uniforms'

const TEAM_KEY = ['team'] as const

const roleOf = (value: ProfileValue) => (value.exclusive ? PROFILE_META[value.exclusive].role : 'salesperson')
const functionsOf = (value: ProfileValue): ('atendimento' | 'arte' | 'producao')[] =>
  value.exclusive ? [] : value.production

/** Funcionários: convidar pelo e-mail, trocar o perfil, nova senha, desativar. */
export const TeamSection = ({ canWrite }: { canWrite: boolean }) => {
  const team = useQuery({ queryKey: TEAM_KEY, queryFn: ({ signal }) => fetchTeam(signal) })
  const members = useMembers()
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)

  const functionsBy = new Map<string, UniformFunction[]>(
    (members.data ?? []).map((member) => [member.userId, member.functions])
  )

  const sorted = [...(team.data ?? [])].sort((a, b) =>
    a.status === b.status ? a.displayName.localeCompare(b.displayName) : a.status === 'active' ? -1 : 1
  )

  return (
    <Section
      title="Funcionários"
      icon={<Users className="h-3.5 w-3.5" />}
      aside={
        canWrite && (
          <Button variant="lime" size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviting(true)}>
            Adicionar funcionário
          </Button>
        )
      }
    >
      <p className="mb-4 text-sm text-muted">
        Cadastre pelo e-mail. O sistema gera uma senha temporária para você mandar à pessoa; no primeiro acesso ela
        cria a própria senha.
      </p>
      {team.isPending && <Spinner />}
      {team.isError && <ErrorBox message={errorMessage(team.error)} onRetry={() => void team.refetch()} />}

      <ul className="divide-y divide-line">
        {sorted.map((member) => {
          const waiting = member.mustChangePassword && member.status === 'active'
          return (
            <li key={member.userId} className={clsx('flex flex-wrap items-center gap-3 py-3', member.status === 'disabled' && 'opacity-50')}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {member.displayName}
                  {member.isSelf && <Badge>você</Badge>}
                </p>
                <p className="truncate text-xs text-muted">{member.email}</p>
              </div>
              <Badge tone={member.role === 'cashier' ? 'info' : member.role === 'salesperson' ? 'neutral' : 'lime'}>
                {profileLabel(member.role, functionsBy.get(member.userId) ?? [])}
              </Badge>
              <span className="w-40 text-right text-[11px] font-semibold">
                {member.status === 'disabled' ? (
                  <span className="text-red-600">Desativado</span>
                ) : waiting ? (
                  <span className="text-amber-700">Aguardando 1º acesso</span>
                ) : member.lastSeenAt ? (
                  <span className="text-muted">Visto {ago(member.lastSeenAt)}</span>
                ) : (
                  <span className="text-muted">Nunca entrou</span>
                )}
              </span>
              {canWrite && member.role !== 'owner' && !member.isSelf && (
                <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(member)}>
                  Editar
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      <EditDialog
        member={editing}
        functions={editing ? functionsBy.get(editing.userId) ?? [] : []}
        onClose={() => setEditing(null)}
      />
    </Section>
  )
}

const InviteDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [profile, setProfile] = useState<ProfileValue>({ exclusive: null, production: [] })
  const [result, setResult] = useState<{ name: string; email: string; password: string | null } | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setEmail('')
      setProfile({ exclusive: null, production: [] })
      setResult(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      const created = await addMember({ displayName: name.trim(), email: email.trim(), role: roleOf(profile) })
      const fns = functionsOf(profile)
      if (fns.length > 0) {
        try {
          await replaceMemberFunctions(created.member.userId, fns)
        } catch (error) {
          toast(`Acesso criado, mas as funções não foram gravadas: ${errorMessage(error)}`, 'error')
        }
      }
      return created
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEY })
      void queryClient.invalidateQueries({ queryKey: keys.members })
      toast(`${created.member.displayName} foi adicionado(a).`)
      setResult({ name: created.member.displayName, email: created.member.email, password: created.temporaryPassword })
    },
  })

  const valid = name.trim() !== '' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && profileValid(profile)

  return (
    <Modal
      open={open}
      wide
      title={result ? 'Acesso criado' : 'Adicionar funcionário'}
      onClose={onClose}
      footer={
        result ? (
          <Button variant="ink" onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="lime" busy={mutation.isPending} disabled={!valid} onClick={() => mutation.mutate()}>
              Criar acesso
            </Button>
          </>
        )
      }
    >
      {result ? (
        <InviteCard name={result.name} email={result.email} password={result.password} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="m-name">Nome</label>
              <input id="m-name" autoFocus maxLength={200} className="field" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="m-email">E-mail (é o login)</label>
              <input id="m-email" type="email" autoComplete="off" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <span className="label">Perfil</span>
            <ProfilePicker value={profile} onChange={setProfile} />
          </div>
          {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
        </div>
      )}
    </Modal>
  )
}

const EditDialog = ({
  member,
  functions,
  onClose,
}: {
  member: TeamMember | null
  functions: UniformFunction[]
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [profile, setProfile] = useState<ProfileValue>({ exclusive: null, production: [] })
  const [newPassword, setNewPassword] = useState<string | null>(null)

  useEffect(() => {
    if (member) {
      setProfile(profileOf(member.role, functions))
      setNewPassword(null)
    }
    // As funções chegam de outra consulta; só recalcula quando abre outra pessoa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.userId])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: TEAM_KEY })
    void queryClient.invalidateQueries({ queryKey: keys.members })
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!member) return
      const role = roleOf(profile)
      if (role !== member.role) await changeRole(member.userId, member.version, role)
      const fns = functionsOf(profile)
      if ([...fns].sort().join() !== [...functions].sort().join()) await replaceMemberFunctions(member.userId, fns)
    },
    onSuccess: () => {
      toast('Perfil atualizado.')
      onClose()
    },
    onSettled: refresh,
  })

  const reset = useMutation({
    mutationFn: () => resetPassword(member!.userId),
    onSuccess: (result) => setNewPassword(result.temporaryPassword),
    onSettled: refresh,
  })

  const toggle = useMutation({
    mutationFn: () => setMemberActive(member!.userId, member!.version, member!.status !== 'active'),
    onSuccess: (updated) => {
      toast(updated.status === 'active' ? `${updated.displayName} voltou a ter acesso.` : `${updated.displayName} foi desativado(a).`)
      onClose()
    },
    onSettled: refresh,
  })

  const error = save.error ?? reset.error ?? toggle.error

  return (
    <Modal
      open={member !== null}
      wide
      title={member?.displayName ?? ''}
      onClose={onClose}
      footer={
        newPassword ? (
          <Button variant="ink" onClick={onClose}>Concluir</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="lime" busy={save.isPending} disabled={!profileValid(profile)} onClick={() => save.mutate()}>
              Salvar perfil
            </Button>
          </>
        )
      }
    >
      {member && newPassword ? (
        <InviteCard name={member.displayName} email={member.email} password={newPassword} />
      ) : member ? (
        <div className="space-y-5">
          <p className="text-sm text-muted">{member.email}</p>
          <ProfilePicker value={profile} onChange={setProfile} />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="outline" size="sm" busy={reset.isPending} icon={<KeyRound className="h-4 w-4" />} onClick={() => reset.mutate()}>
              Gerar nova senha temporária
            </Button>
            <Button
              variant={member.status === 'active' ? 'danger' : 'outline'}
              size="sm"
              busy={toggle.isPending}
              icon={member.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
              onClick={() => {
                if (member.status !== 'active' || window.confirm(`Tirar o acesso de ${member.displayName}? A pessoa sai do sistema na hora.`))
                  toggle.mutate()
              }}
            >
              {member.status === 'active' ? 'Desativar acesso' : 'Reativar acesso'}
            </Button>
          </div>
          <p className="text-[11px] text-muted">
            Esqueceu a senha? Gere uma nova temporária e mande para a pessoa — a antiga deixa de valer e ela sai das
            sessões abertas.
          </p>
          {error && <ErrorBox message={errorMessage(error)} />}
        </div>
      ) : null}
    </Modal>
  )
}
