import { z } from 'zod'

/**
 * O modelo de etiqueta, na fiação — F124.
 *
 * O layout mora numa coluna `jsonb`, e este arquivo é a razão de isso ser
 * seguro: **o conteúdo é validado por zod na LEITURA**, nunca confiando no que
 * está gravado. Um modelo de uma versão anterior, ou editado à mão no banco,
 * é recusado na hora de desenhar — em vez de virar uma etiqueta com
 * `height: undefinedmm`, que o CSS ignora em silêncio e o papel mostra torto.
 *
 * Os tipos aqui espelham `LabelLayout` do `@aeris/printing`. Não são um
 * import: `@aeris/contracts` descreve a fiação e não depende de renderizador
 * nenhum — e o dia em que o layout ganhar um campo novo, os dois arquivos
 * mudam juntos e o typecheck cobra.
 */

/** Milímetro. Aceita fração — `5,7 mm` de vão entre colunas é 5,7 mm mesmo. */
const millimetres = z.number().min(-1000).max(2000)
const positiveMillimetres = z.number().min(0).max(2000)

export const LABEL_FIELD_SOURCES = [
  'sku',
  'name',
  'salePrice',
  'lastPurchaseAt',
  // F129: o editor oferece estes quatro; o `.conf` do GDOOR não os traz.
  'gtin',
  'brand',
  'unit',
  'installment',
  'literal',
  // F140: o dia da impressão, a data do selo de garantia.
  'printedAt',
  // F141: a identificação do fornecedor e a localização da peça na loja.
  'supplierReference',
  'location',
] as const

export const LabelFieldSourceSchema = z.enum(LABEL_FIELD_SOURCES)
export type LabelFieldSourceType = z.infer<typeof LabelFieldSourceSchema>

/** `#rrggbb`, em minúsculas. */
const HexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/, 'Cor deve ser #rrggbb em minúsculas')

const ElementBox = {
  leftMm: millimetres,
  topMm: millimetres,
  widthMm: positiveMillimetres,
  heightMm: positiveMillimetres,
}

export const LabelTextElement = z.object({
  kind: z.literal('text'),
  source: LabelFieldSourceSchema,
  /** Só tem conteúdo quando `source` é `literal`. */
  text: z.string().max(500),
  /**
   * Em quantas vezes, no campo parcelado (F129). Opcional: os modelos gravados
   * antes do editor não têm a chave e continuam válidos na leitura.
   */
  installments: z.number().int().min(1).max(36).optional(),
  ...ElementBox,
  fontFamily: z.string().min(1).max(80),
  fontSizePt: z.number().min(1).max(400),
  color: HexColor,
  /** Nulo é "sem tarja" — e não uma tarja branca, que apagaria o de baixo. */
  background: HexColor.nullable(),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  wrap: z.boolean(),
  rotationDeg: z.number().min(-3600).max(3600),
})

export const LabelBarcodeElement = z.object({
  kind: z.literal('barcode'),
  ...ElementBox,
  moduleWidth: z.number().min(0.1).max(20),
  showText: z.boolean(),
  color: HexColor,
})

export const LabelElementSchema = z.discriminatedUnion('kind', [
  LabelTextElement,
  LabelBarcodeElement,
])

export const LabelLayoutSchema = z.object({
  name: z.string().min(1).max(120),
  page: z.object({
    widthMm: positiveMillimetres,
    heightMm: positiveMillimetres,
    marginLeftMm: positiveMillimetres,
    marginTopMm: positiveMillimetres,
    marginRightMm: positiveMillimetres,
    marginBottomMm: positiveMillimetres,
  }),
  label: z.object({
    widthMm: positiveMillimetres,
    heightMm: positiveMillimetres,
  }),
  columns: z.number().int().min(1).max(20),
  rows: z.number().int().min(1).max(60),
  columnGapMm: positiveMillimetres,
  /**
   * O vão entre fileiras (F140). Com padrão zero: os modelos gravados antes
   * dele continuam válidos na leitura, e a migração 0076 grava o vão dos que
   * vieram do GDOOR.
   */
  rowGapMm: positiveMillimetres.default(0),
  /*
   * Duzentos campos é muito mais do que qualquer modelo real tem — o maior da
   * Elite tem sete. O teto não é sobre uso: é sobre o que cabe numa coluna
   * `jsonb` que o navegador vai desenhar, e sobre um arquivo mal-formado não
   * virar uma página que trava a aba.
   */
  elements: z.array(LabelElementSchema).max(200),
})

export type LabelLayoutType = z.infer<typeof LabelLayoutSchema>

export const LABEL_TEMPLATE_SOURCES = ['gdoor', 'aeris'] as const
export const LabelTemplateSourceSchema = z.enum(LABEL_TEMPLATE_SOURCES)

export const LabelTemplateSummary = z.object({
  id: z.string(),
  name: z.string(),
  source: LabelTemplateSourceSchema,
  /** O nome do arquivo importado, como ele chegou. */
  sourceFile: z.string().nullable(),
  isDefault: z.boolean(),
  status: z.enum(['active', 'archived']),
  layout: LabelLayoutSchema,
  version: z.number().int(),
  updatedAt: z.string(),
})

export type LabelTemplateSummaryType = z.infer<typeof LabelTemplateSummary>

export const LabelTemplateList = z.object({
  templates: z.array(LabelTemplateSummary),
})

/**
 * Importar um `.conf` do GDOOR.
 *
 * O arquivo vai em **base64**, e os bytes são decodificados e interpretados no
 * SERVIDOR. Mandar o layout já pronto do navegador seria deixar a validação do
 * formato no cliente — e o arquivo é Windows-1252 com vírgula decimal e cor
 * BGR, exatamente o tipo de coisa em que dois leitores diferentes discordam.
 * Um leitor só, no servidor, é o que garante que dois computadores da mesma
 * loja importem o mesmo arquivo do mesmo jeito.
 */
export const ImportLabelTemplateRequest = z.object({
  /** Nome do arquivo, para o lojista reconhecer qual dos dele é este. */
  fileName: z.string().min(1).max(255),
  /** O conteúdo do arquivo, em base64. Cem kilobytes é muito para um INI. */
  contentBase64: z.string().min(1).max(140_000),
  /**
   * O nome do modelo. Ausente usa o `Nome=` de dentro do arquivo — que é o que
   * o lojista vê no GDOOR, e nem sempre é o nome do arquivo.
   */
  name: z.string().trim().min(1).max(120).optional(),
})

export type ImportLabelTemplateRequestType = z.infer<
  typeof ImportLabelTemplateRequest
>

/**
 * Criar um modelo no editor do Aeris (F129).
 *
 * Aqui o layout vem pronto do navegador — e é validado inteiro no servidor
 * pelo mesmo `LabelLayoutSchema` da leitura. Não há formato de outro sistema
 * para interpretar: é o formato do próprio Aeris.
 */
export const CreateLabelTemplateRequest = z.object({
  name: z.string().trim().min(1).max(120),
  layout: LabelLayoutSchema,
})

export type CreateLabelTemplateRequestType = z.infer<
  typeof CreateLabelTemplateRequest
>

export const UpdateLabelTemplateRequest = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  /** O layout editado (F129). Com `version`: quem salva por cima perde, não ganha. */
  layout: LabelLayoutSchema.optional(),
  /** Marcar como padrão. `false` não tira o padrão de ninguém — só marca. */
  isDefault: z.literal(true).optional(),
  status: z.enum(['active', 'archived']).optional(),
})

export type UpdateLabelTemplateRequestType = z.infer<
  typeof UpdateLabelTemplateRequest
>
