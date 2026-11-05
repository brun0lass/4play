import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hideLinkToken,
  linkRef,
  linkTokenOf,
  maskSensitiveText,
  prepareEvent,
} from '../src/lib/analytics-privacy.ts'

const TOKEN = 'k7Hq_2Zr-9XbLm3PwT8vYc4NfD1sRa6u'
const ORIGIN = 'https://app.4play.example'

test('o token some da URL da página, da API e do texto do WhatsApp', () => {
  assert.equal(hideLinkToken(`${ORIGIN}/pedido/${TOKEN}?x=1`), `${ORIGIN}/pedido/:token?x=1`)
  assert.equal(
    hideLinkToken(`/api/v1/uniforms/public/intakes/${TOKEN}`),
    '/api/v1/uniforms/public/intakes/:token'
  )
  const whatsapp = encodeURIComponent(`Oi! Monte por aqui: ${ORIGIN}/pedido/${TOKEN}`)
  assert.ok(!hideLinkToken(whatsapp).includes(TOKEN))
})

test('a tela de pedidos da equipe não é confundida com o link', () => {
  const order = `${ORIGIN}/pedidos/0193a8f2-7c11-7d2e-8f00-1234567890ab`
  assert.equal(hideLinkToken(order), order)
  assert.equal(linkTokenOf(order), null)
  assert.equal(linkTokenOf(`${ORIGIN}/pedido/${TOKEN}`), TOKEN)
})

test('CPF, CNPJ, telefone, e-mail e CEP viram asteriscos, com ou sem pontuação', () => {
  const cases = [
    ['CPF 123.456.789-09', 'CPF ***.***.***-**'],
    ['12345678909', '***********'],
    ['35.776.002/0001-51', '**.***.***/****-**'],
    ['(11) 98888-7777', '(**) *****-****'],
    ['11988887777', '***********'],
    ['+55 11 98888-7777', '+** ** *****-****'],
    ['5511988887777', '*************'],
    ['maria.silva@time.com.br', '*****.*****@****.***.**'],
    ['01310-100', '*****-***'],
  ] as const
  for (const [input, expected] of cases) assert.equal(maskSensitiveText(input), expected, input)
})

test('o que a equipe precisa ver na gravação continua igual', () => {
  for (const text of ['Pedido #3312', 'R$ 12.345,67', '05/11/2026 10:30', '2026-11-05', '81 conjuntos', 'Camisa M']) {
    assert.equal(maskSensitiveText(text), text)
  }
})

test('o resumo é estável, não contém o token e muda de um link para outro', () => {
  assert.equal(linkRef(TOKEN), linkRef(TOKEN))
  assert.notEqual(linkRef(TOKEN), linkRef(`${TOKEN}x`))
  assert.ok(!TOKEN.includes(linkRef(TOKEN)))
})

test('o evento do link sai marcado e sem o token em lugar nenhum', () => {
  const url = `${ORIGIN}/pedido/${TOKEN}`
  const event = prepareEvent({
    event: '$$heatmap',
    properties: {
      $current_url: url,
      $pathname: `/pedido/${TOKEN}`,
      $session_entry_url: url,
      $heatmap_data: { [url]: [{ x: 1, y: 2 }] },
    },
    $set_once: { $initial_current_url: url },
  })
  assert.ok(event)
  assert.equal(event.properties.area, 'link_cliente')
  assert.equal(event.properties.link_ref, linkRef(TOKEN))
  assert.equal(event.properties.$pathname, '/pedido/:token')
  assert.ok(!JSON.stringify(event).includes(TOKEN))
})

test('o texto do clique é limpo, mas os ids do PostHog não são alterados', () => {
  const event = prepareEvent({
    properties: {
      $current_url: `${ORIGIN}/clientes`,
      $el_text: 'Maria (11) 98888-7777',
      $elements_chain: 'a:text="123.456.789-09"',
      $device_id: '11988887777',
      $session_id: '12345678909',
    },
  })
  assert.ok(event)
  assert.equal(event.properties.area, 'sistema')
  assert.equal(event.properties.link_ref, undefined)
  assert.equal(event.properties.$el_text, 'Maria (**) *****-****')
  assert.equal(event.properties.$elements_chain, 'a:text="***.***.***-**"')
  assert.equal(event.properties.$device_id, '11988887777')
  assert.equal(event.properties.$session_id, '12345678909')
})

test('a gravação passa sem ser percorrida e o evento descartado continua descartado', () => {
  const snapshot = [{ type: 2, data: `/pedido/${TOKEN}` }]
  const event = prepareEvent({ properties: { $snapshot_data: snapshot } })
  assert.equal(event?.properties.$snapshot_data, snapshot)
  assert.equal(prepareEvent(null), null)
})
