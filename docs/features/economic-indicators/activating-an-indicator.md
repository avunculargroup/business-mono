# Turning on a seeded indicator

**Who this is for:** whoever activates one of the seeded rows sitting in
`economic_indicators` with `is_active = false`. AU CPI and AU Bus. Confidence
are worked through in full; the six further AU rows from
[`abs-activation-spec.md`](./abs-activation-spec.md#indicator-set) follow the
same loop (see [The general case](#the-general-case)). It assumes no
familiarity with the poll, the migration workflow or SDMX. Follow it top to
bottom.

**Why they are off.** Their adapters — ABS and OECD, both SDMX — were written
without network access, so their parsing has never met a real response. The
fixtures behind their green tests are synthesised from the SDMX specification,
not recorded from the providers (see
[`adapter-contract.md`](./adapter-contract.md#abs-and-oecd--adapterssdmxts-adaptersabsts-adaptersoecdts--built-not-activated)).
Activating one is therefore a verification exercise, and this is the sequence
for it.

**Time:** about twenty minutes for the first, ten for the second, plus waiting
for two poll runs.

-----

## The one thing to understand first

Turning a row on is safe, and that is deliberate.

Both rows are *known* to be incomplete, and both adapters refuse an incomplete
request rather than guessing at it. AU CPI's `provider_table_ref` is
`ABS,CPI,2.0.0` — a dataflow with no data key, which asks ABS for every CPI
series it publishes, and the parser will not pick one of them for you. AU Bus. Confidence's ref names no
publishing agency, so the OECD adapter will not even build the URL.

So the first poll after you activate either row **will fail, and write nothing**.
That failure is the point: it is how you find out what the request should have
said. You are not risking bad data by turning it on; you are asking the provider
a question you cannot ask any other way from here.

One failing indicator never affects the others. The poll logs it and carries on.

-----

## What you need

- Access to the **Supabase dashboard** for the `bts-internal` project, so you can
  run SQL. Left sidebar → **SQL Editor** → **New query**. Everything below that
  starts with `select` is read-only and safe to run.
- Access to the **web app**, for the `/routines` page.
- For step 5 only: the ability to open a pull request on this repository.

-----

## Step 1 — Look at the row before you touch it

In the Supabase SQL Editor:

```sql
select short_label, name, provider, provider_table_ref,
       period_granularity, unit, decimals, is_active
from economic_indicators
where short_label in ('AU CPI', 'AU Bus. Confidence');
```

You should see both rows with `is_active = false`. Note the `provider_table_ref`
values — those are what you are here to correct.

-----

## Step 2 — Turn one on

Do **one at a time**. Start with AU CPI.

```sql
update economic_indicators
set is_active = true
where short_label = 'AU CPI';
```

> **Why this one is a direct `update` and step 5 is not.** This is a temporary
> change you are about to reverse or replace, on a row nothing is reading yet.
> The permanent version goes in a migration file so the next person's database
> ends up the same as yours — that is step 5.

-----

## Step 3 — Run the poll

The poll normally runs itself once a day at 08:00 Melbourne time. You do not
need to wait for that.

1. Open the web app → **Routines**.
2. Find **Daily economic indicator poll**.
3. Open its menu → **Run now**.

"Run now" queues the run by moving its next-run time to the present; the agent
server picks it up on its next tick, usually within a few minutes. Nothing
appears instantly — give it five minutes before concluding anything.

> While you are waiting, do not edit the routine. Saving an edit can recompute
> the next-run time and quietly cancel the run you just queued.

-----

## Step 4 — Read what ABS said

Back in the SQL Editor:

```sql
select created_at, status, notes::jsonb
from agent_activity
where action = 'Routine run: Daily economic indicator poll'
order by created_at desc
limit 1;
```

`notes` holds the whole run as JSON. The part you want is `failed`, a list of
strings. For AU CPI you should see something beginning:

```
AU CPI (parse: ABS: SDMX query returned 47 series where one was expected
(0:0:0:0, 0:0:0:1, …). The indicator's provider_table_ref needs a data key
that pins a single series.
```

…followed by a slice of the actual ABS response. If instead it says
`HTTP 403 … provider refused the request (check User-Agent / egress)`, ABS
turned the request away before answering; the adapter already sends a
User-Agent, so the likely cause is the agent server's egress, not the ref. **That slice is the thing this
whole exercise exists to obtain.** It is the first real ABS payload anyone here
has seen. Copy the entire `failed` entry somewhere you can read it properly — it
is long, and you will need it twice.

### Turning that into a data key

Inside the quoted response you will find a `structure` block listing the
dataflow's dimensions and, for each, its possible values with ids and names.
You are looking for the combination that means **All groups CPI, Australia,
index numbers, original**. Since the November 2025 move to the monthly CPI the
region is called "Australia", not "Weighted average of eight capital cities";
read its code from the structure rather than assuming the old one.

A data key is those dimension values in the order the dimensions are listed,
joined with dots, frequency last — `M` for this series, not the old quarterly
`Q`. Dimensions you want to leave unconstrained are left empty between the
dots.

Use `CPI` (version 2.0.0), never `CPI_M` (the old Monthly CPI Indicator,
discontinued) or `CPI_Q` (the quarterly series, a separate dataflow).

If the response does not give you enough to be confident, open
<https://explore.abs.gov.au> in a browser, find the series by name, and use the
data key it shows for the API query. Do not guess. A key that selects the wrong
series will parse perfectly and write a wrong number, which is the one failure
mode nothing downstream will catch.

### Two other failures you might see instead

| What `failed` says | What it means | What to do |
|---|---|---|
| `unrecognised TIME_PERIOD "2026-W03"` | The series reports in a period type the parser does not handle (weeks, semesters) | Tell me — it is a small addition to `parseSdmxTimePeriod` |
| `response is not an SDMX data message`, with an `errors` block quoted | ABS rejected the request itself; the message inside says why | Usually a malformed dataflow id — fix it and re-run from step 3 |
| `HTTP 404` | The dataflow id is wrong | Check it at <https://explore.abs.gov.au> |

-----

## Step 5 — Write the correction as a migration

Now make it permanent. A migration is a `.sql` file that runs itself against the
database when it reaches `main`, so every environment ends up identical. The
full workflow is in [`../../../packages/db/MIGRATIONS.md`](../../../packages/db/MIGRATIONS.md);
what follows is the short version for this specific change.

Create a file at `supabase/migrations/`, named with the **current UTC time** as
fourteen digits, then a short description:

```
supabase/migrations/20261002093000_activate_au_cpi.sql
```

> The fourteen digits must not collide with any existing file in that folder.
> Two files sharing a timestamp are one row to Supabase and the second aborts
> the batch — taking every other pending migration with it. A test checks this,
> so a collision fails the build rather than a deployment.

Contents — substituting your real data key for `<key>`. Keep the version in
the dataflow: `ABS,CPI,2.0.0` makes the next ABS rebase arrive as a 404 rather
than as a silent revision of every stored period.

```sql
-- Activate AU CPI, verified against a live ABS response on <date>.
-- The seeded ref was the dataflow alone, which returns every series in it;
-- the data key below pins All groups CPI, Australia, index, original.
-- See docs/features/economic-indicators/activating-an-indicator.md.

update economic_indicators
set provider_table_ref = 'ABS,CPI,2.0.0/<key>',
    period_granularity = 'monthly',
    poll_frequency     = 'daily',
    is_active          = true
where short_label = 'AU CPI';
```

`poll_frequency` is `daily` because monthly CPI is released on the last
Wednesday of the month, and a `weekly` row is only polled on Mondays.

Then edit `schema.sql` at the repo root if it records the seeded values, so the
human-readable reference matches.

Open a pull request. Once it merges to `main`, a GitHub Action applies it.

-----

## Step 6 — Run it again and check the data

Repeat step 3, then:

```sql
select o.period_date, o.value, o.released_at, o.is_current
from indicator_observations o
join economic_indicators e on e.id = o.indicator_id
where e.short_label = 'AU CPI'
order by o.period_date desc
limit 10;
```

Check all four:

1. **Periods are first-of-month.** `2026-08-01`, `2026-09-01` — never
   `2026-08-31`. The back series starts at `2024-04-01`. The dashboard's prior
   and year-ago comparisons join on this column, so an end-of-period date
   misaligns them silently.
2. **Values look like a CPI index near 100.** ABS rebased the monthly CPI to
   September 2025 = 100, so expect values a little either side of 100 — not
   percentages, not raw prices, and not the 130–145 the old quarterly series
   read. If they look like a different quantity, the data key points at the
   wrong series. Go back to step 4.
3. **There are roughly 19 of them.** The poll backfills about eighteen periods
   on first ingest so the year-on-year comparison works immediately.
4. **Spot-check the newest figure against the ABS website.** This is the only
   step that catches a plausible-but-wrong series, and it is worth the two
   minutes.

If all four hold, the indicator is live. It now appears on the internal
dashboard, and in Minute at `/indicators` for subscribers.

-----

## Step 7 — Replace the synthesised fixture

The tests currently prove the parser reads SDMX-JSON in general. Once you have a
real ABS payload they can prove it reads *ABS*, which is what the FRED and RBA
tests do for theirs.

Save the successful response as
`apps/agents/src/lib/indicators/adapters/__fixtures__/sdmx-abs-cpi.json`,
replacing the synthesised one, and update the expected values in
`sdmx.test.ts` to match. Then remove `sdmx-abs-cpi.json` from the synthesised
list in `__fixtures__/README.md`.

You can get the payload from a terminal on any machine that can reach ABS. The
format comes from the `Accept` header, which is how the API guide documents it:

```
curl -H 'Accept: application/vnd.sdmx.data+json' \
     -H 'User-Agent: BTS-platform/1.0 (economic-indicators)' \
     'https://data.api.abs.gov.au/rest/data/ABS,CPI,2.0.0/<key>?startPeriod=2024-01-01'
```

> The adapter still adds `?format=jsondata`, which the current API guide does
> not document. Note whether the first live run returns valid SDMX-JSON; either
> way the parameter comes out afterwards, so the request matches the documented
> interface.

Hand it to me and I will do this part.

-----

## Now the OECD row

Same sequence, with one difference at step 4: it fails before it reaches the
network, so there is no response body to read. You will see:

```
AU Bus. Confidence (not_found: Indicator AU Bus. Confidence has OECD dataflow
"DSD_STES@DF_CLI", which names no agency. The ref must be
"{agency},{dataflow},{version}/{dataKey}" — e.g.
"OECD.SDD.STES,DSD_STES@DF_CLI,/AUS.M.BCICP...AA".
```

OECD addresses a dataflow by three parts — who publishes it, which dataflow, and
which version — where ABS needs only the dataflow. The seeded ref has the middle
part and the data key but not the agency, and a wrong agency returns a 404 that
looks exactly like a missing series, which is why the adapter refuses rather than
attempting one.

Find the correct agency at <https://data-explorer.oecd.org> — select the
business confidence series for Australia, open the developer or API panel, and
read the full dataflow reference from the query it shows. Then write it into the
ref with a migration as in step 5:

```sql
update economic_indicators
set provider_table_ref = 'OECD.SDD.STES,DSD_STES@DF_CLI,/AUS.M.BCICP...AA',
    is_active          = true
where short_label = 'AU Bus. Confidence';
```

-----

## If you want to stop

Turning a row back off is one statement, and it takes effect on the next poll:

```sql
update economic_indicators set is_active = false where short_label = 'AU CPI';
```

To also discard anything it wrote:

```sql
delete from indicator_observations
where indicator_id = (select id from economic_indicators where short_label = 'AU CPI');
```

Nothing else references those rows, so there is nothing to clean up afterwards.

-----

## The general case

Nothing above is specific to these two beyond the dataflow ids. Any seeded
indicator activates the same way — including the six rows seeded by
`20261023044700_seed_au_indicator_expansion.sql`. The RBA ones differ at step 4: AU Credit (`D2`)
and AU Commodity Prices (`I2`) carry no column matcher yet, so they fail with
`No column matcher for RBA table` until a Series ID read from the live CSV is
written into the ref as `D2:<series id>`. AU 10Y (`F2:FCMYGBAG10D`) fails with
`column "…" not found` only if that guess is wrong. The
general loop: turn it on, run the poll, read `failed` in the
newest `agent_activity` row, correct the ref in a migration, run it again, then
check the periods and spot-check the newest figure against the provider.

The step people skip is the last one. A wrong series parses cleanly and writes a
confident wrong number, and no test can catch that — only someone comparing it
to the provider's own page.
