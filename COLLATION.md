# Collation map and JOIN rules

Derived from a full `information_schema` dump of the production server, 29 Aug 2026.
Read this before converting any `IN (SELECT …)` to a JOIN.

**Server:** MySQL `8.0.46-0ubuntu0.24.04.3` · default `utf8mb4` / `utf8mb4_0900_ai_ci`

---

## 1. The landscape

### Databases

| Database | Default charset | Notes |
|---|---|---|
| `db_uspto` | latin1_swedish_ci | raw USPTO corpus — the big one |
| `db_application` | latin1_swedish_ci | |
| `db_business` | latin1_swedish_ci | control plane (organisation, user) |
| `db_patent_application_bibliographic` | latin1_swedish_ci | **individual tables converted to utf8mb4** |
| `db_patent_grant_bibliographic` | latin1_swedish_ci | **individual tables converted to utf8mb4** |
| `db_patent_maintainence_fee` | latin1_swedish_ci | |
| `db_new_application` | utf8mb4_0900_ai_ci | but `dashboard_items` is `utf8mb4_general_ci` |
| `db_patent_application_bibliographic_new` | utf8mb4_0900_ai_ci | |

**336 tenant databases (`db_<id><hash>`) live on this same server.** 320 are `utf8mb4_0900_ai_ci`, **16 are `latin1_swedish_ci`**.

Two consequences:

- Cross-database joins between tenant and main databases are physically possible — they are not on separate servers. Whether the application should do it is a separate question (`getOrgConnection` opens a distinct pool per tenant, so a join would have to be issued on one connection covering both schemas).
- **A query that joins tenant data to main data behaves differently for those 16 tenants.** Any collation fix hardcoded for `utf8mb4` will throw error 1267 for them. Do not hardcode a tenant-side collation.

### The database default lies

Column collation was set per table, not inherited. You must check the column, never the database:

```
db_patent_application_bibliographic   default latin1_swedish_ci
  └── inventor.appno_doc_num          actually utf8mb4_0900_ai_ci, indexed
```

### Six collations are in play, not two

Across string columns in the eight main databases:

| Collation | Columns |
|---|---|
| `latin1_swedish_ci` | 488 |
| `utf8mb4_0900_ai_ci` | 118 |
| `utf8mb4_general_ci` | 78 |
| `utf8mb3_unicode_ci` | 8 |
| `utf32_general_ci` | 6 |
| `utf8mb4_unicode_ci` | 1 |

---

## 2. The two rules

### Rule 1 — same charset, different collation → `COLLATE`. Different charset → `CONVERT`.

`COLLATE` can only name a collation of the column's own charset. To cross charsets you need `CONVERT(expr USING charset)`.

```sql
-- utf8mb4_general_ci  vs  utf8mb4_0900_ai_ci   → same charset
di.application COLLATE utf8mb4_0900_ai_ci

-- latin1_swedish_ci  vs  utf8mb4_general_ci    → different charset
CONVERT(d.appno_doc_num USING utf8mb4)
```

### Rule 2 — put the coercion on the side whose index you do NOT need.

Wrapping a column in `COLLATE` or `CONVERT()` makes it a non-indexable expression for that predicate. On `db_uspto` that turns a seek into a full scan.

**Coerce the small, already-filtered side. Leave the big indexed side bare.**

```sql
-- WRONG: coercion on the big indexed column → full scan of inventor
WHERE inv.appno_doc_num COLLATE utf8mb4_general_ci IN (
    SELECT di.application FROM db_new_application.dashboard_items di WHERE di.organisation_id = :org
)

-- RIGHT: coercion on the small filtered set → inventor.appno_doc_num index still used
WHERE inv.appno_doc_num IN (
    SELECT di.application COLLATE utf8mb4_0900_ai_ci
    FROM db_new_application.dashboard_items di WHERE di.organisation_id = :org
)
```

Placing the coercion in a subquery's **SELECT list** (rather than its WHERE clause) costs nothing — no index on the inner side is being used for that expression anyway.

### Corollary — narrowing can lose data

`CONVERT(utf8mb4_col USING latin1)` replaces unmappable characters with `?`, silently changing match results.

| Key type | Safe to narrow to latin1? |
|---|---|
| `appno_doc_num`, `grant_doc_num`, `patent`, `rf_id`, reel/frame | **Yes** — ASCII digits and letters only |
| `name`, `representative_name`, `cname`, `lawfirm`, addresses | **No** — widen to utf8mb4 instead, or keep the two-step |

When the ASCII-safe side is also the big indexed side, you cannot narrow *and* keep the index. That is the case where `IN (:array)` from a prior query genuinely beats a JOIN — see §4.

---

## 3. Column reference for the common join keys

| Column | Where | Collation | Indexed |
|---|---|---|---|
| `application` | `db_new_application.dashboard_items` | `utf8mb4_general_ci` | yes — `IDX_appno`, `idx_di_filter(application,type,organisation_id,representative_id)` |
| `patent`, `lawfirm`, `name`, `event_code` | `db_new_application.dashboard_items` | `utf8mb4_general_ci` | `IDX_Law` on `lawfirm` |
| `appno_doc_num`, `grant_doc_num` | `db_uspto.documentid` | `latin1_swedish_ci` | yes |
| `appno_doc_num` | `db_patent_application_bibliographic.inventor` | `utf8mb4_0900_ai_ci` | yes — plus `unq_idx(name, appno_doc_num)` |
| `appno_doc_num` | `db_patent_grant_bibliographic.inventor_new` | `utf8mb4_0900_ai_ci` | yes — plus `unq_idx(name, appno_doc_num)` |
| `appno_doc_num`, `grant_doc_num` | `db_application.*` (`documentid`, `table_a…d`, `assets_transfer`, …) | `latin1_swedish_ci` | yes |
| `name` | `db_uspto.assignor_and_assignee` | `utf8mb4_0900_ai_ci` | — table default is `utf8mb4_general_ci`, the column is not |
| `representative_name` | `db_uspto.representative` | `utf8mb4_0900_ai_ci` | — |
| `representative_name` | `db_uspto.list1`, `list2`, `admin_representative_reports` | `latin1_swedish_ci` | — |
| `representative_name` | `db_business.representative` | `utf8mb4_general_ci` | — |
| `cname` | `db_uspto.assignment`, `db_uspto.correspondent` | `latin1_swedish_ci` | — |
| `name` | `db_business.organisation` | `latin1_swedish_ci` | — the column behind MySQL error 3988 on logo upload |

**`representative_name` appears in four different collations across four schemas.** Every predicate touching it needs checking individually.

---

## 4. Decision procedure for each of the 228 `IN (SELECT …)`

1. **Do both sides live on the same connection?**
   No (one side is `req.connection_db`) → **keep `IN (:array)`**. Two queries, both index-seekable, is correct. Do not convert.

2. **Are the compared columns the same collation?**
   Yes → convert to `INNER`/`LEFT JOIN` directly. No coercion needed.

3. **Different collation, same charset?**
   Add `COLLATE` to the **smaller / already-filtered** side. Convert to a JOIN.

4. **Different charset?**
   - ASCII-only key, and the utf8mb4 side is the small one → `CONVERT(small USING latin1)`, JOIN, big latin1 index preserved.
   - ASCII-only key, and the latin1 side is the small one → `CONVERT(small USING utf8mb4)`, JOIN.
   - Text key (names, addresses) → widen the small side to utf8mb4. Never narrow.
   - Both sides big and indexed → **keep the two-step `IN (:array)`.** A JOIN here forces a scan on one side; two indexed lookups beat one scan.

5. **`EXPLAIN` before and after.** If `type` degrades to `ALL` or `key` becomes `NULL` on a `db_uspto` / `db_patent_*` table, the rewrite is worse than what it replaced — revert it.

---

## 5. Known-wrong existing workarounds

43 hand-written `COLLATE` clauses exist today (26 × `utf8mb4_0900_ai_ci`, 17 × `utf8mb4_general_ci`). At least one class is placed on the wrong side:

```js
// routes/application/events.js:2525 and :2533
where appno_doc_num COLLATE utf8mb4_0900_ai_ci IN (
    select application FROM db_new_application.dashboard_items WHERE ...
)
```

`inventor.appno_doc_num` is *already* `utf8mb4_0900_ai_ci`, so the clause changes no collation — it only risks the index on a table with `unq_idx(name, appno_doc_num)`. The mismatch is on the other side: `dashboard_items.application` is `utf8mb4_general_ci`. Correct form:

```sql
WHERE inv.appno_doc_num IN (
    SELECT di.application COLLATE utf8mb4_0900_ai_ci
    FROM db_new_application.dashboard_items di
    WHERE di.organisation_id = :organisationID AND di.type = :type
      AND di.representative_id IN (:companies)
)
```

Audit all 43 against §3 before converting any of them to JOINs.

---

## 6. What is still unknown

- **Row counts.** The dump omitted `TABLE_ROWS` / `CARDINALITY` because collecting them stalled on a 100 GB schema. Rule 2 needs to know which side is bigger. Where it is not obvious, run `EXPLAIN` on the specific query rather than guess.
- **Tenant `org_host`.** 336 tenant schemas exist on this server, but `organisation.org_host` may still point elsewhere for some. Confirm with
  `SELECT DISTINCT org_host FROM db_business.organisation;`
  before assuming any tenant join is physically possible.
- **The 16 latin1 tenants.** Identify them before writing any tenant-side collation:
  `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE DEFAULT_COLLATION_NAME = 'latin1_swedish_ci' AND SCHEMA_NAME LIKE 'db\_%';`
