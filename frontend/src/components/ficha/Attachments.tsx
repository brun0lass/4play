import type { ProductionAttachmentSummaryType } from '@/contracts/aeris/uniforms.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Images, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { deleteAttachment, uploadAttachment } from '@/api/uniforms'
import { Section } from '@/components/ficha/Section'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { dateTime } from '@/lib/format'
import { errorMessage } from '@/lib/http'
import { keys } from '@/lib/queries'

/** A arte, o print do cliente, a foto da peça. As imagens vêm pela própria API. */
export const Attachments = ({
  orderId,
  attachments,
  editable,
}: {
  orderId: string
  attachments: readonly ProductionAttachmentSummaryType[]
  editable: boolean
}) => {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<ProductionAttachmentSummaryType | null>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.order(orderId) })

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await uploadAttachment(orderId, file)
    },
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: (attachmentId: string) => deleteAttachment(orderId, attachmentId),
    onSuccess: () => setViewing(null),
    onSettled: refresh,
  })

  return (
    <Section
      title="Imagens"
      icon={<Images className="h-3.5 w-3.5" />}
      aside={
        editable && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])]
                event.target.value = ''
                if (files.length > 0) upload.mutate(files)
              }}
            />
            <Button
              size="sm"
              variant="outline"
              busy={upload.isPending}
              icon={<ImagePlus className="h-4 w-4" />}
              onClick={() => input.current?.click()}
            >
              Enviar imagem
            </Button>
          </>
        )
      }
    >
      {upload.isError && <div className="mb-3"><ErrorBox message={errorMessage(upload.error)} /></div>}
      {attachments.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma imagem. Mande a arte aprovada e os prints do cliente.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {attachments.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setViewing(attachment)}
              className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-paper"
            >
              <img
                src={attachment.thumbUrl}
                alt={attachment.caption ?? 'Imagem do pedido'}
                loading="lazy"
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      )}

      <Modal
        open={viewing !== null}
        title="Imagem do pedido"
        wide
        onClose={() => setViewing(null)}
        footer={
          viewing && (
            <>
              <span className="mr-auto self-center text-xs text-muted">
                Enviada {dateTime(viewing.createdAt)}
              </span>
              <a href={viewing.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full px-4 text-sm font-bold hover:bg-black/5">
                Abrir original
              </a>
              {editable && (
                <Button
                  variant="danger"
                  busy={remove.isPending}
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => remove.mutate(viewing.id)}
                >
                  Tirar
                </Button>
              )}
            </>
          )
        }
      >
        {viewing && (
          <img src={viewing.url} alt={viewing.caption ?? ''} className="mx-auto max-h-[65vh] rounded-xl" />
        )}
        {remove.isError && <div className="mt-3"><ErrorBox message={errorMessage(remove.error)} /></div>}
      </Modal>
    </Section>
  )
}
