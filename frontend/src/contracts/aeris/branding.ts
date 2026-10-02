import { z } from 'zod'

/**
 * A marca de uma loja (F169).
 *
 * ## O que a loja escolhe, e o que ela não escolhe
 *
 * Uma logo e UMA cor. Não é um editor de tema: a cor escolhida vira
 * `--brand-primary` e um tom escuro derivado dela vira o fundo do menu lateral,
 * e o resto da paleta — superfícies, texto, os semáforos de situação — continua
 * sendo do produto. Verde continua querendo dizer "terminou" (F156), e uma loja
 * que pudesse pintar o "Cancelado" de verde teria uma tela que mente.
 *
 * ## Validado na LEITURA, e não só na escrita
 *
 * Mesma regra da 0082, escrita na própria migração: o que está num `jsonb` não
 * é verdade porque está gravado. Todo campo tem `.default()`, então uma marca
 * gravada por uma versão anterior do produto continua sendo lida — e o que ela
 * não tinha vira o padrão em vez de `undefined` no meio de um `style`.
 */

/**
 * Hexadecimal de seis dígitos, sempre.
 *
 * Três dígitos (`#0af`) e oito (com alfa) ficam de fora porque a cor é
 * derivada por conta própria — escurecida para o menu, clareada para o hover —
 * e a aritmética de uma dessas formas é um caminho a mais para o mesmo
 * resultado. O seletor de cor do navegador entrega exatamente esta forma.
 */
export const BrandColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #0064ec')

/**
 * A chave dos bytes no object store (ADR-0015), nunca uma URL.
 *
 * Guardar URL aqui significaria que a forma de servir a logo está gravada no
 * banco de cada cliente: mudar de adaptador de storage, ou pôr um CDN na
 * frente, viraria uma migração de dados.
 */
const objectKey = z.string().trim().min(1).max(512)

export const BrandingSchema = z.object({
  /** Nula enquanto a loja não subiu nada: o sistema fica com a marca Aeris. */
  logoKey: objectKey.nullable().default(null),
  primaryColor: BrandColorSchema.nullable().default(null),
})

export type BrandingSchema = z.infer<typeof BrandingSchema>

/**
 * `null` quando a conta não tem a chave `marca-propria` ligada.
 *
 * Nulo e não "o padrão da Aeris": a tela precisa distinguir "esta loja não
 * contratou marca própria" de "contratou e ainda não subiu nada", porque a
 * primeira não deve nem mostrar a tela de Aparência.
 */
export const BrandingResponse = z.object({
  branding: BrandingSchema.nullable(),
  version: z.number().int().positive().nullable(),
})

export type BrandingResponse = z.infer<typeof BrandingResponse>

export const UpdateBrandingRequest = z.object({
  primaryColor: BrandColorSchema.nullable(),
  /**
   * `false` remove a logo e volta para a da Aeris.
   *
   * Um campo à parte porque o upload é outra rota: mandar `logoKey` aqui
   * deixaria o navegador escolher onde os bytes de outro cliente moram.
   */
  clearLogo: z.boolean().default(false),
  version: z.number().int().positive().nullable(),
})

export type UpdateBrandingRequest = z.infer<typeof UpdateBrandingRequest>
export type UpdateBrandingBody = z.output<typeof UpdateBrandingRequest>
