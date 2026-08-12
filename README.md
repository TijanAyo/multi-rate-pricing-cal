# Multi-Rate Pricing Calculator

**Live URL**: https://pricing-cal.onrender.com 
**Demo login:** `demo@example.com` / `Password123!`

> The API and web app are on free-tier hosting that sleeps when idle. The **first request after a period of inactivity can take ~50 seconds** while the service wakes. It is not broken — give it a moment and reload.

---

## Contents

- [What is where](#what-is-where)
- [Prerequisites and setup](#prerequisites-and-setup)
- [Calculation and rounding policy](#calculation-and-rounding-policy)
- [Finalize and immutability rules](#finalize-and-immutability-rules)
- [API reference](#api-reference)
- [Tests](#tests)
- [Assumptions and trade-offs](#assumptions-and-trade-offs)
- [What I would improve before production](#what-i-would-improve-before-production)

---

## What is where

```
├─ packages/calc/          @pricing/calc — the calculation module.
│                          Pure TypeScript over decimal.js. No NestJS, no
│                          TypeORM, no database. This is deliberate: because it
│                          imports nothing from the framework, "one shared
│                          module" is provable rather than asserted.
├─ apps/api/               NestJS + TypeORM + PostgreSQL.
│                          The only writer of any stored amount.
└─ apps/web/               Next.js (App Router).
                           Displays server-computed figures; never does money
                           arithmetic itself.
```

**Stack choices:** NestJS + TypeORM for the backend, Next.js for the frontend, PostgreSQL in Docker for local development, decimal.js for money.

---

## Prerequisites and setup

**You need:** Node.js ≥ 22, pnpm ≥ 10 (`corepack enable`), and Docker.

```bash
# 1. Install dependencies for the whole workspace
pnpm install

# 2. Start PostgreSQL (host port 5433, so it will not clash with a local one)
pnpm db:up

# 3. Configure the API and the web app
cp .env.example apps/api/.env
echo 'NEXT_PUBLIC_API_URL=http://localhost:4000' > apps/web/.env.local

# 4. Create the schema, then load the demo data
pnpm migration:run
pnpm seed

# 5. Run both apps
pnpm dev
```

- Web app → <http://localhost:3005>
- API → <http://localhost:4000/api>
- Sign in with `demo@example.com` / `Password123!`

Optional database browser: `docker compose --profile tools up -d` → <http://localhost:8080>.

<details>
<summary>Other useful commands</summary>

```bash
pnpm test                # calculation unit tests
pnpm --filter api test:e2e   # API integration tests (uses a separate pricing_test database)
pnpm build               # build all three packages
pnpm db:down             # stop PostgreSQL
pnpm migration:revert    # roll back the last migration
```
</details>

---

## Calculation and rounding policy

All money arithmetic lives in **one module**, `packages/calc`, and runs through **decimal.js** — never a JavaScript `number`.

### Why not plain numbers

JavaScript numbers are binary floating point, which cannot represent most decimal fractions exactly. The canonical demonstration:

```js
0.1 + 0.2          // 0.30000000000000004
1.15 * 3           // 3.4499999999999997  ← naively truncates to 3.44, losing a cent
```

Over a document's worth of lines those errors accumulate into a total that is visibly wrong and does not reconcile. decimal.js stores values as exact decimals, so it never drifts.

### The policy, in three rules

**1. Every cash component is rounded to 2 decimal places as it is produced**, and the *rounded* value is what flows onward.

The subtotal is rounded, then the discount is computed and rounded, then subtracted; the tax is computed on that rounded base and rounded, then added. The consequence is that every number a user sees is a real cent, and the figures on screen add up **exactly** rather than approximately.

**2. Ties round HALF UP.** `0.125 → 0.13`, `0.825 → 0.83`. This is what retail pricing conventionally does and what a reviewer checking by hand expects. (Banker's rounding would give `0.12`; there is a test asserting we do not.)

**3. Inputs are never rounded.** Unit prices, discount percentages and tax percentages are used at full precision — a `7.1234%` tax rate is honoured exactly, not truncated to `7.12%`. Only computed *cash* is rounded.

The policy is configured once, in a **scoped** Decimal constructor rather than by mutating global state:

```ts
// packages/calc/src/calculate.ts
const Money = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP, precision: 30 });
```

### Order of operations, per line

```
subtotal       = quantity × unitPrice                       → round to 2dp
discountAmount = percent of subtotal, or the fixed amount    → round to 2dp
afterDiscount  = subtotal − discountAmount
taxAmount      = taxPercent of afterDiscount                 → round to 2dp
lineTotal      = afterDiscount + taxAmount
```

**Discount is applied before tax, and tax is charged on the discounted amount** — 5% of 180, not 5% of 200.

### Worked example

Taking **Widget A** from the assignment's sample document: quantity 2, unit price 100.00, 10% discount, 5% tax.

| Step | Arithmetic | Result |
|---|---|---|
| 1. Line subtotal | `2 × 100.00` | **200.00** |
| 2. Discount amount | `10% of 200.00` = `20.00` | **20.00** |
| 3. After discount | `200.00 − 20.00` | **180.00** |
| 4. Tax amount | `5% of 180.00` = `9.00` ← *of 180, not 200* | **9.00** |
| 5. Line total | `180.00 + 9.00` | **189.00** |

The whole document:

| Line | Qty | Unit price | Discount | Tax | Subtotal | Discount amt | After discount | Tax amt | Line total |
|---|---|---|---|---|---|---|---|---|---|
| Widget A | 2 | 100.00 | 10% | 5% | 200.00 | 20.00 | 180.00 | 9.00 | 189.00 |
| Widget B | 1 | 50.00 | — | 5% | 50.00 | 0.00 | 50.00 | 2.50 | 52.50 |
| Service fee | 1 | 200.00 | $20 fixed | — | 200.00 | 20.00 | 180.00 | 0.00 | 180.00 |

| Document total | Amount | How derived |
|---|---|---|
| Subtotal | **450.00** | `200 + 50 + 200` |
| Total discount | **40.00** | `20 + 0 + 20` |
| Total tax | **11.50** | `9.00 + 2.50 + 0` |
| Grand total | **421.50** | `189.00 + 52.50 + 180.00`, and equally `450 − 40 + 11.50` |

A case where the rounding actually bites — `3 × 3.33` with a `7.5%` discount:

```
subtotal       = 3 × 3.33            = 9.99
discountAmount = 7.5% of 9.99        = 0.749250  → 0.75   (half up)
afterDiscount  = 9.99 − 0.75         = 9.24
```

Because the discount was rounded *before* being subtracted, `afterDiscount` is a clean `9.24` rather than an internal `9.240750` that would print as `9.24` but not quite add up.

### Why the totals are stored, not re-derived

Each line's amounts are computed once and **written to its row**; the document's totals are the sum of those stored line values and are **written to the document row**. The summary report then simply `SUM`s the stored document columns.

Every layer reads the same recorded numbers, so **the report cannot disagree with the documents it aggregates** — the agreement is structural, not a coincidence that happens to hold because two separate implementations rounded the same way today.

The invariant that keeps this honest: **no code path writes a line item without recalculating.** Every mutation in `DocumentsService` funnels through one private `mutateLines()` helper that loads the document under a row lock, applies the change, calls `recalculate()`, and saves — all in one transaction. There is no way to update a line and forget to refresh the totals.

### Where the client fits

The browser **never** performs money arithmetic. While editing a draft, the editor posts the line *inputs* to a stateless `POST /api/calc/preview` and displays what comes back. That endpoint calls the same `calculateDocument()` the persisted path calls, so the live figure and the saved figure cannot diverge. Money crosses the wire as a **string** (`"189.00"`, never `189`) — emitting a JSON number would hand the value straight back to the float problem.

---

## Finalize and immutability rules

| Status | Behaviour |
|---|---|
| `draft` | Fully editable — add, edit and remove lines; edit metadata. |
| `finalized` | Read-only. Every mutating endpoint rejects with **`403 DOCUMENT_FINALIZED`**. |

**Finalizing** is `POST /api/documents/:id/finalize` — a dedicated endpoint, not `PATCH { status: 'finalized' }`. It is a state transition with validation and side effects, and routing it separately means status cannot be flipped as though it were an ordinary field. (`UpdateDocumentDto` has no `status` property at all.)

Finalize refuses when:

| Condition | Code |
|---|---|
| The document is already finalized | `ALREADY_FINALIZED` |
| It has no line items | `NO_LINE_ITEMS` |
| Any line has quantity < 1 or a negative price *(stretch goal)* | `INVALID_LINE_ON_FINALIZE` |

On success it recalculates one final time, so the frozen amounts are provably current.

**Duplication is supported** *(stretch goal)*: `POST /api/documents/:id/duplicate` copies any document — finalized or draft — into a **new draft** titled `"<title> (copy)"` with today's issue date. It copies only the line **inputs** (description, quantity, price, discount rule, tax rule) and then recomputes every amount from scratch. Nothing is ever copied from one row of computed figures to another, so every stored amount in the system traces back to the calculation module.

Enforcement is a single `assertEditable()` helper called from every write path, rather than scattered inline status checks. The e2e suite asserts that **all four** mutating endpoints reject a finalized document, and that the document is genuinely unchanged afterwards.

---

## API reference

All routes are under `/api` and require `Authorization: Bearer <token>` except where marked public.

```
POST   /auth/signup                          public   → { user, accessToken }
POST   /auth/login                           public   → { user, accessToken }
GET    /auth/me                                       → { id, email }
GET    /health                               public   → { status }

POST   /calc/preview                                  → stateless totals for a set of line inputs

GET    /documents                    ?status=         → document summaries
POST   /documents                                     → 201 document
GET    /documents/:id                                 → document with line items
PATCH  /documents/:id                draft only       → document
DELETE /documents/:id                                 → 204 (soft delete)
POST   /documents/:id/finalize                        → document
POST   /documents/:id/duplicate                       → 201 new draft

POST   /documents/:id/line-items              draft only  → the whole document
PATCH  /documents/:id/line-items/:lineItemId  draft only  → the whole document
DELETE /documents/:id/line-items/:lineItemId  draft only  → the whole document

GET    /reports/summary   ?from=YYYY-MM-DD&to=YYYY-MM-DD&status=
```

Line-item writes return the **whole document** because any line change moves the document totals — returning just the line would leave the client's totals stale.

### Response envelope

Success and failure share one predictable shape:

```jsonc
// 200
{ "data": { "id": "…", "grandTotal": "421.50", "lineItems": [ … ] } }

// 400
{ "error": {
    "code": "DISCOUNT_EXCEEDS_SUBTOTAL",
    "message": "Fixed discount of 150.00 cannot exceed the line subtotal of 100.00.",
    "field": "discount.value",
    "lineIndex": 1
} }
```

`code` is the contract a client switches on — stable and machine-readable. `message` is for humans and may be reworded freely. `field` (a dotted path) and `lineIndex` let the UI attach the message to the exact input that caused it, which is how the editor highlights the offending cell.

One global exception filter produces this shape for **everything** — `CalculationError` from the shared module, DTO validation failures, and lifecycle rejections alike — so the client has one error model, not three. HTTP status codes still carry their normal meaning (`400` validation, `401` unauthenticated, `403` finalized, `404` not found, `409` conflict).

### Validation errors

| Condition | Code | Status |
|---|---|---|
| Quantity not a whole number ≥ 1 | `INVALID_QUANTITY` | 400 |
| Unit price NaN or negative | `INVALID_UNIT_PRICE` | 400 |
| Discount percent outside 0–100 | `INVALID_DISCOUNT_PERCENT` | 400 |
| Fixed discount negative | `INVALID_DISCOUNT_FIXED` | 400 |
| Fixed discount exceeds the line subtotal | `DISCOUNT_EXCEEDS_SUBTOTAL` | 400 |
| Tax percent NaN or negative | `INVALID_TAX_PERCENT` | 400 |
| Edit attempted on a finalized document | `DOCUMENT_FINALIZED` | 403 |
| Document missing **or owned by someone else** | `DOCUMENT_NOT_FOUND` | 404 |

### Data model notes

- **The discount is one value plus a type tag** (`discountType` + `discountValue`), not two nullable columns. "10% off *and* $20 off simultaneously" is therefore not a state the schema can represent, rather than an invalid state that has to be checked for. A database `CHECK` constraint backs it up: the tag and the value are either both `NULL` or both set.
- **Money columns are `numeric`**, read as strings by the `pg` driver and kept as strings all the way to the JSON response.
- **Line items carry a `position`** so row order is stable rather than whatever Postgres happens to return.
- **Users have a *partial* unique index on email** (`WHERE deleted_at IS NULL`). With soft delete, a plain unique constraint would let a deleted account hold its email hostage forever.
- **Ownership is a `WHERE` clause on every query**, and a document belonging to another user returns **404, not 403** — the API never confirms that an id exists.

---

## Tests

```bash
pnpm test                     # 41 unit tests — the calculation module
pnpm --filter api test:e2e    # 41 integration tests — the API over a real database
```

**Unit tests** (`packages/calc/src/calculate.spec.ts`) are the highest-value surface, and cover:

- the assignment's sample document, asserted line by line **and** in total;
- half-up boundary cases that would fail under banker's rounding (`0.125 → 0.13`, `0.825 → 0.83`, `0.74925 → 0.75`);
- float-drift regressions (`3 × 1.15` must be `3.45`, not `3.44`);
- edge cases — zero price, 100% discount, a fixed discount exactly equal to the subtotal, an empty document, very large amounts;
- every error code, asserting both `code` and `field`;
- the **consistency property**: across several awkward documents, each total equals the sum of its already-rounded line values, and `grandTotal === subtotal − totalDiscount + totalTax` in integer cents.

**Integration tests** run against a real PostgreSQL database (`pricing_test`, created and migrated automatically) with the same global pipes and filters as production. They cover the sample document's stored totals, recalculation on every kind of line change, finalize immutability across **all four** mutating endpoints, duplication, cross-user `404`s, soft delete, and report reconciliation.

> The report test asserts the graded property directly: the summary's aggregates equal the sum of the individual documents it returns, and each of those matches what `GET /documents/:id` reports.

---

## Assumptions and trade-offs

Where the brief was ambiguous, I made a call and recorded it here.

**A fixed discount larger than the line subtotal is rejected, not clamped.** The brief permits either provided the choice is documented. Rejecting surfaces what is almost certainly a typo instead of quietly charging a different amount than the user asked for. The error names both figures: *"Fixed discount of 150.00 cannot exceed the line subtotal of 100.00."*

**The summary report covers both drafts and finalized documents.** The brief asks for "number of documents" without qualification, and a user whose seeded drafts vanished from their own report would reasonably think it was broken. An optional `?status=` narrows it when only finalized documents matter.

**Discount percent is bounded 0–100; tax percent is bounded only at zero.** No upper limit on tax, since the brief explicitly requires no tax-compliance knowledge and a cap would be an invented rule.

**`customer` is a plain string, not an entity.** Nothing in the brief needs customer records, and a `customers` table would be scope the assignment did not ask for. Promoting it later is a migration plus a foreign key.

**Single implicit currency.** No currency column, no conversion. Multi-currency changes the rounding story materially (some currencies have zero or three decimal places) and would be a different assignment.

**`issueDate` is a timezone-free calendar date** (`type: 'date'`, `'YYYY-MM-DD'`). A timestamp would mean the same document reported a different issue date depending on who was looking at it. Report range bounds are inclusive at both ends.

**JWT bearer tokens in `localStorage`, not httpOnly cookies.** The API and web app sit on different origins, where cross-site cookies need `SameSite=None; Secure` plus CSRF handling — real complexity for no benefit here. The trade-off is honest: a bearer token in `localStorage` is readable by any XSS on the page, where an httpOnly cookie would not be. For production I would move to httpOnly cookies with a short-lived access token and rotating refresh token.

**The design prototype's client-side arithmetic was deliberately discarded.** The Claude Design source computed totals in the browser with floating-point `Number` math and formatted money via `Number(n).toLocaleString()`. Both are exactly what the brief rules out ("totals must be computed server-side, the client must not be the source of truth"; "avoid floating-point drift"). The port kept 100% of the prototype's markup and styling and replaced 100% of its math with server calls — including a string-based money formatter that never converts through a number.

**Line items are hard-deleted; documents are soft-deleted.** A line item has no meaning outside its document, so there is nothing to audit in isolation; the document is the unit worth keeping.

**`forbidNonWhitelisted` is on.** A request that includes an unknown key — say a client trying to set `grandTotal` — is rejected rather than having the field silently dropped. Silent stripping would let a client believe it had set a total the server actually owns.

---

## What I would improve before production

**A database-level immutability guard.** Today `assertEditable()` in the service layer is the only thing stopping a finalized document from changing. A trigger rejecting `UPDATE`s on rows where `status = 'finalized'` would make it structural rather than a rule the application has to remember — useful the day someone writes a migration or a maintenance script that bypasses the service.

**Refresh tokens with rotation**, and the move to httpOnly cookies described above. Seven-day access tokens with no revocation path are fine for an assessment, not for real money documents.

**An audit log.** Finalize and duplicate are exactly the events someone will later need to reconstruct ("who froze this, and when?"). Append-only rows recording actor, action and timestamp.

**Cursor pagination on the document list**, which currently returns everything a user owns. Fine at demo scale, not at ten thousand documents.

**An idempotency key on finalize and duplicate**, so a double-clicked button or a retried request cannot produce two copies.

**Multi-currency**, with the currency stored per document and the rounding policy parameterised by its minor-unit count — the current policy hard-codes two decimal places.

**`customer` promoted to its own entity**, once anything needs customer-level reporting or contact details.

**Report caching.** The summary aggregates in SQL and is cheap now, but a materialised rollup per user per month would keep it cheap as documents accumulate.

**Optimistic concurrency in the UI.** The API already takes a row-level write lock per transaction, but two browser tabs editing the same draft will still last-write-wins. A version column returned to the client and checked on write would surface the conflict instead of silently discarding an edit.
