# FlowBoard — Functional Specification

**Product:** FlowBoard — a Trello-style visual work-management (Kanban) tool
**Document version:** 1.0
**Date:** 27 August 2026
**Status:** Draft for review
**Owner:** Anas Matar, DPOInternational
**Companion documents:** `BUSINESS_MODEL.md`, `flowboard-prototype.html`

---

## 1. Overview

### 1.1 Purpose

FlowBoard is a collaborative Kanban application. Teams organise work as **cards** that move
across **lists** on a **board**. The product's promise is that anyone can understand the state
of a project in five seconds by looking at it, and change that state by dragging one thing.

This document defines the functional behaviour of the **Core Kanban** release (v1.0) — the scope
demonstrated by the accompanying HTML prototype — plus the data model, permissions, and
non-functional requirements needed to build it.

### 1.2 Scope of v1.0

| In scope | Out of scope (later releases) |
|---|---|
| Workspaces with multiple boards | Multiple workspaces per account |
| Lists, cards, drag & drop | Automation rules / Butler-style triggers |
| Labels, due dates, members | Timeline / calendar / table views |
| Card description, checklist, comments, activity | File attachments to object storage |
| Search and filtering | Public board sharing / guest links |
| WIP limits per list | Reporting & analytics dashboards |
| Board membership and invitations | Third-party integrations (Slack, GitHub) |
| Light & dark theme | Mobile native applications |

### 1.3 Definitions

| Term | Meaning |
|---|---|
| **Workspace** | The top-level container. Owns billing, members and boards. |
| **Board** | One project or process. Contains ordered lists. |
| **List** | A vertical column representing a stage of work (e.g. *In Progress*). |
| **Card** | A single unit of work. Lives in exactly one list at a time. |
| **Label** | A coloured tag applied to cards for categorisation. Board-scoped. |
| **Member** | A user with access to a workspace and/or specific boards. |
| **WIP limit** | Maximum number of cards a list should hold; a soft, visual constraint. |
| **Activity** | The append-only audit trail of everything that happened to a card. |

---

## 2. Personas

| Persona | Role | Primary need | Success looks like |
|---|---|---|---|
| **Maya — Team lead** | Runs a 6-person delivery team | See where everything stands without a status meeting | Opens the board each morning, sees blockers in one glance |
| **Dan — Contributor** | Engineer / designer | Know what to do next; log progress with minimal ceremony | Adds a card in under 5 seconds, drags it when done |
| **Sofia — Stakeholder** | Client or department head | Read-only visibility into progress and dates | Follows a board without being able to break it |
| **Karim — Workspace admin** | Ops / IT | Control who has access and what it costs | Adds and removes people, sees seat usage |

---

## 3. User stories

### 3.1 Boards

| ID | Story | Acceptance criteria |
|---|---|---|
| B-01 | As a member, I can see all boards I belong to in a sidebar | Sidebar lists boards with a colour swatch and card count; the active board is highlighted |
| B-02 | As a member, I can create a board | New board is created with three default lists (*To Do*, *Doing*, *Done*) and the creator as admin |
| B-03 | As a member, I can rename a board inline | Editing the title in the header persists on blur or Enter; the sidebar updates immediately |
| B-04 | As a member, I can star a board | Starred boards sort to the top of the sidebar |
| B-05 | As a board admin, I can invite people to a board | Invitee appears in the board avatar stack and can open the board |
| B-06 | As a board admin, I can archive or delete a board | Deletion requires confirmation; archived boards are hidden but restorable for 30 days |

### 3.2 Lists

| ID | Story | Acceptance criteria |
|---|---|---|
| L-01 | As a member, I can add a list to the right of existing lists | The list appears immediately and is empty |
| L-02 | As a member, I can rename a list inline | Title is editable in place; change persists on blur |
| L-03 | As a member, I can reorder lists by dragging | Order persists for all board members |
| L-04 | As a member, I can set a WIP limit on a list | The card counter shows `count / limit`; it turns red when the count exceeds the limit. The limit is advisory — it never blocks a drop |
| L-05 | As a member, I can sort a list by due date | Cards reorder ascending, cards with no date last |
| L-06 | As a member, I can archive all cards in a list, or delete the list | Both actions ask for confirmation; deleting a list archives its cards |

### 3.3 Cards

| ID | Story | Acceptance criteria |
|---|---|---|
| C-01 | As a member, I can add a card to the bottom of a list | An inline composer opens; Enter saves and keeps the composer open for rapid entry; Escape cancels |
| C-02 | As a member, I can drag a card within a list or to another list | The card lands at the pointer position; a move is written to the card's activity log |
| C-03 | As a member, I can open a card to see its detail view | Modal shows title, location, labels, members, description, checklist and activity |
| C-04 | As a member, I can edit a card title | Editable in the modal header; the board updates on save |
| C-05 | As a member, I can add a rich-text description | Saved explicitly with a Save button; a `≡` badge appears on the card |
| C-06 | As a member, I can assign labels to a card | Multi-select; labels render as coloured chips on the card front |
| C-07 | As a member, I can assign members to a card | Multi-select from board members; avatars render on the card front. Assigning a non-member adds them to the board |
| C-08 | As a member, I can set a due date and mark it complete | Card shows a date badge, colour-coded: grey (future), amber (≤ 2 days), red (overdue), green (complete) |
| C-09 | As a member, I can add a checklist | Progress bar and `done/total` badge on the card front; items can be ticked and deleted |
| C-10 | As a member, I can comment on a card | Comment appears at the top of activity with author and timestamp; a 💬 badge with the count appears on the card front |
| C-11 | As a member, I can move a card via a menu (not just drag) | Accessible alternative to drag & drop; keyboard-operable |
| C-12 | As a member, I can copy a card | Copy is inserted directly below the original with " (copy)" appended; activity resets |
| C-13 | As a member, I can delete a card | Requires confirmation; card is soft-deleted and recoverable for 30 days |

### 3.4 Search & filter

| ID | Story | Acceptance criteria |
|---|---|---|
| F-01 | As a member, I can search cards on the current board by text | Matches title and description, case-insensitive, live as I type |
| F-02 | As a member, I can filter by label, member and due-date bucket | Filters combine with AND across categories, OR within a category |
| F-03 | As a member, I can see and remove active filters | Each active filter renders as a removable chip; "Clear all" resets |
| F-04 | Lists show an explicit empty state when filtered to nothing | "No cards match the filter" rather than an ambiguous blank |

### 3.5 Cross-cutting

| ID | Story | Acceptance criteria |
|---|---|---|
| X-01 | Every destructive or state-changing action gives feedback | A toast confirms the action within 200 ms |
| X-02 | I can switch between light and dark theme | Theme applies to the whole application instantly |
| X-03 | I can drive the core flows from the keyboard | `/` or `F` focuses search; `Esc` closes modals and popovers; `Enter` submits composers |
| X-04 | I can collapse the sidebar | The board area expands to full width |

---

## 4. Screen-by-screen behaviour

### 4.1 Sidebar

- Brand block: product mark + workspace name.
- **Boards** section: one row per board — colour swatch, name, total card count.
- **Create board**: prompts for a name, creates the board with three default lists, and navigates to it.
- Footer: current user avatar, name and workspace role.
- Collapsible via the ☰ control in the top bar.

### 4.2 Top bar

| Control | Behaviour |
|---|---|
| ☰ | Toggle sidebar |
| Board title | Inline-editable text field |
| ☆ / ★ | Toggle board star |
| Search | Live text filter over the current board |
| Filter | Popover: labels, members, due-date buckets (Overdue / Next 7 days / No due date) |
| Avatar stack | Board members; hover shows full name |
| ＋ Invite | Popover to add or remove board members |
| ◐ | Theme toggle |

### 4.3 Filter chip bar

Appears only when at least one filter is active. Renders one chip per active filter with an
individual ✕, plus a **Clear all** button. Hidden entirely when no filter is applied.

### 4.4 Board canvas

Horizontally scrolling row of lists, each 286 px wide, followed by an **Add another list** affordance.
Lists are independently vertically scrollable so headers and the add-card control stay visible.

### 4.5 List

```
┌──────────────────────────────┐
│ [List name        ] [4/3] ⋯  │  ← name is inline-editable; pill = count/WIP limit
├──────────────────────────────┤
│  card                        │
│  card                        │  ← scrollable
│  card                        │
├──────────────────────────────┤
│ ＋ Add a card                │
└──────────────────────────────┘
```

List menu (⋯): Set WIP limit · Sort by due date · Archive all cards · Delete list.

### 4.6 Card front

Renders, top to bottom, only what exists:

1. Label chips
2. Title
3. Meta row — due-date badge, description indicator, checklist progress, comment count, member avatars

### 4.7 Card detail modal

Two-column layout (single column below 700 px):

- **Left:** labels · members · description · checklist with progress bar · activity feed with comment box
- **Right — Add to card:** Members · Labels · Due date · Move · Copy · Delete

Dismissed by ✕, clicking the scrim, or `Esc`.

---

## 5. Data model

```
Workspace
  id, name, plan, seats, created_at
  └── Board
        id, workspace_id, name, color, starred, archived, created_at
        ├── BoardMember (board_id, user_id, role)
        ├── Label (id, board_id, name, color)
        └── List
              id, board_id, name, position, wip_limit, archived
              └── Card
                    id, list_id, title, description, position,
                    due_at, due_complete, archived, created_by, created_at, updated_at
                    ├── CardLabel   (card_id, label_id)
                    ├── CardMember  (card_id, user_id)
                    ├── ChecklistItem (id, card_id, text, done, position)
                    ├── Comment     (id, card_id, author_id, body, created_at)
                    └── ActivityEvent (id, card_id, actor_id, type, payload, created_at)

User
  id, email, display_name, initials, avatar_color, created_at
```

### 5.1 Ordering

Positions use a **sparse float** (or lexicographic rank) rather than dense integers, so moving a
card writes one row instead of renumbering the list. On drop, the new position is the midpoint of
its neighbours; a background job re-balances when gaps get too small.

### 5.2 Activity event types

`card.created` · `card.moved` · `card.renamed` · `card.described` · `label.added` · `label.removed` ·
`member.assigned` · `member.unassigned` · `due.set` · `due.cleared` · `due.completed` ·
`checklist.item.added` · `checklist.item.checked` · `comment.added` · `card.archived`

Activity is **append-only** and never edited — it is the audit trail.

---

## 6. Permissions

| Capability | Workspace admin | Board admin | Board member | Observer |
|---|:--:|:--:|:--:|:--:|
| View board | ✓ | ✓ | ✓ | ✓ |
| Create / edit / move cards | ✓ | ✓ | ✓ | — |
| Comment | ✓ | ✓ | ✓ | ✓ |
| Create / rename / delete lists | ✓ | ✓ | ✓ | — |
| Manage labels | ✓ | ✓ | ✓ | — |
| Invite / remove board members | ✓ | ✓ | — | — |
| Rename / archive / delete board | ✓ | ✓ | — | — |
| Manage workspace members & billing | ✓ | — | — | — |

*Observer* is a read-and-comment role, intended for clients and stakeholders; observers do not
consume a paid seat on the Business tier and above.

---

## 7. API surface (v1)

REST over HTTPS, JSON bodies, bearer-token auth. All list endpoints are cursor-paginated.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/boards` | Boards visible to the caller |
| POST | `/v1/boards` | Create a board |
| GET | `/v1/boards/{id}` | Board with lists and cards (single hydration call) |
| PATCH | `/v1/boards/{id}` | Rename, recolour, star, archive |
| POST | `/v1/boards/{id}/members` | Invite a member |
| POST | `/v1/boards/{id}/lists` | Create a list |
| PATCH | `/v1/lists/{id}` | Rename, reposition, set WIP limit |
| DELETE | `/v1/lists/{id}` | Archive a list |
| POST | `/v1/lists/{id}/cards` | Create a card |
| PATCH | `/v1/cards/{id}` | Update fields **and** move (`list_id` + `position`) |
| DELETE | `/v1/cards/{id}` | Archive a card |
| POST | `/v1/cards/{id}/comments` | Add a comment |
| GET | `/v1/cards/{id}/activity` | Paginated activity feed |
| GET | `/v1/boards/{id}/search?q=` | Server-side search for large boards |

**Realtime:** a WebSocket channel per board (`board:{id}`) broadcasts the same event objects that
the activity feed stores, so open clients converge without polling.

### 7.1 Concurrency

Card moves are last-write-wins on `(list_id, position)` with an `updated_at` precondition.
Field edits use optimistic concurrency: a stale `If-Match` returns `409` and the client re-fetches
the card rather than silently overwriting a colleague's edit.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | Board with 20 lists / 1,000 cards hydrates in < 1.5 s on a 10 Mbps connection. Drag interaction holds 60 fps; list bodies virtualise beyond 150 cards. |
| **Realtime latency** | A change made by one member is visible to another in < 500 ms p95. |
| **Availability** | 99.9 % monthly for Business, 99.95 % for Enterprise, measured on the API. |
| **Accessibility** | WCAG 2.2 AA. Every drag action has a keyboard/menu equivalent (see C-11). Focus is trapped in modals and restored on close. Colour is never the only carrier of meaning — due-date badges carry text as well as colour. |
| **Browser support** | Latest two versions of Chrome, Edge, Firefox, Safari. Responsive down to 768 px; below that the board scrolls one list at a time. |
| **Internationalisation** | UTF-8 throughout, externalised strings, RTL-ready layout (relevant for Arabic-language deployments). Dates render in the user's locale and timezone. |
| **Security** | TLS 1.3 in transit, AES-256 at rest, bcrypt/argon2 password hashing, SSO (SAML/OIDC) on Enterprise, full audit log, rate limiting per token. |
| **Data protection** | GDPR-aligned: data-export and erasure endpoints, configurable data residency (EU/US), documented sub-processors, DPA available. |
| **Backups** | Point-in-time recovery to any moment in the last 7 days; daily snapshots retained 30 days. |

---

## 9. Prototype notes

The file `flowboard-prototype.html` is a **single-file, dependency-free** clickable prototype.
Open it in any modern browser — no server, no build step, no install.

**What is real in the prototype**

- Three seeded boards with lists, cards, labels, members, due dates, checklists and comments
- Drag & drop of cards within and between lists, with pointer-accurate insertion
- Drag & drop reordering of lists
- Inline board and list renaming; inline card composer with Enter-to-add
- Full card detail modal: description, labels, members, due date, checklist, comments, move, copy, delete
- Live text search plus label / member / due-date filters with removable chips
- WIP limits with over-limit highlighting
- Board creation and switching, member invitation, light/dark theme, keyboard shortcuts

**What is deliberately stubbed**

| Stub | Reason |
|---|---|
| **No persistence** — state lives in memory and resets on refresh | The prototype demonstrates interaction design, not storage. Production uses the API in §7. |
| No authentication | Signed-in user is hard-coded as *Anas Matar*. |
| No realtime sync | Single-client only; production uses the WebSocket channel in §7. |
| No file attachments | Out of scope for v1.0. |
| Relative timestamps are illustrative ("2 days ago") | Real timestamps come from the server. |
| Email invitations are not sent | The invite popover toggles local membership only. |

**Verification.** The prototype ships with an automated smoke test (`smoke.py`, Playwright) that
exercises board rendering, card creation, the detail modal, checklists, comments, labels, search,
filtering, board switching, drag & drop and the theme toggle, and asserts a clean console.

---

## 10. Release plan

| Release | Contents | Rough effort |
|---|---|---|
| **v1.0 — Core Kanban** | Everything in §3, real persistence, auth, realtime | 10–12 weeks, 3 engineers |
| **v1.1 — Collaboration** | Attachments, notifications, @mentions, richer activity | 4 weeks |
| **v1.2 — Views** | Calendar and table views, saved filters, board templates | 6 weeks |
| **v2.0 — Scale** | Automation rules, reporting, integrations, SSO/SCIM, admin console | 12 weeks |

## 11. Open questions

1. Are labels board-scoped (Trello's model) or workspace-scoped (better for cross-board reporting)?
2. Should WIP limits ever be *hard* — blocking a drop — or always advisory?
3. Do Observers count toward billed seats on the Team tier?
4. Is EU-only data residency required at launch, or can it wait for the Enterprise tier?
5. Archive retention: is 30 days sufficient, or does compliance require longer?
