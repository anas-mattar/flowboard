# Backlog item specifications

Every backlog item (FB-nn) gets one specification in this folder **before** implementation starts. The specification is the contract between Anas (who approves scope and acceptance criteria), the owner who implements it, the reviewer, and QA. A task may not be assigned until its specification has been approved for scope, acceptance criteria and significant technical decisions.

## File naming

```
docs/engineering/specs/FB-04-boards.md
```

`FB-<two-digit-id>-<short-kebab-slug>.md`. One file per backlog item. Where a backlog item is split into backend and frontend tasks, both tasks share the same specification.

## Status line

The first lines of every specification carry:

```
**Backlog item:** FB-04 Boards
**Status:** Draft | Ready for approval | Approved | Superseded
**Approved by:** Anas, <date> (Paperclip issue link)
**Owner(s):** <agent> (backend), <agent> (frontend)
**Reviewer:** <agent who did not write the change>
**Increment:** MVP-1 | MVP-2 | MVP-3 | Launch readiness
```

## Required sections

Use these headings in this order. Leave a section in with "None" rather than deleting it, so a reader knows it was considered.

### 1. Goal

Two or three sentences: what a user can do after this ships that they could not before, and why it is in this increment.

### 2. Requirement references

A table tracing every piece of scope to its source. Use the citation style from `../STANDARDS.md`: **FS §n**, story IDs (**B-02**), **BM §n**, **PT**, and **CL-xx** for `../CLARIFICATIONS.md`.

| Source | Reference | Requirement |
|---|---|---|
| FS | B-02 | Create a board with three default lists and the creator as admin |
| CL | CL-A7 | Doing list defaults to WIP 3 |

Tag each row **[REQ]** (explicit), **[ENG]** (engineering necessity), **[ASM]** (assumption, cite the CL-O entry) or **[SUG]** (suggestion needing approval), following the TAS-7 convention. Anything **[ASM]** without a CL-O entry must be added to `CLARIFICATIONS.md` §4 in the same pull request.

### 3. Scope

**In scope:** bullet list.
**Out of scope:** bullet list, with the backlog item where each deferred piece lands.

### 4. Acceptance criteria

Numbered. Each criterion is observable, names the story ID it satisfies, and is phrased so a Playwright test or integration test can assert it. Example:

1. **B-02** Creating a board named "Launch" produces lists To Do, Doing (WIP limit 3) and Done, and the creator appears as board admin.
2. **B-04** Starred boards appear before unstarred boards in the sidebar, each group ordered by name.

Include negative criteria for authorisation (one per FS §6 role that must be refused) and for validation.

### 5. User interface

Only for items with UI. Describe each screen or component touched, referencing the FS §4 section and the prototype as the visual reference. List keyboard interactions, focus behaviour, empty states, confirmations and toasts (X-01, X-03, FS §8). Name every externalised string key added.

### 6. API contract

For every route added or changed:

```
PATCH /v1/boards/{id}
Auth: session cookie or bearer token; requires Board admin or Workspace admin (FS §6)
Request: BoardPatch schema (flowboard-shared/src/schemas/board.ts)
Response 200: Board schema
Errors: 403 forbidden, 404 not visible, 409 stale If-Match, 422 validation
Activity events written: card.renamed (FS §5.2) ... or "None"
WebSocket events published: same objects as activity events
```

Reference the Zod schema names in `flowboard-shared`; do not duplicate field lists here. State pagination for list endpoints (FS §7 cursor pagination) and the `If-Match` behaviour for edits (FS §7.1).

### 7. Data changes

- Migrations to add, with table and column names and constraints.
- Seed or fixture changes.
- Indexes, with the query that needs them.
- Confirm `archived_at` soft delete and insert-only activity rules are respected (STANDARDS §1.3), or state "No schema change".

### 8. Authorisation

The FS §6 matrix rows this item touches, as a table of capability by role, and the integration test that covers it.

### 9. Dependencies

Backlog items that must be done first, external decisions (CL entries) this item relies on, and any new package added to the workspace with its reason.

### 10. Test plan

Map to the definition of done in `../STANDARDS.md` §2:

| Level | Tests | Covers |
|---|---|---|
| Unit | `position.test.ts` midpoint and re-balance | AC 3 |
| Integration | `boards.create.test.ts` per role | AC 1, authorisation rows |
| End to end | `FB-04-boards.spec.ts`: `B-02 creates a board with three default lists` | AC 1, 2 |
| Accessibility | axe on sidebar and board header | FS §8 |
| Performance | None until FB-16 | |

### 11. Verification evidence

Filled in by the owner at completion and checked by the reviewer. Required before the task can move to review:

- CI run link (lint, typecheck, unit, integration, build, e2e smoke).
- Test run output pasted or linked for each level in §10.
- Screenshots or Playwright trace attached to the Paperclip task for every UI change.
- Review task link and verdict.
- Items of the definition of done that are **not** met, stated plainly.

### 12. Open questions

Questions for Anas, each with a recommendation, grouped so they can be answered in one card. Once answered, move the answer to `../CLARIFICATIONS.md` and replace the question here with the CL-xx reference.

## Approval flow

1. Owner (usually FlowBoard Lead) writes the specification as **Draft** on a branch `docs/FB-nn-spec`.
2. Independent review by another agent for traceability and testability.
3. Anas approves scope, acceptance criteria and significant technical decisions on the Paperclip task; status becomes **Approved** with the date and link.
4. Implementation tasks are created from the approved specification, one owner each.
5. Changes after approval are a new revision with a dated change note at the end of the file; material scope changes go back to Anas.
