import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, Minus, Pencil, Trash2 } from 'lucide-react'
import type { FabricRollType } from '@/contracts/aeris/uniforms'
import {
  archiveRoll,
  createRoll,
  editPrice,
  fetchFabrics,
  fetchRolls,
  fetchRollUses,
  saveRollDayUse,
  storeKeys,
  updateRoll,
} from '@/api/uniform-store'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toast'
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
} from '@/components/ui'
import {
  StoreField,
  decimal,
  todayLocal,
} from '@/components/catalog/StoreFields'
import { day, money } from '@/lib/format'
import { errorMessage } from '@/lib/http'

const amount = (value: string) =>
  Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export const EstoquePage = () => {
  const { can } = useAuth()
  const manage = can('inventory.write')
  const client = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<'abertos' | 'acabados'>('abertos')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<FabricRollType | 'new' | null>(null)
  const [using, setUsing] = useState(false)
  const [historyDay, setHistoryDay] = useState(todayLocal)
  const rolls = useQuery({
    queryKey: [...storeKeys.rolls, status],
    queryFn: ({ signal }) => fetchRolls(status, signal),
  })
  const history = useQuery({
    queryKey: [...storeKeys.uses, historyDay],
    queryFn: ({ signal }) => fetchRollUses(historyDay, signal),
    enabled: historyDay !== '',
  })
  const refresh = () => {
    void client.invalidateQueries({ queryKey: storeKeys.rolls })
    void client.invalidateQueries({ queryKey: storeKeys.uses })
  }
  const archive = useMutation({
    mutationFn: (roll: FabricRollType) => archiveRoll(roll.id, roll.version),
    onSuccess: () => {
      toast('Rolo arquivado. O histórico foi preservado.')
      refresh()
    },
  })
  const visible =
    rolls.data?.filter((roll) =>
      `${roll.number} ${roll.fabricName} ${roll.color ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR'))
    ) ?? []
  return (
    <div>
      <PageHeader
        title="Estoque de tecidos"
        kicker="Cada rolo tem seu próprio saldo"
        actions={
          manage && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                icon={<Minus className="h-4 w-4" />}
                onClick={() => setUsing(true)}
              >
                Baixa do dia
              </Button>
              <Button
                variant="lime"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setEditing('new')}
              >
                Entrada de rolos
              </Button>
            </div>
          )
        }
      >
        <p className="mt-2 text-sm text-muted">
          Cadastre os rolos recebidos em kg ou metros. No fim do dia, registre
          quanto saiu de cada rolo.
        </p>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant={status === 'abertos' ? 'ink' : 'outline'}
          onClick={() => setStatus('abertos')}
        >
          Em uso
        </Button>
        <Button
          variant={status === 'acabados' ? 'ink' : 'outline'}
          onClick={() => setStatus('acabados')}
        >
          Acabados
        </Button>
        <input
          className="field max-w-sm"
          placeholder="Número do rolo, tecido ou cor"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {rolls.isPending && <Spinner />}
      {rolls.isError && (
        <ErrorBox
          message={errorMessage(rolls.error)}
          onRetry={() => void rolls.refetch()}
        />
      )}
      {rolls.isSuccess && visible.length === 0 && (
        <Empty title="Nenhum rolo aqui">
          <p>
            Os tecidos do cadastro não são saldo de estoque. Registre os rolos
            que chegaram.
          </p>
        </Empty>
      )}
      {archive.isError && <ErrorBox message={errorMessage(archive.error)} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((roll) => (
          <article className="card p-4" key={roll.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted">Rolo #{roll.number}</p>
                <h2 className="font-extrabold">{roll.fabricName}</h2>
                <p className="text-sm">{roll.color ?? 'Sem cor informada'}</p>
              </div>
              {roll.finishedAt && <Badge>Acabado</Badge>}
            </div>
            <p className="display mt-3 text-3xl">
              {amount(roll.remaining)}{' '}
              <span className="text-base">{roll.unit}</span>
            </p>
            <p className="text-xs text-muted">
              Inicial: {amount(roll.initialQuantity)} {roll.unit} · entrada{' '}
              {day(roll.receivedOn)}
            </p>
            {roll.lastUseOn && (
              <p className="text-xs text-muted">
                Última baixa: {day(roll.lastUseOn)}
              </p>
            )}
            {roll.supplier && (
              <p className="mt-2 text-xs">Fornecedor: {roll.supplier}</p>
            )}
            {roll.cost && <p className="text-xs">Custo: {money(roll.cost)}</p>}
            {roll.note && <p className="mt-2 text-sm">{roll.note}</p>}
            {manage && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Pencil className="h-3 w-3" />}
                  onClick={() => setEditing(roll)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  busy={archive.isPending}
                  icon={<Trash2 className="h-3 w-3" />}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Arquivar o rolo #${roll.number}? As baixas serão preservadas.`
                      )
                    )
                      archive.mutate(roll)
                  }}
                >
                  Arquivar
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      <section className="card mt-6 p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-extrabold">Histórico de baixas</h2>
          <input
            aria-label="Dia do histórico"
            type="date"
            className="field max-w-48"
            value={historyDay}
            onChange={(e) => setHistoryDay(e.target.value)}
          />
        </div>
        {history.isPending && historyDay && <Spinner />}
        {history.isError && <ErrorBox message={errorMessage(history.error)} />}
        {history.data?.length === 0 && (
          <p className="text-sm text-muted">Nenhuma baixa neste dia.</p>
        )}
        {history.data?.map((use) => (
          <p key={use.id} className="border-t border-line py-2 text-sm">
            Rolo #{use.rollNumber} · {use.fabricName} ·{' '}
            <strong>
              {amount(use.quantity)} {use.unit}
            </strong>
            {use.finished ? ' · acabou' : ''}
            {use.createdByName ? ` · ${use.createdByName}` : ''}
          </p>
        ))}
      </section>
      {editing !== null && (
        <RollEditor
          key={editing === 'new' ? 'new' : editing.id}
          roll={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            refresh()
            setEditing(null)
          }}
        />
      )}
      {using && (
        <DayUse
          onClose={() => setUsing(false)}
          onSaved={() => {
            refresh()
            setUsing(false)
          }}
        />
      )}
    </div>
  )
}

const RollEditor = ({
  roll,
  onClose,
  onSaved,
}: {
  roll: FabricRollType | null
  onClose: () => void
  onSaved: () => void
}) => {
  const fabrics = useQuery({
    queryKey: storeKeys.fabrics,
    queryFn: ({ signal }) => fetchFabrics(signal),
  })
  const [fabricId, setFabricId] = useState(roll?.fabricId ?? '')
  const [color, setColor] = useState(roll?.color ?? '')
  const [unit, setUnit] = useState<'kg' | 'm'>(roll?.unit ?? 'kg')
  const [quantity, setQuantity] = useState(roll?.initialQuantity ?? '')
  const [cost, setCost] = useState(editPrice(roll?.cost ?? null))
  const [supplier, setSupplier] = useState(roll?.supplier ?? '')
  const [receivedOn, setReceivedOn] = useState(roll?.receivedOn ?? todayLocal())
  const [note, setNote] = useState(roll?.note ?? '')
  const [copies, setCopies] = useState('1')
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        fabricId,
        color: color.trim() || null,
        unit,
        initialQuantity: decimal(quantity),
        cost: cost.trim() ? decimal(cost) : null,
        supplier: supplier.trim() || null,
        receivedOn,
        note: note.trim() || null,
      }
      if (roll) await updateRoll(roll.id, { ...body, version: roll.version })
      else await createRoll({ ...body, copies: Number(copies) })
    },
    onSuccess: onSaved,
  })
  return (
    <Modal
      open
      title={roll ? `Editar rolo #${roll.number}` : 'Entrada de rolos'}
      onClose={() => {
        if (!save.isPending) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button
            variant="lime"
            busy={save.isPending}
            disabled={
              !fabricId || !quantity || !receivedOn || !fabrics.isSuccess
            }
            onClick={() => save.mutate()}
          >
            Gravar
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <StoreField label="Tecido">
          <select
            className="field"
            value={fabricId}
            onChange={(e) => setFabricId(e.target.value)}
          >
            <option value="">Escolha</option>
            {roll && !fabrics.data?.some((f) => f.id === roll.fabricId) && (
              <option value={roll.fabricId}>
                {roll.fabricName} (arquivado)
              </option>
            )}
            {fabrics.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </StoreField>
        <StoreField label="Cor (opcional)">
          <input
            className="field"
            maxLength={60}
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </StoreField>
        <StoreField label="Unidade">
          <select
            className="field"
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'kg' | 'm')}
          >
            <option value="kg">Quilos (kg)</option>
            <option value="m">Metros (m)</option>
          </select>
        </StoreField>
        <StoreField label={`Quantidade inicial por rolo (${unit})`}>
          <input
            className="field"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </StoreField>
        {!roll && (
          <StoreField label="Quantos rolos iguais chegaram?">
            <input
              className="field"
              type="number"
              min={1}
              max={50}
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </StoreField>
        )}
        <StoreField label="Custo por rolo (R$, opcional)">
          <input
            className="field"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </StoreField>
        <StoreField label="Fornecedor (opcional)">
          <input
            className="field"
            maxLength={120}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
        </StoreField>
        <StoreField label="Data da entrada">
          <input
            className="field"
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
          />
        </StoreField>
        <StoreField label="Observações">
          <textarea
            className="field"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </StoreField>
      </div>
      {roll?.lastUseOn && (
        <p className="mt-3 text-xs text-muted">
          A quantidade inicial recalcula o saldo. Tecido e unidade não podem ser
          trocados depois de uma baixa.
        </p>
      )}
      {fabrics.isError && <ErrorBox message={errorMessage(fabrics.error)} />}
      {save.isError && <ErrorBox message={errorMessage(save.error)} />}
    </Modal>
  )
}

const DayUse = ({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) => {
  const rolls = useQuery({
    queryKey: [...storeKeys.rolls, 'abertos'],
    queryFn: ({ signal }) => fetchRolls('abertos', signal),
  })
  const [date, setDate] = useState(todayLocal)
  const [uses, setUses] = useState<
    Record<string, { quantity: string; finished: boolean }>
  >({})
  const chosen = Object.entries(uses).filter(
    ([, use]) => use.finished || Number(decimal(use.quantity)) > 0
  )
  const save = useMutation({
    mutationFn: () =>
      saveRollDayUse({
        day: date,
        uses: chosen.map(([rollId, use]) => ({
          rollId,
          quantity: decimal(use.quantity || '0'),
          finished: use.finished,
        })),
      }),
    onSuccess: onSaved,
  })
  const set = (
    id: string,
    patch: Partial<{ quantity: string; finished: boolean }>
  ) =>
    setUses((all) => ({
      ...all,
      [id]: { quantity: '', finished: false, ...all[id], ...patch },
    }))
  return (
    <Modal
      open
      wide
      title="Baixa do dia"
      onClose={() => {
        if (!save.isPending) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" disabled={save.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="lime"
            busy={save.isPending}
            disabled={chosen.length === 0 || !date}
            onClick={() => {
              if (
                window.confirm(
                  'Registrar estas baixas? Confira as quantidades antes de confirmar.'
                )
              )
                save.mutate()
            }}
          >
            Registrar baixas
          </Button>
        </>
      }
    >
      <StoreField label="Dia do consumo">
        <input
          className="field max-w-52"
          type="date"
          max={todayLocal()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </StoreField>
      <p className="my-3 text-sm text-muted">
        Informe só os rolos utilizados. Marcar “Acabou” encerra o rolo. Informe
        também quanto foi consumido; um eventual saldo fica registrado para
        conferência.
      </p>
      {rolls.isPending && <Spinner />}
      {rolls.isError && <ErrorBox message={errorMessage(rolls.error)} />}
      {rolls.data?.length === 0 && <Empty title="Nenhum rolo em uso" />}
      <div className="space-y-2">
        {rolls.data?.map((roll) => (
          <div
            key={roll.id}
            className="grid items-center gap-2 rounded-xl bg-paper p-3 sm:grid-cols-[1fr_150px_110px]"
          >
            <div>
              <p className="font-bold">
                #{roll.number} · {roll.fabricName}
              </p>
              <p className="text-xs text-muted">
                {roll.color} · saldo {amount(roll.remaining)} {roll.unit}
              </p>
            </div>
            <input
              aria-label={`Consumo do rolo ${roll.number} em ${roll.unit}`}
              className="field"
              inputMode="decimal"
              placeholder={`Saiu (${roll.unit})`}
              value={uses[roll.id]?.quantity ?? ''}
              onChange={(e) => set(roll.id, { quantity: e.target.value })}
            />
            <label className="text-sm font-bold">
              <input
                type="checkbox"
                className="mr-2"
                checked={uses[roll.id]?.finished ?? false}
                onChange={(e) => set(roll.id, { finished: e.target.checked })}
              />
              Acabou
            </label>
          </div>
        ))}
      </div>
      {save.isError && <ErrorBox message={errorMessage(save.error)} />}
    </Modal>
  )
}
