import { z } from 'zod'

/**
 * O robô de preço de um número de WhatsApp (F193).
 *
 * Uma entrada por conta de canal — configurada ou não: a conta sem robô volta
 * com os padrões e `configured: false`, e a tela a mostra pronta para ligar.
 */

const word = z.string().trim().min(1).max(60)
const wordList = z.array(word).max(200)

export const PriceSectionSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    emoji: z.string().trim().max(16),
    triggers: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
    /** `f.`, `bat.` — o começo do nome da peça no cadastro. */
    namePrefix: z.string().trim().min(1).max(20).nullable(),
    categoryId: z.uuid().nullable(),
  })
  .refine(
    (section) => section.namePrefix !== null || section.categoryId !== null,
    {
      message: 'Informe o prefixo do nome ou a categoria da seção.',
      path: ['namePrefix'],
    }
  )

export type PriceSectionBody = z.infer<typeof PriceSectionSchema>

const settings = {
  enabled: z.boolean(),
  branchId: z.uuid().nullable(),
  minDelaySeconds: z.number().int().min(0).max(120),
  maxDelaySeconds: z.number().int().min(0).max(120),
  maxItems: z.number().int().min(1).max(50),
  repeatWindowSeconds: z.number().int().min(0).max(86_400),
  maxRepliesPerHour: z.number().int().min(1).max(3_600),
  stopWords: wordList,
  intruders: wordList,
  qualityLabels: wordList,
  brandTokens: wordList,
  sections: z.array(PriceSectionSchema).max(12),
}

export const PriceResponderSaveRequest = z
  .object({ ...settings, version: z.number().int().min(0) })
  .refine((body) => body.maxDelaySeconds >= body.minDelaySeconds, {
    message: 'A espera máxima não pode ser menor que a mínima.',
    path: ['maxDelaySeconds'],
  })
  .refine((body) => !body.enabled || body.branchId !== null, {
    message: 'Escolha a filial cujo estoque o robô consulta.',
    path: ['branchId'],
  })
  .refine((body) => !body.enabled || body.sections.length > 0, {
    message: 'O robô precisa de pelo menos uma seção.',
    path: ['sections'],
  })

export type PriceResponderSaveBody = z.infer<typeof PriceResponderSaveRequest>

export const PriceResponderSummary = z.object({
  accountId: z.string(),
  accountDisplayName: z.string(),
  configured: z.boolean(),
  ...settings,
  sections: z.array(
    z.object({
      title: z.string(),
      emoji: z.string(),
      triggers: z.array(z.string()),
      namePrefix: z.string().nullable(),
      categoryId: z.string().nullable(),
    })
  ),
  version: z.number().int(),
})

export type PriceResponderSummary = z.infer<typeof PriceResponderSummary>

export const PriceResponderListResponse = z.object({
  responders: z.array(PriceResponderSummary),
})

export const PriceResponderPreviewRequest = z.object({
  message: z.string().trim().min(1).max(500),
  /** A configuração da tela, ainda não gravada — testar antes de salvar. */
  draft: PriceResponderSaveRequest.optional(),
})

export const PriceResponderPreviewResponse = z.object({
  outcome: z.enum(['reply', 'no_match', 'no_trigger', 'no_branch']),
  /** Em Markdown, como vai para a outbox. */
  body: z.string().nullable(),
  model: z.array(z.string()),
  stockIgnored: z.boolean(),
  sections: z.array(
    z.object({
      title: z.string(),
      emoji: z.string(),
      items: z.array(
        z.object({
          productId: z.string(),
          name: z.string(),
          priceLabel: z.string(),
        })
      ),
      rejected: z.array(
        z.object({
          productId: z.string(),
          name: z.string(),
          reason: z.enum(['model', 'excluded', 'no_stock', 'no_price']),
        })
      ),
    })
  ),
})

export type PriceResponderPreview = z.infer<
  typeof PriceResponderPreviewResponse
>

export const ResponderExclusionListResponse = z.object({
  exclusions: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      createdAt: z.string(),
    })
  ),
})

export const ResponderExclusionAddRequest = z.object({ productId: z.uuid() })

export const ResponderLogOutcomeSchema = z.enum([
  'replied',
  'no_match',
  'no_trigger',
  'repeat',
  'rate_capped',
  'own_number',
  'looks_like_bot',
  'not_text',
  'no_branch',
  'disabled',
])

export const ResponderLogResponse = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      conversationId: z.string(),
      query: z.string(),
      outcome: ResponderLogOutcomeSchema,
      itemCount: z.number().int(),
      replyBody: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
  /** O `before` da próxima página; nulo quando acabou. */
  nextCursor: z.string().nullable(),
})

export type ResponderLogResponse = z.infer<typeof ResponderLogResponse>
