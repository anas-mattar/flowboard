**Backlog item:** FB-03 App shell
**Status:** Approved
**Approved by:** Anas, 3 October 2026 (Paperclip issue TAS-10, confirmation card accepted; independent review TAS-12)
**Owner(s):** FlowBoard Frontend (`flowboard-web` components, routing, theme, primitives and unit tests), FlowBoard QA (`flowboard-web/e2e/FB-03-shell.spec.ts` Playwright and axe suite, §10, in a separate task after the Frontend task; see the end-to-end ownership rule in FB-00)
**Reviewer:** FlowBoard QA
**Increment:** MVP-1

---

### 1. Goal

A signed-in user sees the FlowBoard frame from the prototype: a collapsible sidebar with the workspace name and their own identity, a top bar, a theme toggle that switches the whole application instantly and is remembered, and routing that keeps signed-out visitors out. FB-03 is the stage on which FB-04 places the board list and the board itself; it ships the layout, navigation, theme, toast and dialog primitives once so that every later screen reuses them.

### 2. Requirement references

| Source | Reference | Requirement | Tag |
|---|---|---|---|
| FS | X-02 | Switch between light and dark theme; applies to the whole application instantly | [REQ] |
| FS | X-04 | Collapse the sidebar; the board area expands to full width | [REQ] |
| FS | X-01 | Every destructive or state-changing action gives feedback: toast within 200 ms (primitive shipped here, used by FB-04) | [REQ] |
| FS | X-03 | `Esc` closes modals and popovers; `Enter` submits composers (dialog primitive and shortcut registry shipped here) | [REQ] |
| FS | §4.1 | Sidebar: brand block with product mark and workspace name; Boards section (rows by FB-04); footer with current user avatar, name and workspace role; collapsible via ☰ | [REQ] |
| FS | §4.2 | Top bar controls: ☰ toggle, board title, star, search, filter, avatar stack, invite, theme toggle. FB-03 renders ☰ and theme; board title and star are FB-04; search, filter, avatars and invite are placeholders disabled until FB-09 and FB-13 | [REQ] |
| FS | §8 accessibility | WCAG 2.2 AA; focus trapped in modals and restored on close; colour never the only carrier of meaning | [REQ] |
| FS | §8 browser | Latest two versions of Chrome, Edge, Firefox, Safari; responsive down to 768 px | [REQ] |
| FS | §8 internationalisation | Externalised strings; RTL-ready layout with logical properties | [REQ] |
| BM | §5 | Clear empty states are a margin decision (empty state when a workspace has no boards, content supplied by FB-04) | [REQ] |
| CL | CL-E13 | Theme persisted per user via `PATCH /v1/me`, mirrored in `localStorage`; sidebar collapse in `localStorage` | [ENG] |
| CL | CL-E6 | Prototype behaviours not to copy: `prompt()`, `confirm()`; in-app dialogs instead | [REQ] |
| CL | CL-E7 | Logical CSS properties, message catalogue | [REQ] |
| CL | CL-O2 | PT design tokens are the approved visual design | [ASM] put to Anas with this specification |
| PT | sidebar, topbar, `[data-theme]` | Visual and interaction reference: 250 px sidebar, `--sidebar` palette, brand block, 32 px icon buttons, `data-theme` attribute on the document element | [REQ] |
| TAS-7 | §4 FB-03 | Acceptance: theme persists per user; sidebar collapse persists; keyboard focus order verified; axe reports no violations | [REQ] |

### 3. Scope

**In scope**

- Application layout component: sidebar (250 px, collapsible to 0 with a 200 ms transition that respects `prefers-reduced-motion`), main column with top bar and content outlet, matching PT structure and tokens.
- Routing with TanStack Router: `/login`, `/signup` (public, from FB-02), authenticated layout route wrapping `/` and `/boards/$boardId` (the board route itself renders FB-04's content; FB-03 ships the route with a placeholder outlet). Route guard: unauthenticated → `/login?next=<path>`; after login, return to `next`.
- Sidebar: brand block (mark "F" gradient, "FlowBoard", workspace name from `GET /v1/me`), a "Boards" section header with an outlet for FB-04's list, footer with avatar (initials on `avatarColor`), display name, workspace role ("Workspace admin" or "Member", from catalogue), and a footer menu with "Sign out" (FB-02's action) and the theme choice.
- Top bar: ☰ button (toggles sidebar, `aria-expanded`, `aria-controls`), a title slot (FB-04 fills it), a spacer, disabled placeholder controls for search, filter and invite with `aria-disabled` and a tooltip "Coming soon" (removed by FB-09 and FB-13), and the ◐ theme toggle cycling light → dark → system with the current value announced.
- Theme: `data-theme` on `<html>` set before first paint from `localStorage`, reconciled with `GET /v1/me`, persisted with `PATCH /v1/me` on change; `system` follows `prefers-color-scheme`.
- Primitives: `Toast` (polite live region, auto-dismiss 4 s, pause on hover and focus, max 3 stacked), `Dialog` (modal with focus trap, `Esc` to close, focus restored to the opener, scrim click closes non-destructive dialogs only), `ConfirmDialog` (title, body, destructive primary button, cancel), a `useShortcut` registry (used by FB-13 for `/` and `F`; FB-03 registers only `Esc` handling for dialogs).
- Tailwind set up to consume the CSS variables from FB-00; no raw colour values in components.
- Responsive: at and below 768 px the sidebar overlays the content and is closed by default; above, it pushes content (FS §8).
- Empty content state component used by FB-04 when no boards exist.
- QA: the Playwright and axe suite in §10, written against the merged Frontend work.

**Out of scope**

- Board rows in the sidebar, Create board, board title and star (FB-04).
- Search, filter chip bar, avatar stack, invite popover (FB-09, FB-13).
- Keyboard shortcuts `/` and `F` (FB-13); only the registry ships here.
- Workspace switcher (CL-D7; only when a user has more than one workspace).

### 4. Acceptance criteria

1. **[REQ, X-02]** Pressing the theme toggle switches every visible surface between light and dark within one frame (no per-component transitions), and the choice survives a full reload and a login on a second browser context (persisted on the user, CL-E13).
2. **[ENG, CL-E13]** With no stored preference, the app follows `prefers-color-scheme`; choosing a theme overrides it; choosing "system" returns to following it.
3. **[REQ, X-04]** Pressing ☰ collapses the sidebar and the content area grows to the full viewport width (asserted by measuring the content element); pressing again restores it; the state survives a reload on the same device (`localStorage`).
4. **[REQ, FS §4.1]** The sidebar shows the product mark, the workspace name, a "Boards" heading, and a footer with the user's initials on their avatar colour, display name and role text; all text comes from the catalogue or the API.
5. **[ENG, route guard]** A signed-out visitor requesting `/boards/abc` is sent to `/login?next=/boards/abc` and, after logging in, lands on `/boards/abc`; a signed-in user requesting `/login` is sent to `/`.
6. **[REQ, FS §8 accessibility]** Tab order is: skip link, ☰, top-bar controls, sidebar items, footer menu, main content; every control has a visible focus ring; the ☰ button exposes `aria-expanded`; the sidebar is a `nav` landmark and the content a `main` landmark; axe reports zero violations on the shell in both themes, expanded and collapsed.
7. **[REQ, X-01]** The `Toast` primitive renders a message within 200 ms of being called (measured in a unit test with fake timers and in Playwright by timestamp), is announced via `aria-live="polite"`, and dismisses automatically after 4 s unless hovered or focused.
8. **[REQ, X-03, FS §8]** The `Dialog` primitive traps focus (Tab from the last control wraps to the first), closes on `Esc`, and returns focus to the element that opened it; `ConfirmDialog` requires an explicit click or Enter on the destructive button and does not close on scrim click.
9. **[REQ, FS §8 browser]** At a 768 px viewport the sidebar is closed by default and overlays the content when opened; the shell has no horizontal scrollbar at 768 px and 1280 px.
10. **[REQ, CL-E7]** Switching `<html dir="rtl">` in a test renders the sidebar on the right with no layout breakage (logical properties only); an ESLint rule or stylelint check forbids physical `left`/`right` margin and padding properties in `flowboard-web/src`.
11. **[REQ, FS §8 browser]** The Playwright shell tests pass on Chromium, Firefox and WebKit projects.
12. **[ENG]** Placeholder top-bar controls are `aria-disabled="true"`, not focus traps, and carry the "Coming soon" catalogue text as their accessible description.

### 5. User interface

Visual reference: PT `aside.sidebar`, `.brand`, `.side-sec`, `.side-foot`, `.topbar`, `.icon-btn`, `.btn`, tokens in `:root` and `[data-theme="dark"]` (CL-O2).

**Sidebar** (FS §4.1): 250 px, `--sidebar` background, `--sidebar-2` on hover rows. Brand block: 28 px gradient mark with "F", "FlowBoard" bold, workspace name small underneath. "Boards" section label upper-case, dimmed. Outlet for FB-04. Footer: 28 px avatar circle, name, role small; a menu button (⋯) opening a popover with Theme (Light / Dark / System radio group) and Sign out.

**Top bar** (FS §4.2): 52 px, `--panel` background, `--line` bottom border. Left to right: ☰ icon button, title slot, spacer, search placeholder, "Filter" placeholder button, avatar stack placeholder, "Invite" placeholder, ◐ theme button. Placeholder controls are visually dimmed and `aria-disabled`.

**Content**: `main` region filling the remaining space; `--bg` background; vertical overflow handled by the child (board canvas scrolls horizontally in FB-04).

**Keyboard**: Tab order as in AC 6; `Esc` closes any open popover or dialog; Enter and Space activate buttons; the footer menu is a `menu` with arrow-key navigation.

**Focus behaviour**: on route change focus moves to the page heading (visually hidden `h1` inside the title slot until FB-04 supplies the board title). Dialog focus trap and restore as in AC 8.

**Empty states**: `EmptyState` component (icon, heading, body, primary action slot). Content supplied by FB-04 ("No boards yet. Create your first board.").

**Confirmations and toasts**: primitives only; first use in FB-04.

**Strings** (catalogue keys): `app.name`, `app.skipToContent`, `shell.toggleSidebar`, `shell.boards`, `shell.theme`, `shell.theme.light`, `shell.theme.dark`, `shell.theme.system`, `shell.comingSoon`, `shell.search`, `shell.filter`, `shell.invite`, `shell.userMenu`, `role.workspaceAdmin`, `role.member`, `dialog.cancel`, `dialog.confirm`, `toast.dismiss`.

### 6. API contract

No new routes. FB-03 consumes `GET /v1/me` and `PATCH /v1/me` from FB-02 and `POST /v1/auth/logout`.

### 7. Data changes

None.

### 8. Authorisation

Client-side route guard only (redirects); the server enforces authentication on every `/v1` route (FB-02). The guard is tested in Playwright, not relied upon for security (STANDARDS §1.4).

### 9. Dependencies

- Backlog: FB-02 (frontend task; needs `GET /v1/me`, `PATCH /v1/me` and the auth screens). FB-03 can start as soon as the FB-02 backend routes are merged, in parallel with the FB-04 backend task.
- Decisions: CL-E13, CL-E6, CL-E7, CL-O2 (see §12).
- New packages: `tailwindcss`, `@tailwindcss/vite`, `@radix-ui/react-dialog` and `@radix-ui/react-dropdown-menu` (accessible primitives; alternatively `react-aria-components`, owner's choice recorded in the pull request), `stylelint` with a logical-properties rule or an ESLint equivalent.

### 10. Test plan

| Level | Tests | Covers |
|---|---|---|
| Unit (Vitest + Testing Library) | `theme.test.tsx` (initial from storage, system preference, PATCH called on change); `Toast.test.tsx` (render within 200 ms, auto-dismiss, pause on hover); `Dialog.test.tsx` (focus trap, Esc, restore); `ConfirmDialog.test.tsx` (no scrim close); `routeGuard.test.tsx` (`next` handling) | AC 1, 2, 5, 7, 8 |
| Integration | None (no API change) | |
| End to end (QA) | `flowboard-web/e2e/FB-03-shell.spec.ts`: `X-02 toggles theme instantly and persists across reload`, `X-02 theme follows the user into a second browser context`, `X-04 collapses the sidebar and expands the content`, `X-04 collapse state persists on reload`, `FB-03 redirects signed-out visitor and returns to next after login`, `FB-03 tab order and focus rings`, `FB-03 shell at 768 px overlays sidebar`, `FB-03 RTL renders without breakage` | AC 1, 3, 4, 5, 6, 9, 10, 11 |
| Accessibility | axe on the shell: light and dark, sidebar expanded and collapsed, footer menu open, a dialog open | AC 6 |
| Performance | None until FB-16 | |

### 11. Verification evidence

- CI run link on the pull request head, including Chromium, Firefox and WebKit projects.
- Unit test output and Playwright report.
- Screenshots: shell in light and dark, expanded and collapsed, at 1280 px and 768 px, with the footer menu open and a confirm dialog open; one RTL screenshot.
- axe report summary.
- Review task link and verdict.
- Definition-of-done items not met, stated plainly.

### 12. Open questions

None open. CL-O2 (the prototype's design tokens are the approved visual design for v1.0) was accepted by Anas on 3 October 2026 (TAS-10 confirmation card) and is recorded as **CL-A10** in `CLARIFICATIONS.md` §2.1.
