import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Access } from '../src/lib/access.ts'
import {
  activeSidebarGroup,
  GROUPED_NAV,
  matchesNavPath,
  parseSidebarGroups,
  PRIMARY_NAV,
  visibleNavigation,
} from '../src/lib/sidebar-navigation.ts'

const access = (overrides: Partial<Access> = {}): Access => ({
  ready: true,
  isManager: false,
  isFinance: false,
  functions: [],
  seeMoney: false,
  createOrder: false,
  customers: false,
  products: false,
  stock: false,
  finance: false,
  team: false,
  seamstresses: false,
  priceTable: false,
  sectors: false,
  manageSeamstresses: false,
  homeTab: 'atendimento',
  ...overrides,
})

test('preserva os 15 destinos uma vez cada, sem alterar URLs', () => {
  const destinations = [
    ...PRIMARY_NAV,
    ...GROUPED_NAV.flatMap((group) => group.items),
  ].map((item) => item.to)
  assert.equal(new Set(destinations).size, 15)
  assert.deepEqual(
    [...destinations].sort(),
    [
      '/',
      '/producao',
      '/setores',
      '/estatisticas',
      '/links',
      '/ocorrencias',
      '/financeiro',
      '/clientes',
      '/produtos',
      '/tecidos',
      '/personalizacoes',
      '/tabela',
      '/estoque',
      '/costureiras',
      '/equipe',
    ].sort()
  )
})

test('atendimento não ganha estoque, setores ou administração', () => {
  const nav = visibleNavigation(
    access({
      createOrder: true,
      customers: true,
      products: true,
      priceTable: true,
    }),
    (permission) => permission === 'uniforms.read'
  )
  assert.deepEqual(
    nav.primary.map((item) => item.to),
    ['/', '/producao', '/clientes', '/links']
  )
  assert.deepEqual(
    nav.groups
      .find((group) => group.id === 'production')
      ?.items.map((item) => item.to),
    ['/ocorrencias']
  )
  assert.equal(
    nav.groups.find((group) => group.id === 'catalog')?.items.length,
    4
  )
  assert.equal(
    nav.groups.some((group) => group.id === 'administration'),
    false
  )
})

test('operador não ganha cadastros comerciais ou valores', () => {
  const nav = visibleNavigation(
    access({ stock: true, sectors: true, seamstresses: true }),
    (permission) => permission === 'uniforms.read'
  )
  assert.deepEqual(
    nav.primary.map((item) => item.to),
    ['/', '/producao']
  )
  assert.deepEqual(
    nav.groups.map((group) => group.id),
    ['production']
  )
  assert.equal(nav.groups[0]?.items.length, 5)
})

test('financeiro e carregamento não mostram grupos vazios', () => {
  const nav = visibleNavigation(
    access({ finance: true, customers: true }),
    () => false
  )
  assert.deepEqual(
    nav.primary.map((item) => item.to),
    ['/clientes', '/financeiro']
  )
  assert.deepEqual(nav.groups, [])
  assert.deepEqual(
    visibleNavigation(access({ ready: false }), () => true),
    { primary: [], groups: [] }
  )
})

test('grupo ativo cobre página e subrota, sem casar prefixos semelhantes', () => {
  assert.equal(activeSidebarGroup('/produtos'), 'catalog')
  assert.equal(activeSidebarGroup('/tabela/editar'), 'catalog')
  assert.equal(activeSidebarGroup('/estoque'), 'production')
  assert.equal(activeSidebarGroup('/equipe'), 'administration')
  assert.equal(activeSidebarGroup('/producao'), null)
  assert.equal(matchesNavPath('/produtos-outro', '/produtos'), false)
  assert.equal(matchesNavPath('/clientes', '/'), false)
})

test('preferência tolera armazenamento ausente, inválido e versões diferentes', () => {
  const closed = { production: false, catalog: false, administration: false }
  for (const raw of [null, '{bad', 'null', '5', '[]'])
    assert.deepEqual(parseSidebarGroups(raw), closed)
  assert.deepEqual(
    parseSidebarGroups(
      '{"production":true,"catalog":"true","administration":false,"unknown":true}'
    ),
    { ...closed, production: true }
  )
  const preference = { production: true, catalog: true, administration: false }
  assert.deepEqual(parseSidebarGroups(JSON.stringify(preference)), preference)
})
