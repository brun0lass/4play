import { z } from 'zod'

/**
 * O modelo da nota térmica, na fiação (F149).
 *
 * Espelha `ReceiptTemplate` do `@aeris/printing` **sem importar o pacote**, pelo
 * mesmo motivo de `labels.ts`: o navegador carrega os contratos e eles não
 * arrastam pacote de domínio junto. Os dois mudam juntos, e o `tsc` cobra.
 *
 * Validado na escrita E na leitura. O que está gravado num `jsonb` não é
 * verdade só porque está gravado: um modelo escrito por uma versão anterior, ou
 * mexido à mão no banco, imprime `undefined` no rodapé — e ninguém descobre até
 * o cliente estar com o papel na mão.
 */

/**
 * O aviso do cupom não é editável, e isto é decisão de risco, não de gosto.
 *
 * Ele existe para o cliente distinguir num olhar este papel de um cupom fiscal,
 * e para a loja que o imprime no lugar de uma NFC-e não poder alegar que
 * parecia oficial. Os outros papéis a loja escreve como quiser.
 */
export const RECEIPT_FISCAL_NOTICE = 'RECIBO — SEM VALOR FISCAL'

/**
 * O teto é generoso de propósito, e a tela é que avisa sobre a bobina.
 *
 * Uma linha maior que a bobina não some: `text.ts` quebra em duas, como já faz
 * com a frase do vale, que tem 69 caracteres desde a F126. Recusar aqui no
 * tamanho da bobina seria proibir o que o papel já imprime — o cuidado com
 * "isso vai quebrar" é aviso na tela, não erro do servidor.
 */
const line = z.string().trim().max(120)
const lines = z.array(line).max(3)

export const ReceiptDocumentKeySchema = z.enum([
  'receipt',
  'quote',
  'exchange',
  'voucher',
  'statement',
  'settlement',
])

export type ReceiptDocumentKey = z.infer<typeof ReceiptDocumentKeySchema>

/**
 * As linhas de dados que a loja pode reordenar (F160).
 *
 * Repetidas aqui e não importadas de `@aeris/printing`, pela mesma razão das
 * outras listas deste pacote: os contratos não arrastam pacote de domínio. O
 * teste `receipt-template-contract.test.ts` compara as duas.
 */
export const INFO_LINE_IDS = [
  'number',
  'date',
  'validUntil',
  'customer',
  'customerDocument',
  'customerPhone',
  'customerAddress',
  'customerEmail',
  'salesperson',
  'operator',
  'terminal',
] as const

export const InfoLineSchema = z.enum(INFO_LINE_IDS)

export const ReceiptDocumentTemplateSchema = z.object({
  notice: z.string().trim().max(48).nullable(),
  footerLines: lines,
  showBarcode: z.boolean(),
  showDocumentId: z.boolean(),
})

export const ReceiptTemplateSchema = z
  .object({
    header: z.object({
      showDocument: z.boolean(),
      showAddress: z.boolean(),
      showBranch: z.boolean(),
      extraLines: lines,
      // F161: o resto do emitente. `.default` pelo mesmo motivo do `customer`
      // abaixo — um modelo gravado antes continua sendo lido.
      showLegalName: z.boolean().default(false),
      showPostalCode: z.boolean().default(true),
      showPhone: z.boolean().default(true),
      showStateRegistration: z.boolean().default(false),
    }),
    lines: z.object({
      showUnitMath: z.boolean(),
      showOverriddenMark: z.boolean(),
      showCode: z.boolean().default(false),
      showLineDiscount: z.boolean().default(true),
      // A localização da peça (26/09). Desligada: o papel de quem não mexe
      // no modelo sai igual.
      showLocation: z.boolean().default(false),
    }),
    receipt: z.object({
      showOperator: z.boolean(),
      showTerminal: z.boolean(),
    }),
    /*
     * Os dados do cliente e a ordem das linhas (F160).
     *
     * Com `.default` nos dois, e não opcional: o modelo gravado é validado NA
     * LEITURA, e um campo novo obrigatório faria todo modelo salvo antes desta
     * feature falhar — a loja voltaria ao padrão em silêncio, perdendo o aviso
     * e o rodapé que escreveu. O padrão aqui é o mesmo de
     * `DEFAULT_RECEIPT_TEMPLATE`, e um teste compara os dois.
     */
    customer: z
      .object({
        showAddress: z.boolean(),
        showPhone: z.boolean(),
        showDocument: z.boolean(),
        showEmail: z.boolean(),
        showCode: z.boolean().default(false),
        addressStyle: z.enum(['line', 'fields']).default('line'),
      })
      .default({
        showAddress: true,
        showPhone: true,
        showDocument: false,
        showEmail: false,
        showCode: false,
        addressStyle: 'line',
      }),
    /** F161: "Válido até 20/09" ou "Validade: 1 dia". */
    quoteValidity: z.enum(['date', 'days']).default('date'),
    /** F161: a letra do papel. */
    font: z
      .object({
        family: z.enum(['consolas', 'courier', 'arial']),
        size: z.enum(['normal', 'large', 'extra']),
        bold: z.boolean(),
      })
      .default({ family: 'consolas', size: 'normal', bold: true }),
    infoOrder: z
      .array(InfoLineSchema)
      .max(INFO_LINE_IDS.length)
      .default([...INFO_LINE_IDS]),
    documents: z.object({
      receipt: ReceiptDocumentTemplateSchema,
      quote: ReceiptDocumentTemplateSchema,
      exchange: ReceiptDocumentTemplateSchema,
      voucher: ReceiptDocumentTemplateSchema,
      statement: ReceiptDocumentTemplateSchema,
      settlement: ReceiptDocumentTemplateSchema,
    }),
    paper: z.union([z.literal(32), z.literal(48)]),
  })
  .refine(
    (template) => template.documents.receipt.notice === RECEIPT_FISCAL_NOTICE,
    {
      message: `O aviso do cupom é fixo: "${RECEIPT_FISCAL_NOTICE}".`,
      path: ['documents', 'receipt', 'notice'],
    }
  )

export type ReceiptTemplate = z.infer<typeof ReceiptTemplateSchema>

export const ReceiptTemplateResponse = z.object({
  template: ReceiptTemplateSchema,
  /** `0` quando a loja nunca salvou: o padrão, e nenhuma linha no banco. */
  version: z.number().int().min(0),
  updatedAt: z.string().nullable(),
})

export type ReceiptTemplateResponse = z.infer<typeof ReceiptTemplateResponse>

export const UpdateReceiptTemplateRequest = z.object({
  /** A versão que a tela leu. `0` grava o primeiro modelo da loja. */
  version: z.number().int().min(0),
  template: ReceiptTemplateSchema,
})

export type UpdateReceiptTemplateRequest = z.infer<
  typeof UpdateReceiptTemplateRequest
>
