import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  madeIn,
  personalizationCharges,
  priceAt,
  tiersOf,
  type OfferType,
} from '../src/lib/intake-offer.ts'

test('tecido por id e faixas nos limites; a definir usa a padrão', () => {
  const product = {
    fabricIds: ['elastano-id', 'poliester-id'],
    personalizationTypeIds: [],
    tiers: [
      { fabricId: null, minQuantity: 0, unitPrice: '55' },
      { fabricId: 'elastano-id', minQuantity: 0, unitPrice: '55' },
      { fabricId: 'elastano-id', minQuantity: 11, unitPrice: '48' },
      { fabricId: 'elastano-id', minQuantity: 51, unitPrice: '46' },
      { fabricId: 'poliester-id', minQuantity: 1, unitPrice: '45' },
    ],
  }
  assert.equal(priceAt(tiersOf(product, 'elastano-id'), 10), 55)
  assert.equal(priceAt(tiersOf(product, 'elastano-id'), 11), 48)
  assert.equal(priceAt(tiersOf(product, 'elastano-id'), 50), 48)
  assert.equal(priceAt(tiersOf(product, 'elastano-id'), 51), 46)
  assert.equal(priceAt(tiersOf(product, 'poliester-id'), 20), 45)
  assert.equal(priceAt(tiersOf(product, null), 20), 55)
  assert.equal(madeIn(product, 'novo-id'), false)
  assert.equal(madeIn(product, null), true)
  assert.equal(priceAt(tiersOf(product, 'novo-id'), 10), null)
})

const types: OfferType[] = [
  {
    id: 'dados',
    name: 'Nome e número',
    kind: 'dados',
    fields: ['nome', 'numero'],
    charge: 'por-peca',
    unitPrice: '6',
  },
  {
    id: 'logo',
    name: 'Sem logo',
    kind: 'opcao',
    fields: [],
    charge: 'por-peca',
    unitPrice: '3',
  },
  {
    id: 'pedido',
    name: 'Arte',
    kind: 'opcao',
    fields: [],
    charge: 'por-pedido',
    unitPrice: '50',
  },
  {
    id: 'gratis',
    name: 'Opção grátis',
    kind: 'opcao',
    fields: [],
    charge: 'nenhuma',
    unitPrice: null,
  },
]
test('dados só nas linhas preenchidas e opções somente na peça marcada', () => {
  const charges = personalizationCharges(types, [
    {
      typeIds: types.map((t) => t.id),
      options: ['logo', 'pedido', 'gratis'],
      rows: [
        { name: null, number: '10', quantity: 2 },
        { name: null, number: null, quantity: 10 },
      ],
    },
    {
      typeIds: ['dados', 'pedido'],
      options: ['pedido', 'logo'],
      rows: [{ name: 'Ana', number: null, quantity: 1 }],
    },
  ])
  assert.deepEqual(
    charges.map((c) => [c.type.id, c.value]),
    [
      ['dados', 18],
      ['logo', 36],
      ['pedido', 50],
    ]
  )
})
test('campo desativado não cobra; link sem preços não revela valores', () => {
  assert.deepEqual(
    personalizationCharges(
      [{ ...types[0]!, fields: ['nome'] }],
      [
        {
          typeIds: ['dados'],
          options: [],
          rows: [{ name: null, number: '2', quantity: 4 }],
        },
      ]
    ),
    []
  )
  assert.deepEqual(
    personalizationCharges(
      types.map((t) => ({ ...t, unitPrice: null })),
      [
        {
          typeIds: types.map((t) => t.id),
          options: ['logo', 'pedido'],
          rows: [{ name: 'Ana', number: '2', quantity: 4 }],
        },
      ]
    ),
    []
  )
})
