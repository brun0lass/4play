import { z } from 'zod'

/**
 * Etiquetas — F088.
 *
 * Um registro só, com `scope` dizendo a quem cada etiqueta pode ser colada:
 * `party` (permanente, acompanha a pessoa) ou `conversation` (temporária,
 * nasce e morre com o assunto). Ver a migração 0049 para por que uma tabela e
 * não duas.
 *
 * As etiquetas da F087 — "em atraso", "cliente novo", "sem cadastro", a cidade
 * — NÃO passam por aqui: aquelas são derivadas de dado que outros módulos já
 * mantêm, e não existem como linha em lugar nenhum.
 */

export const TAG_SCOPE_VALUES = ['party', 'conversation'] as const
export const TagScopeSchema = z.enum(TAG_SCOPE_VALUES)
export type TagScopeType = z.infer<typeof TagScopeSchema>

/**
 * Os cinco tons do design system, e não uma cor livre.
 *
 * Eles já são temáticos (claro e escuro) e já têm contraste verificado. Uma
 * paleta aberta produz etiqueta ilegível no primeiro amarelo sobre branco — e
 * a pessoa que escolheu o amarelo não é quem vai ler a tela o dia inteiro.
 */
export const TAG_TONE_VALUES = [
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
] as const
export const TagToneSchema = z.enum(TAG_TONE_VALUES)
export type TagToneType = z.infer<typeof TagToneSchema>

export const TagStatusSchema = z.enum(['active', 'archived'])

/** A forma enxuta que viaja pendurada em cada cliente e em cada conversa. */
export const TagRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  tone: TagToneSchema,
})

export type TagRefType = z.infer<typeof TagRefSchema>

export const TagSummary = TagRefSchema.extend({
  scope: TagScopeSchema,
  status: TagStatusSchema,
  /**
   * Quantos clientes e conversas usam esta etiqueta hoje.
   *
   * Existe para que arquivar não seja uma decisão tomada às cegas: "Atacado"
   * colada em duzentos clientes é uma coisa; colada em nenhum é outra.
   */
  usageCount: z.number().int(),
  version: z.number().int(),
})

export type TagSummaryType = z.infer<typeof TagSummary>

export const TagListQuery = z.object({
  scope: TagScopeSchema,
  status: TagStatusSchema.optional(),
})

export const TagListResponse = z.object({
  tags: z.array(TagSummary),
})

const TagName = z
  .string()
  .trim()
  .min(1, 'Dê um nome à etiqueta.')
  // Uma etiqueta é um rótulo, não uma observação: 32 caracteres é o que cabe
  // num crachá ao lado de um nome sem empurrar o resto do cabeçalho.
  .max(32, 'Use no máximo 32 caracteres.')

export const CreateTagRequest = z.object({
  scope: TagScopeSchema,
  name: TagName,
  tone: TagToneSchema.default('neutral'),
})

export type CreateTagBody = z.infer<typeof CreateTagRequest>

export const UpdateTagRequest = z.object({
  name: TagName,
  tone: TagToneSchema,
  version: z.number().int(),
})

export type UpdateTagBody = z.infer<typeof UpdateTagRequest>

/**
 * Arquivar e desarquivar pela mesma rota, com o estado desejado no corpo.
 *
 * Os VÍNCULOS não são apagados quando a etiqueta é arquivada: um cliente que
 * era "Atacado" continua tendo sido, e desarquivar devolve a classificação
 * inteira em vez de exigir que alguém cole tudo de novo.
 */
export const SetTagStatusRequest = z.object({
  status: TagStatusSchema,
  version: z.number().int(),
})

export type SetTagStatusBody = z.infer<typeof SetTagStatusRequest>

/**
 * A lista FINAL de etiquetas de um dono, e não "adicione esta" / "remova
 * aquela".
 *
 * Um seletor de etiquetas é um conjunto, e quem edita pensa no resultado. Duas
 * pessoas mexendo ao mesmo tempo é o último a salvar — a resposta certa aqui,
 * porque a alternativa (versão do agregado) faria colar uma etiqueta falhar
 * porque alguém mudou o telefone do cliente no mesmo minuto. Nada disso vale
 * para estoque, financeiro ou fiscal: uma classificação não soma nem subtrai.
 */
export const SetTagsRequest = z.object({
  tagIds: z.array(z.uuid()).max(20),
})

export type SetTagsBody = z.infer<typeof SetTagsRequest>
