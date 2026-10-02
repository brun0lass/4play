import type { z } from 'zod'

import {
  AddMemberRequest,
  AddMemberResponse,
  MemberResponse,
  ResetMemberPasswordResponse,
  TeamList,
} from '@/contracts/aeris/team.ts'
import { qs, request } from '@/lib/http'

/**
 * `/api/v1/team` — quem tem acesso à conta da 4Play no Aeris.
 *
 * O Aeris não manda e-mail: ele cria o acesso pelo e-mail e devolve uma senha
 * temporária. No primeiro login a pessoa é obrigada a criar a própria senha
 * (`mustChangePassword`). Cadastrar e mexer é só de dono e administrador
 * (`identity.user.write`).
 */

export type TeamMember = z.infer<typeof TeamList>['items'][number]
export type Role = TeamMember['role']

export const fetchTeam = async (signal?: AbortSignal): Promise<TeamMember[]> =>
  TeamList.parse(await request(`/api/v1/team/members${qs({ pageSize: 100 })}`, { signal })).items

export const addMember = async (input: {
  displayName: string
  email: string
  role: Role
}): Promise<z.infer<typeof AddMemberResponse>> =>
  AddMemberResponse.parse(
    await request('/api/v1/team/members', { method: 'POST', body: AddMemberRequest.parse(input) })
  )

export const changeRole = async (userId: string, version: number, role: Role): Promise<TeamMember> =>
  MemberResponse.parse(
    await request(`/api/v1/team/members/${userId}/role`, { method: 'PATCH', body: { version, role } })
  ).member

export const setMemberActive = async (
  userId: string,
  version: number,
  active: boolean
): Promise<TeamMember> =>
  MemberResponse.parse(
    await request(`/api/v1/team/members/${userId}/${active ? 'enable' : 'disable'}`, {
      method: 'POST',
      body: { version },
    })
  ).member

export const resetPassword = async (
  userId: string
): Promise<z.infer<typeof ResetMemberPasswordResponse>> =>
  ResetMemberPasswordResponse.parse(
    await request(`/api/v1/team/members/${userId}/password-reset`, { method: 'POST' })
  )
