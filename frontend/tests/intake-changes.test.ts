import { test } from 'node:test'
import assert from 'node:assert/strict'
import { intakeChanges, type IntakeSent } from '../src/lib/intake-changes.ts'

const camiseta = {
  productId: 'camiseta',
  productName: 'Camiseta',
  color: null,
  kit: null,
  options: [],
  rows: [
    { size: 'M', quantity: 3, name: null, number: null },
    { size: 'G', quantity: 1, name: 'Ana', number: '10' },
  ],
}
const sent: IntakeSent = {
  items: [camiseta],
  notes: null,
  event: null,
  fabricName: '92% poliéster',
  fabricFinish: 'Liso',
}

test('sem mudança nenhuma, nada para mostrar', () => {
  assert.deepEqual(intakeChanges(sent, structuredClone(sent)), [])
})

test('quantidade, pessoa, cor e opção mudadas na mesma peça', () => {
  const changes = intakeChanges(sent, {
    ...sent,
    items: [
      {
        ...camiseta,
        color: 'Azul',
        options: [{ id: 'x', name: 'Sem o logo' }],
        rows: [
          { size: 'M', quantity: 5, name: null, number: null },
          { size: 'P', quantity: 1, name: 'Beto', number: null },
        ],
      },
    ],
  })
  assert.deepEqual(changes, [
    {
      title: 'Camiseta',
      lines: [
        'M sem nome: 3 → 5',
        '+ 1 × P · Beto',
        '− 1 × G · Ana 10',
        'Cor: a loja define → Azul',
        '+ Sem o logo',
      ],
    },
  ])
})

test('peça que entrou e peça que saiu', () => {
  const changes = intakeChanges(sent, {
    ...sent,
    items: [
      {
        productId: 'conjunto',
        productName: 'Conjunto',
        color: null,
        options: [],
        rows: [],
        kit: {
          people: [
            {
              quantity: 1,
              pieces: [
                { piece: 'Camiseta', size: 'P', name: 'Amanda', number: '22' },
                { piece: 'Shorts', size: 'M', name: null, number: null },
              ],
            },
          ],
          counts: [{ piece: 'Camiseta', size: 'G', quantity: 2 }],
        },
      },
    ],
  })
  assert.deepEqual(changes, [
    {
      title: 'Conjunto — entrou',
      lines: ['+ 1 × Camiseta P · Amanda 22 + Shorts M', '+ 2 × Camiseta G sem nome'],
    },
    { title: 'Camiseta — saiu', lines: ['− 3 × M sem nome', '− 1 × G · Ana 10'] },
  ])
})

test('tecido, data e observação ficam em "O pedido"', () => {
  const changes = intakeChanges(sent, {
    ...sent,
    fabricFinish: 'Furadinho',
    event: { date: '2026-11-18', name: 'Copa' },
    notes: 'Gola polo',
  })
  assert.deepEqual(changes, [
    {
      title: 'O pedido',
      lines: [
        'Tecido: 92% poliéster · Liso → 92% poliéster · Furadinho',
        'Para quando: sem evento → evento em 18/11/2026 (Copa)',
        'Observação: nenhuma → Gola polo',
      ],
    },
  ])
})
