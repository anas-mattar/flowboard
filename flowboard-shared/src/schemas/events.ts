import { z } from 'zod';

/**
 * The FS §5.2 activity event names, as the single source of truth
 * (STANDARDS §1.2). The database CHECK constraint, the stored row, the
 * activity-feed response and the WebSocket frame all derive from this list;
 * adding an event type means adding it here first.
 */
export const ACTIVITY_EVENT_TYPES = [
  'card.created',
  'card.moved',
  'card.renamed',
  'card.described',
  'label.added',
  'label.removed',
  'member.assigned',
  'member.unassigned',
  'due.set',
  'due.cleared',
  'due.completed',
  'checklist.item.added',
  'checklist.item.checked',
  'comment.added',
  'card.archived',
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export const activityEventTypeSchema = z.enum(ACTIVITY_EVENT_TYPES);

/**
 * Funnel instrumentation stored in our own database (BM §9, §13.3).
 * FB-18 may extend this list; FB-01 ships the initial set from the spec §7.
 */
export const FUNNEL_EVENT_TYPES = [
  'user.signed_up',
  'workspace.created',
  'board.created',
  'card.created',
  'invite.sent',
  'invite.accepted',
  'activation.reached',
] as const;

export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number];

export const funnelEventTypeSchema = z.enum(FUNNEL_EVENT_TYPES);
