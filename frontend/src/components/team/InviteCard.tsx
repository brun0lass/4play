import { Check, Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui'

/**
 * O convite pronto para mandar: o link, o e-mail e a senha temporária.
 *
 * O Aeris não envia e-mail, então quem cadastra repassa — pelo WhatsApp ou
 * copiando. A senha temporária só aparece aqui, uma vez; se perder, gera outra.
 */
export const inviteText = (name: string, email: string, password: string | null): string => {
  const first = name.trim().split(/\s+/)[0] ?? name
  const link = `${window.location.origin}/login`
  return password
    ? `Olá, ${first}! Seu acesso ao sistema da 4Play Uniformes está pronto.\n\n` +
        `Entre em: ${link}\nE-mail: ${email}\nSenha temporária: ${password}\n\n` +
        'No primeiro acesso o sistema vai pedir para você criar a sua própria senha.'
    : `Olá, ${first}! Você agora tem acesso ao sistema da 4Play Uniformes.\n\n` +
        `Entre em: ${link}\nE-mail: ${email}\n\nUse a mesma senha que você já usa no Aeris.`
}

export const InviteCard = ({
  name,
  email,
  password,
}: {
  name: string
  email: string
  password: string | null
}) => {
  const [phone, setPhone] = useState('')
  const [copied, setCopied] = useState(false)
  const text = inviteText(name, email, password)
  const digits = phone.replace(/\D/g, '')
  const wa = `https://wa.me/${digits ? (digits.startsWith('55') ? digits : `55${digits}`) : ''}?text=${encodeURIComponent(text)}`

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-ink p-4 text-white">
        <p className="text-[11px] font-bold tracking-widest text-white/50 uppercase">Dados de acesso</p>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex gap-2"><dt className="w-36 text-white/60">E-mail</dt><dd className="font-bold">{email}</dd></div>
          {password ? (
            <div className="flex items-center gap-2">
              <dt className="w-36 text-white/60">Senha temporária</dt>
              <dd className="rounded-lg bg-lime px-2 py-0.5 font-mono text-base font-extrabold tracking-wider text-ink">{password}</dd>
            </div>
          ) : (
            <div className="flex gap-2"><dt className="w-36 text-white/60">Senha</dt><dd>a que a pessoa já usa no Aeris</dd></div>
          )}
        </dl>
        {password && (
          <p className="mt-3 text-[11px] text-white/60">
            Esta senha aparece só agora. No primeiro acesso a pessoa cria a própria senha.
          </p>
        )}
      </div>

      <pre className="rounded-2xl bg-paper p-4 font-sans text-xs whitespace-pre-wrap">{text}</pre>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-44 flex-1">
          <label className="label" htmlFor="inv-phone">WhatsApp do funcionário (opcional)</label>
          <input id="inv-phone" inputMode="tel" placeholder="(31) 99999-0000" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#25D366] px-4 text-sm font-bold text-white hover:brightness-95"
        >
          <MessageCircle className="h-4 w-4" /> Mandar no WhatsApp
        </a>
        <Button
          variant="outline"
          icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? 'Copiado' : 'Copiar convite'}
        </Button>
      </div>
    </div>
  )
}
