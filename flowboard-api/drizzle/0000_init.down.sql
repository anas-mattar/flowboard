-- Down path for 0000_init (STANDARDS §1.3: every migration has a tested down path).
--
-- Drizzle generates no down SQL, so this file is hand-written and is run by
-- `pnpm db:migrate:down` (src/db/migrate.ts). Tables are dropped in reverse
-- foreign-key dependency order; indexes, CHECK constraints and foreign keys
-- belong to their tables and are removed with them.
--
-- The migration creates the whole model in one step, so its down path empties
-- the `public` schema. `drizzle.__drizzle_migrations` is migration bookkeeping,
-- not application schema, and is left in place (the runner deletes this
-- migration's ledger row so `up` can re-apply it).

DROP TABLE IF EXISTS "funnel_event";--> statement-breakpoint
DROP TABLE IF EXISTS "session";--> statement-breakpoint
DROP TABLE IF EXISTS "invitation";--> statement-breakpoint
DROP TABLE IF EXISTS "activity_event";--> statement-breakpoint
DROP TABLE IF EXISTS "comment";--> statement-breakpoint
DROP TABLE IF EXISTS "checklist_item";--> statement-breakpoint
DROP TABLE IF EXISTS "card_member";--> statement-breakpoint
DROP TABLE IF EXISTS "card_label";--> statement-breakpoint
DROP TABLE IF EXISTS "card";--> statement-breakpoint
DROP TABLE IF EXISTS "list";--> statement-breakpoint
DROP TABLE IF EXISTS "label";--> statement-breakpoint
DROP TABLE IF EXISTS "board_star";--> statement-breakpoint
DROP TABLE IF EXISTS "board_member";--> statement-breakpoint
DROP TABLE IF EXISTS "board";--> statement-breakpoint
DROP TABLE IF EXISTS "workspace_member";--> statement-breakpoint
DROP TABLE IF EXISTS "workspace";--> statement-breakpoint
DROP TABLE IF EXISTS "user";
