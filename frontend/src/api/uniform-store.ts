import * as U from '@/contracts/aeris/uniforms'
import { qs, request } from '@/lib/http'

const BASE = '/api/v1/uniforms'
export const storeKeys = {
  fabrics: ['uniform-fabrics'],
  pieces: ['uniform-pieces'],
  types: ['personalization-types'],
  rolls: ['fabric-rolls'],
  uses: ['roll-uses'],
} as const

export const fetchFabrics = async (signal?: AbortSignal) =>
  U.UniformFabricListResponse.parse(
    await request(`${BASE}/fabrics`, { signal })
  ).fabrics
export const createFabric = async (body: U.CreateUniformFabricBody) =>
  U.UniformFabricResponse.parse(
    await request(`${BASE}/fabrics`, {
      method: 'POST',
      body: U.CreateUniformFabricRequest.parse(body),
    })
  ).fabric
export const updateFabric = async (
  id: string,
  body: U.UpdateUniformFabricBody
) =>
  U.UniformFabricResponse.parse(
    await request(`${BASE}/fabrics/${id}`, {
      method: 'PUT',
      body: U.UpdateUniformFabricRequest.parse(body),
    })
  ).fabric
export const archiveFabric = async (id: string, version: number) => {
  await request(`${BASE}/fabrics/${id}/archive`, {
    method: 'POST',
    body: { version },
  })
}

export const fetchPersonalizationTypes = async (signal?: AbortSignal) =>
  U.PersonalizationTypeListResponse.parse(
    await request(`${BASE}/personalization-types`, { signal })
  ).types
export const createPersonalizationType = async (
  body: U.CreatePersonalizationTypeBody
) =>
  U.PersonalizationTypeResponse.parse(
    await request(`${BASE}/personalization-types`, {
      method: 'POST',
      body: U.CreatePersonalizationTypeRequest.parse(body),
    })
  ).type
export const updatePersonalizationType = async (
  id: string,
  body: U.UpdatePersonalizationTypeBody
) =>
  U.PersonalizationTypeResponse.parse(
    await request(`${BASE}/personalization-types/${id}`, {
      method: 'PUT',
      body: U.UpdatePersonalizationTypeRequest.parse(body),
    })
  ).type
export const archivePersonalizationType = async (
  id: string,
  version: number
) => {
  await request(`${BASE}/personalization-types/${id}/archive`, {
    method: 'POST',
    body: { version },
  })
}

export const fetchPieces = async (signal?: AbortSignal) =>
  U.UniformPieceListResponse.parse(await request(`${BASE}/pieces`, { signal }))
    .pieces
export const savePiece = async (id: string | null, body: U.SavePieceBody) =>
  U.UniformPieceResponse.parse(
    await request(`${BASE}/pieces${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: U.SavePieceRequest.parse(body),
    })
  ).piece
export const archivePiece = async (id: string, version: number) => {
  await request(`${BASE}/pieces/${id}/archive`, {
    method: 'POST',
    body: { version },
  })
}

export const fetchRolls = async (
  status: 'abertos' | 'acabados',
  signal?: AbortSignal
) =>
  U.FabricRollListResponse.parse(
    await request(`${BASE}/rolls${qs({ status })}`, { signal })
  ).rolls
export const createRoll = async (body: U.CreateFabricRollBody) =>
  U.FabricRollListResponse.parse(
    await request(`${BASE}/rolls`, {
      method: 'POST',
      body: U.CreateFabricRollRequest.parse(body),
    })
  ).rolls
export const updateRoll = async (id: string, body: U.UpdateFabricRollBody) =>
  U.FabricRollResponse.parse(
    await request(`${BASE}/rolls/${id}`, {
      method: 'PUT',
      body: U.UpdateFabricRollRequest.parse(body),
    })
  ).roll
export const archiveRoll = async (id: string, version: number) => {
  await request(`${BASE}/rolls/${id}/archive`, {
    method: 'POST',
    body: { version },
  })
}
export const saveRollDayUse = async (body: U.RollDayUseBody) => {
  await request(`${BASE}/rolls/day-use`, {
    method: 'POST',
    body: U.RollDayUseRequest.parse(body),
  })
}
export const fetchRollUses = async (day: string, signal?: AbortSignal) =>
  U.RollUseListResponse.parse(
    await request(`${BASE}/rolls/uses${qs({ day })}`, { signal })
  ).uses

/** O preço volta com seis casas; os formulários da loja editam centavos. */
export const editPrice = (value: string | null) =>
  value === null ? '' : Number(value).toFixed(2).replace('.', ',')
