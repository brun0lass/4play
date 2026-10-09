// QA local sem acesso ou gravação na produção. Escuta apenas em loopback.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const fabrics = [
  '92% poliéster 8% elastano',
  'Furadinho',
  '100% poliéster',
].map((name, i) => ({
  id: id(i + 1),
  name,
  discontinued: i === 2,
  productCount: 2,
  version: 1,
}))
const types = [
  {
    id: id(10),
    name: 'Nome e número',
    kind: 'dados',
    fields: ['nome', 'numero'],
    charge: 'por-peca',
    unitPrice: '6',
    description: null,
    productCount: 2,
    version: 1,
  },
  {
    id: id(11),
    name: 'Sem logo da 4Play',
    kind: 'opcao',
    fields: [],
    charge: 'por-peca',
    unitPrice: '3',
    description: null,
    productCount: 2,
    version: 1,
  },
  {
    id: id(12),
    name: 'Arte antecipada',
    kind: 'opcao',
    fields: [],
    charge: 'nenhuma',
    unitPrice: null,
    description: 'R$ 50,00, descontados do pedido.',
    productCount: 2,
    version: 1,
  },
]
const charts = [
  {
    id: id(20),
    name: 'Camisa polo',
    note: 'Medidas em cm',
    productIds: [id(30)],
    version: 1,
    sections: [
      {
        title: 'Adulto',
        rows: [
          { size: 'P', width: '50', height: '70' },
          { size: 'M', width: '52', height: '72' },
        ],
      },
    ],
  },
]
const pieces = ['Camisa polo', 'Camisa sem personalização'].map(
  (name, index) => ({
    id: id(30 + index),
    name,
    discontinued: false,
    personalized: index === 0,
    personalizationTypeIds: index === 0 ? types.map((t) => t.id) : [],
    sizeChartIds: [id(20)],
    version: 1,
    fabrics: fabrics.map((f, i) => ({
      fabricId: f.id,
      fabricName: f.name,
      fabricArchived: false,
      variantId: id(40 + index * 3 + i),
      cost: '20',
      tiers: [
        { minQuantity: 1, unitPrice: '89' },
        { minQuantity: 11, unitPrice: '79' },
      ],
    })),
  })
)
const rolls = [
  {
    id: id(50),
    number: 1,
    fabricId: id(1),
    fabricName: fabrics[0].name,
    color: 'Branco',
    unit: 'kg',
    initialQuantity: '20',
    remaining: '18.5',
    cost: '350',
    supplier: 'Fornecedor de teste',
    receivedOn: '2026-10-09',
    note: null,
    finishedAt: null,
    lastUseOn: '2026-10-09',
    version: 1,
  },
]
const session = {
  user: {
    id: id(99),
    email: 'qa@example.test',
    displayName: 'QA local — dados fictícios',
    isPlatformAdmin: false,
    mustChangePassword: false,
  },
  context: {
    tenantId: id(100),
    tenantName: '4Play QA',
    companyId: null,
    companyName: null,
    companyTradeName: null,
    branchId: null,
    branchName: null,
    role: 'owner',
  },
  memberships: [],
  permissions: [
    'uniforms.read',
    'uniforms.manage',
    'uniforms.write',
    'inventory.read',
    'inventory.write',
    'catalog.read',
    'sales.write',
    'party.read',
    'finance.read',
    'identity.user.read',
  ],
  features: ['uniformes'],
}
const api = {
  '/api/v1/auth/me': session,
  '/api/v1/uniforms/me': {
    userId: id(99),
    manages: true,
    functions: [],
    seesMoney: true,
  },
  '/api/v1/uniforms/members': { members: [] },
  '/api/v1/uniforms/fabrics': { fabrics },
  '/api/v1/uniforms/personalization-types': { types },
  '/api/v1/uniforms/pieces': { pieces },
  '/api/v1/uniforms/size-charts': { charts },
  '/api/v1/uniforms/rolls': { rolls },
  '/api/v1/uniforms/rolls/uses': { uses: [] },
  '/api/v1/uniforms/public/intakes/qa': {
    status: 'aberto',
    customerFirstName: 'Teste',
    needsRegistration: false,
    contactPhone: null,
    contactEmail: null,
    message: 'Cenário de teste local — não cria pedidos reais',
    showPrices: true,
    products: pieces.map((p) => ({
      id: p.id,
      name: p.name,
      unitPrice: '89',
      fabricIds: p.fabrics.map((f) => f.fabricId),
      tiers: [
        { fabricId: null, minQuantity: 1, unitPrice: '89' },
        ...p.fabrics.flatMap((f) =>
          f.tiers.map((t) => ({ ...t, fabricId: f.fabricId }))
        ),
      ],
      sizeChartIds: p.sizeChartIds,
      personalizationTypeIds: p.personalizationTypeIds,
      fields: p.personalized ? ['nome', 'numero'] : [],
    })),
    personalizationTypes: types,
    sizeCharts: charts,
    sizes: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG'],
    leadDays: 30,
    eventLeadDays: 7,
    fabrics: fabrics.slice(0, 2),
    today: '2026-10-09',
    expiresAt: '2026-10-16T12:00:00Z',
    submittedAt: null,
  },
}
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  if (path.startsWith('/api/')) {
    // Nenhuma gravação sequer na fixture: validar edição sem submeter.
    res.writeHead(req.method === 'GET' && api[path] ? 200 : 404, {
      'Content-Type': 'application/json',
    })
    res.end(
      JSON.stringify(
        api[path] ?? {
          code: 'qa_only',
          message: 'Servidor local de QA, sem gravações.',
        }
      )
    )
    return
  }
  try {
    const file =
      path.startsWith('/assets/') || path.startsWith('/brand/')
        ? resolve(root, `.${path}`)
        : resolve(root, 'index.html')
    if (!file.startsWith(root)) throw new Error('path')
    const bytes = await readFile(file)
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.svg')
            ? 'image/svg+xml'
            : file.endsWith('.png')
              ? 'image/png'
              : 'text/html',
    })
    res.end(bytes)
  } catch {
    res.writeHead(404)
    res.end()
  }
}).listen(5178, '127.0.0.1', () =>
  console.log('QA local: http://127.0.0.1:5178/produtos')
)
