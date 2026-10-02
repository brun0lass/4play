import { useMutation } from '@tanstack/react-query'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'

import { login } from '@/api/auth'
import { useAuth } from '@/auth/AuthProvider'
import { CoBrand } from '@/components/CoBrand'
import { LightningBackdrop } from '@/components/Lightning'
import { Button, ErrorBox } from '@/components/ui'
import { ApiError, errorMessage } from '@/lib/http'

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha não conferem.',
  too_many_attempts: 'Muitas tentativas. Espere um pouco e tente de novo.',
  no_membership: 'Este usuário não tem acesso a nenhuma loja.',
  account_suspended: 'Esta conta está suspensa. Fale com o suporte do Aeris.',
}

export const LoginPage = () => {
  const { status, setSession } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => setSession(session),
  })

  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate({ email: email.trim(), password })
  }

  const error = mutation.error
  const message =
    error instanceof ApiError ? (LOGIN_ERRORS[error.code] ?? error.message) : error && errorMessage(error)

  return (
    <div className="grid min-h-full lg:grid-cols-[1.15fr_1fr]">
      {/* Lado da marca */}
      <section className="relative hidden flex-col items-center justify-between overflow-hidden p-12 text-white lg:flex">
        <LightningBackdrop />
        <span className="relative text-[11px] font-bold tracking-[0.3em] text-white/50 uppercase">
          Central de produção
        </span>
        <div className="relative flex flex-col items-center text-center">
          <CoBrand size="lg" />
          <p className="mt-10 max-w-md text-lg font-medium text-white/75">
            Da arte aprovada à peça embalada, num quadro só. O sistema de gestão da 4Play, por{' '}
            <strong className="font-extrabold text-white">Aeris One</strong>.
          </p>
        </div>
        <div className="relative flex gap-8 text-xs font-bold tracking-[0.2em] text-white/50 uppercase">
          <span>Arte</span>
          <span>Impressão</span>
          <span>Corte</span>
          <span>Costura</span>
          <span className="text-lime">Pronto</span>
        </div>
      </section>

      {/* Formulário */}
      <section className="relative flex flex-col items-center justify-center bg-ink px-6 py-12 lg:bg-white">
        <LightningBackdrop className="lg:hidden" />
        <div className="relative w-full max-w-sm">
          <CoBrand size="md" className="mb-10 lg:hidden" />
          <h1 className="display text-4xl text-white lg:text-ink">Entrar</h1>
          <p className="mt-2 mb-8 text-sm font-medium text-white/60 lg:text-muted">
            Use o seu acesso do Aeris One.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label lg:text-muted">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field h-12"
                placeholder="voce@4playuniformes.com.br"
              />
            </div>
            <div>
              <label htmlFor="password" className="label">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="field h-12 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  className="absolute inset-y-0 right-0 px-4 text-muted hover:text-ink"
                  aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {message && <ErrorBox message={message} />}

            <Button
              type="submit"
              variant="lime"
              size="lg"
              busy={mutation.isPending}
              className="w-full"
            >
              Entrar agora <ArrowRight className="h-5 w-5" />
            </Button>
          </form>

          <p className="mt-10 text-center text-xs font-medium text-white/40 lg:text-muted">
            4Play Uniformes · CNPJ 35.776.002/0001-51
            <br />
            Sistema sobre o Aeris One
          </p>
        </div>
      </section>
    </div>
  )
}
