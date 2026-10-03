/**
 * The public API version prefix. FS §7 fixes the public surface at `/v1`;
 * STANDARDS §1.2 requires a new versioned path for any breaking change.
 */
export const API_VERSION = 'v1' as const;

export type ApiVersion = typeof API_VERSION;
