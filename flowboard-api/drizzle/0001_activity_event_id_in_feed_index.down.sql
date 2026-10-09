-- Down path for 0001_activity_event_id_in_feed_index (STANDARDS §1.3).
--
-- Restores the FB-01 index shape, `(card_id, created_at desc)` without `id`.
-- Index-only, so the rollback loses no data: the feed query still runs, it
-- simply sorts the card's whole history to return one page again (FB-06 §7).

DROP INDEX "activity_event_card_created_idx";--> statement-breakpoint
CREATE INDEX "activity_event_card_created_idx" ON "activity_event" USING btree ("card_id","created_at" DESC NULLS LAST);
