# Multi-Rate Pricing Calculator

**Live URL:** _(to be filled in after deploy — see [Deployment](#deployment))_
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
- [Deployment](#deployment)
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


### Order of operations, per line

```
subtotal       = quantity × unitPrice                       → round to 2dp
discountAmount = percent of subtotal, or the fixed amount    → round to 2dp
afterDiscount  = subtotal − discountAmount
taxAmount      = taxPercent of afterDiscount                 → round to 2dp
lineTotal      = afterDiscount + taxAmount
```

**Discount is applied before tax, and tax is charged on the discounted amount** — 5% of 180, not 5% of 200.


### Why the totals are stored, not re-derived

Each line's amounts are computed once and **written to its row**; the document's totals are the sum of those stored line values and are **written to the document row**. The summary report then simply `SUM`s the stored document columns.

Every layer reads the same recorded numbers, so **the report cannot disagree with the documents it aggregates** — the agreement is structural, not a coincidence that happens to hold because two separate implementations rounded the same way today.

The invariant that keeps this honest: **no code path writes a line item without recalculating.** Every mutation in `DocumentsService` funnels through one private `mutateLines()` helper that loads the document under a row lock, applies the change, calls `recalculate()`, and saves — all in one transaction. There is no way to update a line and forget to refresh the totals.


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
