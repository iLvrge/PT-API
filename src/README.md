# PT-API v2 — industry-standard rewrite

A layered, tested rewrite of the PatenTrack API living under `src/`, on the
`rewrite/industry-standard` branch. The legacy app (`app.js`, `routes/`,
`helpers/`, `model/`) is untouched and still runs; this is built alongside it so
migration is incremental and nothing breaks during the transition.

## What exists today

A complete, tested **foundation** plus fully implemented modules that prove the
pattern end to end:

- **auth** — `POST /signin`, `GET /refresh-token`
- **users** — `GET/POST /admin/customers/:id/users`, `DELETE /admin/customers/:id/users/:userId`
- **keywords** — `GET/POST /admin/keywords`, `PUT/DELETE /admin/keywords/:keywordId`
- **health** — `GET /health`, `GET /health/ready`

Cross-cutting infrastructure:

- **Swagger / OpenAPI** — interactive docs at `GET /docs`, raw spec at `GET /docs.json`
- **Sentry** — `config/sentry.js`, initialised in `server.js`; reports only 5xx /
  non-operational errors (audit F14), no-op without `SENTRY_DSN`
- **Request logging** — `middleware/request-logger.js`; one structured line per
  request with a correlation id (`X-Request-Id`, also `req.id`)
- **Tenant connections** — `db/tenant-connections.js`; per-organisation pooled
  connections with TTL eviction, replacing the legacy cache without its F4 bug

74 tests pass; lint is clean; coverage gate enforced in CI. The remaining
endpoints are ported by repeating the module pattern below — no new
architecture required.

## Architecture

```
Request
  → routes        (HTTP verb + path, middleware chain)
    → middleware   (auth, validate, rate-limit, security)
    → controller   (req/res only — no logic, no SQL)
      → service    (business rules — no HTTP, no SQL; unit-tested)
        → repository (data access: raw SELECT reads, Sequelize writes)
          → db      (pooled Sequelize connections + raw query helpers)
  → error-handler  (one place; correct status codes; Sentry only for 5xx)
```

Each layer knows only the layer below it. That is what makes the services
unit-testable with the repository mocked, and the routes integration-testable
with the whole DB layer mocked — no live database needed for CI.

## The read/write split (team policy)

- **Reads** are raw SQL `SELECT` through `db/query.js` (`selectAll`, `selectOne`,
  `selectValue`, `exists`). Always `:named` replacements, never interpolation.
- **Writes** (`INSERT`/`UPDATE`/`DELETE`) go through a Sequelize model in a
  repository. See `modules/users/users.repository.js` for both sides in one file.

Raw reads return plain objects, so a read result can never be `.update()`d or
`.destroy()`d by accident — writes must go through the model.

## Collation & JOINs

`IN (SELECT …)` → JOIN conversions are governed by `../COLLATION.md`, built from a
full schema dump. The one rule to remember: **put `COLLATE`/`CONVERT()` on the
side whose index you do NOT need** — wrapping an indexed column forces a full
scan on the 100 GB tables. Some `IN` subqueries must stay as-is (cross-connection
tenant data, or both sides big and indexed). Do not convert blindly.

## Security & correctness fixes baked in

Every item here was an audit finding, fixed structurally rather than per-endpoint:

| Fix | Where |
|---|---|
| JWT signature **verified**, not just decoded (F1) | `middleware/auth.js`, `auth.service.refresh` |
| Fail-fast on missing/known secret (F2) | `config/env.js` |
| Passwords never derived from user data; bcrypt cost 12 (F3) | `users.service`, `env` |
| No accidental globals — `no-undef` in CI (F4) | `eslint.config.js` |
| Unhandled rejections don't kill the process (F6) | `utils/async-handler`, `server.js` |
| No `ORDER BY` injection — allowlisted identifiers (F7) | `db/query.identifier/direction` |
| Rate limiting + helmet + CORS allowlist (F12) | `middleware/security.js` |
| Correct status codes, never a blanket 402 (F13) | `middleware/error-handler.js` |
| Sentry only for 5xx, not every 4xx (F14) | `middleware/error-handler.js` |
| Edge validation with field-level errors (F17) | `middleware/validate.js` + zod schemas |
| Connection pooling; query logging off (P1/P2) | `db/index.js`, `config/env.js` |

## Running

```bash
npm run test           # all unit + integration tests (no DB needed)
npm run test:coverage  # with coverage gate
npm run lint           # eslint on src + tests
npm run start:v2       # boot the v2 server (needs a real .env)
npm run dev:v2         # boot with --watch
```

## How to port another endpoint

Take one legacy route (say `GET /admin/customers/:id/companies`) and:

1. **repository** — add a raw `SELECT` read method (or a Sequelize write) in
   `modules/<feature>/<feature>.repository.js`. Convert any `IN (SELECT …)` per
   `COLLATION.md`; verify with `EXPLAIN`.
2. **service** — put the business logic in `<feature>.service.js`, HTTP- and
   SQL-free. This is where the unit tests point.
3. **validation** — a zod schema in `<feature>.validation.js` for params/body/query.
4. **controller** — thin `req → service → res` in `<feature>.controller.js`.
5. **routes** — wire path + middleware in `<feature>.routes.js`; mount in `app.js`.
6. **tests** — a `.service.test.js` (repository mocked) and a `.routes.test.js`
   (DB layer mocked via supertest). Copy the users tests as a template.

The pattern is identical every time; that repetition is the point.

## Not yet done (honest status)

- Only auth + users + health are implemented. The other feature modules
  (assets, events, dashboards, companies, documents, slack, …) are not.
- Tenant-database access (`getOrgConnection` equivalent) is not yet ported — the
  users module currently targets `db_business` only. A `tenant-connections.js`
  with the same cache/eviction as the legacy `dbConnectionCache`, minus the
  implicit-global bug (F4), is the next infrastructure piece.
- Repository **read** methods are covered by integration tests against mocks;
  a DB-backed test tier (seeded MySQL in CI) should exercise the real SQL.
```
