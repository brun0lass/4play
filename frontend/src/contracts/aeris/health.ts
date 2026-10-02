import { z } from 'zod'

/**
 * Health contracts.
 *
 * Liveness and readiness are deliberately different shapes because they answer
 * different questions. Liveness asks "is this process alive?" and must never
 * consult a dependency — a liveness probe that pings the database turns a brief
 * outage into a restart storm, and restarting an application does not repair a
 * database. Readiness asks "should traffic reach this instance right now?" and
 * therefore does consult dependencies. See ADR-0007.
 */

export const LivenessResponse = z.object({
  status: z.literal('alive'),
})

export type LivenessResponse = z.infer<typeof LivenessResponse>

export const DependencyStatus = z.object({
  name: z.string(),
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
})

export type DependencyStatus = z.infer<typeof DependencyStatus>

export const ReadinessResponse = z.object({
  status: z.enum(['ready', 'not_ready']),
  dependencies: z.array(DependencyStatus),
})

export type ReadinessResponse = z.infer<typeof ReadinessResponse>

/**
 * Aggregate health, for humans and for the application shell indicator.
 *
 * `degraded` is the interesting state: the service itself is fine but a
 * dependency is not. The UI surfaces this rather than showing a binary
 * online/offline, because "the API is up but the database is not" is an
 * operationally different situation from "nothing is reachable".
 */
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  dependencies: z.array(DependencyStatus),
})

export type HealthResponse = z.infer<typeof HealthResponse>
