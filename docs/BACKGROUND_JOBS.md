# Background jobs

How the data-pipeline scripts are run from the API, why the previous approach
lost work, and what replaced it.

## What these jobs are

Seventeen scripts, written in PHP and JavaScript, live outside this repository
in three sibling checkouts:

| repository | what it holds |
|---|---|
| `customer-data-migrator` | customer provisioning and per-account data builds |
| `uspto-data-sync` | USPTO ingestion, assignments, flags, reports |
| `script_patent_application_bibliographic` | bibliographic XML, families, logos, name normalisation |

The API does not own them. It starts them, and until now that was the whole of
the relationship.

## What was wrong

**Work was started and then forgotten.** `runPhpScriptBackground` called
`execFile` and attached a `.catch` that logged. Nothing recorded that a job had
been asked for, whether it finished, or what it did. A restart during a job lost
it with no trace, and nothing retried.

**Nobody could see a running job.** These take minutes. The console had no way
to ask "is it still going?", so a long job and a dead one looked identical — the
same complaint that turned out to be behind several "the button does nothing"
reports.

**One endpoint was ported to a script that does not exist.** `publishCompanies`
— the console's Update button — called `update_client_companies.php`. That file
is in none of the three repositories, is in no repository's git history, and
the legacy handler never named it. The legacy `/publish` route ran
`create_data_for_company_db_application.php`, did two things first, and the
port dropped both: it refused when the customer had no users, and it honoured
the `?company_id=` selection the console sends, queueing one rebuild per ticked
company. All three are restored; see "The publish endpoint" below.

**The same script name means different things.** Every script present in more
than one repository differs between them — different sizes, different contents:

```
assets_family.php   customer-data-migrator 11039 B   uspto-data-sync 7282 B   bibliographic 2384 B
update_flag.php     customer-data-migrator 35552 B   uspto-data-sync 35734 B  bibliographic 36129 B
```

`SCRIPT_PATH` points at one directory, so which version runs is decided by
whatever was deployed there, not by anything in this repository.

**The environment handed to scripts was incomplete and partly wrong.** The
scripts read `DB_RT_PWD`, `STATIC_PATH` and `STATIC_PATH_URL`; the runner did
not set them. It also mapped the two bibliographic databases to each other's
names:

```js
DB_APPLICATION_BIBLIO: process.env.DATABASE_GRANT_BIBLIO,   // swapped
DB_GRANT_BIBLIO: process.env.DATABASE_APPLICATION_BIBLIO,   // swapped
```

**Nothing bounded concurrency.** Ten requests meant ten simultaneous copies of a
script that rebuilds a customer's database.

## What replaced it

A queue, on Redis, with BullMQ.

**Why Redis and not RabbitMQ.** Redis is already a dependency of this machine
and of the deployment; RabbitMQ would be a new broker to run and monitor. The
features that justify RabbitMQ — topic routing, federation, consumers in other
languages — are not used here: one producer, one worker pool, seventeen named
jobs. BullMQ supplies what this workload actually needs: retry with backoff,
per-job concurrency, progress, scheduled and repeatable jobs, and a durable
record of what failed. If a PHP consumer is ever wanted, Redis can serve it too.

### Shape

```
request ──▶ queue.enqueue(job, payload)  ──▶  Redis  ──▶  worker process
                     │                                        │
                     └── returns a job id immediately         └── spawns php/node,
                                                                  records progress,
                                                                  retries on failure
GET /jobs/:id ──▶ status, progress, attempts, error
```

The API process enqueues and returns. A separate worker process runs the
scripts, so a deploy or crash of the API cannot kill a job in flight, and the
worker can be scaled or paused on its own.

### The job catalogue

Every job is declared in one place (`src/jobs/catalogue.js`) with its runtime,
script, argument shape, timeout, retry policy and concurrency. Nothing else may
name a script. A request can therefore only start work that has been declared,
with arguments that have been validated — the scripts take database names and
organisation ids on their command line, so this is a security boundary as well
as a tidy one.

### Running it

```
npm run worker            # the consumer; runs alongside the API
```

`JOBS_INLINE=1` runs jobs in-process without Redis. Tests use it, and it keeps
a developer without Redis working.

## What this does not do

It does not rewrite the scripts. They stay in their own repositories and keep
running as child processes; what changed is that the API now knows what it
started, can say so, and can retry. Porting individual scripts into the API is
a separate exercise, and the catalogue is where it would start.

It does not resolve which copy of a divergent script is correct. That needs
someone who knows the deployment; the catalogue records the ambiguity so it is
at least visible.

## What needs a decision

Three things surfaced while building this that code cannot settle:

**1. Every duplicated script differs between repositories.** Ten of the
seventeen exist in two or three checkouts, and no two copies are identical.
`SCRIPT_PATH` picks one directory, so the deployed copy wins by accident. The
catalogue's `sources` field lists where each was found; someone needs to decide
which repository is authoritative and retire the rest.

**2. `SCRIPT_PATH` points at `/var/www/html/scripts/`,** which exists only on
the server. Every job is therefore unrunnable on a developer machine — visible
now at `GET /admin/jobs/catalogue`, where all eighteen report
`runnable: false` with the reason. Previously this was silent.

**3. The scripts connect as root.** `script_create_customer_db.php` opens
`mysqli("localhost", "root", getenv('DB_RT_PWD'))` and issues `CREATE DATABASE`
and `CREATE USER`. That is why `DB_RT_PWD` has to be in the worker's
environment, and it is worth deciding whether provisioning should keep those
rights or move behind a narrower account.

## The publish endpoint

`GET /admin/customers/:id/publish` is the console's Update button, and it was
the one endpoint the port got wrong rather than merely un-instrumented. What it
does now, matching the legacy handler:

1. Counts the customer's users. With none it answers *"Please create a admin
   user first for this customer."* and queues nothing — rebuilding a database
   nobody can log into is wasted work, and the port reported it as success.
2. Reads `?company_id=<JSON array>`, which the console sends as the portfolio
   rows the user ticked.
3. No selection: one `company.build-application-data` job for the whole
   organisation, argv `[orgId, ""]`.
4. A selection: one job per company, argv `[orgId, companyId, "1"]`.

The dedupe key for that job is `org:<id>:company:<id>` rather than the
organisation alone. Keyed on the organisation, a ten-company selection would
collapse onto one job and the other nine would be dropped silently — the same
class of bug as the one being fixed.

## Operational notes

The worker is a second process. A deployment that runs only `npm start` will
queue jobs that nothing consumes — `GET /admin/jobs` will show them piling up
in `waiting`. Both need to run:

```
npm start     # the API: enqueues
npm run worker  # the consumer: runs the scripts
```

`ioredis` is a direct dependency, not just BullMQ's. BullMQ 6 treats it as an
optional peer and fails at connection time with a message about installing it,
which would otherwise appear first in production.
