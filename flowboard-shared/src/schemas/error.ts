import { z } from 'zod';

/**
 * The single error envelope every `/v1` route returns (FB-00 §6).
 * Validation failures are `422` with `details` carrying the Zod issues.
 */
export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      details: z.unknown().optional(),
    }),
  })
  .describe('ApiError');

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Error codes defined so far. Later backlog items extend this list. */
export const API_ERROR_CODES = {
  badRequest: 'bad_request',
  notFound: 'not_found',
  validationFailed: 'validation_failed',
  internalError: 'internal_error',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
