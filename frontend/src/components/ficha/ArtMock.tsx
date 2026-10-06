import type { ProductionAttachmentSummaryType } from '@/contracts/aeris/uniforms.ts'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, Palette } from 'lucide-react'
import { useState } from 'react'

import { Section } from '@/components/ficha/Section'
import { Modal } from '@/components/ui'
import { dateTime } from '@/lib/format'

/**
 * O mock da arte, sempre à vista (pedido do dono da 4Play, 06/10): fica em
 * cima da linha do tempo, em qualquer aba da ficha, para quem estiver
 * trabalhando no pedido não se perder.
 *
 * A imagem mais nova é a grande — costuma ser a última versão da arte; as
 * outras ficam em miniatura. Enviar e tirar imagem continua na aba Arte.
 */
export const ArtMock = ({
  attachments,
  onGoToArt,
}: {
  attachments: readonly ProductionAttachmentSummaryType[]
  onGoToArt: () => void
}) => {
  const newestFirst = [...attachments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [open, setOpen] = useState<number | null>(null)
  const main = newestFirst[0]
  const viewing = open === null ? null : newestFirst[open]

  return (
    <Section title="Mock da arte" icon={<Palette className="h-3.5 w-3.5" />}>
      {main === undefined ? (
        <p className="text-sm text-muted">
          Ainda sem imagem.{' '}
          <button type="button" onClick={onGoToArt} className="font-bold underline">
            Enviar na aba Arte
          </button>
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen(0)}
            className="block w-full overflow-hidden rounded-2xl border border-line bg-paper"
            title="Ver maior"
          >
            <img src={main.url} alt={main.caption ?? 'Mock da arte'} className="max-h-72 w-full object-contain" />
          </button>
          {newestFirst.length > 1 && (
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {newestFirst.slice(1, 10).map((attachment, index) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => setOpen(index + 1)}
                  className="aspect-square overflow-hidden rounded-lg border border-line bg-paper"
                >
                  <img src={attachment.thumbUrl} alt={attachment.caption ?? 'Imagem do pedido'} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={viewing !== null && viewing !== undefined}
        wide
        title="Mock da arte"
        onClose={() => setOpen(null)}
        footer={
          viewing && (
            <>
              <span className="mr-auto self-center text-xs text-muted">
                {open === 0 ? 'A mais recente · ' : ''}enviada {dateTime(viewing.createdAt)}
              </span>
              <a href={viewing.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full px-4 text-sm font-bold hover:bg-black/5">
                Abrir original
              </a>
            </>
          )
        }
      >
        {viewing && open !== null && (
          <div className="relative">
            <img src={viewing.url} alt={viewing.caption ?? ''} className="mx-auto max-h-[65vh] rounded-xl" />
            {newestFirst.length > 1 && (
              <>
                <NavButton side="left" disabled={open === 0} onClick={() => setOpen(open - 1)} />
                <NavButton side="right" disabled={open === newestFirst.length - 1} onClick={() => setOpen(open + 1)} />
              </>
            )}
          </div>
        )}
      </Modal>
    </Section>
  )
}

const NavButton = ({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    aria-label={side === 'left' ? 'Imagem anterior' : 'Próxima imagem'}
    className={clsx(
      'absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-lime shadow disabled:opacity-20',
      side === 'left' ? 'left-2' : 'right-2'
    )}
  >
    {side === 'left' ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
  </button>
)
