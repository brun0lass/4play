import { z } from 'zod'

/**
 * Onde a busca das listas procura o texto — F167, ampliado na F190.
 *
 * ## Por que num arquivo só
 *
 * Os três valores estavam escritos à mão em quatro lugares (a lista do
 * Estoque, a de Produtos, o filtro da ação em massa e a preferência de
 * pessoa). Enquanto foram dois, repetir custava pouco. O terceiro mostrou o
 * preço: **um modo que existe em três dos quatro lugares não dá erro** — ele
 * some no `else` de quem não o conhece e a busca continua a mesma, com o botão
 * aceso. É o defeito da F182 outra vez, e a F190 nasceu dele.
 *
 * `@aeris/ui` e `@aeris/inventory` não podem importar daqui (regra de
 * dependência: contratos só compõem primitivas de domínio), então lá os três
 * valores são repetidos e um teste segura os dois lados juntos.
 *
 * ## O que cada um quer dizer
 *
 * - `anywhere` — o padrão, e o de sempre: `13` acha `IPHONE 13`.
 * - `prefix` — o do GDOOR, que a loja usa há anos: `bat.` acha o que **começa**
 *   com isso, em qualquer uma das colunas procuradas.
 * - `exact` — **só identificador, e por igualdade**: o código ou o código de
 *   barras inteiro, nada de nome. O dono, 25/09/2026, depois de digitar `8810`
 *   e receber sete peças: _"tem que ter um exatamente igual, pra puxar esse
 *   caso dele aí"_. As sete vieram pelo código de barras — `8810` mora dentro
 *   da barra interna de toda peça da loja —, e a barra é justamente a coluna
 *   que a tela não mostra por padrão.
 */
export const SEARCH_MODES = ['anywhere', 'prefix', 'exact'] as const

export const SearchModeSchema = z.enum(SEARCH_MODES)

export type SearchMode = z.infer<typeof SearchModeSchema>
