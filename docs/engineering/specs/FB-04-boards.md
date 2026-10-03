**Backlog item:** FB-04 Boards
**Status:** Ready for approval
**Approved by:** pending, Paperclip issue TAS-10
**Owner(s):** FlowBoard Backend (`flowboard-api` board routes, `flowboard-shared` board schemas), FlowBoard Frontend (`flowboard-web` sidebar board list, create board, board page, title, star, archive)
**Reviewer:** FlowBoard QA; QA also owns the slice-level acceptance test (§10)
**Increment:** MVP-1

---

### 1. Goal

A signed-in user can create a board, see it in the sidebar with its colour and card count, open it to find the three default lists, rename it inline, star it so it sorts first, archive it behind a confirmation, and find it again after logging out and back in. With FB-04 the vertical slice "sign up, land on your first board" is complete and the BM §1 metric becomes an automated assertion: a new visitor reaches a persisted board in under two minutes of scripted interaction.

### 2. Requirement references

| Source | Reference | Requirement | Tag |
|---|---|---|---|
| FS | B-01 | Sidebar lists boards I belong to with a colour swatch and card count; the active board is highlighted | [REQ] |
| FS | B-02 | Create a board; it gets three default lists (To Do, Doing, Done) and the creator as admin | [REQ] |
| FS | B-03 | Rename a board inline in the header; persists on blur or Enter; sidebar updates immediately | [REQ] |
| FS | B-04 | Star a board; starred boards sort to the top of the sidebar | [REQ] |
| FS | B-06 | Archive or delete a board; deletion requires confirmation; archived boards are hidden but restorable for 30 days | [REQ] (restore UI is FB-17) |
| FS | §4.1 | Create board prompts for a name, creates the board with three default lists and navigates to it | [REQ] |
| FS | §4.2 | Board title is an inline-editable text field; ☆/★ toggles the star | [REQ] |
| FS | §4.4, §4.5 | Board canvas: horizontally scrolling row of lists, 286 px wide; list header shows name and `count / WIP` pill (static rendering here; list behaviour is FB-05) | [REQ] |
| FS | §7 | `GET /v1/boards`, `POST /v1/boards`, `GET /v1/boards/{id}` single hydration call, `PATCH /v1/boards/{id}` rename, recolour, star, archive; cursor pagination on list endpoints | [REQ] |
| FS | §7.1 | Optimistic concurrency with `If-Match` and `409` | [REQ] |
| FS | §6 | View board: all roles; rename/archive board: workspace admin and board admin only | [REQ] |
| FS | §5, §5.1 | Board, List fields; sparse-float positions for the default lists | [REQ] |
| FS | X-01 | Toast within 200 ms for create, rename, star, archive | [REQ] |
| FS | X-03 | Enter submits the create form and the title; Esc cancels | [REQ] |
| FS | §8 | Accessibility: keyboard-operable, focus management, text alongside colour | [REQ] |
| BM | §1, §9 | Time-to-first-board under two minutes | [REQ] |
| BM | §2.3, §5 | Flow discipline on the first board (WIP 3 on Doing); clear empty states | [REQ] |
| BM | §13.3 | Funnel event `board.created` | [REQ] |
| CL | CL-A7 | Default lists To Do, Doing (WIP 3), Done | [REQ] |
| CL | CL-D3 | Six default labels seeded on board creation | [REQ] |
| CL | CL-A2, CL-E16 | Delete is archive with confirmation; one "Archive board" action in MVP-1 | [REQ] |
| CL | CL-E14 | Star per user in `board_star` | [ENG] |
| CL | CL-E15 | Board colour from the PT palette; `color` accepted by PATCH, no UI | [ENG] |
| CL | CL-E17 | Visibility rule and card count definition | [ENG] |
| CL | CL-E18 | `If-Match` optional in MVP-1; web app always sends it | [ENG] |
| CL | CL-E20 | Funnel event `board.created` | [ENG] |
| CL | CL-E6 | Inline form instead of `prompt()`; starred sorting that PT lacks | [REQ] |
| PT | `renderSidebar`, `renderTop`, `#newBoard`, `#boardTitle`, `#starBtn` | Visual and interaction reference | [REQ] |
| TAS-7 | §4 FB-04, §6 | Acceptance: starred boards sort first; delete requires confirmation and archives; `GET /v1/boards/{id}` returns lists and cards in one response; Playwright signup to first board under two minutes | [REQ] |

### 3. Scope

**In scope**

- Backend: `GET /v1/boards`, `POST /v1/boards`, `GET /v1/boards/{id}`, `PATCH /v1/boards/{id}`; board-level rows of the authorisation module (`board.view`, `board.create`, `board.edit`, `board.archive`, `board.star`); creation transaction (board, creator as board admin, three default lists at positions 1024/2048/3072 with WIP 3 on Doing, six default labels, funnel event); hydration query (board, members, labels, lists, cards with label ids, member ids, checklist summary, comment count); starred-first ordering; `If-Match`.
- Shared: `BoardSummary`, `BoardList` (paginated), `BoardCreate`, `BoardPatch`, `BoardHydrated` (with `ListWithCards`, `CardSummary`, `BoardMemberView`) schemas; `DEFAULT_LISTS`, `DEFAULT_LABELS`, `BOARD_COLORS` already in `flowboard-shared` from FB-01.
- Frontend: sidebar board rows (swatch, name, count, active state, starred group first), "Create board" inline form in the sidebar, board route `/boards/$boardId` rendering the top-bar title field, star toggle, board menu (⋯) with "Archive board", the board canvas with lists rendered read-only (header with name and `count / WIP` pill; empty body with "No cards yet"; no add-card, no drag), `/` redirect to the first board or the empty state with the create form, toasts, confirm dialog, optimistic updates for rename and star with rollback.
- QA: Playwright per story and the slice-level two-minute test.

**Out of scope**

- Add, rename, reorder, WIP edit, archive of lists (FB-05); the lists on the board are display-only here.
- Cards of any kind (FB-06). Hydration already returns `cards: []` per list so the schema is final.
- Board members, avatar stack, invitations (FB-09). Hydration returns `members` with the creator only.
- Restore, archived-items view, 30-day purge (FB-17).
- Recolour UI (none in FS §4; API accepts `color`, CL-E15).
- Realtime updates (FB-15); the sidebar re-fetches on focus and after mutations.
- Search and filter (FB-13).

### 4. Acceptance criteria

1. **[REQ, B-02, CL-A7, CL-D3]** `POST /v1/boards { name: "Launch" }` returns `201` with the hydrated board containing lists To Do (position 1024, no WIP), Doing (2048, WIP 3), Done (3072, no WIP), six labels Bug, Feature, Design, Urgent, Research, Blocked with PT colours, and `members` containing the caller with role `admin`; a `board_member` row with role `admin`, and a `funnel_event` `board.created` exist.
2. **[REQ, B-01, CL-E17]** `GET /v1/boards` returns only non-archived boards the caller may view, each with `id, name, color, starred, cardCount, workspaceId, updatedAt`, ordered starred first then by name case-insensitively; `cardCount` counts non-archived cards on non-archived lists (integration test seeds archived cards and lists and asserts they are excluded).
3. **[REQ, FS §7]** `GET /v1/boards` is cursor-paginated (`?cursor=&limit=`, default 50, max 200) with `nextCursor` null on the last page, even though MVP workspaces will not reach the limit.
4. **[REQ, FS §7]** `GET /v1/boards/{id}` returns the board, `members`, `labels`, `lists` (non-archived, by position) each with `cards` (non-archived, by position, with `labelIds`, `memberIds`, `checklist: { done, total }`, `commentCount`, `dueAt`, `dueComplete`) in one response; the integration test uses the FB-01 seed and asserts the Product Roadmap Q3 board counts match the prototype.
5. **[REQ, B-03, FS §7.1, CL-E18]** `PATCH /v1/boards/{id} { name }` with a matching `If-Match` returns `200` with the new `updatedAt`; with a stale `If-Match` returns `409 stale`; without `If-Match` succeeds (MVP-1); names are trimmed, 1 to 120 characters, otherwise `422`.
6. **[REQ, B-04, CL-E14]** `PATCH /v1/boards/{id} { starred: true }` creates a `board_star` row for the caller only; another member of the same board still sees `starred: false`; starring is allowed for every role that can view the board, including observers.
7. **[REQ, B-06, CL-E16]** `PATCH /v1/boards/{id} { archived: true }` sets `archived_at`; the board disappears from `GET /v1/boards`; `GET /v1/boards/{id}` returns `404` for board members and observers and `200` with `archivedAt` set for board admins and workspace admins (so FB-17 can restore); `{ archived: false }` clears it (API only in MVP-1).
8. **[REQ, FS §6]** Authorisation negatives: a user from another workspace gets `404` on `GET`/`PATCH`; a board `member` or `observer` gets `403` on `PATCH name`, `color` or `archived`; a workspace `member` who is not a board member gets `404`; a workspace `admin` who is not a board member gets `200` on `GET` and `PATCH`; unauthenticated gets `401` everywhere; `POST /v1/boards` is allowed for every workspace member and refused with `422` for a `workspaceId` the caller does not belong to.
9. **[REQ, B-01]** Frontend sidebar: each board row shows a colour swatch (decorative, `aria-hidden`), the name and the card count; the active board row has `aria-current="page"`; starred boards appear in a first group marked with ★ text (not colour only); the list updates immediately after create, rename, star and archive.
10. **[REQ, B-02, FS §4.1, CL-E6]** "Create board" opens an inline text field in the sidebar (no `prompt()`); Enter creates and navigates to the new board; Esc cancels; an empty name is refused inline; a toast "Board created" appears within 200 ms (X-01).
11. **[REQ, B-03, FS §4.2]** The board title in the top bar is an editable field; Enter or blur persists the trimmed value and the sidebar row updates optimistically; Esc restores the previous value; an empty value is reverted; a `409` triggers a re-fetch and a toast "This board was changed elsewhere, showing the latest"; toast "Board renamed" on success.
12. **[REQ, B-04, FS §4.2]** The star button toggles between ☆ and ★ with `aria-pressed` and an accessible name "Star board"/"Unstar board"; the sidebar regroups immediately; rollback on failure with a toast.
13. **[REQ, B-06]** The board menu offers "Archive board"; choosing it opens a confirm dialog ("Archive 'Launch'? You can restore it from archived items for 30 days."); confirming archives, navigates to the next board (or the empty state), and shows a toast "Board archived"; Esc or Cancel leaves the board untouched.
14. **[REQ, FS §4.4, §4.5, CL-A7]** The board canvas shows the three default lists as 286 px columns in position order with their names and the pill `0 / 3` on Doing and `0` on the others; the canvas scrolls horizontally; each list body shows the empty-state text.
15. **[REQ, BM §5]** A workspace with no boards shows the empty state "No boards yet" with the create form focused; `/` redirects to the first board in sidebar order when one exists.
16. **[REQ, BM §1, TAS-7 §6]** Slice-level: a Playwright test that starts signed out, signs up, creates a board, verifies the three default lists, renames it, stars it, signs out, logs in, and finds the board starred with the new name at the top of the sidebar, completes in under 120 seconds of wall-clock time on CI, with the elapsed time printed in the report. The budget is asserted, not just logged.
17. **[REQ, FS §8]** Sidebar rows, create form, title field, star button, board menu and confirm dialog are keyboard-operable; axe reports zero violations on the board page with the sidebar populated, with the create form open, and with the confirm dialog open, in both themes.

### 5. User interface

Visual reference: PT `renderSidebar` (`.side-item`, `.side-swatch`, `.count`, `#newBoard`), `renderTop` (`#boardTitle`, `#starBtn`), `.board`, `.list`, `.list-head`, `.pill`, `.empty` (CL-O2, CL-E6).

**Sidebar board list** (FS §4.1, B-01, B-04): rows are buttons or links in a `nav` list; starred group first with a visually hidden "Starred" group heading and a ★ glyph in the row; then the rest alphabetically. Row: 10 px swatch, name (truncated with title attribute), count right-aligned. Active row uses `--sidebar-2` background and `aria-current`.

**Create board** (FS §4.1, B-02): a "＋ Create board" row at the bottom; activating it swaps the row for a text input (placeholder "Board name", autofocus, `maxlength` 120) with an inline "Create" button. Enter creates; Esc or blur with an empty value cancels. On success navigate to `/boards/{id}` and toast.

**Top bar title and star** (FS §4.2, B-03, B-04): the title slot from FB-03 receives an `input` styled as text (PT `.board-title`) with an accessible label "Board name"; focus shows the `--accent` border. The star button follows the title. The board menu (⋯ icon button, accessible name "Board actions") opens a dropdown with "Archive board" (destructive styling).

**Board page** (FS §4.4, §4.5): horizontal flex row of lists with a 12 px gap, `overflow-x: auto`; each list: header with name and pill, body with the empty text "No cards yet" (FB-06 replaces it), no footer control until FB-06. The "Add another list" affordance is FB-05 and is not rendered.

**Empty workspace state**: `EmptyState` from FB-03 with heading "No boards yet", body "Create your first board to start organising work.", and the create form inline.

**Keyboard**: sidebar rows are focusable and activate on Enter or Space; the create input submits on Enter and cancels on Esc; the title input submits on Enter (blurring it) and reverts on Esc; the menu is arrow-key navigable; the confirm dialog follows FB-03.

**Focus behaviour**: after creating a board, focus moves to the board title input; after archiving, to the first sidebar row or the create form.

**Toasts** (X-01): `boards.toast.created`, `boards.toast.renamed`, `boards.toast.archived`, `boards.toast.starred`, `boards.toast.unstarred`, `boards.toast.conflict`, `boards.toast.failed`.

**Strings** (catalogue keys): `boards.create`, `boards.create.placeholder`, `boards.create.submit`, `boards.create.required`, `boards.starred`, `boards.title.label`, `boards.star`, `boards.unstar`, `boards.actions`, `boards.archive`, `boards.archive.confirmTitle` ("Archive '{name}'?"), `boards.archive.confirmBody`, `boards.archive.confirm`, `boards.empty.title`, `boards.empty.body`, `lists.empty`, `lists.wipPill` ("{count} / {limit}"), plus the toast keys above.

### 6. API contract

Schemas in `flowboard-shared/src/schemas/board.ts`. Auth on every route: session cookie or bearer token (FB-02); `Origin` check on mutations for cookie auth (CL-E9).

```
GET /v1/boards?cursor=&limit=
Auth: any authenticated user
Response 200: BoardList { items: BoardSummary[], nextCursor: string | null }
  BoardSummary { id, workspaceId, name, color, starred, cardCount, archivedAt: null, createdAt, updatedAt }
Ordering: starred desc, lower(name) asc, id asc (stable cursor)
Visibility: CL-E17
Errors: 401, 422 (bad cursor or limit)
Activity events written: None
```

```
POST /v1/boards
Auth: workspace member of the target workspace (FS §6 "member" row; board creation is a member capability)
Request: BoardCreate { name: string (1..120 after trim), workspaceId?: string }  // defaults to currentWorkspace (CL-D7)
Response 201: BoardHydrated
Side effects: board_member (creator, admin); 3 lists (CL-A7); 6 labels (CL-D3); funnel_event board.created (CL-E20)
Errors: 401, 403 bad_origin, 422 validation or workspace not joined
Activity events written: None (FS §5.2 events are card-scoped)
```

```
GET /v1/boards/{id}
Auth: board member (any role) or workspace admin of the board's workspace
Response 200: BoardHydrated {
  board: Board, members: BoardMemberView[] ({ user: PublicUser, role }), labels: Label[],
  lists: ListWithCards[] ({ ...List, cards: CardSummary[] }),
  starred: boolean, callerRole: "admin" | "member" | "observer" | "workspace_admin"
}
  CardSummary { id, listId, title, position, dueAt, dueComplete, labelIds, memberIds, checklist: { done, total }, commentCount, hasDescription, updatedAt }
Archived boards: 404 for member/observer; 200 for board admin/workspace admin (CL-E16)
Errors: 401, 404 not visible
```

```
PATCH /v1/boards/{id}
Auth: board admin or workspace admin for name, color, archived; any viewer for starred (CL-E14)
Headers: If-Match: <updatedAt as returned> (optional in MVP-1, CL-E18)
Request: BoardPatch { name?, color? (#rrggbb), starred?, archived? }  // at least one field
Response 200: BoardSummary (with the caller's starred)
Errors: 401, 403 forbidden or bad_origin, 404 not visible, 409 stale, 422 validation
Activity events written: None
WebSocket events published: None until FB-15
```

Pagination: `GET /v1/boards` only. `starred` in `PATCH` does not bump `updatedAt` (it is not a board edit, CL-E14), so `If-Match` is ignored when `starred` is the only field.

### 7. Data changes

No schema change; FB-01 created `board`, `board_member`, `board_star`, `label`, `list`, `card`, `funnel_event` and the indexes `board_workspace_active_idx` and `card_list_active_idx` that the sidebar count and hydration rely on. If the hydration query plan on the seeded data shows a missing index, FB-04 adds it in a new migration and records the query here.

### 8. Authorisation

| Capability | Workspace admin | Board admin | Board member | Observer | Workspace member, not on board | Other workspace |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| List boards (sees this board) | ✓ | ✓ | ✓ | ✓ | — | — |
| Create board in workspace | ✓ | ✓ | ✓ | ✓ | ✓ | 422 |
| View board (hydrate) | ✓ | ✓ | ✓ | ✓ | 404 | 404 |
| Rename, recolour, archive | ✓ | ✓ | 403 | 403 | 404 | 404 |
| Star | ✓ | ✓ | ✓ | ✓ | 404 | 404 |
| View archived board | ✓ | ✓ | 404 | 404 | 404 | 404 |

Covered by `flowboard-api/test/boards.matrix.test.ts`, generated from this table (STANDARDS §1.4). Observer and member rows are exercised by inserting `board_member` rows directly in the test, because invitations arrive in FB-09.

### 9. Dependencies

- Backlog: FB-01 and FB-02 (backend task); FB-03 and the FB-04 backend task (frontend task); QA slice test depends on both FB-04 tasks.
- Decisions: CL-A7, CL-D3, CL-A2, CL-E14 to CL-E18, CL-E20, CL-E6.
- New packages: none expected. The frontend uses the FB-03 primitives and TanStack Query mutations with optimistic updates.

### 10. Test plan

| Level | Tests | Covers |
|---|---|---|
| Unit | `flowboard-shared/src/schemas/board.test.ts` (name trim and bounds, colour format, patch requires one field); `boards/ordering.test.ts` (starred then name, cursor encoding); `flowboard-web` `BoardList.test.tsx` (grouping, `aria-current`), `BoardTitle.test.tsx` (Enter, blur, Esc, empty revert), `CreateBoard.test.tsx` | AC 2, 5, 9, 10, 11 |
| Integration | `test/boards.create.test.ts` (defaults, labels, member, funnel event, transaction); `test/boards.list.test.ts` (visibility, ordering, counts excluding archived, pagination); `test/boards.get.test.ts` (hydration against seed, archived visibility); `test/boards.patch.test.ts` (rename, If-Match, 409, star per user, archive and unarchive, validation); `test/boards.matrix.test.ts` | AC 1 to 8 |
| End to end (QA) | `flowboard-web/e2e/FB-04-boards.spec.ts`: `B-01 sidebar lists boards with swatch and count and highlights the active board`, `B-02 creates a board with three default lists and Doing WIP 3`, `B-02 Esc cancels and empty name is refused`, `B-03 renames inline on Enter and on blur and sidebar updates`, `B-03 Esc reverts the title`, `B-04 starred boards sort to the top`, `B-06 archive requires confirmation and hides the board`, `B-06 cancel keeps the board`, `X-01 toasts appear within 200 ms`, `FB-04 empty workspace shows create form`, `FB-04 keyboard-only create rename star archive` | AC 9 to 15, 17 |
| End to end, slice (QA) | `flowboard-web/e2e/MVP-1-first-board.spec.ts`: `MVP-1 new visitor reaches a persisted starred board in under two minutes` (signup → create → verify lists → rename → star → sign out → log in → board found first with new name; asserts elapsed < 120 s and prints it) | AC 16 |
| Accessibility | axe on the board page in both themes: populated sidebar, create form open, board menu open, confirm dialog open | AC 17 |
| Performance | None until FB-16; the hydration shape is the one FB-16 measures | |

### 11. Verification evidence

- CI run links on the backend and frontend pull request heads; the QA pull request adding the Playwright files.
- Integration test output including the matrix test and the `409` case.
- Playwright report with the slice test's elapsed time, plus a trace file for the slice test attached to the Paperclip task.
- Screenshots: sidebar with starred and unstarred boards, create form open, board page with the three lists, title being edited, archive confirm dialog, empty workspace state, in light and dark.
- `EXPLAIN ANALYZE` output of the hydration query and the sidebar count query on the seeded database.
- Review task links and verdicts.
- Definition-of-done items not met, stated plainly.

### 12. Open questions

None requiring Anas beyond the engineering decisions CL-E14 to CL-E18 and CL-E20, which are confirmed by accepting this specification set. One note for awareness: FS §7 lists no `DELETE /v1/boards/{id}`, and CL-A2 makes delete and archive the same action, so MVP-1 exposes "Archive board" only; if Anas wants a visibly separate "Delete" wording in the menu, it is a copy change with no API impact.
