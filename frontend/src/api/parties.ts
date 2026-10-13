import type { z } from 'zod'

import {
  PartyAddressRequest,
  PartyContactRequest,
  PartyResponse,
  RemovePartyChildRequest,
  UpdatePartyRequest,
} from '@/contracts/aeris/party.ts'
import { request } from '@/lib/http'

/**
 * O cadastro de um cliente no Aeris: os dados, os contatos e os endereços.
 *
 * Toda alteração leva a `version` da pessoa (ADR-0014 do Aeris): duas pessoas
 * mexendo no mesmo cliente não se sobrescrevem — a segunda recebe 409 e
 * recarrega. Cada resposta traz o cadastro inteiro, já com a versão nova.
 */

export type PartyDetail = z.infer<typeof PartyResponse>['party']
export type PartyAddressInput = z.input<typeof PartyAddressRequest>
export type PartyContactInput = z.input<typeof PartyContactRequest>

const BASE = '/api/v1/parties'

const party = (raw: unknown): PartyDetail => PartyResponse.parse(raw).party

export const fetchParty = async (id: string, signal?: AbortSignal): Promise<PartyDetail> =>
  party(await request(`${BASE}/${id}`, { signal }))

export const updateParty = async (id: string, input: z.input<typeof UpdatePartyRequest>): Promise<PartyDetail> =>
  party(await request(`${BASE}/${id}`, { method: 'PATCH', body: UpdatePartyRequest.parse(input) }))

export const addPartyAddress = async (id: string, input: PartyAddressInput): Promise<PartyDetail> =>
  party(await request(`${BASE}/${id}/addresses`, { method: 'POST', body: PartyAddressRequest.parse(input) }))

export const updatePartyAddress = async (
  id: string,
  addressId: string,
  input: PartyAddressInput
): Promise<PartyDetail> =>
  party(
    await request(`${BASE}/${id}/addresses/${addressId}`, { method: 'PUT', body: PartyAddressRequest.parse(input) })
  )

export const removePartyAddress = async (id: string, addressId: string, version: number): Promise<PartyDetail> =>
  party(
    await request(`${BASE}/${id}/addresses/${addressId}/remove`, {
      method: 'POST',
      body: RemovePartyChildRequest.parse({ version }),
    })
  )

export const addPartyContact = async (id: string, input: PartyContactInput): Promise<PartyDetail> =>
  party(await request(`${BASE}/${id}/contacts`, { method: 'POST', body: PartyContactRequest.parse(input) }))

export const removePartyContact = async (id: string, contactId: string, version: number): Promise<PartyDetail> =>
  party(
    await request(`${BASE}/${id}/contacts/${contactId}/remove`, {
      method: 'POST',
      body: RemovePartyChildRequest.parse({ version }),
    })
  )
