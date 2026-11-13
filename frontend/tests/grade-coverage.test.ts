import assert from 'node:assert/strict'
import { test } from 'node:test'

import { missingOptions, tierPrice, uncoveredPieces } from '../src/lib/grade-coverage.ts'

const pieces = [
  { id: 'conj', name: 'Conjunto camiseta e shorts' },
  { id: 'conj-bolso', name: 'Conjunto camiseta e shorts com bolso' },
  { id: 'regata-conj', name: 'Conjunto regata ou top e shorts' },
  { id: 'manguito', name: 'Manguito (o par)' },
  { id: 'polo', name: 'Camisa polo' },
]
const charts = [
  { name: 'Camiseta masculina', productIds: ['conj', 'conj-bolso'] },
  { name: 'Camiseta feminina babylook', productIds: ['conj', 'conj-bolso'] },
  { name: 'Shorts masculino', productIds: ['conj', 'regata-conj'] },
  { name: 'Shorts feminino', productIds: ['conj', 'regata-conj'] },
  { name: 'Shorts masculino com bolso', productIds: ['conj-bolso'] },
  { name: 'Regata feminina', productIds: ['regata-conj'] },
  { name: 'Regata masculina (cavada ou machão)', productIds: ['regata-conj'] },
]
const services = ['Personalização (nome e número)', 'Arte antes do pedido']

/** O pedido #83 da Sian (11/11): 77 conjuntos de camiseta, 48 de regata e 20 manguitos na grade. */
const sian = [
  { piece: 'Camiseta masculina', quantity: 33 },
  { piece: 'Shorts masculino', quantity: 33 },
  { piece: 'Camiseta feminina babylook', quantity: 44 },
  { piece: 'Shorts feminino', quantity: 44 },
  { piece: 'Regata feminina', quantity: 20 },
  { piece: 'Shorts feminino', quantity: 20 },
  { piece: 'Regata masculina (cavada ou machão)', quantity: 28 },
  { piece: 'Shorts masculino', quantity: 28 },
  { piece: 'Manguito (o par)', quantity: 10 },
  { piece: 'Manguito (o par)', quantity: 10 },
]

test('acusa o manguito do pedido #83', () => {
  assert.deepEqual(
    uncoveredPieces({
      lines: [
        { description: 'Conjunto camiseta e shorts' },
        { description: 'Conjunto regata ou top e shorts' },
      ],
      pieces,
      charts,
      services,
      counted: sian,
    }),
    [{ piece: 'Manguito (o par)', quantity: 20 }],
  )
})

test('com o manguito nos itens, nada a acusar; frete e personalização não contam', () => {
  assert.deepEqual(
    uncoveredPieces({
      lines: [
        { description: 'Conjunto camiseta e shorts — 92/8' },
        { description: 'Conjunto regata ou top e shorts' },
        { description: 'Manguito (o par)' },
        { description: 'Personalização (nome e número)' },
        { description: 'Frete', freight: true },
      ],
      pieces,
      charts,
      services,
      counted: sian,
    }),
    [],
  )
})

test('o conjunto com bolso não cobre o shorts sem bolso só porque o nome começa igual', () => {
  assert.deepEqual(
    uncoveredPieces({
      lines: [{ description: 'Conjunto camiseta e shorts com bolso' }],
      pieces,
      charts,
      services,
      counted: [
        { piece: 'Camiseta masculina', quantity: 5 },
        { piece: 'Shorts masculino', quantity: 5 },
      ],
    }),
    [{ piece: 'Shorts masculino', quantity: 5 }],
  )
})

test('na dúvida não acusa: item de antes do catálogo, ou pedido sem item reconhecido', () => {
  assert.deepEqual(
    uncoveredPieces({
      lines: [
        { description: 'Conjunto camiseta e shorts' },
        { description: 'Camisa dry' },
      ],
      pieces,
      charts,
      services,
      counted: sian,
    }),
    null,
  )
  assert.deepEqual(
    uncoveredPieces({
      lines: [{ description: 'Frete', freight: true }],
      pieces,
      charts,
      services,
      counted: sian,
    }),
    null,
  )
})

test('nome de peça que a loja não tem mais (renomeada) não é acusado', () => {
  assert.deepEqual(
    uncoveredPieces({
      lines: [{ description: 'Conjunto camiseta e shorts' }],
      pieces,
      charts,
      services,
      counted: [
        { piece: 'Camiseta babylook', quantity: 26 },
        { piece: 'Regata feminina', quantity: 4 },
      ],
    }),
    [{ piece: 'Regata feminina', quantity: 4 }],
  )
})

test('maiúsculas e acentos não importam; personalizado sem peça não conta', () => {
  assert.deepEqual(
    uncoveredPieces({
      lines: [{ description: 'CONJUNTO CAMISETA E SHORTS' }],
      pieces,
      charts,
      services,
      counted: [
        { piece: 'camiseta masculina', quantity: 2 },
        { piece: '', quantity: 3 },
      ],
    }),
    [],
  )
})

const offers = [
  {
    id: 'manguito',
    name: 'Manguito (o par)',
    parts: [],
    fabrics: [
      {
        fabricId: 'f92',
        tiers: [
          { minQuantity: 1, unitPrice: '15.000000' },
          { minQuantity: 11, unitPrice: '12.000000' },
        ],
      },
    ],
  },
  { id: 'regata', name: 'Regata ou Top', parts: [{}], fabrics: [] },
  { id: 'regata-conj', name: 'Conjunto regata ou top e shorts', parts: [{}, {}], fabrics: [] },
]
const offerCharts = [
  { name: 'Regata feminina', productIds: ['regata', 'regata-conj'] },
  { name: 'Shorts feminino', productIds: ['regata-conj'] },
]

const manguitoTiers = [
  { minQuantity: 1, unitPrice: '15.000000' },
  { minQuantity: 11, unitPrice: '12.000000' },
]

test('cada peça que falta traz os produtos que a cobrem: a peça sozinha primeiro, o conjunto depois', () => {
  assert.deepEqual(
    missingOptions({
      missing: [
        { piece: 'Manguito (o par)', quantity: 20 },
        { piece: 'Regata feminina', quantity: 8 },
      ],
      pieces: offers,
      charts: offerCharts,
      fabricId: 'f92',
    }),
    [
      {
        piece: 'Manguito (o par)',
        quantity: 20,
        options: [{ productId: 'manguito', name: 'Manguito (o par)', kit: false, tiers: manguitoTiers }],
      },
      {
        piece: 'Regata feminina',
        quantity: 8,
        options: [
          { productId: 'regata', name: 'Regata ou Top', kit: false, tiers: null },
          { productId: 'regata-conj', name: 'Conjunto regata ou top e shorts', kit: true, tiers: null },
        ],
      },
    ],
  )
})

test('sem o tecido do pedido não há prévia de preço', () => {
  const [group] = missingOptions({
    missing: [{ piece: 'manguito (o par)', quantity: 4 }],
    pieces: offers,
    charts: offerCharts,
    fabricId: null,
  })
  assert.equal(group?.options[0]?.tiers, null)
})

test('a faixa de preço segue a quantidade escolhida', () => {
  assert.equal(tierPrice(manguitoTiers, 10), '15.000000')
  assert.equal(tierPrice(manguitoTiers, 11), '12.000000')
  assert.equal(tierPrice(manguitoTiers, 0), '15.000000')
  assert.equal(tierPrice(null, 5), null)
})

test('peça solta, sem produto ligado, não é acusada (a "CAMISA INFANTIL MASC" antiga)', () => {
  assert.deepEqual(
    uncoveredPieces({
      lines: [{ description: 'Conjunto camiseta e shorts' }],
      pieces,
      charts: [...charts, { name: 'CAMISA INFANTIL MASC', productIds: [] }],
      services,
      counted: [{ piece: 'CAMISA INFANTIL MASC', quantity: 20 }],
    }),
    [],
  )
})

test('com um item sem tabela (Camisa polo), só o nome de produto é acusado', () => {
  assert.deepEqual(
    uncoveredPieces({
      lines: [{ description: 'Camisa polo — 92/8' }],
      pieces,
      charts,
      services,
      counted: [
        { piece: 'Camiseta masculina', quantity: 20 },
        { piece: 'Manguito (o par)', quantity: 4 },
      ],
    }),
    [{ piece: 'Manguito (o par)', quantity: 4 }],
  )
})
