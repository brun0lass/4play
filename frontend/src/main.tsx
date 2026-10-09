import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'

import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { Guard } from '@/components/Guard'
import { Logo } from '@/components/Logo'
import { Shell } from '@/components/Shell'
import { ToastProvider } from '@/components/Toast'
import { ErrorBox } from '@/components/ui'
import { ApiError, UnauthenticatedError, errorMessage } from '@/lib/http'
import { ClientesPage } from '@/pages/Clientes'
import { EquipePage } from '@/pages/Equipe'
import { EstoquePage } from '@/pages/Estoque'
import { CostureirasPage } from '@/pages/Costureiras'
import { LinksPage } from '@/pages/Links'
import { OcorrenciasPage } from '@/pages/Ocorrencias'
import { ProdutosPage } from '@/pages/Produtos'
import { TabelaLojaPage } from '@/pages/TabelaLoja'
import { FichaImpressaoPage } from '@/pages/FichaImpressao'
import { FinanceiroPage } from '@/pages/Financeiro'
import { LoginPage } from '@/pages/Login'
import { LinkPedidoPage } from '@/pages/LinkPedido'
import { PainelPage } from '@/pages/Painel'
import { PedidoPage } from '@/pages/Pedido'
import { SetoresPage } from '@/pages/Setores'
import { EstatisticasPage } from '@/pages/Estatisticas'
import { ProducaoPage } from '@/pages/Producao'
import { TrocarSenhaPage } from '@/pages/TrocarSenha'

import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Recusa do servidor (4xx) não melhora tentando de novo.
      retry: (count, error) =>
        !(error instanceof UnauthenticatedError) &&
        !(error instanceof ApiError && error.status < 500) &&
        count < 2,
    },
  },
})

const Splash = () => (
  <div className="brush-bg flex h-full items-center justify-center">
    <Logo className="h-16 animate-pulse" />
  </div>
)

const RequireSession = ({ children }: { children: ReactNode }) => {
  const { status, session, error } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <Splash />
  if (status === 'error')
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorBox message={errorMessage(error)} onRetry={() => window.location.reload()} />
      </div>
    )
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (session?.user.mustChangePassword && location.pathname !== '/trocar-senha')
    return <Navigate to="/trocar-senha" replace />
  return <>{children}</>
}

/** A tela inicial de cada perfil: a produção vê o painel, o financeiro cai no financeiro. */
const Home = () => {
  const { can } = useAuth()
  if (can('uniforms.read')) return <PainelPage />
  if (can('finance.read')) return <Navigate to="/financeiro" replace />
  return <Navigate to="/clientes" replace />
}

const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    {/* O link do pedido (F232): o cliente abre sem login. */}
    <Route path="/pedido/:token" element={<LinkPedidoPage />} />
    <Route
      path="/trocar-senha"
      element={
        <RequireSession>
          <TrocarSenhaPage />
        </RequireSession>
      }
    />
    <Route
      path="/pedidos/:id/imprimir"
      element={
        <RequireSession>
          <FichaImpressaoPage />
        </RequireSession>
      }
    />
    <Route
      element={
        <RequireSession>
          <Shell />
        </RequireSession>
      }
    >
      <Route index element={<Home />} />
      <Route path="producao" element={<ProducaoPage />} />
      <Route path="pedidos" element={<Navigate to="/producao?vista=lista" replace />} />
      <Route path="pedidos/:id" element={<PedidoPage />} />
      <Route path="financeiro" element={<Guard allow={(a) => a.finance}><FinanceiroPage /></Guard>} />
      <Route path="clientes" element={<Guard allow={(a) => a.customers}><ClientesPage /></Guard>} />
      <Route path="produtos" element={<Guard allow={(a) => a.products}><ProdutosPage /></Guard>} />
      <Route path="tabela" element={<Guard allow={(a) => a.priceTable}><TabelaLojaPage /></Guard>} />
      <Route path="estoque" element={<Guard allow={(a) => a.stock}><EstoquePage /></Guard>} />
      <Route path="costureiras" element={<Guard allow={(a) => a.seamstresses}><CostureirasPage /></Guard>} />
      <Route path="links" element={<Guard allow={(a) => a.createOrder}><LinksPage /></Guard>} />
      <Route path="setores" element={<Guard allow={(a) => a.sectors}><SetoresPage /></Guard>} />
      <Route path="estatisticas" element={<Guard allow={(a) => a.sectors}><EstatisticasPage /></Guard>} />
      <Route path="ocorrencias" element={<OcorrenciasPage />} />
      <Route path="equipe" element={<Guard allow={(a) => a.team}><EquipePage /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
