**Backlog item:** FB-06 Cards core
**Status:** Approved
**Approved by:** Anas, 7 October 2026 (Paperclip issue TAS-126, Wave-1 confirmation card accepted at 09:42 UTC per CL-D24; independent review TAS-128 and TAS-129)
**Owner(s):** FlowBoard Backend (`flowboard-api` card routes, activity feed route, `flowboard-shared` card and activity schemas, Markdown-free storage), FlowBoard Frontend (`flowboard-web` card composer, card front, card detail modal route, title and description editing, Move picker, Copy, Delete, activity feed, Markdown rendering), FlowBoard QA (`flowboard-web/e2e/FB-06-cards.spec.ts` and the MVP-2 slice test `MVP-2-first-card.spec.ts`, in a separate task after the Frontend task)
**Reviewer:** cross-assigned per pull request among FlowBoard Backend, Frontend and QA; never the author (STANDARDS §1.9)
**Increment:** MVP-2

---

### 1. Goal

A board member can add cards quickly with an inline composer, open a card in a modal with its own URL, rename it, write a description that renders as a safe Markdown subset, move it to another list and position through a keyboard-operable picker, copy it, delete (archive) it, and read its append-only activity. With FB-06 the BM §9 activation metric "time to first card under two minutes" becomes an automated assertion, and every later card attribute (labels, members, due dates, checklists, comments) has a modal to live in. The C-11 menu move ships here, before drag and drop, so an accessible path to moving cards exists from the first day cards exist (TAS-7 §9.7).

### 2. Requirement references

| Source | Reference | Requirement | Tag |
|---|---|---|---|
| FS | C-01 | Add a card to the bottom of a list; inline composer; Enter saves and keeps the composer open; Escape cancels | [REQ] |
| FS | C-03 | Open a card to see its detail view: title, location, labels, members, description, checklist and activity | [REQ] |
| FS | C-04 | Edit a card title in the modal header; the board updates on save | [REQ] |
| FS | C-05 | Add a rich-text description, saved explicitly with Save; a `≡` badge appears on the card | [REQ] (format per CL-D17) |
| FS | C-11 | Move a card via a menu; accessible alternative to drag and drop; keyboard-operable | [REQ] |
| FS | C-12 | Copy a card; inserted directly below the original with " (copy)" appended; activity resets | [REQ] |
| FS | C-13 | Delete a card; requires confirmation; soft-deleted and recoverable for 30 days | [REQ] |
| FS | §4.5 | ＋ Add a card at the bottom of the list; list bodies scroll so the add-card control stays visible | [REQ] |
| FS | §4.6 | Card front renders, top to bottom, only what exists: label chips, title, meta row (due badge, description indicator, checklist progress, comment count, member avatars) | [REQ] |
| FS | §4.7 | Card detail modal: two columns (single below 700 px); left labels · members · description · checklist · activity with comment box; right "Add to card": Members · Labels · Due date · Move · Copy · Delete; dismissed by ✕, scrim click or Esc | [REQ] (labels, members, due, checklist, comments are FB-08, FB-10, FB-11, FB-12; their sections render read-only data and the buttons are disabled with a "coming soon" tooltip until those items ship) |
| FS | §5, §5.1 | Card fields; sparse-float positions | [REQ] |
| FS | §5.2 | `card.created`, `card.moved`, `card.renamed`, `card.described`, `card.archived`; append-only | [REQ] |
| FS | §6 | Create / edit / move cards: workspace admin, board admin, board member; Observer refused; View board (and so read a card) all roles | [REQ] |
| FS | §7 | `POST /v1/lists/{id}/cards`, `PATCH /v1/cards/{id}` update fields **and** move (`list_id` + `position`), `DELETE /v1/cards/{id}` archive, `GET /v1/cards/{id}/activity` paginated | [REQ] |
| FS | §7.1 | Moves last-write-wins with `updated_at` precondition; field edits `If-Match` with `409` | [REQ] |
| FS | X-01, X-03 | Toast within 200 ms; Enter submits composers; Esc closes modals | [REQ] |
| FS | §8 | WCAG 2.2 AA; focus trapped in modals and restored on close; keyboard equivalent to drag (C-11); dates in locale | [REQ] |
| BM | §1, §9 | Time to first card under two minutes (activation) | [REQ] |
| BM | §13.3 | Funnel instrumentation with v1.0 | [REQ] |
| CL | CL-D17 (plan D11) | Description: plain text stored, rendered as a sanitised Markdown subset, up to 10,000 characters, no WYSIWYG | [REQ] |
| CL | CL-A2 | Delete is archive with confirmation and 30-day restore (FB-17) | [REQ] |
| CL | CL-A13 (closes CL-O4) | Copy fields: title, description, due date and completion, labels, members, checklist items; not comments or activity | [REQ] |
| CL | CL-E3 | The activity feed is the v1.0 audit trail | [REQ] |
| CL | CL-E23 | `If-Match` on `PATCH /v1/cards/{id}`; a move is an edit | [ENG] |
| CL | CL-E24 | Additive routes `GET /v1/cards/{id}`, `POST /v1/cards/{id}/copy` | [ENG] |
| CL | CL-E26 | Lazy card detail; hydration keeps `CardSummary` | [ENG] |
| CL | CL-E29 | Hand-written per-role matrix test until FB-09 | [ENG] |
| CL | CL-E32, CL-E37 | `micromark` as the sanitising renderer; constructs outside the subset disabled | [ENG] |
| CL | CL-E35 | `card.moved` payload with `via: "menu"` | [ENG] |
| CL | CL-E38 | `CardDetail` and `ActivityPage` shapes; cursor on `(createdAt, id)` | [ENG] |
| CL | CL-E39 | Copy mechanics; `copiedFromCardId` | [ENG] |
| CL | CL-E40 | Funnel `card.created` written here (amends CL-E20) | [ENG] |
| CL | CL-E41 | Move validation: same board, live list, position as sent, ties ordered by id | [ENG] |
| CL | CL-E6 | Inline composer instead of `prompt()`; confirmations PT lacks | [REQ] |
| CL | CL-E13 | Modal route `/boards/{id}/cards/{cardId}` (ARCH §4) | [ENG] |
| PT | `openComposer`, `.card`, `.meta`, `#scrim`, `.modal`, `#mTitle`, `#mSub`, `#mDesc`, `#mSaveDesc`, `#aMove`, `#aCopy`, `#aDelete`, `#mActivity` | Visual and interaction reference | [REQ] |
| TAS-7 | §9.3 FB-06 items 1 to 11; §9.2 S1 | Acceptance criteria and the slice test approved on 6 October 2026 | [REQ] |

No **[ASM]** rows. CL-O4 is recorded as CL-A13.

### 3. Scope

**In scope**

- Backend: `POST /v1/lists/{id}/cards`, `GET /v1/cards/{id}`, `PATCH /v1/cards/{id}` (title, description, move), `DELETE /v1/cards/{id}`, `POST /v1/cards/{id}/copy`, `GET /v1/cards/{id}/activity`; capability `board.manageCards` on mutations and `board.view` on reads; `If-Match`; events `card.created`, `card.renamed`, `card.described`, `card.moved` (`via: "menu"` or `"drag"`), `card.archived` (`via: "card"`); funnel `card.created`; the activity presenter that joins `actor`.
- Shared: `CardCreate`, `CardPatch`, `CardDetail`, `CardIdParams`, `ActivityPage`, `ActivityQuery`, `CardCreatedPayload`, `CardRenamedPayload`, `CardDescribedPayload` schemas; constants `CARD_TITLE_MAX_LENGTH = 500`, `CARD_DESCRIPTION_MAX_LENGTH = 10000`, `ACTIVITY_PAGE_DEFAULT_LIMIT = 50`, `ACTIVITY_PAGE_MAX_LIMIT = 200`; the `renderMarkdownSubset` configuration lives in `flowboard-web` (it is presentation), its unit test with the hostile inputs of CL-E37 next to it.
- Frontend: card composer per list; card front component (label chips and avatars render from hydration data even though FB-08/FB-10 add the editors); modal route `/boards/$boardId/cards/$cardId` with lazy `GET /v1/cards/{id}` and `GET /v1/cards/{id}/activity`; title editing; description editor with Save and Cancel and the rendered view; "Add to card" column with Move, Copy, Delete active and Members, Labels, Due date disabled until their items ship; Move picker; confirm dialog for Delete; activity feed with "Load more"; optimistic updates and `409` handling; toasts.
- QA: Playwright per story, axe, and the slice test `MVP-2-first-card.spec.ts` (S1).

**Out of scope**

- Drag and drop (FB-07); FB-06 ships the `PATCH` move that FB-07 reuses.
- Label assignment and management (FB-08); member assignment (FB-10); due date and checklist editing (FB-11); comments (FB-12). The modal renders what the API returns for these and shows their buttons disabled.
- Restore and the archived-items view (FB-17).
- Search and filter (FB-13).
- Realtime (FB-15); the modal re-fetches on focus and after mutations.
- Virtualised list bodies (FB-16); FB-06 renders all cards.

### 4. Acceptance criteria

1. **[REQ, C-01, FS §5.2, CL-E40]** `POST /v1/lists/{id}/cards { title: "Write launch post" }` returns `201` with a `CardSummary` (the FB-04 shape, unchanged; it has no `createdBy`) whose `position` is `positionAtEnd(max position of live cards in the list)` and `listId` the target list; a following `GET /v1/cards/{id}` returns `CardDetail` with `createdBy` equal to the caller; a `card.created` activity event with `{ title }` and a funnel event `card.created` with `{ boardId, workspaceId }` exist; titles are trimmed and must be 1 to 500 characters, otherwise `422`; an archived list returns `404`.
2. **[REQ, C-03, CL-E26, CL-E38]** `GET /v1/cards/{id}` returns `CardDetail` with `description` (string or `null`), `boardId`, `listName`, `labelIds`, `memberIds`, `checklistItems` in position order, `commentCount`, `dueAt`, `dueComplete`, `updatedAt`; every board role including Observer gets `200`; an archived card returns `404` for member and observer and `200` with `archivedAt` set for board admin and workspace admin (FB-17 restore, same rule as CL-E16).
3. **[REQ, C-04, FS §7.1, CL-E23]** `PATCH /v1/cards/{id} { title }` with a matching `If-Match` returns `200` with the new `updatedAt` and writes `card.renamed { from, to }`; a stale `If-Match` returns `409 stale` and writes nothing; no header succeeds; an unchanged title writes no event.
4. **[REQ, C-05, CL-D17]** `PATCH /v1/cards/{id} { description }` stores the text exactly as sent (no server-side rendering or stripping), bounded at 10,000 characters after trimming trailing whitespace, otherwise `422`; `{ description: null }` or an empty string clears it; writes `card.described { hasDescription }`; `GET /v1/boards/{id}` then reports `hasDescription: true` for a non-empty description and `false` after clearing.
5. **[REQ, C-11, C-02 persistence, FS §7.1, CL-E35, CL-E41]** `PATCH /v1/cards/{id} { listId, position, via: "menu" }` moves the card: `listId` must be a live list on the same board (another board's list or an archived list is `422`), `position` a positive finite number stored as sent; the response is the updated `CardSummary`; `card.moved { fromListId, toListId, fromPosition, toPosition, via: "menu" }` is written; `{ position }` alone reorders within the current list; `{ listId }` without `position` is `422`; `via` defaults to `"drag"` when absent; a stale `If-Match` returns `409`.
6. **[REQ, C-12, CL-A13, CL-E39]** `POST /v1/cards/{id}/copy` returns `201` with a `CardSummary` titled `"{title} (copy)"` (truncated so the result fits 500 characters), positioned strictly between the original and the next card in the same list (or appended when the original is last), with the original's `description`, `dueAt`, `dueComplete`, `labelIds`, `memberIds` and checklist items (text, done, order) copied, `commentCount: 0`; `GET /v1/cards/{copyId}` returns `CardDetail` with `createdBy` equal to the caller (not the original's creator); the copy's activity is exactly one `card.created { title, copiedFromCardId }`; the original's activity and comments are unchanged.
7. **[REQ, C-13, CL-A2]** `DELETE /v1/cards/{id}` returns `204`, sets `archived_at`, writes `card.archived { via: "card" }`, and the card is absent from the next hydration and from the sidebar count; a second `DELETE` returns `404`; `GET /v1/cards/{id}` then follows AC 2's archived rule.
8. **[REQ, FS §7, CL-E38]** `GET /v1/cards/{id}/activity?cursor=&limit=` returns `ActivityPage { items, nextCursor }` newest first, default 50 and maximum 200 per page, `nextCursor` null on the last page, each item carrying `actor` as `PublicUser`, `type` and `payload`; a bad cursor or limit is `422`; every role that can view the board may read it.
9. **[REQ, FS §6]** Authorisation negatives, per route in §6: Observer gets `403 forbidden` on create, title, description, move, copy and delete and `200` on `GET /v1/cards/{id}` and the activity route; a workspace member not on the board and a user from another workspace get `404` everywhere; unauthenticated gets `401`; a cookie-authenticated mutation without a matching `Origin` gets `403 bad_origin`.
10. **[REQ, C-01, FS §4.5, CL-E6]** Frontend: each list footer shows "＋ Add a card" (hidden for Observers); activating it opens an inline composer at the bottom of the list (textarea, placeholder "Enter a title for this card…", "Add card" button, "Cancel", hint "Enter to add"); Enter saves, the card appears at the bottom immediately (optimistic), the list scrolls to it, and the composer stays open and focused for the next card; Shift+Enter inserts a line break; Esc or Cancel closes the composer; an empty or whitespace title is ignored and the composer stays open; toast "Card added" within 200 ms (X-01).
11. **[REQ, FS §4.6]** The card front is a button-like element with the accessible name of its title; it renders, top to bottom and only when present: label chips (name text and colour, from hydration), the title, and a meta row with the due badge (FB-11 styling; a plain locale date here), the `≡` description indicator with visually hidden text "Has a description", the checklist `done/total` badge, the 💬 comment count badge with visually hidden "comments", and up to three member avatars then "+n"; a card with only a title renders only the title.
12. **[REQ, C-03, FS §4.7, FS §8]** Clicking a card, or pressing Enter or Space on a focused card, navigates to `/boards/{boardId}/cards/{cardId}` and opens the modal over the board; the modal fetches `GET /v1/cards/{id}` and the first activity page lazily, shows a skeleton while loading, traps focus, has `aria-modal` and `aria-labelledby` the title field, closes by ✕, scrim click or Esc (navigating back to `/boards/{boardId}`), and restores focus to the card that opened it (or to the list header when the card is gone); opening the URL directly in a new tab shows the board with the modal open. Below 700 px the layout is a single column.
13. **[REQ, C-03]** The modal header shows the title field and the location line "in {listName}" (PT `#mSub`; the board name is omitted because the board is visible behind); the left column shows Labels and Members sections only when the card has any (read-only chips and avatars until FB-08 and FB-10), the Description section, a Checklist section only when items exist (read-only until FB-11), and the Activity section; the right "Add to card" column shows Members, Labels, Due date (disabled with the tooltip and visually hidden text "Available soon"), Move, Copy and Delete.
14. **[REQ, C-04, X-03]** The modal title is an `input` labelled "Card title"; Enter or blur persists the trimmed value, the card front on the board updates optimistically, Esc restores the previous value, an empty value reverts; a `409` re-fetches the card and shows "Updated by someone else, showing the latest"; toast "Title updated".
15. **[REQ, C-05, CL-D17, CL-E37]** The Description section shows the rendered Markdown subset (paragraphs, bold, italic, bulleted and numbered lists, links opening in a new tab) or the placeholder "Add a more detailed description…" as a button; activating it opens a textarea prefilled with the raw text, with "Save" and "Cancel"; Save persists and shows "Description saved"; Cancel or Esc discards changes (Esc in the textarea does not close the modal); a counter appears from 9,000 characters and Save is disabled above 10,000; headings, images, code blocks, block quotes, tables and raw HTML in the stored text render as literal text; a `javascript:` link renders as text, not a link.
16. **[REQ, C-11, FS §8, CL-E42 grammar]** "Move" opens a popover (`role="dialog"`, labelled "Move card") with a "List" `select` of the board's live lists (current list preselected) and a "Position" `select` numbered 1 to n+1 for the chosen list (current position preselected when the list is unchanged; the position options update when the list changes), and a "Move" button; confirming computes the position from the neighbours with the shared position module, sends `PATCH` with `via: "menu"`, moves the card on the board optimistically, updates the location line, shows "Moved to {listName}" (or "Card moved" within the same list), and returns focus to the Move button; Esc closes without moving. The whole flow is operable with Tab, arrow keys and Enter only.
17. **[REQ, C-12]** "Copy" sends the copy request, inserts the copy directly below the original on the board, shows "Card copied", and keeps the original open; opening the copy shows its activity with one "created this card (copied from {title})" entry.
18. **[REQ, C-13, X-01]** "Delete" (destructive styling) opens a confirm dialog ("Delete '{title}'? You can restore it from archived items for 30 days."); confirming closes the modal, removes the card from the board, moves focus to the list header, and shows "Card deleted"; Cancel or Esc keeps the card and returns focus to the Delete button.
19. **[REQ, FS §7, FS §8]** The Activity section lists events newest first, each with the actor's avatar and name, a sentence from the message catalogue per event type (`card.created` "created this card", with "(copied from {title})" when `copiedFromCardId` is present; `card.renamed` "renamed this card from '{from}' to '{to}'"; `card.described` "updated the description" or "removed the description"; `card.moved` "moved this card from {from} to {to}" or "reordered this card in {list}"; `card.archived` "archived this card" with "with the list" or "with all cards in the list" by `via`; other FS §5.2 types render their generic sentence so FB-08 to FB-12 only add strings), and a relative time ("2 minutes ago", `Intl.RelativeTimeFormat`) with the absolute locale timestamp in a `title` attribute and `<time datetime>`; a "Load more" button appears while `nextCursor` is not null. The comment box is FB-12 and is not rendered.
20. **[REQ, FS §6]** For an Observer: no composer, no title or description editing (static text), Move, Copy and Delete absent; the modal, card front and activity remain readable. The API refuses the Observer regardless (AC 9).
21. **[REQ, FS §7.1]** When any card mutation returns `409`, the client re-fetches the board and the card, re-renders, and shows "Updated by someone else, showing the latest" without resending the edit.
22. **[REQ, BM §9, TAS-7 S1]** Slice-level, exactly the approved S1 criterion: a Playwright test that starts signed out, signs up, creates a board and adds the first card to To Do, stopping the clock when that card is visible on the board, completes in under 120 seconds of wall-clock time on CI with the elapsed time printed and asserted. Nothing else is inside the timed window. The description round trip (open the card, write a description, save, reload, find the `≡` indicator and the rendered description) is a separate, untimed test in `FB-06-cards.spec.ts` (§10) covering AC 4 and AC 15.
23. **[REQ, FS §8]** Composer, card front, modal, title field, description editor, Move picker, Delete dialog and activity list are keyboard-operable with visible focus; axe reports zero violations on the board with cards, with the composer open, with the modal open (loaded), with the description editor open, with the Move picker open and with the Delete dialog open, in both themes.

### 5. User interface

Visual reference: PT `openComposer` (`.composer`, `.add-card`), `.card` and `.meta` badges (`.due`, `.lab`, `.avatar`), the modal (`#scrim`, `.modal`, `#mTitle`, `#mSub`, `#mDesc`, `#mSaveDesc`, `.act`, `.bubble`, `.when`), the "Add to card" column (`#aMove`, `#aCopy`, `#aDelete`) and `popup` (CL-A10 tokens; CL-E6 for confirmations PT lacks). Primitives from FB-03 (`Dialog`, `ConfirmDialog`, `ToastProvider`, Esc stack, `focusable`).

**Card composer** (C-01, FS §4.5): list footer button "＋ Add a card" → inline form with `textarea` (`aria-label` "Card title", `maxlength` 500, auto-growing), primary "Add card", secondary "Cancel", hint text. Enter submits; Shift+Enter newline; Esc cancels. Only one composer is open per list; opening another list's composer closes the first.

**Card front** (FS §4.6): `article` with a focusable `button`-styled surface, `aria-label` the title plus a summary of badges ("Write launch post, has a description, 2 of 5 checklist items, 3 comments"); chips `span.lab.text` with the label name; meta badges with icons and visually hidden text. FB-07 adds the drag handle semantics to the same element.

**Modal** (FS §4.7, C-03): TanStack Router child route `/boards/$boardId/cards/$cardId` rendering `Dialog` over the board; width up to 760 px; two columns (`grid-template-columns: 1fr 180px`) collapsing to one below 700 px; ✕ button with the accessible name "Close card"; scrim click closes. Header: title `input` and location line. Left: Labels, Members (read-only here), Description, Checklist (read-only), Activity. Right: "Add to card" heading and six buttons.

**Description** (C-05): rendered view through `renderMarkdownSubset` (micromark, CL-E37) inside a `div` with the class `card-description`, styled with the PT type scale; editor textarea `aria-label` "Description", Save and Cancel, character counter `aria-live="polite"` above 9,000.

**Move picker** (C-11): popover dialog anchored to the Move button; two labelled `select` elements and a Move button; the position select lists "1 (top)" to "n+1 (bottom)" for a different list and "1" to "n" for the same list.

**Activity** (FS §7): `ol` of `li` entries; each `li` has the actor avatar (`aria-hidden`, name is in the text), the sentence and a `time` element; "Load more" at the end.

**Confirmations**: `ConfirmDialog` for Delete with the AC 18 text; confirm button "Delete card".

**Keyboard**: card front Enter/Space opens; composer Enter/Shift+Enter/Esc; modal Tab cycles within, Esc closes (unless a nested popover or editor is open, in which case Esc closes that first: Esc stack, TAS-94); title Enter/Esc; description editor Esc cancels editing; Move picker Tab/arrows/Enter/Esc; dialog per FB-03.

**Focus behaviour**: opening the modal focuses the ✕ button (so a screen reader hears the dialog name first and the title field is not accidentally edited); closing returns focus to the originating card; after Delete, to the list header; after Move, to the Move button; after Copy, stays on Copy.

**Toasts** (X-01): `cards.toast.added`, `cards.toast.titleUpdated`, `cards.toast.descriptionSaved`, `cards.toast.moved` ("Moved to {listName}"), `cards.toast.reordered` ("Card moved"), `cards.toast.copied`, `cards.toast.deleted`, `cards.toast.conflict` ("Updated by someone else, showing the latest"), `cards.toast.failed`.

**Strings** (catalogue keys): `cards.add`, `cards.add.placeholder`, `cards.add.submit`, `cards.add.hint`, `cards.add.cancel`, `cards.front.hasDescription`, `cards.front.checklist` ("{done} of {total} checklist items"), `cards.front.comments` ("{count} comments"), `cards.front.moreMembers` ("+{n}"), `cards.modal.close`, `cards.modal.title.label`, `cards.modal.location` ("in {listName}"), `cards.modal.labels`, `cards.modal.members`, `cards.modal.description`, `cards.modal.description.placeholder`, `cards.modal.description.label`, `cards.modal.description.save`, `cards.modal.description.cancel`, `cards.modal.description.counter` ("{count} / {max}"), `cards.modal.checklist`, `cards.modal.activity`, `cards.modal.activity.loadMore`, `cards.modal.addToCard`, `cards.modal.soon` ("Available soon"), `cards.modal.move`, `cards.modal.move.title`, `cards.modal.move.list`, `cards.modal.move.position`, `cards.modal.move.top` ("{n} (top)"), `cards.modal.move.bottom` ("{n} (bottom)"), `cards.modal.move.confirm`, `cards.modal.copy`, `cards.modal.delete`, `cards.delete.confirmTitle`, `cards.delete.confirmBody`, `cards.delete.confirm`, `activity.card.created`, `activity.card.created.copied`, `activity.card.renamed`, `activity.card.described`, `activity.card.described.removed`, `activity.card.moved`, `activity.card.reordered`, `activity.card.archived`, `activity.card.archived.list`, `activity.card.archived.all`, `activity.generic.{type}` for the remaining FS §5.2 types, plus the toast keys above.

### 6. API contract

Schemas in `flowboard-shared/src/schemas/card.ts` (new request and detail schemas; `cardSummarySchema` moves here from `board.ts` with a re-export so FB-04 imports keep working, and its field set is **not** changed: `CardSummary` has no `createdBy`; `createdBy` is exposed only on `CardDetail`, which spreads the `Card` entity schema that already carries it) and `flowboard-shared/src/schemas/activity.ts`. Auth on every route: session cookie or bearer token (FB-02); `Origin` check on mutations for cookie auth (CL-E9). Capabilities: `board.manageCards` for mutations, `board.view` for reads, resolved through `card → list → board`. A caller who cannot view the board gets `404`.

```
POST /v1/lists/{id}/cards
Auth: board.manageCards on the list's board
Request: CardCreate { title: string (1..500 after trim) }
Response 201: CardSummary
Side effects: position = positionAtEnd(max live card position in the list); activity card.created { title };
  funnel card.created { boardId, workspaceId } (CL-E40)
Errors: 401, 403 forbidden or bad_origin, 404 list not visible or archived, 422 validation
```

```
GET /v1/cards/{id}
Auth: board.view on the card's board
Response 200: CardDetail { ...Card, description: string | null, boardId, listName, labelIds, memberIds,
  checklistItems: ChecklistItem[], commentCount }
Archived cards: 404 for member/observer; 200 with archivedAt for board admin/workspace admin
Errors: 401, 404
```

```
PATCH /v1/cards/{id}
Auth: board.manageCards
Headers: If-Match: <updatedAt as returned> (optional in MVP-2, CL-E23)
Request: CardPatch {
  title?: string (1..500),
  description?: string (0..10000) | null,
  listId?: uuid, position?: number (> 0, finite),   // listId requires position; position alone reorders in place
  via?: "drag" | "menu"                              // default "drag"; only meaningful with position
}  // at least one of title, description, position
Response 200: CardSummary
Errors: 401, 403, 404, 409 stale, 422 validation, cross-board or archived target list
Activity events written: card.renamed { from, to } when title changes; card.described { hasDescription } when description changes;
  card.moved { fromListId, toListId, fromPosition, toPosition, via } when position or list changes (CL-E35, CL-E41)
Re-balance: when needsRebalance(destination list) after the write, rewrite that list inline (CL-E36; FB-07 tests it)
```

```
DELETE /v1/cards/{id}
Auth: board.manageCards
Headers: If-Match optional
Response 204
Side effects: archived_at = now(); activity card.archived { via: "card" }
Errors: 401, 403, 404 (not visible or already archived), 409
```

```
POST /v1/cards/{id}/copy
Auth: board.manageCards
Response 201: CardSummary (the copy)
Side effects (one transaction, CL-A13, CL-E39): new card at positionBetween(original.position, next?.position),
  title "{title} (copy)" fitted to 500, description, dueAt, dueComplete, card_label, card_member, checklist_item copied;
  activity card.created { title, copiedFromCardId } on the copy; nothing on the original; no funnel event
Errors: 401, 403, 404
```

```
GET /v1/cards/{id}/activity?cursor=&limit=
Auth: board.view
Query: ActivityQuery { cursor?: string, limit?: int 1..200 (default 50) }
Response 200: ActivityPage { items: ActivityEvent[], nextCursor: string | null }
Ordering: createdAt desc, id desc (cursor encodes both, CL-E38)
Errors: 401, 404, 422 bad cursor or limit
```

Payload schemas (`activity.ts`): `CardCreatedPayload { title, copiedFromCardId? }`, `CardRenamedPayload { from, to }`, `CardDescribedPayload { hasDescription }`, plus `CardMovedPayload` and `CardArchivedPayload` from FB-05. WebSocket: none until FB-15; the frames will be these objects.

### 7. Data changes

No schema change. FB-01 created `card` (`description text`, `position`, `due_at`, `due_complete`, `archived_at`, `created_by`), `card_label`, `card_member`, `checklist_item`, `comment`, `activity_event` with `activity_event_card_created_idx (card_id, created_at desc)` and `funnel_event`. The copy transaction reads child rows by primary key and foreign-key indexes. `card.created_by` is nullable in FB-01 for seed rows; FB-06 always writes it. If the activity query plan on a card with 1,000 events shows the index unused, the backend task adds `id` to it in a new migration and records the query here.

Seed: unchanged; the prototype seed's descriptions and activity entries are what AC 2 and AC 19 assert against.

### 8. Authorisation

| Capability | Workspace admin | Board admin | Board member | Observer | Workspace member, not on board | Other workspace |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Create card | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Read card detail | ✓ | ✓ | ✓ | ✓ | 404 | 404 |
| Read activity | ✓ | ✓ | ✓ | ✓ | 404 | 404 |
| Edit title, description | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Move (menu or drag) | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Copy | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Delete (archive) | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Read archived card | ✓ | ✓ | 404 | 404 | 404 | 404 |

Covered by `flowboard-api/test/cards.matrix.test.ts` from this table (CL-E29); FB-09's generator later replaces it.

### 9. Dependencies

- Backlog: FB-05 backend task (shared payload schemas, `(position, id)` ordering) for the backend task; FB-05 frontend task and the FB-06 backend task for the frontend task; both for the QA task. TAS-94 before the frontend task (nested Esc handling in the modal).
- Decisions: CL-D17, CL-A2, CL-A13, CL-E3, CL-E6, CL-E13, CL-E23, CL-E24, CL-E26, CL-E29, CL-E32, CL-E35, CL-E37 to CL-E41.
- New packages: `micromark` (runtime, `flowboard-web`) for the sanitised Markdown subset (CL-E37). If the FB-06 frontend task finds a construct that cannot be disabled, it records the alternative in `CLARIFICATIONS.md` §3 before adding any other renderer.

### 10. Test plan

| Level | Tests | Covers |
|---|---|---|
| Unit | `flowboard-shared/src/schemas/card.test.ts` (title bounds, description 10,000 and null, listId requires position, via default, at-least-one-field); `flowboard-shared/src/schemas/activity.test.ts` (payloads, cursor query); `flowboard-api/src/cards/copy-title.test.ts` (" (copy)" fitting); `flowboard-api/src/activity/cursor.test.ts`; `flowboard-web` `renderMarkdownSubset.test.ts` (subset renders; `<script>`, `javascript:`, images, headings, HTML render as text; links get `rel`), `CardComposer.test.tsx` (Enter keeps open, Shift+Enter, Esc, empty ignored), `CardFront.test.tsx` (renders only what exists, accessible name), `CardModal.test.tsx` (focus trap and restore, Esc stack, single column), `MovePicker.test.tsx` (position options per list, computed position), `ActivityFeed.test.tsx` (sentences per type, relative time, load more) | AC 1, 4 to 6, 8, 10 to 19 |
| Integration | `test/cards.create.test.ts` (position, events, funnel, archived list, `createdBy` on the detail read); `test/cards.get.test.ts` (detail shape against seed, archived visibility); `test/cards.patch.test.ts` (title, description, If-Match 409, no-op no event, move same list, move across lists, cross-board 422, archived target 422, via default); `test/cards.copy.test.ts` (fields, position between, title fitting, `createdBy` is the caller, single event, original untouched); `test/cards.delete.test.ts`; `test/cards.activity.test.ts` (ordering, pagination, cursor, actor join); `test/cards.matrix.test.ts` | AC 1 to 9 |
| End to end (QA) | `flowboard-web/e2e/FB-06-cards.spec.ts`: `C-01 adds cards rapidly with Enter and the composer stays open`, `C-01 Esc closes the composer and empty title is ignored`, `C-03 opens the card modal with its own URL and closes with Esc scrim and button`, `C-03 direct URL opens board with modal`, `C-03 focus is trapped and restored`, `C-04 renames the card from the modal and the board updates`, `C-05 saves a Markdown description and shows the indicator`, `C-05 description survives reload and renders with the indicator`, `C-05 hostile description renders as text`, `C-05 cancel discards`, `C-11 moves a card to another list and position with the keyboard`, `C-12 copies a card below the original with copied fields`, `C-13 delete requires confirmation and archives`, `C-13 cancel keeps the card`, `FS §7 activity lists events newest first with load more`, `FS §6 observer sees read-only card and modal`, `FS §7.1 stale edit shows conflict toast and refreshes`, `X-01 card toasts appear within 200 ms` (`*-x01` projects), `FB-06 keyboard-only add open rename describe move copy delete`, `FS §8 modal is single column below 700 px` | AC 10 to 21, 23 |
| End to end, slice (QA) | `flowboard-web/e2e/MVP-2-first-card.spec.ts`: `S1 new visitor signs up, creates a board and adds the first card in under two minutes` (timer from first navigation to the card being visible; asserts elapsed < 120 s and prints it; no description step inside the timed window) | AC 22 |
| Accessibility | axe in both themes: board with cards, composer open, modal open, description editor open, Move picker open, Delete dialog open | AC 23 |
| Performance | None until FB-16; FB-06 renders all cards without virtualisation | |

### 11. Verification evidence

- CI run links on the backend, frontend and QA pull request heads.
- Integration output including the matrix test, the `409` cases, the copy field assertions and the activity pagination.
- Playwright report for `FB-06-cards.spec.ts`, the slice test's elapsed time and trace, `*-x01` output for card toasts.
- Screenshots: composer open, card fronts with and without badges, modal (two columns and single column), description editor and rendered description, Move picker, Delete dialog, activity feed, observer view, in light and dark.
- `renderMarkdownSubset` test output showing hostile inputs rendered as text.
- Review task links and verdicts per pull request.
- Definition-of-done items not met, stated plainly.

### 12. Open questions

None requiring a business decision beyond those already answered (CL-D17 for the description format, CL-A13 for copy). Two points were put to Anas on the Wave-1 card, each an engineering choice inside approved scope recorded in `CLARIFICATIONS.md` §3.4, and both were accepted as recommended on 7 October 2026:

- **CL-E40** writes the funnel event `card.created` in FB-06 rather than waiting for FB-18, the same way CL-A19 moved the invitation events into FB-09. It costs one insert and makes the BM §9 activation metric measurable from the first MVP-2 build.
- **CL-E37** adds `micromark` as the one Markdown renderer. It is a small CommonMark-compliant dependency whose default output is HTML-escaped; the alternative (a hand-written parser) was a larger security risk.
