import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * O front da 4Play fala com o backend do Aeris One pela MESMA origem.
 *
 * A API do Aeris autentica por cookie de sessão (`SameSite=Lax`, sem CORS
 * para origens de fora — ver `docs/DEPLOYMENT.md` do Aeris). Por isso o
 * navegador nunca chama `aerisone.com.br` direto: o Vite encaminha `/api`
 * para lá, e em produção o nginx deste front faz o mesmo (`deploy/nginx.conf`).
 */
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.AERIS_API_TARGET ?? 'https://aerisone.com.br'

  const apiProxy = {
    '/api': {
      target,
      changeOrigin: true,
      secure: true,
      // O cookie volta sem domínio, para ficar no localhost.
      cookieDomainRewrite: '',
      configure: (proxy: { on: (event: string, handler: (req: { removeHeader: (name: string) => void }) => void) => void }) => {
        // Quem chama é o proxy, não um site de fora: a origem do localhost
        // não está na lista de CORS do Aeris e não precisa estar.
        proxy.on('proxyReq', (req) => {
          req.removeHeader('origin')
          req.removeHeader('referer')
        })
      },
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': here('./src'),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: apiProxy,
    },
    preview: { port: 4174, strictPort: true, proxy: apiProxy },
    build: { target: 'es2022', sourcemap: true },
  }
})
