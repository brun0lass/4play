import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Empty, Spinner } from '@/components/ui'
import { useAccess, type Access } from '@/lib/access'

/**
 * A tela que esta pessoa não usa — quem digita o endereço direto cai aqui em
 * vez de ver dados que não são do trabalho dela.
 */
export const Guard = ({ allow, children }: { allow: (a: Access) => boolean; children: ReactNode }) => {
  const access = useAccess()
  if (!access.ready) return <Spinner />
  if (allow(access)) return <>{children}</>
  return (
    <Empty title="Esta tela não é da sua função">
      <p className="flex items-center justify-center gap-1.5">
        <Lock className="h-4 w-4" /> Fale com o dono ou o gerente se precisar dela.
      </p>
      <Link to="/" className="mt-4 inline-block font-bold text-ink underline">Voltar ao início</Link>
    </Empty>
  )
}
