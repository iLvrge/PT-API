# PT-API — Engineering Audit

**Repo:** `/Users/mac/Documents/GitHub/PT-API` · **Branch:** `master` @ `b67533c`
**Date:** 29 August 2026
**Method:** full static read + local execution checks (`node --check`, module loading, Sequelize model validation, Sequelize source inspection)

| Metric | Value |
|---|---|
| Endpoints | 388 |
| Lines of application code | 48,887 |
| Route files | 42 |
| Models | 96 |
| Databases | 7 |
| Commits | 2,580 |
| Tests | 0 |

---

## Verdict

The **design** is sound. Database-per-tenant with a shared `db_business` control plane fits the domain; the five-way model split is coherent; 355 of 384 handlers carry auth middleware; 694 parameterized queries against 115 raw interpolations. That ratio doesn't happen by accident.

What's missing is an **enforcement layer**. No tests, no linter, no CI, no schema migrations, no input validation. Every rule the architecture depends on is held in place by convention, and across 2,580 commits conventions drift. Most findings below are rules that were assumed and never enforced.

Three findings are exploitable today by anyone who can reach the API. A fourth is not a security hole but is worse operationally: the tenant database layer works by accident, and a single reordered `require` would silently return empty results across the admin application.

None of this requires a rewrite. The critical set is roughly two days of work. The performance ceiling is one config block.

**Severity tally:** 4 critical · 8 high · 7 medium · 8 things working well

---

## What is genuinely good

Worth stating plainly, because the fix list is long and none of it means this is bad work.

- **Auth coverage is high and consistent.** 355 of 384 route handlers carry `authJWT.verifyToken`. The 29 that don't are the ones that legitimately shouldn't: login, password reset, share links, OAuth callbacks.
- **Parameterized queries are the norm.** 694 uses of Sequelize `:replacements` against 115 raw interpolations, and nearly all interpolations are structural fragments (`AND mode IN (:mode)`) rather than values. For 377 hand-written queries, that is a strong result.
- **Graceful shutdown is properly built.** `app.js:340–380` closes the HTTP server, flushes Sentry with a 2s budget, guards against double-shutdown with `isShuttingDown`, and backstops with an `unref()`'d timer. Better than most production Node services.
- **Password hashing uses bcrypt.** Not MD5, not unsalted SHA1. The cost factor is low and the defaults are dangerous (F3), but the primitive is correct.
- **The request logger was written with care.** Circular-safe stringify, byte caps, multipart skipped, writes deferred via `setImmediate` so logging never blocks the response, and the whole thing behind an env flag.
- **Sentry profiling degrades instead of crashing.** `instrument.js:12–19` lazy-requires the native profiling module inside a try/catch so an unsupported Node version disables profiling rather than killing boot.
- **The domain model is coherent.** 96 models cleanly separated across `application` / `business` / `client` / `resources` / `maintainence`. The boundaries mean something and are respected — this would survive a rewrite unchanged.
- **Tenant connections are cached with TTL eviction.** Opening a Sequelize instance per organisation per request would be fatal. `dbConnectionCache` caches by org and evicts after 5 minutes idle. Right idea — see F4 for why it doesn't work as intended.

---

## Critical

### F1 — Anyone can mint a session token for any user

**`routes/business/login.js:324`** · `GET /refresh-token` · no auth middleware

```js
const base64Payload = token.split('.')[1];
const payload = base64Url.decode(base64Payload);   // decode, NOT verify
const decodedPayload = JSON.parse(payload);

const user = await User.findOne({ where: { user_id: decodedPayload.id, status: 0 }});
// ...then signs a brand new valid 24h token for that user
```

The signature is never verified. An attacker sends `base64({"id":1})` with any garbage signature as `x-auth-token` and receives a genuine token for user 1. No password, no existing session, no rate limit. Every account in every tenant is reachable.

**Fix:** Replace the manual decode with `jwt.verify(token, config.config.secret)` and take `id` from the verified payload. ~4 lines. Then rotate `SECRET` to invalidate outstanding tokens.

---

### F2 — The JWT signing secret has a fallback committed to git

**`config/db.config.js:52`** · `helpers/verifyJwtToken.js:5` · absent from `.env.example`

```js
'secret': process.env.SECRET || 'p@nt3nt8@60',
```

Two problems compound. The literal is in the repository, so anyone with read access can forge tokens if the env var is unset. And `SECRET` does not appear in `.env.example` at all — so any new deployment, container rebuild, or fresh `.env` silently falls back to the published value rather than failing loudly.

**Verify on the server:** `grep -c '^SECRET=' .env` in the deployed directory. If that returns `0`, every token in production is forgeable by anyone holding the repo, and F1 isn't even necessary to exploit it.

**Fix:** Delete the fallback. Fail fast at boot: `if (!process.env.SECRET) throw new Error('SECRET is required')`. Add it to `.env.example`. Rotate the value. Same pattern applies to the Pusher credentials a few lines below.

---

### F3 — Accounts are created with the user's surname as their password

**`admin_customers.js:1259`** · **`admin_customers.js:480`** · **`client/users.js:119`**

```js
// admin_customers.js:1259 — password becomes the last name
password: bcrypt.hashSync(req.body.password ? req.body.password : req.body.last_name, 8)

// admin_customers.js:480 — password becomes "123456"
password: bcrypt.hashSync(req.body.password ? req.body.password : 123456, 8)

// client/users.js:119 — unconditionally the last name
password: bcrypt.hashSync(req.body.last_name, 8)
```

The surname is in the same request body, is displayed in the users table, and is usually inferable from the email address. Combined with no rate limiting (F12), any account created through the admin UI without an explicit password is trivially accessible.

**Fix:** Never derive a password from user data. Generate `crypto.randomBytes(32).toString('base64url')`, store it, and force a reset-link flow on first login. Raise the bcrypt cost from 8 to 12.

> **Status:** closed for `POST /customers/:id/users` during this session — see [Session fixes](#session-fixes-applied-not-yet-deployed). The other two sites remain.

---

### F4 — The tenant database layer works by accident

**`helpers/dbConnectionCache.js:24`** · **`routes/business/admin_customers.js:52`** · **`routes/application/dashboards.js`**

`dbConnectionCache.js` calls `helpers.findOrganisationbyID(orgID)` but never requires `helpers`. In isolation it throws `ReferenceError`, which the surrounding try/catch swallows into `return null`. Confirmed directly:

```
$ node -e "require('./helpers/dbConnectionCache.js').getOrgConnection(1)
           .then(r => console.log('result:', r))"

Failed to connect to org 1: helpers is not defined
result: null
```

It works in production only because `admin_customers.js:52` terminates its `const` chain with a semicolon by mistake, so the assignments that follow become implicit globals:

```js
const express = require("express"),
    /* ...30 more... */
    { uploadFile } = require("../../helpers/uploadHelper");   // ← semicolon ends the const

    Representatives = require("../../model/resources/Representatives"),   // now global
    authJWT        = require("../../helpers/verifyJwtToken"),             // now global
    helpers        = require("../../helpers/helper"),                     // now global
    clientDBConnection = require("../../helpers/clientDBConnection"),     // now global
    config         = require("../../config/db.config"),                   // now global
```

Loading every route file leaks **15 application globals**: `Representatives, authJWT, userExist, helpers, clientDBConnection, ClientUsers, ProfessionalUsers, Firms, config, ClientRepesentative, RepresentativeTransactions, AWS, Assignments` and more. Fifteen files exhibit this pattern.

Five route files consume `helpers` without requiring it. **`routes/application/dashboards.js` uses `authJWT.verifyToken` on its route definitions and never requires `authJWT` at all** — it relies entirely on `admin_customers.js` having been loaded first by `app.js`.

**Why this is critical rather than untidy:** reordering the `app.use` block in `app.js`, lazy-loading a route, moving a file, or adding `'use strict'` anywhere in the chain breaks tenant connections silently. Handlers do `if (req.connection_db != null) { ... } else { res.status(200).json([]) }` — so the failure mode is not a 500. It is **empty arrays and HTTP 200**, across the admin application, with nothing in Sentry.

**Fix, in order:**
1. Add `const helpers = require('./helper');` to `dbConnectionCache.js` — one line, removes the dependency on the accident.
2. Add the missing requires to the five files that consume leaked globals.
3. Fix the semicolons, then add ESLint with `no-undef` and `no-implicit-globals` so this class of bug cannot return.

---

## High

### F5 — Tenant scoping is commented out in 54 places

**`dashboards.js`, `events.js`, `customers.js`, `externalapi.js`** — 54 occurrences of `0 /* req.orgId */`

```js
// routes/client/customers.js:130 — GET /timeline
const replacements = { organisation_id: 0 /* req.orgId */, year: 1999, yearAsset: 1997 }
// ...
let { companies, tabs, customers, rf_ids } = req.query
companies = JSON.parse(companies)     // straight into IN (:companies), never checked
```

With the organisation filter pinned to `0`, the only thing separating one tenant's rows from another's is the `companies` array — which arrives in the query string and is never validated against the caller's `req.orgId`.

**Confirm before treating as fact:** it is possible `organisation_id = 0` is a deliberate shared-corpus partition. Log in as a user of org A and call `/timeline?companies=[<an ID belonging to org B>]`. If rows come back, this is a live cross-tenant data leak and moves to Critical.

**Fix:** Restore `req.orgId`, or better, add middleware that resolves the caller's permitted company IDs once and intersects every inbound `companies` array against it. Ownership checks belong in one place, not 54.

---

### F6 — One failed background write kills the entire API process

**`app.js:383`** · 10 fire-and-forget IIFEs across `admin_customers.js`, `events.js`, `documents.js`, `company.js`, `professionals.js`

```js
process.on('unhandledRejection', (reason) => flushAndExit(reason, 'unhandledRejection'));
// flushAndExit → process.exit(1)
```

Meanwhile, ten request handlers launch un-awaited async work:

```js
// admin_customers.js:1272, inside POST /customers/:id/users
(async () => {
    const dbUser = await req.connection_db.define('Users', ...);
    const addClientUser = await dbUser.create(clientUser);
    const findFirm = await Firm.findOne(...);
    // no try/catch, no .catch(), nobody awaits this
})();
```

If the tenant database is briefly unreachable, or a unique constraint trips, that rejection is unhandled — and the global handler exits the process. A data error in one tenant's optional side-effect becomes an outage for every tenant. Supervisor restarts it, so it presents as intermittent unexplained restarts rather than an obvious crash.

**Fix:**
1. Attach `.catch()` to all ten IIFEs — background work should log and move on.
2. Change the `unhandledRejection` handler to capture to Sentry and keep serving. Exiting on unhandled rejection is defensible for a worker; for a shared multi-tenant API it converts every data error into a denial of service.

> **Status:** closed for the create-user IIFE during this session. Nine remain, and the global handler is unchanged.

---

### F7 — SQL injection via ORDER BY

**`routes/client/customers.js:1511, 1558, 1560, 1668, 1670, 2106, 2108`**

```js
let { column, direction } = req.query;
if (typeof column === 'undefined') column = 'asset';
if (typeof direction === 'undefined') direction = 'DESC';

query += ` WHERE organisation.organisation_id = :organisationID
           ORDER BY asset_type ASC, ${column} ${direction} `;
```

Both values are concatenated raw. The only guard is a default when they're absent — any supplied value passes through. MySQL permits subqueries in `ORDER BY`, making this a working boolean-blind extraction primitive against every database the connection can reach. Authentication is required, but any valid user of any tenant qualifies.

**Fix:** Allowlist. `const COLS = new Set(['asset','asset_type','grant_date','payment_due'])`, then `column = COLS.has(column) ? column : 'asset'` and `direction = direction === 'ASC' ? 'ASC' : 'DESC'`. Sort keys can never be bound parameters, so an allowlist is the only correct answer.

---

### F8 — The logo endpoint is an SSRF and a stored-XSS vector

**`admin_customers.js:1547`** `PUT /customers/:id/logo` · `downloadImageFromUrl` at `:1460`

**Server-side request forgery.** `req.body.url_customer_logo` is fetched by the server with no scheme check, host allowlist, redirect limit, or size cap. `http://169.254.169.254/latest/meta-data/` and any internal service are reachable, and the response is written to disk and served back publicly.

**The file-type check does nothing.**

```js
if (mimeType.toLowerCase().indexOf('.exe') < 0) { /* upload */ }
```

A MIME type will never contain `.exe`, so this always passes. The route explicitly accepts `image/svg+xml`, and SVG carries `<script>`. Uploads land on `localstaticfiles.patentrack.com` with `ACL: 'public-read'` and `ContentDisposition: 'inline'` — a stored XSS on a domain your users trust.

**Requests can hang forever.** In `downloadImageFromUrl` the `request.head` error argument is ignored, and if `imageData` is falsy no response is ever sent.

**Fix:** Validate the URL is `https:` and resolves to a public IP before fetching; cap response size and timeout. Replace the `.exe` check with magic-byte sniffing against an allowlist of `png/jpeg/gif/webp` and drop SVG entirely — or serve it with `Content-Disposition: attachment` and a strict CSP. Add `res.status(502)` on every error path.

---

### F9 — Database and AWS credentials are passed on the shell command line

**`helpers/runPhpScript.js:31–37`** · **`admin_customers.js:759`**

```js
const envVars = Object.entries(allEnv).map(([k, v]) => `${k}=${v}`).join(' ');
const command = `screen -md bash -c '${envVars} php -f ${scriptPath} ${quotedArgs}'`;
console.log("Running:", command);   // ← secrets into stdout and log files
```

`allEnv` includes `DB_PASSWORD`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_KEY`. On the command line they're visible to any local user via `ps aux`, and the `console.log` writes them into whatever captures stdout. Arguments are wrapped in double quotes inside single quotes, so a quote character in any argument escapes the construction.

Separately, `admin_customers.js:759` interpolates a URL parameter straight into `exec`:

```js
exec(`node /var/www/html/script/normalize_names.js ${req.orgId} ${req.params.representativeID} ${type} ${suggestions} ${fixed_identicals}`);
```

The route is admin-only, which limits blast radius — but it's still remote code execution behind a single credential.

**Fix:** Use `execFile`/`spawn` with an argument array — never a shell string. Pass secrets through the child process `env` option, which never touches the command line. Delete the `console.log` of the command.

---

### F10 — Slack bot tokens travel in URL paths

**`routes/client/slacks.js`** — 11 routes, e.g. `GET /slacks/conversations/history/:token/:channelID`

URLs are written to nginx access logs, stored in browser history, forwarded in `Referer` headers to any third-party asset, and captured by any proxy in between. A leaked bot token is standing access to the customer's workspace.

**Fix:** Move the token to an `Authorization` header or the request body. Better: stop accepting it from the client at all — look it up server-side from the caller's organisation record.

---

### F11 — TLS certificate verification is disabled for outbound calls

**`helpers/epo.js:11–15`**

```js
const axiosInstance = axios.create({
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
});
```

Every EPO API call — including the OAuth exchange carrying `EPO_KEY` and `EPO_SECRET` — accepts any certificate.

**Fix:** Remove the agent override. If EPO's chain genuinely fails to validate, pin their intermediate CA via the `ca` option instead of disabling verification wholesale.

---

### F12 — No rate limiting anywhere, and the email login code is 24 bits

**`package.json`** (no `express-rate-limit`, no `helmet`) · **`login.js:98`**

```js
const code = crypto.randomBytes(3).toString('hex');   // 16,777,216 possibilities
```

`GET /verify/:code/:email` accepts that code with no attempt counter and no lockout. The same absence applies to `POST /signin` (credential stuffing) and `POST /forgot_password` (email bombing). Also missing: `helmet` for security headers, and `cors()` is mounted bare, emitting `Access-Control-Allow-Origin: *` on every authenticated endpoint.

**Fix:** Add `express-rate-limit` — strict on the six auth routes, generous globally. Widen the code to `randomBytes(16)`, cap at five attempts, and expire it on use (it is currently *extended* by an hour when consumed, at `login.js:160`). Add `helmet()`. Replace bare `cors()` with an explicit origin allowlist.

---

## Correctness & API design

| # | Finding | Detail |
|---|---|---|
| **F13** | HTTP 402 used 257 times for validation | Histogram across all routes: `200`×569, `500`×304, `402`×257, `400`×78, `401`×5. Clients cannot distinguish "you forgot a field" from "that organisation doesn't exist" from "you're not allowed" — all three return `402 Bad inputs`. |
| **F14** | Sentry captures every response ≥ 400 | The `res.send` interceptor at `app.js:58` tests `res.statusCode >= 400`. Every failed login, validation rejection and 404 becomes a captured exception. Narrow to `>= 500`. |
| **F15** | Cross-database writes have no transaction | `POST /customers/:id/users` writes to `db_business`, then the tenant DB, then Firm, then Professional — four writes, no transaction, three inside the F6 IIFE. A distributed transaction isn't available across separate MySQL servers, so the correct shape is: write locally, enqueue the tenant-side work with retry, reconcile. |
| **F16** | Socket.io keeps only the most recent connection | `io.on("connection", socket => { this.socket = socket })` overwrites on every connect, so `emit()` reaches whichever client connected last — and throws when nobody is connected, which per F6 exits the process. No handshake auth, no room-per-tenant. Use `io.to(room).emit()`. |
| **F17** | Model validation is doing the work of input validation | Sequelize's `allowNull: false` is the only thing rejecting a missing `last_name`, surfacing as a generic 402. Validation belongs at the edge: a schema per endpoint (`zod`/`joi`) returning `400` with the offending field named. |
| **F18** | Four routes defined twice in the same file | `PUT /company/law_firms`, `POST /events/assets`, `GET /assets/:patentNumber/:type/outsource`, `POST /assets/assets_for_sale`. Express matches the first registration, so the second is unreachable — and a maintainer has a 50% chance of editing the dead one. |
| **F19** | Unguarded `JSON.parse` on user input, 25 sites | e.g. `JSON.parse(req.params.representativeID)` throws `SyntaxError` on any malformed value. Most sit inside a try/catch that converts it into a misleading `402 No customers found`. |

---

## Session fixes (applied, not yet deployed)

These were found and fixed while diagnosing two live bugs. All are in the working tree, uncommitted.

### S1 — `POST /customers/:id/users` returned `402 Bad inputs` for a missing `last_name`

Verified by replaying the exact payload against the model with no database:

```
VALIDATION FAILED -> SequelizeValidationError
   * notNull Violation | last_name | user.last_name cannot be null
```

`model/business/Users.js:22` declares `last_name` as `allowNull: false`. The frontend's `onRowAdd` only appends keys the operator actually typed, so a blank field is absent rather than empty. Sequelize rejected before any SQL ran and the route's `.catch` replaced the real message with `402 Bad inputs`.

**Changed:** `last_name` defaults to `''`; required fields (`first_name`, `email_address`, `password`) are checked up front returning `400` with field names; the catch now surfaces Sequelize validation and unique-constraint errors as `400` with the offending field; the other three `402` exits became `404` / `400` / `500`. The surname-as-password fallback (F3) was removed from this route.

### S2 — The organisation-side insert failed silently

`db_business.user`, the organisation's own `user`, **and** `professional` all declare `last_name` as `allowNull: false`. Defaulting it in only one place would let the business row save and then throw inside the un-awaited IIFE — which F6 turns into `process.exit(1)` **after** the `200` has already been sent.

**Changed:** one normalized `details` object now feeds all three inserts; a `.catch()` on the IIFE reports to Sentry instead of exiting; the "no tenant connection" path logs loudly and raises a Sentry warning naming the user and org instead of passing silently. Added the missing `const Sentry = require("@sentry/node")` — it was not imported.

Verified against all three models:

```
PASS  db_business.user
PASS  organisation user
PASS  organisation prof.
```

### S3 — `DELETE /admin/users/:orgId/:user_id` deleted from the wrong database

**New finding, not in the original sweep.** The handler created a transaction on `connection.business` and passed it to a model belonging to the *tenant* connection:

```js
const t = await connection.business.transaction();
await userDetail.destroy({ transaction: t });   // tenant model, business transaction
await user.destroy({ transaction: t });
```

Sequelize routes a query onto `options.transaction.connection` with no check that the transaction belongs to the same instance:

```js
// sequelize/lib/sequelize.js:648
return options.transaction
  ? options.transaction.connection
  : this.connectionManager.getConnection(options);
```

Both models use `tableName: 'user'`. So the tenant delete ran `DELETE FROM user` against **db_business** — the tenant row was never removed and the business row was deleted twice. The handler then reported success.

The handler also refused to delete any user without a tenant-side row (`404 "User not found in client database."`). Because that row is created in the F6 IIFE, users created while it silently failed became permanently undeletable. Confirmed against live data for org 118: `db_business` held users 37, 335, 338 while the organisation database held only 335, 338 — user 37 was unremovable.

**Changed:** two transactions, one per database, business first (that's the row granting access); a missing tenant row is logged and no longer blocks the delete; a failed tenant delete reports the leftover instead of failing the whole request; "user doesn't exist" changed from `500` to `404`.

### S4 — Frontend (PT-Admin-Application), for completeness

Not part of this repo, but the same investigation. Delete had never worked because the deployed bundle predated `3716208` (23 Nov 2025), which changed the row mapping from `id: user.user_id` to `id: user.id ?? user.user_id`. The API aliases the column on the way out (`attributes: [['user_id','id'], ...]`), so the old mapping produced `id: undefined`, `if (oldData.id > 0)` was false, and the promise was left unsettled — spinner forever, **no HTTP request at all**.

Three separate causes stacked:
1. Old row mapping (fixed Nov 2025, never deployed).
2. Unsettled promise in `onRowDelete` (fixed in `a9e8cf4`, never deployed).
3. `package.json` build script passed `--openssl-legacy-provider` to `react-scripts` instead of via `NODE_OPTIONS`, so `yarn build` failed on the server with `ERR_OSSL_EVP_UNSUPPORTED` — which is *why* nothing was ever deployed. That fix is still uncommitted.

Final state: the server was serving the correct new bundle; the browser was holding a cached `index.html` (CRA content-hashes the JS but not the HTML). Delete now returns `200 OK`.

---

## Performance

Ordered by expected win per hour of work.

### P1 — No connection pool configured: five connections per database

**`config/db.config.js`** — all 7 Sequelize instances

Every instance is constructed with only `host` and `dialect`. Sequelize 5 then applies its default pool: `max: 5`. Five concurrent queries per database, full stop. Request six waits — not for MySQL, but for a slot.

The giveaway: the file tracked in git as `config/db.config.js(server)` *does* carry a pool block reading `MAX/MIN/ACQUIRE/IDLE` from the environment, and those variables are still in `.env.example`. The pool configuration was lost when the live config was rewritten, and the env vars have been ignored ever since.

**Fix:** add `pool: { max: 20, min: 2, acquire: 30000, idle: 10000 }` to every instance, and coerce env values with `Number()` — `max: process.env.MAX` passes the string `"100"` into generic-pool. Also set `logging: false` here. **Typically 3–5× concurrent throughput; ten minutes of work.**

### P2 — 263 of 377 queries log their full SQL

`logging: console.log` appears 263 times; `logging: false` once. Some queries are several kilobytes of generated SQL, stringified and written synchronously to stdout on every request. Where stdout is a pipe to supervisor, the write can block the event loop. `LOG_SILENT` no-ops `console.log`, but Sequelize still builds the string first, and there are 1,272 other `console.log` calls.

**Fix:** set `logging: false` once in `db.config.js` and delete the per-query overrides with a scripted replace. Keep one env-gated escape hatch.

### P3 — A 441 KB wall of SVG is rebuilt on every request

**`routes/application/svg_flag_icon.js`** — 5,771 lines, one route. The handler declares `SvgIconsContent`, a 441 KB object literal of inline SVG, *inside* the function body. Every request allocates the whole structure, then garbage-collects it. It's static content that never varies by user.

**Fix:** move it to module scope (five minutes, most of the win). Then move it out of the API entirely — files on the static host with a far-future `Cache-Control`.

### P4 — No caching layer of any kind

No Redis, no LRU, no HTTP cache headers, no `compression` middleware. Reference data that changes rarely — organisations, layouts, roles, activity types, company lists — is re-queried on every request. `helpers.findOrganisationbyID` alone runs on nearly every admin endpoint.

**Fix:** start with an in-process LRU (60s TTL) around `findOrganisationbyID` and the layout/role lookups. Add `compression()`. Move to Redis when cache coherence across processes matters.

### P5 — Sequential awaits where the queries are independent

`admin_company_search.js:555` issues 51 sequential awaits in one handler; `:2556` has 45, `:1723` has 33; `company.js:943` has 22. At 30 ms per query that's 1.5 s of pure serialisation. `Promise.all` appears 18 times across the codebase, so the pattern is known — just not applied where it matters most.

**Fix:** profile the top five handlers, group independent queries, wrap each group in `Promise.all`. **2–4× latency reduction** is typical. Pairs with P1 — parallel queries need pool slots.

### P6 — Models redefined on every request

140 calls to `req.connection_db.define(...)`. Sequelize caches by name on the instance, so repeats are cheaper than the first, but the argument objects are still assembled per request and `await` on a synchronous call adds a microtask tick.

**Fix:** define tenant models once when the connection is created in `getOrgConnection`, and hang them off `sequelize.models`.

### P7 — Blocking work on the event loop

9 `bcrypt.*Sync` calls and 17 sync `fs` calls in request paths. `bcrypt.compareSync` at cost 8 blocks for ~10–20 ms per login. Raising the cost to a modern 12 (which F3 requires) makes this eight times worse unless the calls go async first.

**Fix:** `await bcrypt.compare()` / `await bcrypt.hash()` — bcrypt uses the libuv threadpool. Replace sync `fs` with `fs.promises`.

### P8 — Body limits set to 100 MB

```js
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', parameterLimit: 100000 }));
```

A handful of concurrent 100 MB bodies exhausts heap. File uploads already have a separate 20 MB cap via `express-fileupload`, so the JSON limit doesn't need to accommodate them.

**Fix:** drop the global limit to `1mb` and raise it per-route where genuinely needed.

---

## System design

### The shape is sound

Database-per-tenant with a shared `db_business` control plane is a legitimate choice for this domain — patent portfolios are large, per-customer, and benefit from physical isolation. The five-way logical split maps to real boundaries. Nothing here needs replacing.

### Four structural weaknesses

1. **Tenant credentials are stored in plaintext.** `organisation.org_pass`, `org_usr`, `org_host`, `org_db` sit unencrypted in the control-plane database. Any SQL injection, backup leak, or read-only DBA account yields every tenant's database credentials at once. Encrypt at rest with a KMS-held key, or store only a secrets-manager reference.

2. **Business logic lives in the route layer.** 42 route files hold 37,479 lines; the largest is 5,771. `helpers/helper.js` is 4,967 lines exporting 147 functions — a bag, not a module. No service layer, so query shapes are re-implemented across handlers (32 near-identical `SELECT assignor_and_assignee_id` variants, 24 of `SELECT documentid.appno_doc_num`). Fixing a query means finding every copy. Extract repositories per aggregate as you touch each area, not in one sweep.

3. **Background work runs as fire-and-forget shell processes.** Long jobs launch via `exec`/`spawn`/`screen` against scripts in `/var/www/html/script/`. No retry, no visibility, no failure signal, no back-pressure, and the API's own health is coupled to them. Any real queue (BullMQ on Redis is least disruptive) gives retries, dead-letter inspection, and concurrency limits.

4. **The schema is a mixed-charset minefield.** The `utf8mb4 → latin1` conversion error fixed in `b67533c` was a symptom. `organisation.name`, `address`, `city`, `state` are still `latin1_swedish_ci` — 30 columns across `db_business` and `db_uspto`. MySQL error 3988 will resurface on any endpoint writing a non-ASCII value. Given no migration tooling exists, the honest sequence is: adopt a migration tool first, then convert charsets column by column with a tested rollback.

### The missing enforcement layer

This is the root cause behind most of the report.

| Gap | Consequence today | Smallest fix that helps |
|---|---|---|
| No linter | 15 accidental globals; F4 shipped and survived | ESLint with `no-undef`, `no-implicit-globals`, `require-atomic-updates` |
| No tests | Every change is validated by hand in production | Supertest against the 20 highest-traffic endpoints |
| No CI | Nothing blocks a broken commit | GitHub Actions: lint + test on pull request |
| No migrations | Schema changes are too risky to attempt at all | `umzug` or `sequelize-cli`, baselined at current schema |
| No health endpoint | Supervisor restarts blind; no load-balancer probe | `GET /healthz` pinging each of the 7 connections |
| No input validation | `402 "Bad inputs"` for every malformed request | `zod` schemas on write endpoints returning 400 + field name |

### Dependencies past end-of-life

| Package | Installed | Status | Action |
|---|---|---|---|
| `sequelize` | 5.22.5 | v5 unmaintained since 2021 | Plan a v6 upgrade — API surface is close |
| `aws-sdk` | 2.1693.0 | v2 end-of-support Sept 2025 (warns on boot) | Move to `@aws-sdk/client-s3`; only `uploadHelper` uses it |
| `request` | 2.88.2 | Deprecated Feb 2020 | Replace with `axios` — already a dependency |
| `request-promise` | 4.2.6 | Deprecated with `request` | Same |
| `mysql2` | 2.3.3 | v3 current; v2 has known advisories | Upgrade alongside Sequelize |
| `xml2js` | 0.4.23 | Prototype pollution — CVE-2023-0842 | Upgrade to ≥ 0.5.0 |
| `jsdom` | 16.7.0 | Nine major versions behind | Upgrade or drop if lightly used |
| `nodemon` | 2.0.4 | Dev tool in `dependencies` | Move to `devDependencies` |

The server runs **Node 25** against Sequelize 5, which predates it by four major Node releases. It works today; it is not a combination anyone tests.

### Repository hygiene

Tracked in git and shouldn't be: `.DS_Store`, `config/db.config.js(server)`, `name_to_domain_api.log`, `previewBuffer.jpg`, `previewBuffer.png`. Also present: an untracked `a.out` binary, a hardcoded developer path at `externalapi.js:598` (`/Users/vivekkapoor/Documents/assignment-pat-49940-821.pdf`), and ~120 lines of commented-out CORS configuration in `app.js`. The `README` still describes how to build a React frontend.

---

## Roadmap

Ordered so each phase makes the next safer. Estimates assume one developer familiar with the codebase.

| When | Do | Why now | Effort |
|---|---|---|---|
| **Day 1** | F1 refresh token · F2 remove secret fallback and rotate · F3 stop deriving passwords from names | Three live authentication bypasses. Nothing else matters until these are closed. | ~4 h |
| **Day 2** | F4 require `helpers` explicitly + four missing requires · P1 configure the pool · P2 turn off query logging | Removes the load-order landmine and lifts the throughput ceiling in one sitting. | ~4 h |
| **Week 1** | F5 confirm and restore tenant scoping · F6 catch the remaining IIFEs and stop exiting on unhandled rejection · F7 allowlist sort columns · F12 rate limiting + helmet | Closes the cross-tenant question; stops data errors becoming outages. | ~3 d |
| **Week 2** | ESLint `no-undef` in CI · `GET /healthz` · F14 narrow Sentry to 500s · F18 delete shadowed routes | The enforcement layer. Everything after is caught automatically rather than by review. | ~3 d |
| **Weeks 3–4** | F8 lock down the upload path · F9 `execFile` with argument arrays · F10/F11 tokens out of URLs, TLS verification back on · F13/F17 correct status codes + edge validation | Remaining exploitable surface, plus the change that makes API errors diagnosable. | ~1 wk |
| **Weeks 5–6** | P3 hoist the SVG blob · P4 LRU + compression · P5 parallelise the five heaviest handlers · P6 define tenant models once · P7 async bcrypt | With pooling fixed these compound. Largest visible latency change. | ~1 wk |
| **Quarter** | Migration tooling, then latin1 conversion · Supertest on top 20 endpoints · aws-sdk v3 and `request` → axios · Sequelize 6 · queue for background jobs | Structural work needing the safety net from weeks 1–2. | ongoing |

---

## Confidence

Findings are ranked by exploitability and blast radius, not by how much code they touch. Every file and line reference was read directly rather than inferred.

**Verified by execution:**
- F4 — ran `node -e` against `dbConnectionCache` and reproduced the `ReferenceError`; enumerated the 15 leaked globals by loading all route files and diffing `Object.getOwnPropertyNames(global)`.
- S1, S2 — replayed the exact browser payload against the Sequelize models; captured the `notNull Violation` before and the three `PASS` results after.
- S3 — read the Sequelize 5 source (`sequelize.js:648`, `model.js:4194`, `query-interface.js`) to confirm transaction-to-connection binding and what `destroy()` resolves to. An earlier hypothesis about `destroy()` returning a falsy value was checked and discarded.
- Every count in this report — endpoints, status codes, `logging: console.log` sites, dependency versions.

**Verified by reading, not by exploiting:** F1, F3, F7, F8, F9. The code paths are unambiguous, but no attack was run against a live system.

**Needs confirmation before being treated as fact:**
- **F5** — whether `organisation_id = 0` is a shared partition or a disabled tenant filter determines whether it is High or Critical.
- **F2** — whether `SECRET` is actually set in the production `.env`.

Both are one command to check.

---

## Deployment state at time of writing

| Item | State |
|---|---|
| Frontend delete + `id` mapping | ✅ Deployed and verified working (`200 OK`) |
| `package.json` build script fix | ⚠️ Uncommitted — the next server build will fail again without it |
| API: S1 `last_name` / 402 | ❌ Fixed locally, not deployed |
| API: S2 silent org-side insert failure | ❌ Fixed locally, not deployed |
| API: S3 cross-instance transaction | ❌ Fixed locally, not deployed — every delete still creates an orphan |
| API: all F-numbered findings | ❌ Unchanged |
| `patentrack-api` (pid 1197143) | ⚠️ Not restarted since before `b67533c` — running older code than master |
