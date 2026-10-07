**Backlog item:** FB-07 Drag and drop
**Status:** Approved
**Approved by:** Anas, 7 October 2026 (Paperclip issue TAS-126, Wave-1 confirmation card accepted at 09:42 UTC per CL-D24; independent review TAS-128 and TAS-129)
**Owner(s):** FlowBoard Frontend (`flowboard-web` dnd-kit integration, sensors, announcements, optimistic moves, rollback), FlowBoard Backend (`flowboard-api` inline re-balance in the card and list move paths, CL-E36, plus the FS §5.1 integration test), FlowBoard QA (`flowboard-web/e2e/FB-07-drag-and-drop.spec.ts`, the baseline drag trace and the screen-reader pass, in a separate task after the Frontend task)
**Reviewer:** cross-assigned per pull request among FlowBoard Backend, Frontend and QA; never the author (STANDARDS §1.9)
**Increment:** MVP-2

---

### 1. Goal

A board member can drag a card within a list or to another list and drag a list by its header to a new place, with the pointer or entirely from the keyboard, and hear each step announced. The move persists through the `PATCH` routes that FB-05 and FB-06 shipped and appears for every member on their next load. FB-07 completes the Wave-1 exit criterion of TAS-7 §9.4 ("cards drag by pointer and keyboard") and is the hardest accessibility surface of v1.0 (TAS-7 §9.7), which is why the grammar and announcements are fixed here rather than left to implementation.

### 2. Requirement references

| Source | Reference | Requirement | Tag |
|---|---|---|---|
| FS | C-02 | Drag a card within a list or to another list; it lands at the pointer position; a move is written to the card's activity log | [REQ] |
| FS | L-03 | Reorder lists by dragging; order persists for all board members | [REQ] |
| FS | C-11 | Menu move exists as the accessible alternative (shipped in FB-06) | [REQ] |
| FS | §5.1 | Sparse-float positions; on drop the new position is the midpoint of its neighbours; re-balance when gaps get too small | [REQ] |
| FS | §5.2 | `card.moved` on every drop that changes list or position | [REQ] |
| FS | §6 | Move cards: workspace admin, board admin, board member; Observer refused. Lists likewise | [REQ] |
| FS | §7 | `PATCH /v1/cards/{id}` move (`list_id` + `position`); `PATCH /v1/lists/{id}` reposition | [REQ] |
| FS | §7.1 | Moves are last-write-wins with an `updated_at` precondition | [REQ] |
| FS | §8 Accessibility | Every drag action has a keyboard/menu equivalent; WCAG 2.2 AA (2.5.7 Dragging Movements) | [REQ] |
| FS | §8 Performance | Drag interaction holds 60 fps (CI budget from FB-16; baseline trace here) | [REQ] |
| FS | X-01, X-03 | Toast on rollback; Esc cancels | [REQ] |
| BM | §2.3 | Flow discipline: the WIP pill reacts during the gesture and never blocks | [REQ] |
| CL | CL-D4 | WIP limits advisory; a drop over the limit is never blocked | [REQ] |
| CL | CL-D2 | Speed at scale is the wedge; the drag path must stay cheap enough for FB-16's budget | [REQ] |
| CL | CL-E6 | Native HTML5 drag and drop from PT is not used; a keyboard-capable library is required | [REQ] |
| CL | CL-E23 | `If-Match` on moves; `409` rolls back | [ENG] |
| CL | CL-E32 | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` are the only new runtime dependencies for drag | [ENG] |
| CL | CL-E35 | `card.moved` payload with `via: "drag"` | [ENG] |
| CL | CL-E36 | Re-balance inline in the move transaction | [ENG] |
| CL | CL-E41 | Position as sent; same-board live list; ties by id | [ENG] |
| CL | CL-E42 | Keyboard grammar, announcements, 5 px pointer activation | [ENG] |
| ARCH | §3.1, §4 | Position module shared by API and web; dnd-kit with pointer and keyboard sensors and announcements | [ENG] |
| PT | `dragstart`/`dragover`/`drop` handlers on `.card` and `.list`, `.list.drag-over` outline, `.card.dragging` | Visual reference for the drop indicator and the dragged card's appearance only | [REQ] |
| TAS-7 | §9.3 FB-07 items 1 to 7; §9.2 S6 | Acceptance criteria approved on 6 October 2026; screen-reader pass | [REQ] |

No **[ASM]** rows.

### 3. Scope

**In scope**

- Frontend: `DndContext` around the board canvas with a `PointerSensor` (5 px activation distance) and a `KeyboardSensor` with a custom coordinate getter implementing the CL-E42 grammar; `SortableContext` per list for cards and one for the list row; drag overlay for the dragged card or list; drop indicator; optimistic move with the shared position module and rollback; WIP pill updates during the gesture; announcements through dnd-kit's `accessibility.announcements` and `screenReaderInstructions` in the message catalogue; Observer and archived-board states disable sensors.
- Backend: inline re-balance (CL-E36) in the card move path (`PATCH /v1/cards/{id}`) and the list move path (`PATCH /v1/lists/{id}`), with `SELECT … FOR UPDATE` on the container; the FS §5.1 integration test (60 consecutive midpoint drops).
- Shared: none new; `positionBetween`, `positionAtEnd`, `needsRebalance`, `rebalance` already exist (FB-01).
- QA: Playwright with pointer and keyboard drags on the three engines, axe during and after a drag, baseline drag trace on the seeded board, manual screen-reader pass recorded on the task (S6).

**Out of scope**

- Touch-specific gestures beyond what the pointer sensor provides (long-press delay tuning is FB-14 responsive work).
- Virtualised lists and the CI drag-performance budget (FB-16).
- Realtime position updates from other members (FB-15); another member's move appears on the next hydration.
- Multi-select drag, drag between boards, drag to archive. None is in FS.
- Any change to the `PATCH` contracts of FB-05 and FB-06.

### 4. Acceptance criteria

1. **[REQ, C-02, FS §5.1, CL-E35]** Dragging a card with the pointer and dropping it between two cards in another list places it there visually before the request completes, sends `PATCH /v1/cards/{id} { listId, position: positionBetween(prev, next), via: "drag" }` with `If-Match`, and the next hydration for another member shows the card in that list at that rank; `card.moved { fromListId, toListId, fromPosition, toPosition, via: "drag" }` is written. Dropping at the top uses `positionBetween(null, first)`; at the bottom `positionAtEnd(last)`; dropping a card back where it started sends no request and writes no event.
2. **[REQ, C-02]** Dragging within the same list reorders the card and sends `{ position, via: "drag" }` without `listId`; the event has `fromListId = toListId`.
3. **[REQ, L-03]** Dragging a list by its header to a new place in the row moves it visually at once, sends `PATCH /v1/lists/{id} { position }` with `If-Match`, and the order persists for every member on reload; dropping it where it started sends nothing.
4. **[REQ, FS §8, C-11, CL-E42]** Keyboard: with a card focused, Space (or Enter) picks it up; Down/Up moves it one position within the list; Right/Left moves it to the same index (clamped to the target's length) in the neighbouring list; Space (or Enter) drops; Escape cancels and returns it to its original list and position with no request sent. The same with a focused list header for lists using Left/Right. During a keyboard drag the card scrolls into view in the target list.
5. **[REQ, FS §8, CL-E42]** A polite live region announces: on pick-up "Picked up card {title}, position {i} of {n} in {list}"; on each move "Moved to {list}, position {i} of {n}" (or "Position {i} of {n}" within the same list); on drop "Dropped card {title} in {list}, position {i} of {n}"; on cancel "Move cancelled, card {title} returned to {list}, position {i} of {n}"; for lists the same sentences with "list" and positions in the row. The instructions text "To pick up a card, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop, Escape to cancel." is linked from every draggable through `aria-describedby`.
6. **[REQ, X-01, CL-E23, FS §7.1]** If the move request returns `403`, `404`, `409` or fails, the card or list returns to its previous place and the toast "Could not move the card, showing the latest" (or "…the list…") appears within 200 ms of the response; on `409` and `404` the board is re-fetched first so the rollback shows the current server state.
7. **[REQ, L-04, CL-D4]** While a card is dragged over a list, that list's pill shows the count as it would be after the drop (`count + 1 / limit`, over-limit style and text when applicable); a drop over the limit is accepted and persists; nothing in the UI or API blocks it.
8. **[REQ, FS §5.1, CL-E36]** Integration: starting from two cards at positions 1024 and 2048, 60 consecutive `PATCH` moves that each place a third card at the midpoint between the same two neighbours all return `200`; after the run the list's positions are evenly spaced (`rebalance(count)`), relative order is preserved, `needsRebalance` is false, every rewritten card has a new `updatedAt`, and exactly 60 `card.moved` events exist (none for the re-balanced neighbours). The same test runs for lists through `PATCH /v1/lists/{id}`.
9. **[REQ, FS §5.1, CL-E36]** Frontend: when the `position` in a move response differs from the one sent (the server re-balanced the container), the client re-fetches the board so its positions match the server's before the next drop. When the client-side `positionBetween` throws because the local gap is too small to split, the client re-fetches the board and recomputes once; if it still throws, the drop is rolled back with the AC 6 toast and no request is sent. Unit test on both paths; the server side is covered by AC 8.
10. **[REQ, FS §6]** For an Observer no card or list is draggable: no drag handle semantics, no sensors, no instructions text; the API refuses `PATCH` moves with `403` (covered by FB-05 and FB-06 matrix tests, re-asserted here through the keyboard path: pressing Space on a focused card as an Observer opens the card instead of picking it up).
11. **[REQ, FS §8]** Clicking a card without moving the pointer more than 5 px opens the card modal (FB-06); moving beyond 5 px starts a drag and releasing does not open the modal. Tab order is unchanged by dragging; after a drop or cancel, focus stays on the moved card (or list header).
12. **[REQ, FS §8 Performance, TAS-7 §9.3 FB-07 item 7]** QA records a Playwright trace of a pointer drag across lists on the seeded Product Roadmap Q3 board on Chromium and attaches it to the task as baseline evidence; no budget is asserted until FB-16.
13. **[REQ, FS §8, S6]** axe reports zero violations on the board page during a keyboard drag (card picked up, live region populated) and after the drop, in both themes; QA's manual screen-reader pass (NVDA with Firefox; VoiceOver with Safari if available) confirms the AC 5 announcements are read, with findings filed as tasks.
14. **[REQ, FS §8 Browser support]** The pointer and keyboard drag tests pass on Chromium, Firefox and WebKit.

### 5. User interface

Visual reference: PT `.card.dragging` (reduced opacity on the source), `.list.drag-over` (dashed accent outline on the target list). dnd-kit replaces PT's native HTML5 handlers (CL-E6).

**Structure**: one `DndContext` in the board route; `SortableContext` with `horizontalListSortingStrategy` for the list row and `verticalListSortingStrategy` per list body; `useSortable` on each card front (FB-06 component) and on each list header; `DragOverlay` renders a copy of the dragged card or list header following the pointer; the source stays in place at 40 % opacity; the target list gets the dashed outline; a 2 px accent drop indicator shows between cards where the item will land (so the drop point is visible even when the overlay covers it).

**Sensors**: `PointerSensor` with `activationConstraint: { distance: 5 }` (CL-E42; keeps click-to-open working, FB-06 AC 12); `KeyboardSensor` with a custom `coordinateGetter` that maps Up/Down to the previous/next card in the same list and Left/Right to the neighbouring list at the clamped index, and Left/Right on list headers to neighbouring list slots. Collision detection: `closestCorners` for cards (handles empty lists), `closestCenter` for lists. Auto-scroll of the canvas and of list bodies is enabled.

**Announcements**: `accessibility.announcements` returns the AC 5 strings from the catalogue; `screenReaderInstructions.draggable` is the instructions text; dnd-kit renders both in a visually hidden polite live region.

**Pill feedback**: the list component receives a `pendingCount` while a card hovers over it and renders the FB-05 pill with that count.

**Rollback**: TanStack Query optimistic update on the board query; on error the previous board snapshot is restored, then `invalidateQueries` for `409` and `404`; toast per AC 6.

**Observer and archived board**: sensors are not registered and `useSortable` receives `disabled: true`; no instructions `aria-describedby`.

**Keyboard**: as AC 4; Escape during a drag is consumed by the drag and does not reach the Esc stack (so it never closes the sidebar overlay or a popover mid-drag, TAS-94).

**Focus behaviour**: focus stays on the dragged element across the whole gesture; after a cross-list keyboard drop the element keeps focus in its new list.

**Toasts** (X-01): `dnd.toast.cardMoveFailed` ("Could not move the card, showing the latest"), `dnd.toast.listMoveFailed`.

**Strings** (catalogue keys): `dnd.instructions`, `dnd.card.pickedUp` ("Picked up card {title}, position {i} of {n} in {list}"), `dnd.card.movedOver` ("Moved to {list}, position {i} of {n}"), `dnd.card.movedWithin` ("Position {i} of {n}"), `dnd.card.dropped`, `dnd.card.cancelled`, `dnd.list.pickedUp` ("Picked up list {name}, position {i} of {n}"), `dnd.list.moved`, `dnd.list.dropped`, `dnd.list.cancelled`, `dnd.handle.card` ("Drag card {title}"), `dnd.handle.list` ("Drag list {name}"), plus the toast keys.

### 6. API contract

No new route and no change to the request or response schemas of FB-05 (`PATCH /v1/lists/{id}`) or FB-06 (`PATCH /v1/cards/{id}`). FB-07's backend change is behavioural, inside those routes:

```
PATCH /v1/cards/{id}  { listId?, position, via: "drag" }   (FB-06 §6)
PATCH /v1/lists/{id}  { position }                          (FB-05 §6)
Re-balance (CL-E36): within the same transaction, after writing the position,
  SELECT … FOR UPDATE the destination container; if needsRebalance(positions) then
  UPDATE each item with rebalance(count)[rank] in current (position, id) order and bump updatedAt.
  No activity event for re-balanced neighbours. The response carries the moved item's final position;
  when it differs from the requested position the client re-fetches the board (AC 9).
```

`If-Match`: CL-E23; a `409` on a drag means someone edited or moved the card since the board was loaded, and the client re-fetches (AC 6).

### 7. Data changes

No schema change. `card_list_active_idx (list_id, position)` and `list_board_position_idx (board_id, position)` serve the neighbour reads and the re-balance rewrite. Soft delete and insert-only activity are untouched (STANDARDS §1.3).

### 8. Authorisation

| Capability | Workspace admin | Board admin | Board member | Observer | Workspace member, not on board | Other workspace |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Drag a card (API: move) | ✓ | ✓ | ✓ | 403 | 404 | 404 |
| Drag a list (API: reposition) | ✓ | ✓ | ✓ | 403 | 404 | 404 |

The API rows are those of FB-05 §8 and FB-06 §8 and are covered by `lists.matrix.test.ts` and `cards.matrix.test.ts`; FB-07 adds the UI assertion of AC 10 in Playwright.

### 9. Dependencies

- Backlog: FB-05 and FB-06 (both backend and frontend tasks) for the frontend task; FB-05 and FB-06 backend tasks for the backend re-balance task; all of them for the QA task.
- Decisions: CL-D4, CL-E6, CL-E23, CL-E32, CL-E35, CL-E36, CL-E41, CL-E42.
- New packages (runtime, `flowboard-web`): `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (ADR-001, CL-E32). Reason: pointer and keyboard sensors with built-in live-region announcements and a sortable preset; the native HTML5 API has no keyboard path (CL-E6). The frontend task pins exact versions and records the `Dependency audit` result in its evidence.

### 10. Test plan

| Level | Tests | Covers |
|---|---|---|
| Unit | `flowboard-web` `keyboardCoordinates.test.ts` (Up/Down/Left/Right mapping, clamping at list ends and board edges), `dropPosition.test.ts` (top, bottom, between, same place → no request, re-fetch when the response position differs, re-fetch and recompute when `positionBetween` throws, rollback when it throws twice), `announcements.test.ts` (strings per phase), `pendingPill.test.ts` (count + 1 and over-limit during hover); `flowboard-api/src/positions/rebalance-inline.test.ts` (pure part of CL-E36: ordering and threshold) | AC 1 to 5, 7, 9 |
| Integration | `test/cards.move.rebalance.test.ts` (AC 8 for cards: 60 midpoint drops, even spacing, order kept, 60 events, neighbours' `updatedAt` bumped); `test/lists.move.rebalance.test.ts` (AC 8 for lists); the FB-06 `cards.patch.test.ts` already covers `via: "drag"` default and `409` | AC 8 |
| End to end (QA) | `flowboard-web/e2e/FB-07-drag-and-drop.spec.ts`: `C-02 drags a card to another list at the pointer position and it persists`, `C-02 drags a card within a list`, `C-02 dropping in place sends no request`, `L-03 drags a list by its header and the order persists`, `C-11 keyboard picks up moves and drops a card across lists with announcements`, `C-11 keyboard reorders a list`, `X-03 Escape cancels a keyboard drag with no request`, `L-04 pill previews the count over the limit and the drop is not blocked`, `FS §7.1 stale move rolls back with toast`, `FS §6 observer cannot drag and Space opens the card`, `FS §8 click without movement opens the card`, `FB-07 baseline drag trace on the seeded board` (Chromium, trace attached, no assertion) | AC 1 to 7, 10 to 12, 14 |
| Accessibility | axe during a keyboard drag and after the drop, both themes; manual screen-reader pass recorded on the QA task (S6) | AC 13 |
| Performance | Baseline trace only (AC 12); the CI budget is FB-16 | |

### 11. Verification evidence

- CI run links on the frontend, backend and QA pull request heads; `Dependency audit` result after adding `@dnd-kit/*`.
- Integration output for the two re-balance tests, including the position table before and after.
- Playwright report on the three engines; the baseline drag trace attached to the QA task; a trace or video of a keyboard drag showing the live region text.
- Screenshots: a card mid-drag with the overlay, indicator and outlined target list; the pill previewing an over-limit count; a list mid-drag; the rollback toast; in light and dark.
- Screen-reader pass notes (tool, browser, each AC 5 sentence heard or not) on the QA task.
- Review task links and verdicts per pull request.
- Definition-of-done items not met, stated plainly.

### 12. Open questions

None requiring a business decision. The engineering decisions this specification relies on are CL-E36 (inline re-balance instead of a background job while there is one API instance and no job runner) and CL-E42 (keyboard grammar and announcement wording), both in `CLARIFICATIONS.md` §3.4 and confirmed by the Wave-1 card (CL-D24), accepted on 7 October 2026. The point raised on that card, the announcement wording of AC 5 (CL-E42), was accepted as recommended; the sentences are user-facing copy and can be reworded later as catalogue strings without code changes.
