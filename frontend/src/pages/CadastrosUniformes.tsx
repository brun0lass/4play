import type {
  PersonalizationTypeType,
  UniformFabricType,
} from '@/contracts/aeris/uniforms'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  archiveFabric,
  archivePersonalizationType,
  createFabric,
  createPersonalizationType,
  editPrice,
  fetchFabrics,
  fetchPersonalizationTypes,
  storeKeys,
  updateFabric,
  updatePersonalizationType,
} from '@/api/uniform-store'
import { useAuth } from '@/auth/AuthProvider'
import { StoreField } from '@/components/catalog/StoreFields'
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
} from '@/components/ui'
import { useToast } from '@/components/Toast'
import { money } from '@/lib/format'
import { errorMessage } from '@/lib/http'

export const TecidosPage = () => {
  const { can } = useAuth()
  const manage = can('uniforms.manage')
  const client = useQueryClient()
  const list = useQuery({
    queryKey: storeKeys.fabrics,
    queryFn: ({ signal }) => fetchFabrics(signal),
  })
  const [editing, setEditing] = useState<UniformFabricType | 'new' | null>(null)
  const remove = useMutation({
    mutationFn: (fabric: UniformFabricType) =>
      archiveFabric(fabric.id, fabric.version),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: storeKeys.fabrics })
      void client.invalidateQueries({ queryKey: storeKeys.pieces })
    },
  })
  return (
    <div>
      <PageHeader
        title="Tecidos"
        kicker="Tecidos usados pela fábrica"
        actions={
          manage && (
            <Button
              variant="lime"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setEditing('new')}
            >
              Novo tecido
            </Button>
          )
        }
      >
        <p className="mt-2 text-sm text-muted">
          Cadastre a composição ou o nome comercial. O descontinuado fica fora
          do link por padrão e pode ser escolhido pela atendente.
        </p>
      </PageHeader>
      {list.isPending && <Spinner />}
      {list.isError && <ErrorBox message={errorMessage(list.error)} />}
      {list.data?.length === 0 && (
        <Empty title="Nenhum tecido">
          <p>Cadastre o primeiro tecido para usar nos produtos e nos rolos.</p>
        </Empty>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.data?.map((fabric) => (
          <article
            key={fabric.id}
            className="card flex items-start justify-between gap-3 p-5"
          >
            <div>
              <h2 className="font-extrabold">{fabric.name}</h2>
              <p className="mt-1 text-xs text-muted">
                {fabric.productCount} produto(s) com preço neste tecido
              </p>
              {fabric.discontinued && (
                <Badge tone="warning">Descontinuado</Badge>
              )}
            </div>
            {manage && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(fabric)}
                >
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Editar {fabric.name}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  busy={remove.isPending && remove.variables.id === fabric.id}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Apagar "${fabric.name}"? Os registros antigos continuam preservados.`
                      )
                    )
                      remove.mutate(fabric)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Apagar {fabric.name}</span>
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      {remove.isError && <ErrorBox message={errorMessage(remove.error)} />}
      {editing !== null && (
        <FabricEditor
          key={editing === 'new' ? 'new' : editing.id}
          fabric={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
const FabricEditor = ({
  fabric,
  onClose,
}: {
  fabric: UniformFabricType | null
  onClose: () => void
}) => {
  const client = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(fabric?.name ?? '')
  const [discontinued, setDiscontinued] = useState(
    fabric?.discontinued ?? false
  )
  const save = useMutation({
    mutationFn: () =>
      fabric
        ? updateFabric(fabric.id, {
            name,
            discontinued,
            version: fabric.version,
          })
        : createFabric({ name, discontinued }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: storeKeys.fabrics })
      void client.invalidateQueries({ queryKey: storeKeys.pieces })
      void client.invalidateQueries({ queryKey: storeKeys.rolls })
      toast('Tecido salvo.')
      onClose()
    },
  })
  return (
    <Modal
      open
      title={fabric ? 'Editar tecido' : 'Novo tecido'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="lime"
            busy={save.isPending}
            disabled={!name.trim()}
            onClick={() => save.mutate()}
          >
            Salvar tecido
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <StoreField label="Nome / composição">
          <input
            className="field"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="92% poliéster 8% elastano"
          />
        </StoreField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={discontinued}
            onChange={(e) => setDiscontinued(e.target.checked)}
          />
          Descontinuado
        </label>
        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}

export const PersonalizacoesPage = () => {
  const { can } = useAuth()
  const manage = can('uniforms.manage')
  const client = useQueryClient()
  const list = useQuery({
    queryKey: storeKeys.types,
    queryFn: ({ signal }) => fetchPersonalizationTypes(signal),
  })
  const [editing, setEditing] = useState<
    PersonalizationTypeType | 'new' | null
  >(null)
  const remove = useMutation({
    mutationFn: (type: PersonalizationTypeType) =>
      archivePersonalizationType(type.id, type.version),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: storeKeys.types })
      void client.invalidateQueries({ queryKey: storeKeys.pieces })
    },
  })
  return (
    <div>
      <PageHeader
        title="Personalizações"
        kicker="Opções oferecidas no pedido"
        actions={
          manage && (
            <Button
              variant="lime"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setEditing('new')}
            >
              Nova personalização
            </Button>
          )
        }
      >
        <p className="mt-2 text-sm text-muted">
          Defina o que o cliente preenche ou marca, e o preço de cada tipo. Em
          Produtos, escolha quais personalizações cada peça aceita.
        </p>
      </PageHeader>
      {list.isPending && <Spinner />}
      {list.isError && <ErrorBox message={errorMessage(list.error)} />}
      {list.data?.length === 0 && (
        <Empty title="Nenhuma personalização">
          <p>
            Cadastre nome e número, opções com checkbox ou outras condições do
            pedido.
          </p>
        </Empty>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.data?.map((type) => (
          <article className="card p-5" key={type.id}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-extrabold">{type.name}</h2>
              {manage && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(type)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Editar {type.name}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    busy={remove.isPending && remove.variables.id === type.id}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Apagar "${type.name}"? Os pedidos antigos ficam preservados.`
                        )
                      )
                        remove.mutate(type)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Apagar {type.name}</span>
                  </Button>
                </div>
              )}
            </div>
            <p className="mt-2 text-sm">
              {type.kind === 'dados'
                ? `Cliente preenche: ${type.fields.join(' e ')}`
                : 'Cliente marca uma opção (checkbox)'}
            </p>
            <p className="mt-1 text-sm font-bold">
              {type.charge === 'nenhuma'
                ? 'Sem cobrança no pedido'
                : `${money(type.unitPrice)} ${type.charge === 'por-peca' ? 'por peça' : 'por pedido'}`}
            </p>
            {type.description && (
              <p className="mt-2 text-xs text-muted">{type.description}</p>
            )}
            <p className="mt-2 text-xs text-muted">
              {type.productCount} produto(s) aceitam este tipo
            </p>
          </article>
        ))}
      </div>
      {remove.isError && <ErrorBox message={errorMessage(remove.error)} />}
      {editing !== null && (
        <TypeEditor
          key={editing === 'new' ? 'new' : editing.id}
          type={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
const TypeEditor = ({
  type,
  onClose,
}: {
  type: PersonalizationTypeType | null
  onClose: () => void
}) => {
  const client = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(type?.name ?? '')
  const [kind, setKind] = useState<'dados' | 'opcao'>(type?.kind ?? 'dados')
  const [fields, setFields] = useState<('nome' | 'numero')[]>(
    type?.fields ?? ['nome', 'numero']
  )
  const [charge, setCharge] = useState<'por-peca' | 'por-pedido' | 'nenhuma'>(
    type?.charge ?? 'por-peca'
  )
  const [price, setPrice] = useState(editPrice(type?.unitPrice ?? null))
  const [description, setDescription] = useState(type?.description ?? '')
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        kind,
        fields: kind === 'dados' ? fields : [],
        charge,
        unitPrice: charge === 'nenhuma' ? null : price,
        description: description.trim() || null,
      }
      return type
        ? updatePersonalizationType(type.id, { ...body, version: type.version })
        : createPersonalizationType(body)
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: storeKeys.types })
      void client.invalidateQueries({ queryKey: storeKeys.pieces })
      toast('Personalização salva.')
      onClose()
    },
  })
  return (
    <Modal
      open
      title={type ? 'Editar personalização' : 'Nova personalização'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="lime"
            busy={save.isPending}
            disabled={
              !name.trim() ||
              (kind === 'dados' && fields.length === 0) ||
              (charge !== 'nenhuma' && !price.trim())
            }
            onClick={() => save.mutate()}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <StoreField label="Nome">
          <input
            className="field"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome e número"
          />
        </StoreField>
        <StoreField label="Como o cliente responde">
          <select
            className="field"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="dados">Preenche nome e/ou número</option>
            <option value="opcao">Marca uma opção (checkbox)</option>
          </select>
        </StoreField>
        {kind === 'dados' && (
          <div className="flex gap-4">
            {(['nome', 'numero'] as const).map((field) => (
              <label
                key={field}
                className="inline-flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={fields.includes(field)}
                  onChange={(e) =>
                    setFields((all) =>
                      e.target.checked
                        ? [...all, field]
                        : all.filter((f) => f !== field)
                    )
                  }
                />
                {field === 'nome' ? 'Nome' : 'Número'}
              </label>
            ))}
          </div>
        )}
        <StoreField label="Cobrança">
          <select
            className="field"
            value={charge}
            onChange={(e) => setCharge(e.target.value as typeof charge)}
          >
            <option value="por-peca">Por peça</option>
            <option value="por-pedido">Uma vez por pedido</option>
            <option value="nenhuma">Não cobra no pedido</option>
          </select>
        </StoreField>
        {charge !== 'nenhuma' && (
          <StoreField label="Preço (R$)">
            <input
              className="field"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="6,00"
            />
          </StoreField>
        )}
        <StoreField label="Orientação para o cliente (opcional)">
          <textarea
            className="field"
            rows={2}
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: a arte antecipada é descontada do pedido."
          />
        </StoreField>
        {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      </div>
    </Modal>
  )
}
