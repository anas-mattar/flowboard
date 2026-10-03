# FlowBoard — Business Model

**Product:** FlowBoard — Trello-style visual work management
**Document version:** 1.0
**Date:** 27 August 2026
**Owner:** Anas Matar, DPOInternational
**Companion documents:** `FUNCTIONAL_SPEC.md`, `flowboard-prototype.html`

> **How to read the numbers in this document.** Every figure below is an *illustrative planning
> assumption* used to show the shape of the model and the sensitivities that matter. They are not
> researched market data. Before this plan is used for fundraising or budgeting, replace §3 (market),
> §6 (unit economics) and §7 (projection) with your own validated inputs. The structure is what is
> being proposed; the arithmetic is a worked example you can re-run with real numbers.

---

## 1. The business in one paragraph

FlowBoard sells a per-seat subscription to a visual work-management tool. Teams adopt it free,
bottom-up, without talking to anyone. They hit a natural ceiling — more boards, more people,
more control — and upgrade. Revenue is recurring, expands with headcount, and is defended by the
fact that a team's boards become the record of how they work. The whole model rests on one thing:
**time-to-first-board must be under two minutes**, because nothing else in the funnel works if it isn't.

---

## 2. Value proposition

### 2.1 The problem

Small and mid-sized teams coordinate work in tools that were not built for it — spreadsheets,
chat threads, email chains, and shared documents. The state of work is scattered, which produces
duplicated effort, missed handoffs, and status meetings whose only purpose is to reconstruct
information that should have been visible all along.

The tools built for this problem split into two unsatisfying halves: lightweight tools that stay
simple but stop being useful as the team grows, and heavyweight project suites that can model
anything but require an administrator and a rollout project.

### 2.2 The promise

> **See all your work in one view. Move it with one drag.**

| For | Who | FlowBoard is | That | Unlike |
|---|---|---|---|---|
| Teams of 3–200 | Coordinating work across people and stages | A visual work-management tool | Makes the state of every task obvious at a glance and changeable in one gesture | Spreadsheets (no shared state), chat (no structure), enterprise PM suites (no on-ramp) |

### 2.3 Differentiators

Feature parity with the category leader is table stakes, not a strategy. Three things are worth
building the company around:

1. **Speed as a feature.** Sub-second board loads and 60 fps dragging on boards with a thousand
   cards. The incumbents get slow at scale; that is a real, measurable wedge.
2. **Flow discipline built in, not bolted on.** WIP limits, ageing indicators and cycle-time
   reporting as first-class features rather than paid add-ons — the teams that care about Kanban
   properly are underserved.
3. **Governance without weight.** Audit trail, data residency, SSO/SCIM and a real DPA available
   at a mid-market price point. Most lightweight tools force a jump to enterprise pricing to get any
   of this — a gap DPOInternational is unusually well placed to exploit.

---

## 3. Market

> Assumption-based. Validate against current analyst reports before use.

### 3.1 Sizing logic (top-down cross-checked bottom-up)

| Layer | Definition | Illustrative figure |
|---|---|---|
| **TAM** | Global collaborative work-management software spend | ~$8–12 bn annually |
| **SAM** | SMB & mid-market teams (3–200 people) buying self-serve, English/EU-first | ~$1.5 bn |
| **SOM (3 yr)** | Realistically reachable with the GTM in §8 | ~$8–12 m ARR |

Bottom-up cross-check: ~40 m knowledge workers in the target segment × ~25 % using a dedicated
Kanban tool × ~$90 average annual revenue per paid seat ≈ $900 m of addressable spend — the same
order of magnitude as the top-down SAM, which is the point of the cross-check.

### 3.2 Segments

| Segment | Size | Entry motion | Willingness to pay | Priority |
|---|---|---|---|---|
| Small teams (3–15) | Largest by count | Free → self-serve upgrade | Low–medium | **Primary** |
| Mid-market departments (15–200) | Best revenue per account | Free land → team expansion | Medium–high | **Primary** |
| Agencies & consultancies | Niche but sticky | Client-facing boards, Observer seats | Medium | Secondary |
| Regulated / compliance teams | Small, high ACV | Governance requirements first | High | Secondary — natural DPOInternational adjacency |
| Enterprise (500+) | Long sales cycles | Requires SSO, SCIM, procurement | High | Deferred to v2.0 |

### 3.3 Competitive position

| Competitor | Strength | Weakness we attack |
|---|---|---|
| **Trello** | Brand, simplicity, huge free base | Slows on large boards; power features sit behind Power-Ups |
| **Asana** | Deep feature set, strong mid-market | Complex to adopt; expensive per seat |
| **Monday.com** | Flexible, strong marketing | Configuration burden; price escalates fast |
| **Jira** | Engineering standard | Overkill and unloved outside engineering |
| **Notion** | All-in-one, loved | Databases-as-boards are slow and fiddly at scale |
| **ClickUp** | Feature breadth, aggressive pricing | Perceived complexity and performance complaints |

**Positioning statement:** *the speed and simplicity of Trello, with the flow discipline and
governance a growing team needs — without the price or the rollout project.*

---

## 4. Revenue model

Per-seat SaaS subscription, monthly or annual, with a genuinely useful free tier.

### 4.1 Why per-seat

It is the norm in the category, so it needs no explanation in a self-serve funnel; it aligns price
with the value driver (people coordinating); and it produces automatic net revenue expansion as
customers hire. The trade-off is that it taxes collaboration — which is why Observers are free
above the Free tier, so nobody is ever charged for letting a stakeholder look.

### 4.2 Tiers

| | **Free** | **Team** | **Business** | **Enterprise** |
|---|---|---|---|---|
| **Price** (annual, per user/month) | $0 | **$5** | **$11** | **$19+** |
| Price (monthly) | $0 | $6 | $13 | Custom |
| Users | up to 10 | unlimited | unlimited | unlimited |
| Boards | 3 per workspace | unlimited | unlimited | unlimited |
| Cards per board | 500 | unlimited | unlimited | unlimited |
| Lists, labels, due dates, checklists | ✓ | ✓ | ✓ | ✓ |
| Comments & activity history | 30 days | unlimited | unlimited | unlimited |
| WIP limits | ✓ | ✓ | ✓ | ✓ |
| Free Observer seats | — | ✓ | ✓ | ✓ |
| Board templates | — | ✓ | ✓ | ✓ |
| File attachments | 10 MB total | 250 MB / user | 5 GB / user | Unlimited |
| Calendar & table views | — | ✓ | ✓ | ✓ |
| Automation rules | — | 200 runs/mo | 5,000 runs/mo | Unlimited |
| Cycle-time & throughput reporting | — | — | ✓ | ✓ |
| Guest / client boards | — | — | ✓ | ✓ |
| Admin console & audit log | — | — | ✓ | ✓ |
| SSO (SAML/OIDC) & SCIM | — | — | — | ✓ |
| Data residency (EU/US) | — | — | — | ✓ |
| Support | Community | Email, 48 h | Priority, 8 h | Named CSM, 99.95 % SLA |

**Annual discount:** ~17 % (two months free), paid up front — the standard lever for improving
cash conversion and reducing churn.

### 4.3 Packaging logic

The free tier is limited on **dimensions that grow naturally with success** — number of boards,
history depth, team size — not on the core experience. A team that likes FlowBoard hits the
3-board or 10-user wall within weeks. The wall arrives *after* the habit forms, which is the only
sequence that converts.

The Free → Team jump is deliberately cheap ($5) so it is an expense-report decision, not a
procurement one. The Team → Business jump is where margin lives, and it is triggered by
*organisational* needs — reporting, admin control, client sharing — that only appear once the
tool is genuinely in use.

### 4.4 Secondary revenue (post-v2.0)

| Stream | Description | Notes |
|---|---|---|
| Template marketplace | Paid board templates, revenue share with authors | Low revenue, high engagement value |
| Integration platform | Premium connectors (Slack, GitHub, Salesforce) | Bundled into Business/Enterprise |
| Professional services | Migration, onboarding, training for Enterprise | Low margin; used to close deals, not to make money |

---

## 5. Cost structure

| Category | Share of revenue at scale | Notes |
|---|---|---|
| **Cost of revenue (COGS)** | 15–20 % | Hosting, storage, CDN, realtime infrastructure, support salaries, payment fees (~3 %) |
| **R&D / Engineering** | 30–35 % | The core investment; heaviest pre-launch |
| **Sales & Marketing** | 25–35 % | Content, SEO, paid acquisition, lifecycle email, partnerships |
| **G&A** | 10–12 % | Finance, legal, compliance (SOC 2, DPAs), tooling |
| **Target gross margin** | **80–85 %** | Standard for a self-serve SaaS with no field sales |

Infrastructure cost per active user is small and falls with scale; the dominant COGS component
in the early years is **support headcount**, which is why in-product help and clear empty states
are a margin decision, not a design flourish.

---

## 6. Unit economics (worked example)

> Illustrative. Substitute measured values as soon as the funnel produces them.

**Assumptions**

| Input | Value |
|---|---|
| Blended paid ARPU | $8 / user / month |
| Average paid team size | 12 users |
| Average account MRR | $96 |
| Gross margin | 82 % |
| Monthly logo churn (SMB) | 3.0 % |
| Monthly net revenue retention | 102 % (expansion offsets churn) |
| Blended CAC per **account** | $420 |
| Free → paid conversion | 4 % |

**Derived**

| Metric | Calculation | Result |
|---|---|---|
| Average account lifetime | 1 ÷ 0.03 | ≈ 33 months |
| Gross-margin LTV | $96 × 0.82 × 33 | **≈ $2,600** |
| LTV : CAC | 2,600 ÷ 420 | **≈ 6.2 : 1** |
| CAC payback | 420 ÷ ($96 × 0.82) | **≈ 5.3 months** |
| Magic number (target) | net new ARR ÷ prior-quarter S&M | > 0.75 |

**Reading it.** An LTV:CAC above 3:1 with payback under 12 months is the standard bar; this model
clears it with room, which means the correct response to healthy early cohorts is to *spend more
on acquisition*, not to optimise price.

**Where it breaks.** The model is most sensitive, in order, to:

1. **Free → paid conversion.** Dropping from 4 % to 2 % roughly doubles effective CAC and pushes
   payback past 10 months. This is the single number to watch weekly.
2. **Churn.** Moving from 3.0 % to 4.5 % monthly cuts LTV by a third. SMB churn is structural
   (teams dissolve), so the defence is expansion into larger teams, not heroic retention effort.
3. **ARPU mix.** If Business-tier attach stays below ~20 % of paid accounts, blended ARPU sinks
   toward $5 and the model needs materially cheaper acquisition to work.

---

## 7. Three-year illustrative projection

| | **Year 1** | **Year 2** | **Year 3** |
|---|---|---|---|
| Registered workspaces | 12,000 | 55,000 | 150,000 |
| Paid accounts | 480 | 2,600 | 8,000 |
| Conversion rate | 4.0 % | 4.7 % | 5.3 % |
| Average account MRR | $84 | $96 | $112 |
| **Ending ARR** | **$484 k** | **$3.0 m** | **$10.8 m** |
| Gross margin | 78 % | 81 % | 84 % |
| Net revenue retention | 96 % | 102 % | 108 % |
| Headcount | 9 | 24 | 52 |
| Cash flow | Negative | Approaching breakeven | Breakeven / positive |

The shape matters more than the values: **year 1 buys product and proof, year 2 buys distribution,
year 3 monetises the base** through mix shift to Business and Enterprise rather than through new
logo volume alone.

---

## 8. Go-to-market

### 8.1 Motion

**Product-led growth, with a sales assist above roughly 50 seats.** No outbound in year 1.

```
Content / SEO / integrations ──► Free workspace ──► Habit (3 boards, 5 users)
                                       │
                                       ▼
                          Limit reached ──► Self-serve upgrade (Team)
                                       │
                                       ▼
                    Org needs: reporting, admin, guests ──► Business
                                       │
                                       ▼
                       Procurement, SSO, residency ──► Enterprise (sales-assisted)
```

### 8.2 Acquisition channels, ranked by expected efficiency

| Channel | Rationale | Year-1 weight |
|---|---|---|
| **SEO & comparison content** | High-intent searches ("Trello alternative", "Kanban WIP limits") convert far above paid | 35 % |
| **Product-led virality** | Every board invitation is a free acquisition event; make inviting frictionless | 25 % |
| **Integration marketplaces** | Slack, Google Workspace, GitHub listings put the product where teams already are | 15 % |
| **Community & template library** | Public templates rank in search and demonstrate value pre-signup | 15 % |
| **Paid acquisition** | Used to *validate* channel economics, not to drive volume, until CAC is proven | 10 % |

### 8.3 Activation

The activation metric is **a workspace with 3+ members and 10+ cards created in week 1** — the
threshold above which retention curves flatten in this category. Everything in onboarding is
built to hit it: a pre-populated sample board, a two-click invite, and templates for the five
most common processes (sprint, content calendar, hiring pipeline, support triage, client projects).

### 8.4 Expansion

Seat expansion is automatic. Tier expansion is prompted contextually — a board that crosses 200
cards is shown cycle-time reporting; an admin adding a tenth user sees the audit log. Upgrade
prompts appear at the moment of need, never as an interstitial.

---

## 9. Key metrics

| Stage | Metric | Year-1 target |
|---|---|---|
| Acquisition | Weekly new workspaces | 250 |
| Activation | % reaching 3 members + 10 cards in week 1 | 35 % |
| Activation | Time to first card | < 2 min |
| Retention | Week-4 workspace retention | > 40 % |
| Retention | Monthly logo churn (paid) | < 3 % |
| Revenue | Free → paid conversion | 4 % |
| Revenue | Net revenue retention | > 100 % by month 18 |
| Revenue | CAC payback | < 8 months |
| Efficiency | Gross margin | > 78 % |
| Product | Board load p95 | < 1.5 s |
| Product | Support tickets per 100 active workspaces | < 4 |

**The one number.** If only a single metric could be tracked, it would be *week-4 workspace
retention*. It is the earliest honest signal of whether the product is genuinely useful, and every
downstream number — conversion, churn, LTV, CAC payback — is derivative of it.

---

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Commoditised category** — hard to differentiate from Trello | High | High | Compete on performance at scale, flow discipline and governance rather than feature count; own a defensible niche before broadening |
| **Incumbent price pressure** — Atlassian bundles equivalent capability for free | Medium | High | Avoid competing on price alone; make Business-tier value organisational (reporting, admin, compliance) rather than feature-gated |
| **Low free→paid conversion** | Medium | High | Limit free on growth dimensions, not core experience; instrument the funnel from day one; run continuous packaging experiments |
| **High SMB churn** | High | Medium | Shift mix toward 15–200-seat accounts; drive annual plans; build data gravity through history and templates |
| **CAC inflation in paid channels** | Medium | Medium | Keep paid under 15 % of acquisition; invest in SEO and virality, which compound |
| **Scaling costs of realtime infrastructure** | Medium | Medium | Idle-connection backoff, regional edges, per-board fan-out limits; monitor cost per active user as a first-class metric |
| **Security or data-protection incident** | Low | Severe | SOC 2 Type II in year 2, penetration testing, least-privilege access, documented incident response, cyber insurance |
| **Key-person dependency in a small team** | Medium | Medium | Written architecture decisions, no single-owner systems, deliberate documentation practice |

---

## 11. Funding and milestones

| Stage | Amount | Use | Milestone that unlocks the next stage |
|---|---|---|---|
| **Pre-seed / bootstrap** | $150–300 k | Build v1.0, launch, first 100 paid accounts | Week-4 retention > 35 %, conversion > 3 % |
| **Seed** | $1.5–2.5 m | Scale GTM, reach $1 m ARR | LTV:CAC > 3:1, payback < 12 months, NRR > 100 % |
| **Series A** | $8–12 m | Enterprise tier, integrations, international | $3 m+ ARR growing > 2.5× annually |

---

## 12. Business Model Canvas (summary)

| | |
|---|---|
| **Customer segments** | Small teams (3–15), mid-market departments (15–200), agencies, compliance-minded teams |
| **Value propositions** | See all work at a glance; move it in one drag; fast at scale; flow discipline and governance without an enterprise rollout |
| **Channels** | Self-serve web, SEO/content, integration marketplaces, in-product invitations, sales assist above ~50 seats |
| **Customer relationships** | Self-serve and automated; email support on paid; named CSM on Enterprise; community and templates |
| **Revenue streams** | Per-seat subscriptions (Team / Business / Enterprise), annual prepay, later marketplace and premium integrations |
| **Key resources** | Engineering team, realtime platform, brand and content library, customer data |
| **Key activities** | Product development, performance engineering, content and SEO, lifecycle marketing, security & compliance |
| **Key partners** | Cloud provider, payment processor, SSO/identity providers, integration platforms, template authors |
| **Cost structure** | Engineering (30–35 %), S&M (25–35 %), COGS (15–20 %), G&A (10–12 %) |

---

## 13. Immediate next steps

1. **Validate the wall.** Interview 15–20 teams currently on free plans of competing tools; confirm
   the 3-board / 10-user limits are the real trigger points before hard-coding them.
2. **Price test.** Run a $5 / $7 / $9 Team-tier test at signup; measure conversion elasticity before
   committing to the tier table in §4.2.
3. **Instrument first.** Ship analytics for the §9 funnel *with* v1.0, not after it — retrofitting
   funnel instrumentation costs a quarter of clean data.
4. **Pick the wedge.** Decide whether the initial beachhead is speed-at-scale or
   compliance-friendly Kanban. Both are defensible; pursuing both simultaneously is not.
5. **Replace the assumptions.** Rebuild §3, §6 and §7 with researched market data and measured
   funnel values before this document is used for any funding or budget decision.
