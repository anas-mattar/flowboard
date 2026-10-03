import { z } from 'zod';
import { userSchema } from './entities/user.js';
import { workspaceSchema } from './entities/workspace.js';

/**
 * Account schemas (FB-02 §6). The API validates request bodies with these and
 * the web app imports the inferred types, so a validation message in the
 * browser matches the one the API would return (STANDARDS §1.2).
 *
 * The rules come from CL-E10: emails are trimmed and at most 254 characters,
 * passwords are 10 to 128 characters with no composition rules, display names
 * are 1 to 80 characters.
 */

/** Longest address RFC 5321 allows (CL-E10). */
export const EMAIL_MAX_LENGTH = 254 as const;

/** Password bounds (CL-E10). No composition rules. */
export const PASSWORD_MIN_LENGTH = 10 as const;
export const PASSWORD_MAX_LENGTH = 128 as const;

/** Display-name bounds (CL-E10). */
export const DISPLAY_NAME_MAX_LENGTH = 80 as const;

/**
 * Email is trimmed before validation so " a@x.com " is stored as "a@x.com"
 * (AC 3). The length bound is applied after trimming.
 */
export const emailFieldSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(EMAIL_MAX_LENGTH, 'validation.tooLong')
  .pipe(z.email('validation.email'));

export const passwordFieldSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'validation.passwordLength')
  .max(PASSWORD_MAX_LENGTH, 'validation.passwordLength');

export const displayNameFieldSchema = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(DISPLAY_NAME_MAX_LENGTH, 'validation.tooLong');

/**
 * `tokenResponse: true` asks for the session token in the response body
 * instead of a cookie, for non-browser clients (CL-E9).
 */
const tokenResponseField = z.boolean().optional();

export const signupRequestSchema = z
  .object({
    email: emailFieldSchema,
    password: passwordFieldSchema,
    displayName: displayNameFieldSchema,
    tokenResponse: tokenResponseField,
  })
  .strict()
  .describe('SignupRequest');

export type SignupRequest = z.infer<typeof signupRequestSchema>;

/**
 * Login does not re-apply the password length bounds as a rejection reason the
 * caller could use to probe: a password outside the stored range simply never
 * matches. The bound here is a denial-of-service guard only (CL-E10).
 */
export const loginRequestSchema = z
  .object({
    email: emailFieldSchema,
    password: z.string().min(1, 'validation.required').max(PASSWORD_MAX_LENGTH),
    tokenResponse: tokenResponseField,
  })
  .strict()
  .describe('LoginRequest');

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Signup and login response (FB-02 §6). `sessionToken` is present only when
 * the request asked for it with `tokenResponse: true`; otherwise the token
 * travels in the `fb_session` cookie and never appears in the body (AC 5).
 */
export const authResponseSchema = z
  .object({
    user: userSchema,
    workspace: workspaceSchema,
    sessionToken: z.string().min(1).optional(),
  })
  .describe('AuthResponse');

export type AuthResponse = z.infer<typeof authResponseSchema>;
