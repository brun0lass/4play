import { z } from 'zod'

/**
 * Response declaration helper — THE performance rule of this codebase.
 *
 * Zod is the authoring language for every contract, but Zod must never
 * serialise a response. `fastify-type-provider-zod` offers a serializerCompiler
 * that does exactly that, and it costs roughly an order of magnitude compared
 * with Fastify's compiled `fast-json-stringify`.
 *
 * So: requests are validated by Zod, responses are declared as JSON Schema
 * through this helper, and Fastify serialises them natively. One authoring
 * language, fastest possible output path. See ADR-0005.
 *
 * Two properties come for free:
 *   - the same JSON Schema feeds @fastify/swagger, so OpenAPI 3.1 cannot drift
 *     from actual behaviour;
 *   - fast-json-stringify emits only declared fields, so an internal column
 *     cannot leak through an endpoint by accident.
 *
 * Passing a raw Zod schema into a `response` block is a review defect.
 *
 * @example
 * schema: {
 *   querystring: ListProductsQuery,           // Zod validates the request
 *   response: { 200: jsonResponse(ProductList) }, // fast-json-stringify writes it
 * }
 */
export const jsonResponse = (schema: z.ZodType): Record<string, unknown> =>
  z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'output',
  })

/**
 * Envelope for an error response.
 *
 * `code` is a stable machine-readable identifier; `message` is for humans and
 * may change. Clients branch on `code`, never on `message`.
 */
export const ErrorResponse = z.object({
  code: z.string().describe('Stable machine-readable error identifier'),
  message: z.string().describe('Human-readable explanation'),
  requestId: z.string().optional().describe('Correlates with server logs'),
})

export type ErrorResponse = z.infer<typeof ErrorResponse>
