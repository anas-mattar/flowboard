import { z } from 'zod';

/**
 * FS §6 roles. Workspace membership carries `admin | member`; board membership
 * carries `admin | member | observer`. The authorisation module that reads
 * these is FB-02; FB-01 only fixes the vocabulary and the CHECK constraints.
 */
export const WORKSPACE_ROLES = ['admin', 'member'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);

export const BOARD_ROLES = ['admin', 'member', 'observer'] as const;

export type BoardRole = (typeof BOARD_ROLES)[number];

export const boardRoleSchema = z.enum(BOARD_ROLES);

/** Workspace plans (BM §4.2). Stored, never enforced in MVP (CL-D5). */
export const WORKSPACE_PLANS = ['free', 'team', 'business'] as const;

export type WorkspacePlan = (typeof WORKSPACE_PLANS)[number];

export const workspacePlanSchema = z.enum(WORKSPACE_PLANS);

/** User theme preference (CL-E13). */
export const USER_THEMES = ['light', 'dark', 'system'] as const;

export type UserTheme = (typeof USER_THEMES)[number];

export const userThemeSchema = z.enum(USER_THEMES);
