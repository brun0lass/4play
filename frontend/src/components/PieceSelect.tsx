import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { createSizeChart } from '@/api/uniforms'
import { useAuth } from '@/auth/AuthProvider'
import { Button, ErrorBox, Modal } from '@/components/ui'
import { errorMessage } from '@/lib/http'
import { usePieceNames } from '@/lib/queries'

const NEW = '__nova-peca__'

/** Os tamanhos de uma peça nova; as medidas ficam em branco até alguém pôr. */
const NEW_PIECE_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXG']

/**
 * A peça escolhida da lista de "Peças e medidas", em vez de escrita.
 *
 * O que já está gravado continua como está: um nome que não está na lista
 * ("Camisa", "BABYLOOK" de antes) aparece como opção da própria linha e é
 * gravado igual — a grade, as levas e os setores contam pela peça escrita, e
 * trocar o texto por baixo mudaria essas contas.
 */
export const PieceSelect = ({
  value,
  onChange,
  disabled,
  className,
  id,
  placeholder = 'Escolha a peça',
}: {
  value: string
  onChange: (piece: string) => void
  disabled?: boolean
  className?: string
  id?: string
  placeholder?: string
}) => {
  const { can } = useAuth()
  const pieces = usePieceNames()
  const [creating, setCreating] = useState(false)
  const names = pieces.data ?? []
  const legacy = value.trim() !== '' && !names.includes(value)

  return (
    <>
      <select
        id={id}
        className={clsx('field', className)}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          if (e.target.value === NEW) setCreating(true)
          else onChange(e.target.value)
        }}
      >
        <option value="">{pieces.isPending ? 'Carregando…' : placeholder}</option>
        {legacy && <option value={value}>{value}</option>}
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {can('uniforms.manage') && <option value={NEW}>+ Cadastrar peça…</option>}
      </select>
      <NewPieceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false)
          onChange(name)
        }}
      />
    </>
  )
}

const NewPieceDialog = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string) => void }) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () =>
      createSizeChart({
        name: name.trim(),
        note: null,
        sections: [{ title: null, rows: NEW_PIECE_SIZES.map((size) => ({ size, width: null, height: null })) }],
      }),
    onSuccess: (chart) => {
      void queryClient.invalidateQueries({ queryKey: ['size-charts'] })
      setName('')
      onCreated(chart.name.slice(0, 40))
    },
  })
  const close = () => {
    setName('')
    create.reset()
    onClose()
  }
  return (
    <Modal
      open={open}
      title="Nova peça"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="lime" icon={<Plus className="h-4 w-4" />} busy={create.isPending} disabled={name.trim() === ''} onClick={() => create.mutate()}>
            Cadastrar
          </Button>
        </>
      }
    >
      <label className="block">
        <span className="label">Nome da peça</span>
        <input
          autoFocus
          className="field"
          maxLength={40}
          placeholder="Camiseta masculina"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim() !== '') create.mutate()
          }}
        />
      </label>
      <p className="mt-2 text-xs text-muted">
        A peça entra em <strong>Peças e medidas</strong> com os tamanhos PP a EXG, sem medidas. Ponha as medidas lá quando quiser que o cliente as veja no
        link.
      </p>
      {create.isError && <ErrorBox message={errorMessage(create.error)} />}
    </Modal>
  )
}
