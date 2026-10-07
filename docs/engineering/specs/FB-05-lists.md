**Backlog item:** FB-05 Lists
**Status:** Approved
**Approved by:** Anas, 7 October 2026 (Paperclip issue TAS-126, Wave-1 confirmation card accepted at 09:42 UTC per CL-D24; independent review TAS-128 and TAS-129)
**Owner(s):** FlowBoard Backend (`flowboard-api` list routes, `flowboard-shared` list schemas), FlowBoard Frontend (`flowboard-web` add-list form, list header editing, list menu, WIP popover, confirmations), FlowBoard QA (`flowboard-web/e2e/FB-05-lists.spec.ts`, in a separate task after the Frontend task)
**Reviewer:** cross-assigned per pull request among FlowBoard Backend, Frontend and QA; never the author (STANDARDS §1.9)
**Increment:** MVP-2

---

### 1. Goal

A board member can add a list at the right end of the canvas, rename it in place, give it an advisory WIP limit that colours the header pill when exceeded, sort its cards by due date, archive all its cards, and delete (archive) the list itself, each behind a confirmation where the action is destructive. With FB-05 the board stops being the fixed three-column view of MVP-1 and becomes a structure the team shapes, which is the first half of MVP-2 "Core Kanban" (TAS-7 §9.2). The list reorder API lands here so the drag gesture of FB-07 has something to persist to.

### 2. Requirement references

| Source | Reference | Requirement | Tag |
|---|---|---|---|
| FS | L-01 | Add a list to the right of existing lists; it appears immediately and is empty | [REQ] |
| FS | L-02 | Rename a list inline; title editable in place; change persists on blur | [REQ] |
| FS | L-03 | Reorder lists by dragging; order persists for all board members (persistence half here, gesture in FB-07) | [REQ] |
| FS | L-04 | Set a WIP limit; counter shows `count / limit`; turns red when exceeded; advisory, never blocks a drop | [REQ] |
| FS | L-05 | Sort a list by due date; cards reorder ascending, cards with no date last | [REQ] |
| FS | L-06 | Archive all cards in a list, or delete the list; both ask for confirmation; deleting a list archives its cards | [REQ] |
| FS | §4.4 | Horizontally scrolling row of 286 px lists followed by an **Add another list** affordance; lists scroll vertically so headers and the add-card control stay visible | [REQ] |
| FS | §4.5 | List header: inline-editable name, `count / WIP` pill, ⋯ menu with Set WIP limit · Sort by due date · Archive all cards · Delete list | [REQ] |
| FS | §5, §5.1 | List fields `name, position, wip_limit, archived`; sparse-float positions | [REQ] |
| FS | §5.2 | `card.moved` for sorted cards, `card.archived` for archived cards; append-only | [REQ] |
| FS | §6 | Create / rename / delete lists: workspace admin, board admin, board member; Observer refused | [REQ] |
| FS | §7 | `POST /v1/boards/{id}/lists`, `PATCH /v1/lists/{id}` rename, reposition, set WIP limit, `DELETE /v1/lists/{id}` archive | [REQ] |
| FS | §7.1 | `If-Match` with `409` on stale edits | [REQ] |
| FS | X-01, X-03 | Toast within 200 ms; Enter submits, Esc cancels | [REQ] |
| FS | §8 | Keyboard operable, focus management, colour never the only carrier (the over-limit pill carries text) | [REQ] |
| BM | §2.3, §5 | Flow discipline through WIP limits is a differentiator; the over-limit state must be unmistakable | [REQ] |
| CL | CL-D4 | WIP limits are advisory only; no server-side rejection on WIP grounds | [REQ] |
| CL | CL-E2 | Deleting a list: confirmation, list archived, cards archived and restorable | [REQ] |
| CL | CL-A2 | "Delete" means archive with 30-day restore (FB-17) | [REQ] |
| CL | CL-A14 (closes CL-O5) | Sort by due date is a one-off rewrite of positions, stable for ties, one `card.moved` per moved card | [REQ] |
| CL | CL-A17 | The pill shows the unfiltered count | [REQ] |
| CL | CL-E23 | `If-Match` on `PATCH /v1/lists/{id}` as CL-E18 | [ENG] |
| CL | CL-E24 | Additive routes `POST /v1/lists/{id}/archive-cards`, `POST /v1/lists/{id}/sort-by-due` | [ENG] |
| CL | CL-E29 | Hand-written per-role matrix test until the FB-09 generator back-fills it | [ENG] |
| CL | CL-E33 | Name 1 to 80 characters; `wipLimit` 1 to 999 or `null`; new list appended | [ENG] |
| CL | CL-E34 | Delete list archives list and cards with one shared timestamp; `via` in `card.archived` | [ENG] |
| CL | CL-E35 | `card.moved` payload with `via: "sort"` | [ENG] |
| CL | CL-E6 | Inline form instead of `prompt()`; confirmations PT lacks | [REQ] |
| PT | `listMenu`, `#addList`, `.list-head input`, `.pill`, `.wip-over`, `.add-list` | Visual and interaction reference | [REQ] |
| TAS-7 | §9.3 FB-05 items 1 to 9 | Acceptance criteria approved on 6 October 2026 | [REQ] |

No **[ASM]** rows: the two assumptions this item depended on (CL-O5 sort semantics, and the `prompt()`-free WIP editor from CL-E6) are now recorded.

### 3. Scope

**In scope**

- Backend: `POST /v1/boards/{id}/lists`, `PATCH /v1/lists/{id}` (name, position, wipLimit), `DELETE /v1/lists/{id}`, `POST /v1/lists/{id}/archive-cards`, `POST /v1/lists/{id}/sort-by-due`; the `board.manageLists` capability wired to every route; `If-Match`; transactions and events of CL-E34 and CL-A14; `card.moved` payload writer shared with FB-06.
- Shared: `ListCreate`, `ListPatch`, `ListIdParams`, `ListArchiveCardsResult`, `ListSortByDueResult`, `CardMovedPayload`, `CardArchivedPayload` schemas; constants `LIST_NAME_MAX_LENGTH = 80`, `WIP_LIMIT_MAX = 999`.
- Frontend: "Add another list" affordance and inline form; list name as an inline-editable field; `count / limit` pill with the over-limit state; list menu (⋯) with the four FS §4.5 items; WIP popover with a number field and Clear; confirmation dialogs for Archive all cards and Delete list; optimistic updates with rollback and `409` handling; toasts.
- QA: Playwright per story, axe on every new state, hand-written role matrix check through the API for the Observer negative.

**Out of scope**

- The drag gesture for lists and cards (FB-07). `PATCH /v1/lists/{id} { position }` ships here and FB-07 calls it.
- Cards, composer, card front, card modal (FB-06). The list body keeps the FB-04 empty text until FB-06 replaces it; the list menu item "Sort by due date" is still implemented and tested here against seeded cards.
- Restore of archived lists and cards, archived-items view, purge (FB-17).
- Search and filter interaction with the pill (FB-13 cites CL-A17).
- Realtime (FB-15): other members see changes on the next hydration.
- Virtualised list bodies (FB-16).

### 4. Acceptance criteria

1. **[REQ, L-01, FS §4.4, CL-E33]** `POST /v1/boards/{id}/lists { name: "Review" }` returns `201` with the `List` whose `position` is `positionAtEnd(max position on the board)` (1024 when the board has no lists, 4096 after the three defaults), `wipLimit: null`, `archivedAt: null`; the list is present in `GET /v1/boards/{id}` for another board member.
2. **[REQ, L-02, FS §7.1, CL-E23, CL-E33]** `PATCH /v1/lists/{id} { name }` with a matching `If-Match` returns `200` with the new `updatedAt`; a stale `If-Match` returns `409 stale`; no header succeeds; names are trimmed and must be 1 to 80 characters, otherwise `422 validation_failed`.
3. **[REQ, L-03, FS §5.1]** `PATCH /v1/lists/{id} { position: 1536 }` places the list between the lists at 1024 and 2048 in the next hydration for every member; `position` must be a positive finite number, otherwise `422`; a position equal to another list's position is accepted (last write wins) and hydration then orders by `(position, id)`.
4. **[REQ, L-04, CL-D4, CL-E33]** `PATCH /v1/lists/{id} { wipLimit: 3 }` stores 3; `{ wipLimit: null }` clears it; `0`, negative, non-integer and values above 999 are `422`; a `PATCH /v1/cards/{id}` move into a list already at or over its limit still succeeds (integration test with FB-06's route when it exists, and with a direct row insert before that).
5. **[REQ, L-05, CL-A14, CL-E35]** `POST /v1/lists/{id}/sort-by-due` on a list holding, in rank order 1 to 5, the cards A (due 10 Oct), B (12 Oct), C (11 Oct), D (no date), E (12 Oct) returns `200 { movedCardIds }` and the next hydration orders them A, C, B, E, D with positions 1024, 2048, 3072, 4096, 5120 (B stays before E because the sort is stable); `movedCardIds` is `[C, B, E, D]` and exactly one `card.moved` with `via: "sort"` is written for each of those four cards whose **rank** changed, none for A, whose rank is unchanged even though its position was rewritten; calling the route again returns `{ movedCardIds: [] }` and writes no event.
6. **[REQ, L-06a, CL-E34]** `POST /v1/lists/{id}/archive-cards` returns `200 { archivedCardIds }`, sets `archived_at` on every non-archived card in the list, writes `card.archived` with `{ via: "archive_all" }` per card, leaves the list itself live, and the list's `cards` array is empty in the next hydration while the sidebar card count drops accordingly (CL-E17).
7. **[REQ, L-06b, CL-E2, CL-E34]** `DELETE /v1/lists/{id}` returns `204`, sets the same `archived_at` timestamp on the list and on each of its non-archived cards, writes `card.archived` with `{ via: "list_archived" }` per card, and the list is absent from the next hydration for every member; cards archived before the delete keep their earlier `archived_at`. A second `DELETE` returns `404`.
8. **[REQ, FS §6]** Authorisation negatives, per route in §6: Observer gets `403 forbidden` on every list mutation; a workspace member who is not on the board and a user from another workspace get `404 not_found`; board member and board admin get the success code; workspace admin not on the board gets the success code; unauthenticated gets `401`; a cookie-authenticated mutation without a matching `Origin` gets `403 bad_origin` (CL-E9).
9. **[REQ, FS §7]** `POST /v1/boards/{id}/lists` on an archived board returns `404` for members and `422` for admins (the board must be restored first); list routes on an archived list return `404`.
10. **[REQ, L-01, FS §4.4, CL-E6]** Frontend: the canvas ends with an "Add another list" button (PT `.add-list`); activating it swaps it for an inline text field (placeholder "List name", `maxlength` 80, autofocus) with an "Add list" button; Enter creates and the new empty list appears at the right end immediately, scrolled into view, with focus on its name field; Esc or blur with an empty value cancels; an empty or whitespace-only name is refused inline with "Enter a list name"; toast "List added" within 200 ms (X-01). Observers do not see the affordance.
11. **[REQ, L-02, FS §4.5]** The list name is an `input` styled as text with the accessible label "List name"; Enter or blur persists the trimmed value and the header updates optimistically; Esc restores the previous value; an empty value reverts; a `409` re-fetches the board and shows the toast "This list was changed elsewhere, showing the latest"; toast "List renamed" on success. Observers see a read-only heading.
12. **[REQ, L-04, CL-D4, CL-A17]** The pill reads `{count}` when there is no limit and `{count} / {limit}` when there is one, where `count` is the number of non-archived cards in the list regardless of any filter; when `count > limit` the pill gets the over-limit style (PT `.wip-over`) **and** visually hidden text "over limit" so the state is announced, with an accessible name such as "4 of 3 cards, over limit"; the state updates immediately when a card is added or moved.
13. **[REQ, L-04, FS §4.5, CL-E6]** "Set WIP limit" in the list menu opens a popover anchored to the header with a number field (min 1, max 999, step 1, labelled "WIP limit", prefilled with the current limit), a "Save" button and a "Clear limit" button; Enter saves; Esc closes without saving; invalid input is refused inline; toasts "WIP limit set to {limit}" and "WIP limit cleared". The popover is on the Esc stack (FB-03, TAS-94).
14. **[REQ, L-05]** "Sort by due date" in the list menu reorders the list's cards immediately (optimistic, using the same comparator as the server from `flowboard-shared`) and shows the toast "Sorted by due date"; on failure the previous order is restored with the toast "Could not sort the list".
15. **[REQ, L-06a, X-01]** "Archive all cards" opens a confirm dialog ("Archive all {count} cards in '{name}'? You can restore them from archived items for 30 days."); confirming empties the list and shows "Cards archived"; Cancel or Esc leaves the list untouched; the item is disabled with the hint "No cards to archive" when the list is empty.
16. **[REQ, L-06b, CL-E2, X-01]** "Delete list" (destructive styling) opens a confirm dialog ("Delete '{name}'? Its {count} cards are archived with it and can be restored for 30 days."); confirming removes the list from the canvas, moves focus to the previous list's header (or to "Add another list" when none remains) and shows "List deleted"; Cancel or Esc leaves the list untouched.
17. **[REQ, FS §6]** For an Observer the list menu shows no items and is not rendered; the name is static; the add-list affordance is absent. For Members and Admins all controls render. The UI never relies on hiding alone: an Observer who calls the API is refused (AC 8).
18. **[REQ, FS §8]** Add-list form, name field, list menu, WIP popover and both dialogs are keyboard-operable with visible focus; the menu is arrow-key navigable and closes on Esc returning focus to the ⋯ button; axe reports zero violations on the board page with the add-list form open, the list menu open, the WIP popover open, a pill in the over-limit state, and each dialog open, in both themes.

### 5. User interface

Visual reference: PT `renderBoard` (`.list`, `.list-head`, `.pill`, `.wip-over`, `.add-list`), `listMenu` (`popup` rows), `#addList` (CL-A10 tokens, CL-E6 for the `prompt()` replacements). Primitives from FB-03: `Dialog`, `ConfirmDialog`, `ToastProvider`, the Esc stack and the `focusable` helpers.

**Add another list** (FS §4.4, L-01): a 286 px wide dashed button at the end of the canvas row, text "＋ Add another list". Activation renders an inline form in its place (input, "Add list" primary button, "Cancel" secondary). After creation the canvas scrolls so the new list is visible and focus lands on the new list's name field; the affordance returns after the new list.

**List header** (FS §4.5, L-02, L-04): `input.board-list-column__name` with `aria-label` "List name"; the pill as a plain `span` (not a live region, because it changes on every card move and would be noisy; the FB-07 announcements cover moves) with the count text plus visually hidden "over limit" when applicable. The ⋯ icon button has the accessible name "List actions for {name}" and opens a menu (`role="menu"`) with items "Set WIP limit", "Sort by due date", "Archive all cards", "Delete list" (destructive styling).

**WIP popover** (L-04): anchored below the ⋯ button; `role="dialog"` with `aria-label` "WIP limit for {name}"; number input, Save, Clear limit; focus moves into the input on open and back to the ⋯ button on close.

**Confirmations** (L-06): `ConfirmDialog` from FB-03 with the texts in AC 15 and 16; the confirm button reads "Archive cards" and "Delete list".

**Keyboard**: name field submits on Enter (blurs) and reverts on Esc; add-list form submits on Enter and cancels on Esc; menu opens on Enter/Space, navigates with Up/Down, activates with Enter, closes with Esc; popover Enter saves, Esc closes; dialogs follow FB-03.

**Focus behaviour**: after Add list, focus goes to the new list's name field; after Delete list, to the previous list's header name or the add-list button; after WIP save, back to the ⋯ button; after Sort, focus stays on the menu button.

**Toasts** (X-01): `lists.toast.added`, `lists.toast.renamed`, `lists.toast.wipSet` ("WIP limit set to {limit}"), `lists.toast.wipCleared`, `lists.toast.sorted`, `lists.toast.sortFailed`, `lists.toast.cardsArchived`, `lists.toast.deleted`, `lists.toast.conflict`, `lists.toast.failed`.

**Strings** (catalogue keys): `lists.add`, `lists.add.placeholder`, `lists.add.submit`, `lists.add.required`, `lists.name.label`, `lists.actions` ("List actions for {name}"), `lists.pill.count` ("{count}"), `lists.pill.withLimit` ("{count} / {limit}", already `lists.wipPill` from FB-04; renamed here with an alias kept), `lists.pill.overLimit` ("over limit"), `lists.pill.name` ("{count} of {limit} cards"), `lists.menu.wip`, `lists.menu.sort`, `lists.menu.archiveCards`, `lists.menu.archiveCards.empty` ("No cards to archive"), `lists.menu.delete`, `lists.wip.title`, `lists.wip.label`, `lists.wip.save`, `lists.wip.clear`, `lists.wip.invalid` ("Enter a whole number from 1 to 999"), `lists.archiveCards.confirmTitle`, `lists.archiveCards.confirmBody`, `lists.archiveCards.confirm`, `lists.delete.confirmTitle`, `lists.delete.confirmBody`, `lists.delete.confirm`, plus the toast keys above.

### 6. API contract

Schemas in `flowboard-shared/src/schemas/list.ts` (new) and `flowboard-shared/src/schemas/activity.ts` (payloads, new). Auth on every route: session cookie or bearer token (FB-02); `Origin` check on mutations for cookie auth (CL-E9). Capability: `board.manageLists` (`authz/can.ts`), resolved from the list's board. Visibility: a caller who cannot `board.view` the board gets `404`, never `403` (FB-04 §8 pattern).

```
POST /v1/boards/{id}/lists
Auth: board.manageLists on board {id} (workspace admin, board admin, board member)
Request: ListCreate { name: string (1..80 after trim) }
Response 201: List
Side effects: position = positionAtEnd(max(position) of non-archived lists on the board)
Errors: 401, 403 forbidden (observer) or bad_origin, 404 board not visible, 422 validation or board archived (admins)
Activity events written: None (FS §5.2 events are card-scoped)
WebSocket events published: None until FB-15
```

```
PATCH /v1/lists/{id}
Auth: board.manageLists on the list's board
Headers: If-Match: <updatedAt as returned> (optional in MVP-2, CL-E23)
Request: ListPatch { name?: string (1..80), position?: number (> 0, finite), wipLimit?: number (int 1..999) | null }  // at least one field
Response 200: List
Errors: 401, 403, 404 not visible or list archived, 409 stale, 422 validation
Activity events written: None
```

```
DELETE /v1/lists/{id}
Auth: board.manageLists
Headers: If-Match optional (CL-E23)
Response 204
Side effects (one transaction, CL-E34): list.archived_at = now(); card.archived_at = same now() for each live card;
  activity card.archived { via: "list_archived" } per card
Errors: 401, 403, 404 (not visible or already archived), 409 stale
```

```
POST /v1/lists/{id}/archive-cards
Auth: board.manageLists
Response 200: ListArchiveCardsResult { archivedCardIds: string[] }
Side effects (one transaction): card.archived_at = now() for each live card; activity card.archived { via: "archive_all" } per card
Errors: 401, 403, 404
```

```
POST /v1/lists/{id}/sort-by-due
Auth: board.manageLists
Response 200: ListSortByDueResult { movedCardIds: string[] }
Side effects (one transaction, CL-A14): stable sort of live cards by (dueAt asc nulls last, current position);
  positions rewritten with rebalance(count); activity card.moved { fromListId = toListId, fromPosition, toPosition, via: "sort" }
  for each card whose rank changed; updatedAt bumped on every rewritten card
Errors: 401, 403, 404
```

Payload schemas (`flowboard-shared/src/schemas/activity.ts`): `CardMovedPayload { fromListId, toListId, fromPosition, toPosition, via: "drag" | "menu" | "sort" }` (CL-E35); `CardArchivedPayload { via: "card" | "archive_all" | "list_archived" }`. The `ActivityEvent.payload` type stays an open record (FB-01); these schemas validate what the routes write and what the feed renders.

Pagination: none (no list endpoint added). `If-Match` behaviour: CL-E23; `position`-only patches are list edits and bump `updatedAt`.

### 7. Data changes

No schema change. FB-01 created `list` (`position`, `wip_limit` with `list_wip_limit_check`, `archived_at`) and `card` with `card_list_active_idx (list_id, position) where archived_at is null`, which serves the archive, sort and count queries. Hydration (FB-04) must order lists and cards by `(position, id)`; if the FB-04 query orders by `position` alone, FB-05's backend task changes the `ORDER BY` and records it here. Soft delete only (`archived_at`); activity is insert-only (STANDARDS §1.3).

Seed: unchanged. The prototype seed already has lists with WIP limits and over-limit counts (Design 3 with 4 cards on Product Roadmap Q3) that AC 12 uses.

### 8. Authorisation

| Capability | Workspace admin | Board admin | Board member | Observer | Workspace member, not on board | Other workspace |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Create list | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Rename, reposition, set WIP | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Archive all cards | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Delete list | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Sort by due date | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| See lists (hydration, FB-04) | ✓ | ✓ | ✓ | ✓ | 404 | 404 |

Covered by `flowboard-api/test/lists.matrix.test.ts`, written in the FB-04 style from this table (CL-E29); the FB-09 generator later replaces it. Observer and member rows use direct `board_member` inserts because invitations arrive in FB-09.

### 9. Dependencies

- Backlog: FB-04 (done) for the backend task; FB-04 and the FB-05 backend task for the frontend task; both for the QA task.
- Decisions: CL-D4, CL-E2, CL-A2, CL-A14, CL-A17, CL-E23, CL-E24, CL-E29, CL-E33, CL-E34, CL-E35, CL-E6.
- Follow-ups that should land first: TAS-94 (Esc layering) before the frontend task, because the WIP popover and the list menu join the Esc stack.
- New packages: none.

### 10. Test plan

| Level | Tests | Covers |
|---|---|---|
| Unit | `flowboard-shared/src/schemas/list.test.ts` (name trim and 80 bound, wipLimit 1..999 or null, patch needs one field, position positive finite); `flowboard-shared/src/sort-by-due.test.ts` (stable ascending, nulls last, rank-change detection); `flowboard-web` `AddList.test.tsx` (Enter, Esc, empty refused), `ListHeader.test.tsx` (name edit, pill text and over-limit text, observer read-only), `ListMenu.test.tsx` (items, disabled archive on empty list), `WipPopover.test.tsx` (bounds, Save, Clear, Esc) | AC 1 to 5, 10 to 13, 17 |
| Integration | `test/lists.create.test.ts` (position at end, archived board); `test/lists.patch.test.ts` (rename, position, wipLimit, If-Match 409, validation, archived list 404); `test/lists.delete.test.ts` (shared timestamp, per-card events, earlier archived untouched, second delete 404); `test/lists.archive-cards.test.ts`; `test/lists.sort-by-due.test.ts` (AC 5 fixture, idempotent second call); `test/lists.matrix.test.ts` | AC 1 to 9 |
| End to end (QA) | `flowboard-web/e2e/FB-05-lists.spec.ts`: `L-01 adds a list at the right end with Enter`, `L-01 Esc cancels and empty name is refused`, `L-02 renames a list inline on Enter and on blur`, `L-02 Esc reverts the list name`, `L-03 reordered list position persists after reload` (through the API call the UI will use, since the gesture is FB-07), `L-04 sets a WIP limit and the pill shows count / limit`, `L-04 pill shows over limit text and style when exceeded`, `L-04 clears the WIP limit`, `L-05 sorts cards by due date with undated last` (seeded board), `L-06 archive all cards requires confirmation and empties the list`, `L-06 delete list requires confirmation and removes the list`, `L-06 cancel keeps the list`, `FS §6 observer sees no list controls`, `X-01 list toasts appear within 200 ms` (in the `*-x01` projects), `FB-05 keyboard-only add rename WIP sort archive delete` | AC 10 to 18 |
| Accessibility | axe on the board page in both themes: add-list form open, list menu open, WIP popover open, over-limit pill, archive-cards dialog open, delete-list dialog open | AC 18 |
| Performance | None until FB-16 | |

### 11. Verification evidence

- CI run links on the backend, frontend and QA pull request heads (seven required checks plus the new non-required `Playwright e2e` once CL-A20 lands).
- Integration test output including the matrix test, the `409` case, the shared-timestamp assertion of AC 7 and the AC 5 ordering fixture.
- Playwright report for `FB-05-lists.spec.ts`; `*-x01` output for the list toasts.
- Screenshots: add-list form open, list being renamed, pill under and over limit, list menu open, WIP popover, both confirm dialogs, observer view, in light and dark.
- Review task links and verdicts per pull request.
- Definition-of-done items not met, stated plainly.

### 12. Open questions

None requiring a business decision. The engineering decisions this specification relies on are CL-E33 to CL-E35 (`CLARIFICATIONS.md` §3.4) and were confirmed by the Wave-1 card (CL-D24), accepted on 7 October 2026. The point raised on that card, the WIP limit upper bound of 999 (CL-E33), was accepted as recommended; it is an engineering guard with no FS source and changing it is a one-constant change.
