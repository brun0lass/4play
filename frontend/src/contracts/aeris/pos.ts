import { z } from 'zod'

import { CashSessionSummary } from './cash.ts'
import { PaymentSummary } from './payments.ts'
import { PricingStatusSchema } from './pricing.ts'
import {
  SalesDocumentDetail,
  SalesLineRequest,
  TenderRequest,
  percentString,
} from './sales.ts'

/**
 * POS contracts (Master Specification section 18).
 *
 * The till has no domain of its own. A sale here is a `sales_document` with
 * `kind: 'sale'` going `draft → completed` (ADR-0017), the money is
 * `@aeris/payments`, the drawer is `@aeris/cash` and the price comes from
 * `@aeris/pricing`. What these three endpoints add is **composition**: one
 * round trip where the counter would otherwise need three, and one transaction
 * where four separate calls would leave a half-finished sale behind.
 *
 * Every amount on this wire is a **string**, for the reason ADR-0016 gives.
 * There is no point in the POS request path — scan, cart, change, receipt —
 * where money is a JavaScript number.
 */

/** Up to twelve integer digits and six decimals — `numeric(18, 6)`, non-negative. */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,6})?$/

const amountString = (label: string) =>
  z
    .string()
    .trim()
    .regex(
      AMOUNT_PATTERN,
      `${label} deve ser um número com ponto decimal, por exemplo 19.90`
    )

// ---------------------------------------------------------------------------
// Lookup — the scan
// ---------------------------------------------------------------------------

/**
 * A variant an operator could have meant.
 *
 * Variant-level rather than product-level, which is the difference between this
 * and `/catalog/products`: the thing with a barcode is the variant, and a till
 * that returned products would make the operator choose a size after scanning
 * one.
 */
export const PosMatch = z.object({
  variantId: z.string(),
  productId: z.string(),
  /** The product's name, copied onto the line when the item is added. */
  description: z.string(),
  sku: z.string(),
  /**
   * O código que este produto tinha no sistema de origem.
   *
   * O balcão pede peça pelo número da planilha antiga, e o `sku` gerado na
   * importação (`GDOOR-1233`) não é esse número — é ele com um prefixo, que a
   * pessoa não digita nem reconhece. Null para o que foi cadastrado aqui.
   */
  externalCode: z.string().nullable(),
  gtin: z.string().nullable(),
  unit: z.string(),
  /**
   * A foto principal, quando existe.
   *
   * Só a miniatura: o balcão confere se pegou a peça certa, e para isso uma
   * imagem de 96px basta. Mandar a `full` numa lista de oito candidatos seria
   * baixar oito fotos inteiras para olhar oito quadradinhos.
   */
  thumbUrl: z.string().nullable(),
  /** True when the term equalled the SKU or the barcode. A scan is always exact. */
  exact: z.boolean(),
  /**
   * What it costs, at one unit, in the list this lookup used.
   *
   * On the MATCH rather than only in the snapshot, because the operator is
   * choosing between candidates and the price is most of how they choose. Null
   * when the product has no price in that list — which is also why the till can
   * refuse before the item is added rather than at the payment step.
   */
  unitPrice: z.string().nullable(),
  /**
   * What the branch holds, or null when the shop does not count this product.
   *
   * Null is NOT zero (F028). A till that printed "0" for a product nobody
   * counts would be telling the operator they cannot sell it, which is the
   * opposite of true.
   */
  onHand: z.string().nullable(),
  /** False when the product is not counted at all. F028. */
  tracksStock: z.boolean(),
  /** A identificação do fornecedor (F141). */
  supplierReference: z.string().nullable(),
  /**
   * Onde a peça fica NESTA filial (F141). Na linha da busca, para o vendedor ir
   * direto à gaveta. Nula sem localização, ou sem filial na sessão.
   */
  location: z.string().nullable(),
})

export type PosMatch = z.infer<typeof PosMatch>

/**
 * One stored price, as the till needs it to resolve locally.
 *
 * Archived tiers are included rather than filtered, because `resolvePrice`
 * wants them: "there was a price here and somebody removed it" is a different
 * answer from "there was never a price", and the trace can only say so if the
 * row is present.
 */
export const PosPriceTier = z.object({
  id: z.string(),
  variantId: z.string(),
  minQuantity: z.string(),
  unitPrice: z.string(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: PricingStatusSchema,
})

export type PosPriceTier = z.infer<typeof PosPriceTier>

/**
 * Everything the till needs to price this variant itself, at any quantity.
 *
 * This is the latency decision of the feature, made explicit in the contract.
 * The alternative — asking `/pricing/resolve` again every time somebody presses
 * `+` — is a round trip per keystroke on the one screen where a round trip is
 * felt. Sending the tiers once means the browser answers with `resolvePrice`
 * from `@aeris/pricing`, which is the SAME function the server would have run;
 * there is no second implementation of the precedence rules anywhere.
 */
export const PosPricingSnapshot = z.object({
  variantId: z.string(),
  /**
   * A variação padrão do produto, quando esta é uma cor sem preço próprio
   * (F176): os `tiers` dela vêm junto, e `resolvePrice` cai neles. Nulo no
   * produto de uma variação só.
   */
  fallbackVariantId: z.string().nullable().default(null),
  /** Null when the tenant has no default list and none was named. */
  priceList: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      currency: z.string(),
      isDefault: z.boolean(),
      validFrom: z.string().nullable(),
      validTo: z.string().nullable(),
      status: PricingStatusSchema,
    })
    .nullable(),
  tiers: z.array(PosPriceTier),
})

export type PosPricingSnapshot = z.infer<typeof PosPricingSnapshot>

export const PosLookupResponse = z.object({
  matches: z.array(PosMatch),
  /**
   * The prices, sent only when the answer was unambiguous.
   *
   * One match means a scan or an exact code, which is the path that has to be
   * instant. Several matches means a person is about to choose, and pricing
   * every candidate would be an N+1 to answer a question nobody asked yet.
   */
  pricing: PosPricingSnapshot.nullable(),
})

export type PosLookupResponse = z.infer<typeof PosLookupResponse>

export const PosLookupQuery = z.object({
  /** A barcode, a code, or a fragment of a name. */
  term: z.string().trim().min(1).max(120),
  /**
   * Capped: a till list nobody can read with the arrow keys is not a list.
   *
   * F211: 20 virou 100. Com 8, "note 8" mostrava oito Note 8 e escondia o
   * resto — o caixa queria rolar e ver todos. A lista rola; o teto só impede
   * que duas letras tragam o catálogo inteiro.
   */
  limit: z.coerce.number().int().min(1).max(100).default(8),
  /** Absent means "the tenant's default list", which is what a till does. */
  priceListId: z.string().min(1).optional(),
  /**
   * A cor escolhida na lista (F215).
   *
   * Escolher refazia a busca pelo código, e a cor cujo código é o do GDOOR
   * voltava junto com as irmãs: a lista reaparecia e nada entrava. Com a
   * variação dita, a resposta é ela e só ela, já com o preço.
   */
  variantId: z.uuid().optional(),
})

export type PosLookupQuery = z.input<typeof PosLookupQuery>
export type PosLookupParams = z.output<typeof PosLookupQuery>

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * One tender.
 *
 * `amount` is what the customer HANDED OVER, not what was applied to the bill.
 * R$ 100,00 in cash against a bill of R$ 90,00 is `amount: "100.00"` and
 * R$ 10,00 of change — the drawer really did receive a hundred, and recording
 * ninety would make the till short by the change it gave.
 */
/**
 * O mesmo objeto de `sales.ts`, com o nome que o PDV sempre usou.
 *
 * A definição mudou de arquivo na F159, quando a retirada de um pedido passou a
 * receber dinheiro pelo mesmo caminho: `pos.ts` já importa de `sales.ts`, e
 * duplicar os limites (24 parcelas, 40 para o NSU) seria duas listas para
 * divergirem na primeira maquininha nova.
 */
export const PosTenderRequest = TenderRequest

export type PosTenderRequest = TenderRequest

export const PosCheckoutRequest = z.object({
  /**
   * Client-generated, and a UUIDv7 when present.
   *
   * A till that cannot reach the Cloud must still produce an identifier that
   * will never collide when it syncs (ADR-0014), so the endpoint accepts one
   * from the first day rather than being retrofitted with one later.
   *
   * The browser does NOT send it today, and that is deliberate: `crypto`
   * exposes `randomUUID` (v4) in a browser and only Node has `randomUUIDv7`,
   * so a web till generating its own would put v4 ids in a column the rest of
   * the schema keeps time-ordered. Offline is not implemented — see
   * docs/features/F016-pos.md — and the Edge, which is where an offline till
   * will actually run, has Node's generator.
   */
  id: z.uuid().optional(),
  branchId: z.string().min(1).optional(),
  /**
   * The open till this sale belongs to.
   *
   * Required, and not merely recorded: a sale rung up with no session has no
   * drawer for its cash and no shift to reconcile against. Section 18 lists
   * abertura before venda for that reason.
   */
  cashSessionId: z.string().min(1),
  /** Never null. A walk-in sale sends the tenant's `Consumidor Final`. */
  customerPartyId: z.string().min(1),
  /**
   * Quem vendeu. **Obrigatório** (F035).
   *
   * Era opcional, e ausente queria dizer "quem digitou". No balcão da Elite
   * Digital há mais vendedores que logins abertos: quem atendeu e quem digitou
   * quase nunca são a mesma pessoa, e o padrão silencioso atribuía toda venda
   * ao caixa — apagando o vendedor de toda a história e de qualquer conversa
   * sobre comissão, atendimento ou reclamação.
   *
   * Exigir aqui e não completar no servidor é a diferença entre um dado que
   * alguém informou e um dado que o sistema inventou. Quando o caixa é também
   * quem vendeu, ele escolhe o próprio nome, e isso é uma informação.
   *
   * O servidor confere que é um usuário ativo DESTE tenant. Um uuid qualquer
   * atribuiria a venda a um estranho, e a coluna aceitaria em silêncio.
   */
  salespersonUserId: z.string().min(1),
  priceListId: z.string().min(1).nullable().default(null),
  discountAmount: amountString('O desconto').default('0'),
  /**
   * O desconto pedido em percentual (F100).
   *
   * O balcão fecha desconto em porcentagem — *"faz 10% pra ele"* —, e sem este
   * campo o percentual digitado no PDV era descartado em silêncio pelo Zod:
   * a tela mostrava o total reduzido e o documento nascia sem desconto nenhum.
   * Tela e registro discordando é o pior desfecho possível para um número que
   * o cliente ouviu em voz alta.
   *
   * Presente IGNORA `discountAmount`; os dois juntos são recusados pela rota,
   * porque a mensagem precisa dizer qual dos dois apagar.
   */
  discountPercent: percentString('O desconto percentual')
    .nullable()
    .default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
  /**
   * O orçamento que o cliente trouxe ao caixa (F034).
   *
   * Presente quando esta venda é a **retirada** de um orçamento: o servidor o
   * fecha na mesma transação, soltando a mercadoria que ele segurava, antes de
   * a venda tirá-la do físico. Sem isso o orçamento ficaria aberto para sempre
   * segurando uma peça que já saiu pela porta — que é o buraco pelo qual a
   * Elite Digital dizia *"fazem orçamento e nunca fazem a venda"*.
   *
   * A versão vem junto porque fechá-lo é uma escrita como qualquer outra, e um
   * orçamento cancelado por outra pessoa enquanto o caixa cobrava não pode ser
   * fechado por cima (ADR-0014).
   */
  quoteId: z.string().min(1).nullable().default(null),
  quoteVersion: z.number().int().nonnegative().nullable().default(null),
  /** At least one: a sale of nothing is not a sale. */
  lines: z.array(SalesLineRequest).min(1),
  payments: z.array(PosTenderRequest).min(1),
})

/**
 * O orçamento do balcão (F034).
 *
 * Quase o checkout, sem a parte do dinheiro — e é exatamente essa a diferença
 * que a Elite Digital descreveu: *"a venda inicia sem valor, pq no caso
 * primeiro eles criam o orçamento"*. Sem `payments` e sem `cashSessionId`,
 * porque nada é recebido aqui e nenhuma gaveta é aberta.
 *
 * Um caixa aberto continua não sendo exigido de propósito: quem faz orçamento
 * no balcão pode não ser quem opera a gaveta, e travar o orçamento no caixa
 * aberto obrigaria a loja a abrir um turno para prometer um preço.
 */
export const PosQuoteRequest = z.object({
  id: z.uuid().optional(),
  branchId: z.string().min(1).optional(),
  customerPartyId: z.string().min(1),
  /** Quem vendeu. Obrigatório, como no checkout — ver acima. */
  salespersonUserId: z.string().min(1),
  priceListId: z.string().min(1).nullable().default(null),
  discountAmount: amountString('O desconto').default('0'),
  /**
   * O desconto pedido em percentual (F100).
   *
   * O balcão fecha desconto em porcentagem — *"faz 10% pra ele"* —, e sem este
   * campo o percentual digitado no PDV era descartado em silêncio pelo Zod:
   * a tela mostrava o total reduzido e o documento nascia sem desconto nenhum.
   * Tela e registro discordando é o pior desfecho possível para um número que
   * o cliente ouviu em voz alta.
   *
   * Presente IGNORA `discountAmount`; os dois juntos são recusados pela rota,
   * porque a mensagem precisa dizer qual dos dois apagar.
   */
  discountPercent: percentString('O desconto percentual')
    .nullable()
    .default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
  /**
   * Até quando o preço vale — e, quando o orçamento segura mercadoria, até
   * quando ela fica segurada.
   *
   * Ausente usa o padrão da loja. Um orçamento que reserva e nunca vence
   * reserva para sempre, e o estoque disponível some sem ninguém ter vendido
   * nada.
   */
  validUntil: z.string().nullable().default(null),
  lines: z.array(SalesLineRequest).min(1),
})

export type PosQuoteRequest = z.input<typeof PosQuoteRequest>
export type PosQuoteBody = z.output<typeof PosQuoteRequest>

/**
 * A entrega que sai do balcão sem o dinheiro (F101).
 *
 * *"caixa cria pedido, motoboy faz a entrega e volta falando como que o
 * cliente pagou e ela anota dai"*. A ordem dos acontecimentos é essa, e o PDV
 * só sabia fazer o contrário: cobrar antes de a mercadoria sair.
 *
 * ## Um pedido despachado, e não um checkout sem pagamento
 *
 * Este pedido nasce no molde do ORÇAMENTO, não no do checkout — sem
 * `payments` e sem `cashSessionId`, não porque foram removidos daqui, mas
 * porque nunca existiram ali. Afrouxar `payments` no `PosCheckoutRequest`
 * criaria um checkout que às vezes não cobra, e "às vezes" é onde o dinheiro
 * some.
 *
 * O que ele ganha é `courierPartyId`, obrigatório: a mercadoria não sai
 * sozinha, e o título que nasce da saída só faz sentido com o nome de quem a
 * levou. Sem caixa aberto de propósito — nada entra na gaveta aqui; o dinheiro
 * aparece na baixa do título, quando o motoboy volta e diz como foi pago.
 */
export const PosOrderRequest = z.object({
  id: z.uuid().optional(),
  branchId: z.string().min(1).optional(),
  /**
   * Nunca o Consumidor Final, e o servidor recusa.
   *
   * A saída levanta um título a receber, e uma dívida precisa de alguém que a
   * deva — a mesma recusa que o despacho já faz desde a F034.
   */
  customerPartyId: z.string().min(1),
  /** Quem vendeu. Obrigatório, como no checkout e no orçamento. */
  salespersonUserId: z.string().min(1),
  /** Quem leva. Uma pessoa com o papel `courier` (F098). */
  courierPartyId: z.string().min(1),
  priceListId: z.string().min(1).nullable().default(null),
  discountAmount: amountString('O desconto').default('0'),
  discountPercent: percentString('O desconto percentual')
    .nullable()
    .default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
  lines: z.array(SalesLineRequest).min(1),
})

export type PosOrderRequest = z.input<typeof PosOrderRequest>
export type PosOrderBody = z.output<typeof PosOrderRequest>

/**
 * O que a tela precisa saber depois de despachar.
 *
 * O documento e o título, juntos: o operador acabou de pôr mercadoria na rua
 * sem receber nada, e a única prova de que a loja tem o que cobrar é o título.
 * Devolvê-lo aqui é o que permite à tela dizer o valor e o número em vez de
 * "pronto".
 */
export const PosOrderResponse = z.object({
  document: SalesDocumentDetail,
  /** O título a receber levantado pela saída. Null nunca, na prática. */
  financeEntryId: z.string().nullable(),
})

export type PosOrderResponse = z.infer<typeof PosOrderResponse>

export type PosCheckoutRequest = z.input<typeof PosCheckoutRequest>
export type PosCheckoutBody = z.output<typeof PosCheckoutRequest>

/** Paid, owed and change — the figures a receipt prints. */
export const PosSettlement = z.object({
  total: z.string(),
  paid: z.string(),
  outcome: z.enum(['settled', 'short', 'over']),
  outstanding: z.string(),
  excess: z.string(),
  changeDue: z.string(),
  /** Excess that cannot be given as change, because it did not arrive as cash. */
  changeRefused: z.string(),
})

export type PosSettlement = z.infer<typeof PosSettlement>

export const PosCheckoutResponse = z.object({
  document: SalesDocumentDetail,
  payments: z.array(PaymentSummary),
  settlement: PosSettlement,
  /** The `sale` movement written to the drawer, when any cash stayed in it. */
  cashMovementId: z.string().nullable(),
  /**
   * O caixa depois do recebimento. Nulo só no sinal e na retirada de pedido
   * da loja que não trabalha com caixa (F174) — o PDV sempre tem um.
   */
  session: CashSessionSummary.nullable(),
})

export type PosCheckoutResponse = z.infer<typeof PosCheckoutResponse>

// ---------------------------------------------------------------------------
// Cancelling a completed sale
// ---------------------------------------------------------------------------

export const PosCancelRequest = z.object({
  version: z.number().int().nonnegative(),
  reason: z.string().trim().max(500).nullable().default(null),
  /**
   * The open till the money comes back out of.
   *
   * Optional, because a sale can be cancelled from a back office with no
   * drawer open; when it is absent the cash refund is recorded in the payment
   * ledger and NOT in a till, and the response says so by returning a null
   * session.
   */
  cashSessionId: z.string().min(1).nullable().default(null),
})

export type PosCancelRequest = z.input<typeof PosCancelRequest>
export type PosCancelBody = z.output<typeof PosCancelRequest>

export const PosCancelResponse = z.object({
  document: SalesDocumentDetail,
  /** New rows that reverse the receipts. Nothing is ever deleted — ADR-0018. */
  refunds: z.array(PaymentSummary),
  session: CashSessionSummary.nullable(),
})

export type PosCancelResponse = z.infer<typeof PosCancelResponse>
