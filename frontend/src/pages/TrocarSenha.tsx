import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { changePassword } from '@/api/auth'
import { SESSION_KEY, useAuth } from '@/auth/AuthProvider'
import { CoBrand } from '@/components/CoBrand'
import { Button, ErrorBox } from '@/components/ui'
import { errorMessage } from '@/lib/http'

/** O primeiro acesso com senha temporária pede uma senha nova. */
export const TrocarSenhaPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const firstName = session?.user.displayName.split(' ')[0] ?? ''
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')

  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword: current, newPassword: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY })
      void navigate('/', { replace: true })
    },
  })

  const mismatch = again !== '' && again !== next

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!mismatch) mutation.mutate()
  }

  return (
    <div className="brush-bg flex min-h-full items-center justify-center px-4 py-12">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8">
        <div className="mb-6 flex justify-center rounded-2xl bg-[#07123a] px-4 py-5">
          <CoBrand size="sm" />
        </div>
        <h1 className="display text-3xl">Crie sua senha</h1>
        <p className="mt-2 mb-6 text-sm text-muted">
          Bem-vindo(a) à 4Play{firstName ? `, ${firstName}` : ''}! Você entrou com uma senha temporária. Agora crie uma senha só sua
          para os próximos acessos.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="cur">Senha temporária (a que você recebeu)</label>
            <input id="cur" type="password" autoComplete="current-password" required className="field" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="new">Sua senha nova (mínimo 12 caracteres)</label>
            <input id="new" type="password" autoComplete="new-password" required minLength={12} className="field" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="again">Repita a senha nova</label>
            <input id="again" type="password" autoComplete="new-password" required className="field" value={again} onChange={(e) => setAgain(e.target.value)} />
            {mismatch && <p className="mt-1 text-xs font-bold text-red-600">As duas não conferem.</p>}
          </div>
          {mutation.isError && <ErrorBox message={errorMessage(mutation.error)} />}
          <Button type="submit" variant="lime" size="lg" className="w-full" busy={mutation.isPending} disabled={mismatch}>
            Criar senha e entrar
          </Button>
        </div>
      </form>
    </div>
  )
}
