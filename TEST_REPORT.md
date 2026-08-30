# Test and manual-verification report

Branch `rewrite/v2` · 30 Aug 2026 · 576 tests, 53 suites, all passing

This is the list to work through by hand before deploying. Section 1 explains the
intermittent test failures and what turned out to be causing them. **Section 3
is a command injection in the currently deployed application and should be read
first.** Section 4 is the set of endpoints that need a human to look at them,
because a test can only prove the code does what it was told to do.

---

## 1. The intermittent test failures

### What was happening

The suite reported a single failing test roughly one run in three. The failing
test was different every time, and never reproduced on its own:

| Run | Failing test | Got | Expected |
|---|---|---|---|
| 2 | `GET /dashboards` returns the tiles | timeout after 5s | 200 |
| 4 | `lawfirm_address` GET lists all | 400 | 200 |
| 4 | `address` GET groups addresses | 404 | 200 |
| 3 | `GET /timeline` paginates | 403 | 200 |
| 8 | admin `DELETE .../users/:userId` | 403 | 200 |
| 8 | `POST /citation` 400s on bad list | socket hang up | 400 |
| 5 | `POST /signin` 400 on missing fields | not 400 | 400 |

Two things made these impossible to explain as ordinary test bugs:

- **The status codes are ones the route cannot produce.** `/timeline` and
  `/lawfirm_address/:id` have no admin check anywhere in their middleware
  chain, so nothing in them can return 403. A valid sign-in body cannot
  produce 400.
- **The app never saw the request.** Instrumenting the error handler to print a
  stack for every error it converted showed no entry for the failing requests,
  and the application's own request log had no matching line. The responses
  were not coming from this application.

### Root cause

Supertest, when handed an Express *app*, opens a fresh ephemeral server for
**every single request** and closes it immediately afterwards. Across a full run
that is several thousand listen/close cycles.

On a busy machine the operating system recycles those ports quickly, and a
request can connect to a port that has already been handed to a different
short-lived listener — another test file's server, or an unrelated local
process. The test then reads a response that was never meant for it, which is
exactly why the status codes were arbitrary and why the app's log had no record.

The machine this ran on sat at load average 9–22 on 8 cores, with an IDE, a
language server and a Vite dev server running alongside. That is what made the
race frequent enough to notice; it would appear on any loaded CI box too.

### The fix

`tests/helpers/server.js` now starts **one listening server per test file** and
hands that to supertest, instead of letting it churn a port per request:

```js
const app = startTestServer();   // request(app) is unchanged
```

All 21 integration test files were migrated. The same hook closes the server and
the Sequelize pools when the file finishes.

### Verification

Twelve consecutive full-suite runs, **0 failures**, at load average 22 — around
twice the load under which it used to fail roughly every third run.

### One warning that remains

Jest still occasionally prints *"a worker process has failed to exit
gracefully"* (about 2 runs in 5, down from 5 in 7). It is a teardown warning
only: no test fails with it, and the run reports success. Left as is rather than
papered over with `--forceExit`, which would hide real leaks.

---

## 2. Two real defects the investigation turned up

Both were found while chasing the flakiness, and both would have reached
production.

### `trust proxy` was set to `true`

`app.set('trust proxy', true)` tells Express to believe the entire
`X-Forwarded-For` chain. Anyone can prepend an arbitrary address to that header,
which means **IP-based rate limiting could be bypassed completely** — the
sign-in limiter included. `express-rate-limit` flags this itself with
`ERR_ERL_PERMISSIVE_TRUST_PROXY`, which is what first surfaced in the test
output.

Now a hop count, `TRUST_PROXY_HOPS`, defaulting to 1. **Set this to the number
of proxies actually in front of the app in production** — 1 for a single load
balancer, 0 if it is exposed directly. Too high and the bypass returns; too low
and rate limiting keys on the proxy instead of the caller.

### The public share limiter ran during tests

The rate limiter protecting the share endpoints had no test skip, unlike the
other two. Its counter accumulated across a test file, so whether a share test
passed depended on how many requests had run before it. It now lives in
`src/middleware/security.js` with the others and shares their policy.

---

## 3. Command injection in the legacy app — needs attention now

This is independent of the rewrite. **These are live in the currently deployed
application**, and the first one needs no credentials at all.

Five places build a shell command by interpolating request data into a template
string and hand it to `child_process.exec`, which runs it through `/bin/sh`. A
value containing `"` followed by `;` closes the quoted argument and starts a new
command, which then runs as the API process user.

| File | Line | Value from the request | Reachable by |
|---|---|---|---|
| `routes/application/family.js` | 1756 | `link` query parameter | **anyone — the route has no authentication** |
| `routes/application/family.js` | 441 | `asset` | any signed-in user |
| `routes/business/admin_customers.js` | 666 | `type`, `suggestions`, `fixed_identicals` | admins |
| `routes/business/admin_customers.js` | 778 | `representativeID` and the same three | admins |
| `routes/business/admin_company_search.js` | 4322 | `assignee_id` | admins |

The unauthenticated one is the urgent one:

```js
// routes/application/family.js:1756 — `link` comes straight from req.query
exec(`php -f /var/www/html/trash/get_epo_thumbnail.php "${link}"`, ...)
```

### What to do

Short term, on the deployed app: either take `GET /family/single/file/` out of
service, or block it at the proxy. It is a thumbnail helper, so losing it
degrades an image preview rather than breaking a workflow.

In the rewrite these become `execFile` with an argument array, which passes the
arguments to the process directly and never involves a shell — the pattern
already used in `src/utils/php-jobs.js`. That is being applied as each of these
files is ported; `family.js`, `admin_customers.js` and `admin_company_search.js`
are next.

---

## 4. What to verify by hand

Tests prove the code does what it was told. These need judgement.

### Endpoints that were broken before this rewrite

Each of these failed in the legacy app too. Confirm the corrected behaviour is
what the front end actually wants.

| Endpoint | Was | Now |
|---|---|---|
| `GET /dashboards` | `Unknown column 'title'` on every call | sums `total`; `title` and `sub_heading` return null because those columns do not exist |
| `GET /transactions` | SQL syntax error on the reserved word `release` | quoted — but **the `transactions` table does not exist on this server**, so it returns zeros |
| `GET /timeline/filter/search/...` | ReferenceError on an undeclared variable | works |
| `GET /tree` | ReferenceError whenever a party had transactions | works |
| `GET /address` | (my porting bug) filtered on a column of the wrong table | LEFT JOIN from `representative` |

**`GET /transactions` needs a decision.** Its table is missing from
`db_application`. Was it dropped, renamed, or was the endpoint abandoned? Right
now it answers 200 with zeros, which is what the legacy catch block did.

### Behaviour that changed deliberately

Sign off on each, or tell me to revert it.

| Change | Why | Risk if wrong |
|---|---|---|
| `GET /connection/:reelFrame` now needs a token | its `verifyToken` was commented out | breaks any anonymous illustration view |
| `GET /ptab/document/:identifier` now needs a token | the API was an open proxy to the USPTO document store | breaks anonymous document links |
| `GET /assets/:patentNumber/:type/outsource` now needs a token | its middleware array was left empty, so it had no authentication at all | breaks any anonymous Assignment Center link |
| `GET /assets/download/:itemID` returns the PDF location | the legacy route downloaded the PDF onto the API server and split it with a shell command | client must follow the link itself |
| `/timeline/standalone/*` now needs a token, scoped to the caller | ran under a middleware that did no authentication and hardcoded organisation 11, so anyone could read that org's timeline | breaks a public embed, if one exists |
| `GET /dashboards` requires a company | unfiltered it aggregates ~8M rows and never returns | a client calling it with `[]` now gets 400 instead of hanging |
| Share codes come from `crypto.randomBytes` | the old generator seeded cuid2 with `Math.random`, making a neighbour's link guessable | none; existing links keep working |
| TLS verification enabled on outbound calls | both API clients passed `strictSSL: false` | fails if an upstream has a bad certificate |

### Routes deliberately not ported

- `GET /dashboards/check` — fired a request for three hardcoded patent numbers and never sent a response, leaking a socket per call.
- `GET /generate_thumbnail` — ignored its own `file` parameter, read a hardcoded PDF from a developer's laptop, wrote a JPEG into the working directory.
- `GET /search/:search_string/:type` — ran three expensive queries and then returned an empty list unconditionally.

### Endpoints deliberately not ported (assets)

- `POST /assets/search` — duplicates `GET /search`, which already covers company, counterparty, transaction and asset search.
- The second `POST /assets/assets_for_sale` declaration — the legacy file registers that path twice; the second handler is unreachable.

### Endpoints answering 501

Ten document endpoints (XML export, spreadsheet generation) are declared in
Swagger under **Documents (pending)** and answer 501. They need the reporting
tier, which is not ported yet. `POST /users/invite` and `GET
/companies/{id}/users` likewise await the messaging tier.

---

## 5. How to test manually

```bash
npm run start:v2          # http://localhost:3600
```

Open **http://localhost:3600/docs**. Call `POST /signin`, copy `accessToken`
into the **Authorize** dialog, and every other endpoint is callable from the UI.

All 195 mounted routes are documented.
`tests/integration/docs-coverage.test.js` walks the live Express router and
fails if a route is undocumented or a documented path no longer exists, so the
page cannot drift from the code.

### Before deploying

- [ ] Set `SECRET` in the production environment. The app refuses to boot
      without it, and **rotating it signs every existing user out.**
- [ ] Set `TRUST_PROXY_HOPS` to the real number of proxies.
- [ ] Set `DB_PORT` if MySQL is not on 3306. Nothing read it before, so the
      legacy app cannot reach the tunnelled server at all.
- [ ] Prefer `DB_USER` over `USER`. `USER` is the POSIX login-name variable;
      under Docker `-e`, systemd or pm2 an inherited value authenticates as the
      wrong account. `USER` is still read as a fallback.
- [ ] Decide what `GET /transactions` should do about its missing table.
