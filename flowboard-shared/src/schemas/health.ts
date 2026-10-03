import { z } from 'zod';

/**
 * `GET /v1/health` response (FB-00 §6).
 * `version` is the `flowboard-api` package version.
 */
export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    version: z.string().min(1),
  })
  .describe('HealthResponse');

export type HealthResponse = z.infer<typeof healthResponseSchema>;
