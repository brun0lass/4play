// Copia os contratos Zod do Aeris One (packages/contracts/src) para
// src/contracts/aeris — a mesma validação que o front oficial usa.
//
// Rode depois de atualizar o clone do Aeris:
//   npm run sync:contracts            (usa ../aerisone)
//   AERIS_REPO=C:/caminho npm run sync:contracts
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const repo = resolve(process.env.AERIS_REPO ?? '../aerisone')
const source = join(repo, 'packages/contracts/src')
const target = resolve('src/contracts/aeris')

if (!existsSync(source)) {
  console.error(`Não achei ${source}. Clone o Aeris ao lado (../aerisone) ou defina AERIS_REPO.`)
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
// env.ts é a validação de ambiente do SERVIDOR (lê process.env) — não vem.
const files = readdirSync(source).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'env.ts'
)
for (const file of files) cpSync(join(source, file), join(target, file))

let commit = 'desconhecido'
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim()
} catch {}
writeFileSync(
  join(target, 'VERSION.md'),
  `Copiado de aerisone/packages/contracts/src no commit ${commit} em ${new Date().toISOString()}.\n` +
    'NÃO edite à mão: rode `npm run sync:contracts`.\n'
)
console.log(`${files.length} arquivos de contrato copiados (aerisone@${commit}).`)
