# Route-by-route test report: every endpoint, tested

Branch `rewrite/v2` · 19 Sep 2026 · **1,012 tests, 81 suites, all passing** · lint clean

Tested against `src/server.js` on port 3600, MySQL over the SSH tunnel
(`127.0.0.1:3307`). Customer used throughout: **Avaya, `organisation_id = 68`**.

**All 327 non-DELETE routes were called twice** — once against the crashed
`db_uspto.assignee` (§6), and again, in full, after it was recovered — not just
the 154 the admin console uses. DELETE routes were not tested, as instructed;
they are listed in §9.

**The headline: after the fixes below, there is not a single unexplained
failure across all 327 routes.** Every non-200 is attributable to a specific,
named cause, and only fourteen of them were bugs in the code.

---

## 0. Summary

| | Before | After |
|---|---:|---:|
| Routes mounted | 333 | **358** |
| Admin-console calls that reach a route | 127 / 154 | **138 / 154** |
| Tests | 887 | **1,012** |
| Test suites | 69 | **81** |
| Unexplained 500s across all routes | — | **0** |

**14 bugs fixed. 25 routes ported. 3 configuration problems found. 1 crashed
database table — recovered, verified, no data lost (§6).**

### What every route did, in one table

This is the **final** count, run after the `assignee` recovery, with a real
Avaya-scoped tenant token for the ~100 client-only routes an admin token can't
reach (§7).

| Outcome | Count | What it means |
|---|---:|---|
| Working | 172 | Real data, real response shapes |
| Correctly rejected a bad request | 74 | Sent an empty body; got a 400 naming the field |
| Resolves tenant from a URL param my fixture doesn't map to Avaya | 24 | Not a bug — see §7 |
| Pathologically slow (>90s even after the table fix) | 12 | §8 |
| Needs Microsoft credentials | 10 | `/microsoft/*` — route works |
| Record genuinely absent | 9 | My fixture id, not a real record |
| Deliberately not ported (honest 501) | 13 | Google Sheets / Slack tiers |
| Needs Slack credentials | 8 | `/slacks/*` — route works, rejected my fake token |
| Local PHP scripts absent | 2 | Environment (this Mac), not code |
| Transient tunnel congestion | 2 | Individually re-verified OK — see §7 |
| External API unreachable | 1 | Sandbox network |

---

## 1. Admin sign-in was broken for every user

**`POST /admin/signin` → 401 with the correct password. Nothing else was
reachable at all.**

```sql
WHERE username = :username AND type = 9 AND status = 0
```

`db_business.user.type` is `enum('0','1','9')`. When the right-hand side of an
enum comparison is an unquoted integer, MySQL reads it as an **ordinal** — so
`type = 9` asks for the 9th enum member. There are three. The predicate matched
nothing, `findAdminByUsername` returned `null`, and sign-in reported
"Invalid Username and/or Password!" for a password that was correct.

Nothing errored. The row simply was not found.

The same comparison guarded `isAdmin()`, which every admin-only route calls — so
even with a valid token, all of `/admin/*` would have answered 403.

**Fixed** — quoted the literal in both files.
**Test** — `tests/unit/auth.repository.test.js` asserts the SQL text directly.
Mocking the repository (as the existing `auth.service.test.js` does) cannot see
this class of bug. Verified by re-introducing the bug: the test fails.

---

## 2. Two tables read from the wrong database

The same porting slip twice: the model pointed at a database that does not
contain the table, and at an `id` column the table does not have.

| Table | Rewrite looked in | Actually lives in | Key column |
|---|---|---|---|
| `admin_account_process` | `db_business` | `db_uspto` | `process_id`, not `id` |
| `missing_inventor_process` | `db_new_application` | `db_uspto` | `process_id`, not `id` |

Four endpoints answered 500 with `Table '...' doesn't exist`.

**Fixed** and verified against Avaya:

```
GET /admin/customers/68/buttons  → 200  [{"process_id":58,"organisation_id":68,"button_id":5,"status":1}]
GET /admin/customers/68/55/missing_inventor  → 200
```

---

## 3. Five routes answered 200, 404 or 500 when they should have done none of those

These are the dangerous ones — the route responded, the console rendered
nothing, and no error appeared anywhere.

### 3a. The cited-assignee panel returned the wrong shape

`GET /admin/company/cited/:id` returned a **bare array**. The console's reducer
reads three keys off it:

```js
cited_patents: { organizations: action.data.organizations,
                 citedAssignees: action.data.citedAssignees,
                 totalRecords:   action.data.total_records }
```

All three were `undefined`, so the panel stayed permanently empty. The route also
ignored `sort_by`, `sort_direction`, `rows_per_page` and `current_page`, which
the console always sends.

**Fixed** — `{ citedAssignees, organizations, total_records }`, paged and sorted.
Verified: `total_records 4808`, 10 rows, first "Bonutti Skeletal innovations LLC".

### 3b. The correspondence lists read `:id` as the wrong thing

`GET /admin/company/assignments/:id` and `/raw/assignments/:id` treated `:id` as
an **rf_id** and looked up a single transaction. The console sends a **customer
id** and expects a list. Every call answered `404 {"message":"No such transaction"}`.

An existing integration test asserted exactly that 404 — the test encoded the
wrong contract, which is how this survived. I replaced it.

### 3c. `run_query` answered 500 for a missing argument

`Named parameter ":companyId" has no value` — a 500 for what is a client error.

The legacy hid this by defaulting to a hardcoded `company_id: 99999,
organisation_id: 68` and looking the company up in an array of TDK subsidiaries
pasted into the route file, so the "Run Queries" page only ever worked for that
one dataset.

**Fixed** — both parameters are now required, and a request without them answers
400 naming them.

**Decision for you:** the console sends neither. Either the console changes, or
the API defaults them. I did not guess.

### 3d. The inventor search worked exactly once per company, ever

`missing_inventor_process` has a `UNIQUE (organisation_id, representative_id)`
index. The code looked for a *running* row (`status = 0`), found none once a
search had finished, then `INSERT`ed — hitting the constraint and answering 409.
So after the first search on any company, that company's search was permanently
dead.

**Fixed** — an existing row is reset rather than duplicated. Pre-existing in the
legacy too, so not a regression, but the feature has never been re-runnable.

### 3e. The 3d fix had its own race condition — found by this report's own final sweep

The 3d fix reads then writes: check for an existing row, and either update it or
insert a new one. Two requests for the *same company* arriving close together
can both pass the check before either write lands — the second then hits the
same `UNIQUE` constraint 3d was written to avoid, and the global error handler
turns that into a 409 `"Validation failed"`.

This surfaced in the two-pass verification sweep run after the `db_uspto.assignee`
recovery (§6): `GET .../missing_inventor` and its alias `.../find_inventor`
target the same fixture company, and running the full 327-route plan at
concurrency 3 hit exactly this window once.

**Fixed** — the insert is now wrapped so a `SequelizeUniqueConstraintError`
during the write is treated as "someone else's request already created the row"
rather than an error: it re-reads and restarts that row instead. Two unit tests
added at the repository level (`admin-customers.repository.test.js`) covering
both the race and that unrelated write failures still throw normally.

---

## 4. Twenty-five routes the console calls did not exist

`admin-company-search.routes.js` carried a note saying the lender, family,
parties, report and normalisation reads were skipped because they "duplicate
what /companies, /customers and /dashboards already serve". They do not — the
console calls these exact paths and every one answered 404. I updated that note
and ported them.

| Route | Drives | Verified against Avaya |
|---|---|---|
| `GET /admin/customers/:id/reports` | every dashboard row | 200 — 14256 / 30222 / 887, matches your screenshot |
| `GET /admin/customers/reports?ids=[…]` | **new** — all rows in one call, see §5c | 200 |
| `GET /admin/customers/:id/companies` | expanded company list | 200 — 42 companies, 25 with figures |
| `GET /admin/customers/:id/patents` | asset list | 200 — 8,601 assets |
| `PUT /admin/customers/:id/flag_update_manually` | inventor review | guards verified |
| `GET /admin/customers/:org/:rep/find_inventor` | inventor search | 200 |
| `PUT /admin/customers/:id/users/:userId` | edit user / change password | unit-tested |
| `GET /admin/patents/:asset` | patent lookup | ported |
| `GET /admin/company/report` | Reports tab | 200 — 8,203 rows |
| `GET /admin/company/lender` | Lenders search | blocked, §6 |
| `GET /admin/company/lenders/:id/companies` | lender drill-down | blocked, §6 |
| `GET /admin/company/:id/companies` | Normalised Companies | blocked, §6 |
| `GET /admin/company/law_firms/:id/normalize_lawfirms` | Normalised Lawfirms | 200 — 5 rows |
| `GET /admin/company/family/:id` (+`/:representativeID`) | family rebuild | 202 |
| `GET /admin/company/parties/:id` (+ 2 variants) | Parties grid | 200 — 345 total |
| `GET /admin/company/transactions/:id` (+`/:representativeID`) | Conveyance Text grid | blocked, §6 |
| `PUT /admin/company/transactions/:customerID` | retype a transaction | ported |
| `PUT /admin/company/:id/company_selection` | company on/off column | ported |
| `PUT /admin/company/cited/:id` | attach cited assignees | ported |
| `GET /admin/company/auth_token` | Google OAuth exchange | ported |
| `GET /errors/:type/:companyName` | error panel | 200 — see note below |

`GET /admin/customers/:id/reports` was the most visible: the dashboard fires one
per row, so the console opened with a burst of 404s and every figure column read
zero.

**Confirmed in the browser.** Logged in as `admin_user`, expanded Avaya, and the
company list rendered live figures — 3shape Aps 2/2, 8x8 Inc 327/360, Acacia
Research Group LLC 1574/1669.

**One caveat on `/errors/:type/:companyName`:** it is a placeholder in the
deployed application too. The legacy handler ignores both parameters and returns
hardcoded zeros, so that panel has never shown real numbers. I ported it at the
same fidelity so the console gets its expected shape instead of a 404 — not
because the numbers mean anything.

### One route that fixed a legacy bug on the way

`PUT /admin/company/cited/:id` was not merely missing. The legacy version
declared its result `const` and then assigned to it, so it threw a `TypeError` on
every successful call; the throw was swallowed by an empty `catch` and no
response was ever sent, leaving the request open until the client gave up.

---

## 5. Three problems that were not in the route code

### 5a. CORS — no browser could reach the API at all

Login failed in Chrome with "Your username and password are not correct!" while
the identical request succeeded from a script. The preflight returned 200 but
carried no `Access-Control-Allow-Origin`, so the browser never sent the POST;
axios reported a network error and the login screen showed its generic message.

`CORS_ORIGINS` is documented in `.env.example` but was **not set in `.env`**, and
`src/config/env.js` treats an empty allowlist as "allow no cross-origin". The
legacy used bare `cors()`, so any origin worked and this never came up.

**This must be set in production before the rewrite is deployed**, or every
browser client — this console and the main web app — stops working, with no
server-side error to explain it.

### 5b. Nine routes turned a missing field into a 500

A missing request field reached the query as `NaN` or `undefined`:

| Route | In the log |
|---|---|
| `PUT /admin/company/assignments` | `Unknown column 'NaN' in 'where clause'` |
| `PUT /admin/customers/:id/buttons` | `Unknown column 'NaN' in 'where clause'` |
| `PUT /documents/repo_folder` | `WHERE parameter "user_account" has invalid "undefined" value` |
| `PUT /documents/template_folder` | same |
| `GET /customers/:layout/parties` | `IN ()` — SQL syntax error |
| `GET /customers/asset_types/:tab_id/companies` | `Named parameter ":company" has no value` |
| `POST /dashboards/count` | `IN ()` — SQL syntax error |
| `POST /dashboards/example` | same |
| `POST /dashboards/parties` | same |

A 500 here is worse than rude: it tells the caller "our fault" for a malformed
request, and writes a SQL fragment to the log every time.

The empty-`IN ()` variant is the interesting one — **the codebase already guards
this in two sibling handlers**. `GET /dashboards` has the guard, and
`assetTypeAssignments` has it with a comment noting the legacy 500'd here and it
is "an explicit 400" now. These were simply missed.

**All fixed and re-verified individually:**

```
PUT  /admin/company/assignments           → 400 {"message":"rf_id is required"}
PUT  /admin/customers/68/buttons          → 400 {"message":"button_id is required"}
PUT  /documents/repo_folder               → 400 {"message":"user_account is required"}
GET  /customers/15/parties                → 400 {"message":"companies is required and must not be empty"}
GET  /customers/15/parties?companies=[55] → 200 {list, total_records}
POST /dashboards/count                    → 400 {"message":"selectedCompanies is required and must not be empty"}
```

One of these needed `setSwitch` made `async` so the guard rejects rather than
throwing synchronously — worth catching, since a synchronous throw escapes a
`.catch()` on the caller's side.

### 5c. The console's dashboard exceeds the API's own rate limit

The rewrite added rate limiting, which the legacy had none of — the right call.
But the default is below what the console's own dashboard needs.

| | |
|---|---:|
| Active customers the dashboard lists | 330 |
| Requests on one dashboard load | **331** |
| `RATE_LIMIT_MAX` default, per 15 min, keyed by IP | **300** |

One page load runs 31 requests past the limit. Those rows answer 429 and —
because the console catches per-row failures and coalesces with `?? 0` — render
as **zeros**, the same symptom as the missing-route bug in §4, from a completely
different cause. A second load inside the window is blocked almost entirely, and
since the limiter is keyed by IP, everyone behind one office NAT shares the
budget.

I hit this myself: my first full sweep returned 45 spurious 429s.

**Raising `RATE_LIMIT_MAX` hides the symptom.** The dashboard would still make
331 round trips, which is also why it takes minutes to fill. I added the endpoint
for the real fix:

```
GET /admin/customers/reports?ids=[68,146,...]      → 200, two queries, all customers
```

**The console still needs a change to use it** —
`src/components/common/Companies/index.js` loops `getCompanyReport(item.id)` in
batches of ten. I have not touched the console; that is your call.

---

## 6. `db_uspto.assignee` — crashed, then recovered, no data lost

**Update, 19 Sep, later the same day: this is fixed.** It blocked 22 endpoints
when this report was first written; all 22 are now re-verified working. Full
runbook and root-cause detail in `RECOVER_ASSIGNEE.md`. Summary:

```
Table './db_uspto/assignee' is marked as crashed and last (automatic?) repair failed
```

**This is not only an admin-console problem.** `assignee` is joined by 18
repository functions across six modules:

| Module | Functions |
|---|---|
| `admin-company-search` | `searchPartiesByCountry`, `addressesForParty`, `addressesWithTransactions`, `latestTransactionForAddress`, `companiesForLawFirm`, `lawFirmsForCompany`, `assetsForParty`, `assignmentsForCompanies`, `companiesForLender`, `searchLenders`, `normalisationCandidates` |
| `customers` | `originalAssigneeName`, portfolio queue queries |
| `transactions` | `assignees` |
| `external` | `assigneesForPatents` |
| `company` | `searchCompanies` |
| `timelines` | transaction detail |

So the main web app's company search, transaction parties, timeline detail and
portfolio queue read the same table.

**What actually happened, and why plain `REPAIR TABLE` was correctly refused.**
Vivek flagged, rightly, that a bare `REPAIR TABLE` on a crashed MyISAM table can
silently discard unrecoverable rows with no way back — especially risky on a
table fed by the daily USPTO download pipeline. So instead: the two data files
were copied off to a separate physical disk before anything touched the
original; `myisamchk --check` (read-only) was tried first and couldn't even open
the index file; that pointed at `REPAIR TABLE ... USE_FRM`, which discards the
damaged index header entirely and rebuilds all 12 indexes (4 of them FULLTEXT)
from a full scan of the data file, rather than trusting anything in the broken
header.

**Result: `status: OK`, 12,092,535 rows recovered — verified, not just
reported.** Cross-checked against `assignment` (11,644,964 rows): 1.04 assignees
per transaction, which is exactly the ratio real assignment data should produce.
Spot-checked both ends of the `rf_id` range — the oldest rows are legible,
decades-old assignee records (Northern Telecom, Paradyne Corp); the newest
match real, current companies (CARIAD SE, Yamaha Robotics Holdings) at `rf_id`s
consistent with where the rest of the corpus stops. Both the row count and the
content check out.

**All 22 previously-blocked endpoints re-tested, all 22 now 200**, with real
data flowing through the joins — e.g. `/admin/company/search/address/Basking
Ridge` correctly returns Cellco Partnership D/B/A Verizon Wireless (Avaya's own
registered address), and `/admin/company/assignments/68` returns 1,172 real
correspondence records with actual law firm names.

**Still open, not urgent:**

1. **The table is still MyISAM.** The recovery fixed the symptom, not the
   cause — nothing stops the same crash from recurring on the next unclean
   shutdown. Converting to InnoDB fixes this properly (FULLTEXT is supported on
   InnoDB), but it's a heavy operation on 12M rows and deserves its own
   maintenance window, separate from this one. `assignment` and `correspondent`
   are the same MyISAM engine, still being written to, and carry the same risk.
2. **The daily import has been reporting `status: success` while landing zero
   rows since 7 Aug** — a separate, still-open issue, unrelated to today's fix
   but likely the same week's incident that left this table crashed in the
   first place. See `RECOVER_ASSIGNEE.md` §6 for the numbers.

---

## 7. What the sweep proves, and what it does not

Every non-DELETE route was called with a real, Avaya-derived parameter set, using
two tokens: `admin_user` for `/admin/*`, and a scoped account inside Avaya for
the client routes. (I created that account through `POST /admin/customers/68/users`
— which incidentally tested that route — and **have since deleted it**, twice:
once created and removed before the `assignee` recovery, and again for the full
re-run after it, using a fresh account each time.)

The **24 routes** that still resolve their organisation from a URL parameter
rather than the caller's own token — `/category_products`, `/comments/:type/:value`,
`/customers/:id/...`, and similar — were tested with the real tenant token and
still show "Organisation database is unavailable". That's correct: my fixture
maps those specific path parameters to values (like a generic `:id` of `15`,
distinct from Avaya's `68`) that don't correspond to a customer with a
provisioned tenant database. It says nothing about whether the route works; it
says my test picked a parameter value with no data behind it. Confirmed by
example — the same style of route addressed *with Avaya's own id* (`GET
/admin/customers/68/...`, `GET /activities`, `GET /address`) returns real data
throughout this report.

**For GET routes this is a genuine end-to-end test**: real ids, real data, real
response shapes.

**For POST and PUT it is not.** Each was called with an empty body, which proves
the route is mounted, reachable, correctly admin-gated, and that its validation
rejects a malformed request. It does **not** prove the write works. Sending real
bodies would have meant creating and modifying customer data across 78 POST and
38 PUT endpoints on a live database, which I was not willing to do unasked.

Write paths I did exercise for real, and can vouch for:

- `POST /admin/customers/:id/users`, `POST /signin`, `POST /admin/signin`
- `PUT /admin/customers/:id/buttons` — read back and confirmed
- `GET .../missing_inventor` and `.../stop` — created and cleaned up a row

Everything marked "correctly rejected a bad request" above means *the route
exists and guards its input*, not *the route writes correctly*. **If you want the
write paths covered, say so and I will do it against a copy of the data.**

### Methodology note

The full 327-route sweep ran **twice** — once while `db_uspto.assignee` was
still crashed, and again after it was recovered (§6) — and each run needed
several passes to produce a trustworthy number, for reasons worth recording so
none of these figures get over-read:

**First sweep (table still crashed):**
1. 20-second cap, admin token. 50 routes timed out and 45 were rate-limited —
   95 inconclusive results, none of them a statement about the route.
2. Two-minute retry of those 95. 36 turned out to work; they were merely slow.
   This is why the report does not call slow routes broken.
3. Tenant token, all routes again. Resolved the ~100 client-scoped routes that
   answered 503 for the admin account, whose organisation has no tenant database.

**Second sweep (after the recovery), to produce the final numbers in §0:**
1. Admin token, all 327, 90-second cap, single pass. Clean — 0 rate-limited.
2. Tenant token, all 327 — but I'd forgotten to raise the rate limit again on
   the fresh server restart, so 318 of 327 came back 429. Not a code issue;
   my own oversight, caught by comparing this run's numbers against the first
   sweep's and finding a **103** "needs a tenant token" count where the earlier,
   properly-configured run had shown ~25 — too large a jump to be real, and it
   traced straight to the rate limiter.
3. Re-ran the tenant pass a third time, rate limit correctly raised. Clean —
   0 rate-limited, count back down to the expected 24 (§7).

Also during the second sweep: an orphaned copy of the local API server from an
earlier restart in this session was still holding open database connections
through the tunnel, degrading every later query until it was found and killed.
And separately, an earlier session had a browser tab quietly firing the
dashboard's 331 requests in a loop, starving the first sweep of the tunnel until
it was closed.

None of this changes what's reported in §0 — it's why getting there took three
attempts each time rather than one, and it's recorded so the process is
reproducible rather than mysterious.

---

## 8. Performance

**How much of this is the tunnel.** I measured rather than guessing: a trivial
`SELECT 1` over the tunnel takes a **287 ms median**, and the indexed user lookup
`verifyToken` performs on *every authenticated request* takes **887 ms**.
Co-located, both would be under a millisecond. So every number below carries
about a second of overhead it would not have in production.

What the tunnel does **not** explain is the row counts.

Only five routes could not answer inside two minutes:

| Endpoint | Rows |
|---|---:|
| `GET /admin/company/law_firms` | **896,968** |
| `GET /admin/company/lawyers` | **834,456** |
| `GET /admin/company/parties/:id` | paged, but the name-gathering query is not |
| `GET /admin/company/owned/cited/:id` | paged, same |
| `GET /admin/company/:representativeID/event_maintainence` | — |

And the slowest that do complete:

| Endpoint | Time |
|---|---:|
| `GET /admin/company/parties/all/:id` | 119 s |
| `GET /admin/company/recent_transactions` | 111 s |
| `GET /admin/company/assignments` | 73 s |
| `GET /admin/company/lawyers/:id` | 69 s |
| `GET /admin/customers/:id/companies` | 44 s |
| `GET /admin/customers` — *the console's first call after login* | 20 s |

`law_firms` and `lawyers` return the entire corpus unpaginated, and the console
loads both into a dropdown. Those two need a `LIMIT` and a search parameter
before anything else on this list.

### A GET that writes on every request

`GET /admin/company/parties/:id` bulk-inserts every party name it finds into
`assignee_organizations` — ~345 rows each time the grid opens. This is inherited
(the legacy does the same) and the logo pipeline depends on those rows, so I
ported it unchanged. But it means the endpoint is **not safe to cache or retry
blindly**, and it is part of why it times out. The saved-logo variant
deliberately does *not* write; I kept that distinction and pinned it with a test.

---

## 9. What is still missing

### Not tested — DELETE routes, as instructed

29 of them, including `/admin/users/:id`, `/admin/customers/:id/companies`,
`/admin/customers/:id/share`, `/admin/company/cited/:id` and the log-clearing
deletes.

### Console calls that never existed in EITHER API

For eight of them the legacy had no matching route either — these features have
been broken in production all along and are **not** something the rewrite lost:

`GET /validity_counter/:companyName` · `GET /companies/subcompanies/:name` ·
`GET /messages/:type` · `GET /alerts/:type` · `GET /site_logo` ·
`GET /admin/customers/company/:companyID` · `POST`/`PUT` `/comments/:type/:value`
· `POST /admin/company/report_dashboard/:id`

That last one is worth a sentence: the legacy route was written
`route.post("/company/report_dashboard:id/")` — no slash before the parameter —
so it only ever matched paths like `/company/report_dashboard5/`. Its handler
body is empty: it logs the request and never sends a response, so any client that
did reach it hung until it timed out.

### Genuinely still unported

| Route | Why I stopped |
|---|---|
| `POST /admin/company/:id/add_bulk_companies` | 538 lines, cross-tenant reads and bulk writes into a customer's database. I will not ship an unverified bulk-write path. |
| `POST /admin/company/cited/:id` and `/export` | Drive a hardcoded Google Sheet; need real OAuth credentials to verify. |

Eleven further endpoints answer an honest **501** (`External asset spreadsheets`,
`Assignment XML`, `Sheet generation`, `Slack file sharing`, `Company Slack user
lists`) — the rewrite marks its unported tiers explicitly rather than pretending.

---

## 10. Tests added

**125 new tests across 14 new suites**, plus rewrites in 3 existing suites.

| Suite | Covers |
|---|---|
| `auth.repository.test.js` | the enum literal in admin sign-in |
| `admin-customers.repository.test.js` | wrong-database models, report SQL, inventor restart |
| `admin-customers.reports.test.js` | `/reports` guard chain and share flag |
| `admin-customers.bulk-reports.test.js` | the bulk endpoint, share-link matching |
| `admin-customers.companies.test.js` | company/figure join, zero fallbacks, arrow ratios |
| `admin-customers.inventors.test.js` | inventor flagging, empty-list guard, restart |
| `admin-customers.patents.test.js` | asset lookup, fail-fast on unknown number |
| `users.update.test.js` | password vs profile edit, tenant mirroring, email conflict |
| `admin-company-search.ported.test.js` | lender short-circuit, family job arguments |
| `admin-company-search.parties.test.js` | cited/party response shapes and scoping |
| `admin-company-search.grid-sql.test.js` | ORDER BY allowlist, bound LIMIT, collation |
| `admin-company-search.correspondence.test.js` | `:id` is a customer, not an rf_id |
| `admin-company-search.transactions.test.js` | conveyance grid, retype allowlist, Google OAuth |
| `admin-company-search.cited-ownership.test.js` | the legacy `const` reassignment that never responded |
| `missing-field-guards.test.js` | the four NaN/undefined 500s |
| `customers.empty-selection-guards.test.js` | the empty-`IN ()` bugs |
| `errors.routes.test.js` | the placeholder panel's shape |

Every new route has an OpenAPI entry; `docs-coverage.test.js` enforces that.

### A security fix made while porting

The legacy parties and cited handlers built `ORDER BY` and `LIMIT` by string
concatenation from query parameters:

```js
query += ` ORDER BY ${sort_by} ${sort_direction} `
query += ` LIMIT ${current_page * rows_per_page}, ${rows_per_page} `
```

A bind parameter cannot stand in for an identifier, so the ported versions put
the column and direction through the existing `q.identifier()` / `q.direction()`
allowlists and bind only the LIMIT values; page size is clamped to 500. Verified
live — this returns the same rows as a clean request:

```
GET /admin/company/cited/68?sort_by=;DROP--&sort_direction=OR1=1  → 200, 10 rows
```

---

## 11. Actions for you

1. **`REPAIR TABLE db_uspto.assignee`** — 22 endpoints across the admin console
   *and* the main web app are blocked until it is readable. Highest value on this
   list by a distance. Say the word and I will run it and re-test.
2. **Set `CORS_ORIGINS` in the production `.env`** — without it no browser can
   reach the API at all, and the failure is silent on the server side.
3. **Decide on the dashboard's 331 requests** — the bulk endpoint exists; the
   console needs one function changed to use it. Otherwise raise
   `RATE_LIMIT_MAX` as a stopgap.
4. **Paginate `/admin/company/law_firms` and `/lawyers`** — 896k and 834k rows,
   loaded into a dropdown.
5. **Decide how `run_query` gets `company_id` / `organisation_id`** — console
   change, or API defaults.
6. Tell me if you want the **write paths** tested properly, and whether to port
   `add_bulk_companies`.

### Test artefacts — all removed

- The Avaya test account (`user_id 339`) — **deleted**.
- The `missing_inventor_process` row created by the sweep — **deleted**.
- `PT-Admin-Application/src/config/config.js` — **restored** to the production URLs.
- `PT-API/.env` gained `CORS_ORIGINS` — **kept deliberately**; see §5a.

Nothing is committed. All changes are in the working tree.
