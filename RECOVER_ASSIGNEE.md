# Recovering `db_uspto.assignee`

Runbook for the crashed MyISAM table blocking 22 endpoints.
Written 19 Sep 2026. Run these **on the server** (`69.110.136.91`) — none of it
can be done over the SQL tunnel.

```
Error:   Table './db_uspto/assignee' is marked as crashed and last (automatic?) repair failed
errno:   144  (HA_ERR_CRASHED_ON_REPAIR)
Server:  MySQL 8.0.46, datadir /mnt2/data/mysql/
Files:   /mnt2/data/mysql/db_uspto/assignee.MYD   (data)
         /mnt2/data/mysql/db_uspto/assignee.MYI   (indexes)
```

**Do not run `REPAIR TABLE`.** It rewrites in place, silently discards rows it
cannot read, and leaves you no way back. Everything below is ordered so that
nothing is destroyed until you have a copy.

---

## What is already safe

**The table definition is not lost.** MySQL 8.0 keeps table metadata in the data
dictionary, not in a `.frm` file, so the schema survived the crash intact — I
read it straight out of `information_schema` while the table itself was
unreadable. It is written out in Appendix A below. You do not have to guess at
the structure.

**`myisam_recover_options = BACKUP` is set on this server.** That means when
MySQL's automatic recovery ran and failed, it was configured to save a copy of
the data file first. **Check for it before anything else** — it may be the whole
recovery:

```bash
ls -la /mnt2/data/mysql/db_uspto/assignee*
ls -la /mnt2/data/mysql/db_uspto/*.BAK
```

A file named something like `assignee-<datetime>.BAK` is a pre-recovery copy of
the `.MYD`. If it exists, copy it somewhere safe immediately.

---

## Step 0 — Back up, before touching anything

Non-negotiable. Once these three files are off the box, every later step is
reversible and the risk you were worried about is gone.

```bash
sudo systemctl stop mysql          # a MyISAM file copied while the server is
                                   # running can be torn; stop first

mkdir -p /backup/assignee-20260919
cp -av /mnt2/data/mysql/db_uspto/assignee.MYD /backup/assignee-20260919/
cp -av /mnt2/data/mysql/db_uspto/assignee.MYI /backup/assignee-20260919/
cp -av /mnt2/data/mysql/db_uspto/*.BAK        /backup/assignee-20260919/ 2>/dev/null

ls -la /backup/assignee-20260919/
```

Note the size of `assignee.MYD`. **If it is multiple GB, your data is very
likely still there** and this is an index problem, not a data-loss problem. If it
is near zero, skip to Step 4 (rebuild from source).

Get the backup off the machine entirely if you can.

---

## Step 1 — Diagnose, read-only

`myisamchk` with no repair flag only reads. It tells you which of the two files
is actually damaged, which decides everything after this.

```bash
# server still stopped from Step 0
myisamchk --check --verbose /mnt2/data/mysql/db_uspto/assignee.MYI
```

Read the output for:

| What you see | What it means | Go to |
|---|---|---|
| `Found N records` with a plausible N (10–30M), errors only about keys/indexes | **Index file corrupt, data intact** — the good case | Step 2 |
| Errors about record positions, "Wrong bytesec", unreadable blocks | Data file damaged | Step 3 |
| `Found 0 records` / file truncated | Data is gone | Step 4 |

Expect roughly **10–30 million rows**. For scale, on the same server
`assignment` holds 11,644,964 rows and `assignor` 28,643,355 across the same
11,644,964 distinct `rf_id`s. `assignee` should be the same order of magnitude
as `assignor`.

Four of this table's twelve indexes are **FULLTEXT** (Appendix A). Large FULLTEXT
indexes on MyISAM are the single most common thing to corrupt, which is why the
index-only case is the most likely one.

---

## Step 2 — Index corrupt, data intact (best case, no rows lost)

`--safe-recover` rebuilds the indexes by reading the data file row by row. It is
slower than `-r` and it does **not** discard rows.

```bash
myisamchk --safe-recover \
          --sort_buffer_size=2G \
          --key_buffer_size=2G \
          --tmpdir=/mnt2/tmp \
          /mnt2/data/mysql/db_uspto/assignee.MYI
```

- Give `--tmpdir` a filesystem with **at least as much free space as the `.MYD`** —
  it needs room to build the indexes.
- This will take a while on 10–30M rows with four FULLTEXT indexes. Let it run.

Then:

```bash
sudo systemctl start mysql
mysql -e "SELECT COUNT(*) FROM db_uspto.assignee;"
mysql -e "SELECT * FROM db_uspto.assignee LIMIT 10;"
```

If the count is in the expected range, go to **Step 5**.

---

## Step 3 — Data file damaged

Only reach for this if Step 1 said the data itself is bad, and only with the
Step 0 backup in hand. `-r` **will drop rows it cannot read**.

```bash
myisamchk --recover \
          --sort_buffer_size=2G --key_buffer_size=2G --tmpdir=/mnt2/tmp \
          /mnt2/data/mysql/db_uspto/assignee.MYI
```

It reports how many rows it deleted. **Write that number down** — it is the size
of your data loss, and it tells you how much of a backfill you need in Step 6.

If `-r` itself fails, `--safe-recover` uses an older, slower algorithm that
sometimes succeeds where `-r` does not. Try it before concluding the data is
unrecoverable.

---

## Step 4 — Rebuild from source (if the data is gone)

This table is derived data: it is loaded from the USPTO assignment bulk files,
so it is re-creatable. Nothing here is unique to your system.

1. Recreate the table **as InnoDB** using Appendix A.
2. Re-import from the USPTO assignment bulk data
   (`assignment.uspto.gov` full-file set, not just the daily deltas).
3. Rebuild `assignor_and_assignee` links if your loader does that separately.

Budget real time for this — it is millions of rows and four FULLTEXT indexes.

---

## Step 5 — Convert to InnoDB, so this cannot happen again

**This is the part that actually fixes the problem.** MyISAM has no crash
recovery. That is precisely why this table crashed and `assignor` — same
database, same workload, same server — did not:

| Table | Engine | State |
|---|---|---|
| `db_uspto.assignor` | InnoDB | fine, 28.6M rows |
| `db_uspto.assignee` | **MyISAM** | **crashed** |
| `db_application.assignee` | InnoDB | fine |
| `db_patent_application_bibliographic.assignee` | InnoDB | fine, 4.98M |
| `db_patent_grant_bibliographic.assignee` | InnoDB | fine, 4.33M |

Every other copy of this table on the server is already InnoDB. This one was
left behind. Repairing it as MyISAM just resets the clock until the next
unclean shutdown.

InnoDB has supported FULLTEXT since 5.6, so all four FULLTEXT indexes carry over.

```sql
-- after a successful recovery, with a verified backup in hand
ALTER TABLE db_uspto.assignee ENGINE=InnoDB;
```

If `ALTER` is too risky on a table you have just recovered, do it as a copy
instead — slower, but the original stays untouched until you are satisfied:

```sql
CREATE TABLE db_uspto.assignee_innodb LIKE db_uspto.assignee;
ALTER TABLE db_uspto.assignee_innodb ENGINE=InnoDB;
INSERT INTO db_uspto.assignee_innodb SELECT * FROM db_uspto.assignee;

-- verify, then swap
RENAME TABLE db_uspto.assignee        TO db_uspto.assignee_myisam_old,
             db_uspto.assignee_innodb TO db_uspto.assignee;
```

Keep `assignee_myisam_old` until you are confident, then drop it.

While you are there, check whether any other MyISAM tables are one bad shutdown
from the same fate:

```sql
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_ROWS,
       ROUND(DATA_LENGTH/1048576) AS data_mb
  FROM information_schema.TABLES
 WHERE ENGINE = 'MyISAM'
   AND TABLE_SCHEMA NOT IN ('mysql','sys','information_schema','performance_schema')
 ORDER BY DATA_LENGTH DESC;
```

`db_uspto.assignment` (11.6M rows) and `db_uspto.correspondent` (11.6M rows) are
both still MyISAM and both still being written to.

---

## Step 6 — The gap, and the reason you did not know about this

Recovering the table is not the end of it. **The import stopped weeks before the
crash surfaced, and your monitoring reported success the whole time.**

```
download_tracking.daily_download   last run 2026-09-19 00:00:01   status "success"
db_uspto.assignment                newest record_dt 2026-08-07
                                   rows in the last 30 days: 0
```

| Month | Rows loaded into `assignment` |
|---|---:|
| 2025-10 | 17,560 |
| 2025-11 | 13,343 |
| 2025-12 | 12,966 |
| 2026-01 | 10,036 |
| 2026-02 | 153 |
| 2026-03 | 2,240 |
| 2026-04 | 2,247 |
| 2026-05 | 1,480 |
| 2026-06 | 418 |
| 2026-07 | 3,074 |
| 2026-08 | 3,540 (stops on the 7th) |
| since 2026-08-07 | **0** |

Volume has been degrading since January and stopped entirely on 7 August. The
MyISAM sibling tables both record a last write of **2026-08-12** — so whatever
happened in that window is likely the same event that crashed `assignee`.

So, after recovery:

1. **Find out why `daily_download` records `status = "success"` while writing
   nothing.** A job that reports green while doing nothing is worse than a job
   that fails loudly — it is why six weeks passed unnoticed.
2. **Backfill 2026-08-07 to today** from the USPTO daily files once the loader
   works.
3. Make the tracker assert something real — rows inserted, or newest `record_dt`
   moving forward — not merely that the script exited 0.

---

## Appendix A — the table definition

Recovered from the MySQL 8.0 data dictionary while the table itself was
unreadable. `ENGINE=InnoDB` below is deliberate; see Step 5.

```sql
CREATE TABLE `assignee` (
  `rf_id`                    bigint       NOT NULL,
  `original_name`            varchar(245) NOT NULL,
  `ee_name`                  varchar(245) NOT NULL,
  `ee_address_1`             varchar(300) NOT NULL,
  `ee_address_2`             varchar(300) NOT NULL,
  `ee_city`                  varchar(50)  NOT NULL,
  `ee_state`                 varchar(60)  NOT NULL,
  `ee_postcode`              varchar(15)  NOT NULL,
  `ee_country`               varchar(50)  NOT NULL,
  `assignor_and_assignee_id` bigint       DEFAULT NULL,
  UNIQUE KEY `rf_id_ee_name` (`rf_id`,`ee_name`),
  KEY `rf_id` (`rf_id`),
  KEY `original_name` (`original_name`),
  KEY `ee_name` (`ee_name`),
  KEY `ee_address_1` (`ee_address_1`),
  KEY `ee_address_2` (`ee_address_2`),
  KEY `assignor_and_assignee_id` (`assignor_and_assignee_id`),
  FULLTEXT KEY `ee_address_1_ee_address_2` (`ee_address_1`,`ee_address_2`),
  FULLTEXT KEY `ee_address_1_full` (`ee_address_1`),
  FULLTEXT KEY `ee_address_2_full` (`ee_address_2`),
  FULLTEXT KEY `ee_country` (`ee_country`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
```

Charset is `latin1` to match the rest of `db_uspto` — see `COLLATION.md`. Do not
"upgrade" it to utf8mb4 during recovery; the joins against it assume latin1 and
changing it would break them in a way that is much harder to spot than a crash.

---

## Appendix B — the 22 endpoints this unblocks

I will re-test all of these once the table reads. They are spread across six
modules — this is not only an admin-console problem.

**Admin console:** `/admin/company/assets/:entityID` ·
`/admin/company/:companyID/law_firms` · `/admin/company/law_firms/:id/companies` ·
`/admin/company/search/address/:address` · `/admin/company/search/country/:name` ·
`/admin/company/:ID/search/address/:type` ·
`/admin/company/:ID/search/address_with_transactions/:type` (GET and PUT) ·
`/admin/company/lender` · `/admin/company/lenders/:id/companies` ·
`/admin/company/:id/companies` · `/admin/company/assignments/:id` ·
`/admin/company/raw/assignments/:id` · `/admin/company/transactions/:id` (+ the
`/:representativeID` variant) · `run_query` report 1

**Main web app:** `/companies/search/:searchName` · `/connection/:reelFrame` ·
`/collections/:rf_id/illustration` · `/customers/transactions/address` ·
`/customers/transactions/name` · `/timeline/item/:rfId` ·
`/transactions/:transactionId`
