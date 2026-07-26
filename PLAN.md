# Link_checker — Build Plan

**Product name:** Link_checker

A serverless platform on Cloudflare. A user pastes a URL; the platform extracts all
links on that single page, captures snapshots (mobile + desktop), checks each link's
HTTP status, saves the link list to a database, and stores the snapshots in a bucket.
Users manage their jobs from a fancy React dashboard.

**Resource naming (for Devin):**
- Worker service: `link-checker`
- D1 database: `link_checker_db`
- R2 bucket: `link-checker-snapshots`
- Queue: `link-checker-jobs`
- Dashboard title/header: **Link_checker**

## 1. User story
1. User authenticates (Cloudflare Access) and lands on the dashboard.
2. User pastes a URL, optionally selects snapshot format(s), clicks **Analyze**.
3. Platform fetches the page, extracts **all links** (single page only, no crawl),
   HEAD-checks each link's HTTP status, and captures a **snapshot**.
4. Results appear: table of links (with HTTP status) + snapshot preview.
5. Link list is saved to the database; snapshot is stored in the bucket.

## 2. Cloudflare building blocks

| Concern | Cloudflare product |
|---|---|
| Dashboard UI | Cloudflare Pages (or Worker serving static assets) |
| API / backend logic | Workers |
| Rendering & snapshots | Browser Rendering API (Puppeteer) |
| Link list / job metadata | D1 (SQLite) |
| Snapshot storage | R2 (object storage) |
| Async job processing | Queues |
| Auth | **Cloudflare Access** |

## 3. Locked key decisions
1. **Crawl depth:** Single page only. Do NOT follow internal links.
2. **Snapshot format:** PNG is the default. User can additionally choose **PDF** and/or
   **HTML**. (Multiple formats may be selected per job.)
3. **Auth:** Cloudflare Access. Read the authenticated user's email from the
   `Cf-Access-Authenticated-User-Email` request header (verify the
   `Cf-Access-Jwt-Assertion` token server-side).
4. **Link validation:** For every discovered link, perform an HTTP status check and
   store the resulting status code. Also store each link's **root (registrable) domain**
   so the dashboard can group/categorize links by domain.
5. **Multi-tenancy:** `user_id` required. Capture and store the current user's email as
   the identity; scope all jobs/links to that user.
6. **Quota:** Cap **10 jobs per user** — interpreted as **10 retained jobs total**
   (DEFAULT, override if wrong). To run an 11th, the user must delete an old job. A
   `DELETE` endpoint frees quota.
7. **Retention:** Jobs and their R2 snapshots are retained **90 days**, then
   auto-expire (R2 lifecycle rule + scheduled cleanup of D1 rows).
8. **Dashboard updates:** **Polling** (dashboard polls job status every few seconds).
9. **Duplicate submissions:** If the same URL is submitted **> 2 minutes** after the
   previous submission of that URL, run a fresh job. If **within 2 minutes**, do not
   re-run — tell the user and reuse/return the most recent job for that URL.
10. **Link scope:** Only `<a href>` anchors count as links.
11. **HTTP status check method (DEFAULT, override if wrong):** `HEAD` first, fall back
    to `GET` on 405/501; check **all** links (internal and external).
12. **Snapshot serving (DEFAULT, override if wrong):** Worker streams the object from R2
    through the API, kept behind Cloudflare Access (no public/signed URLs).
13. **Deployment:** Target Cloudflare account is already logged in for Devin, with
    Browser Rendering enabled and Cloudflare Access configured.
14. **Dashboard stack:** **React** (Vite + React) with a polished, modern UI — clean
    layout, cards, subtle motion, responsive. Use a component/style kit (e.g. Tailwind
    + shadcn/ui or similar) for a "fancy" look.
15. **Links table UX:** Sortable columns; **group/categorize links by root (registrable)
    domain**; filter by HTTP status and internal/external; **CSV export** of the link
    list.
16. **Snapshot viewport:** Capture **both mobile (375×812) and desktop (1280×800)**
    views. PNG for each; PDF is print-styled (`@media print`) for clean printing; HTML
    is raw page source. Snapshot keys are namespaced by viewport (see data model).
17. **Error visibility:** On failure, surface the **HTTP/error code and human-readable
    reason** to the user, plus a **Retry** button that re-runs the job.

## 4. Architecture / flow

```
Browser (Pages dashboard)
   │  POST /api/jobs { url, formats }
   ▼
API Worker ──► verify Access JWT, read user email
   │        ──► enforce 10-job quota
   │        ──► insert job row in D1 (status=queued)
   │        ──► enqueue message on Queue
   │  202 { jobId }
   ▼
Queue Consumer Worker
   ├─ Browser Rendering: open URL (single page)
   ├─ Extract all <a href> links (normalize + dedupe)
   ├─ HEAD-check each link (GET fallback) → capture HTTP status
   ├─ PNG desktop 1280×800  ──► R2  snapshots/{jobId}/desktop.png
   ├─ PNG mobile  375×812   ──► R2  snapshots/{jobId}/mobile.png
   ├─ (if selected) PDF print-styled     ──► R2  snapshots/{jobId}/page.pdf
   ├─ (if selected) raw HTML             ──► R2  snapshots/{jobId}/page.html
   ├─ insert links into D1 (links table, with root_domain)
   └─ update job status=done, store R2 keys + link_count
   ▼
Dashboard polls GET /api/jobs/{id}
```

Heavy work runs in the Queue consumer, not in the request, keeping the dashboard
responsive and handling slow pages/timeouts gracefully.

## 5. Data model (D1)

```sql
CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,          -- uuid
  url          TEXT NOT NULL,
  status       TEXT NOT NULL,             -- queued | running | done | error
  error        TEXT,
  formats      TEXT NOT NULL,             -- json array of optional formats, e.g. ["pdf","html"]
  link_count   INTEGER DEFAULT 0,
  snapshot_desktop_png_key TEXT,          -- always captured
  snapshot_mobile_png_key  TEXT,          -- always captured
  snapshot_pdf_key         TEXT,          -- if selected
  snapshot_html_key        TEXT,          -- if selected
  error_code   TEXT,                       -- e.g. HTTP status or error class on failure
  error_reason TEXT,                       -- human-readable failure reason
  user_email   TEXT NOT NULL,            -- identity from Cloudflare Access
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_jobs_user ON jobs(user_email);
CREATE INDEX idx_jobs_user_url ON jobs(user_email, url);

CREATE TABLE links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES jobs(id),
  href        TEXT NOT NULL,
  anchor_text TEXT,
  root_domain TEXT,                       -- registrable domain, for grouping/sort
  is_internal INTEGER NOT NULL,          -- 0/1 relative to source host
  http_status INTEGER,                    -- from HEAD/GET check; NULL if unreachable
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_links_job ON links(job_id);
CREATE INDEX idx_links_job_domain ON links(job_id, root_domain);
```

## 6. API contract

- `POST /api/jobs` → body `{ "url": "https://...", "formats": ["png","pdf","html"] }`
  → `202 { "jobId": "..." }`.
  - Rejects with `409` if the user already has 10 retained jobs (quota).
  - If the same URL was submitted by this user **< 2 min** ago, returns `200
    { "jobId": <existing>, "reused": true, "message": "Reusing recent result" }`
    instead of starting a new job.
- `GET /api/jobs` → paginated list of the current user's jobs.
- `GET /api/jobs/{id}` → `{ id, url, status, formats, linkCount,
  snapshots:{desktopPng, mobilePng, pdf, html}, errorCode, errorReason, createdAt }`.
- `GET /api/jobs/{id}/links` → `{ links: [{ href, anchorText, rootDomain, isInternal,
  httpStatus }] }`. Supports `?sort=`, `?status=`, `?scope=internal|external`,
  `?groupBy=domain` query params.
- `GET /api/jobs/{id}/links.csv` → CSV export of the link list (Content-Disposition
  attachment).
- `GET /api/snapshots/{id}/{variant}` → streams the R2 object. `variant` ∈
  `desktop-png | mobile-png | pdf | html`.
- `POST /api/jobs/{id}/retry` → re-runs a failed (or any) job; re-enqueues the same URL
  and formats. Returns the (possibly same) jobId.
- `DELETE /api/jobs/{id}` → deletes job, its links, and its R2 objects (frees quota).

All endpoints require a valid Cloudflare Access identity and scope to `user_email`.

## 7. Core crawl logic (consumer pseudocode)

```js
const browser = await puppeteer.launch(env.BROWSER);
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

const links = await page.$$eval("a[href]", (as) =>
  as.map(a => ({ href: a.href, text: a.innerText.trim() }))
);

// normalize + dedupe; classify internal/external vs source host
// derive root_domain (registrable domain, e.g. via PSL) for grouping
// HEAD-check each unique link (GET fallback on 405/501) for http_status
//   with bounded concurrency

// Desktop capture (always)
await page.setViewport({ width: 1280, height: 800 });
const desktopPng = await page.screenshot({ fullPage: true, type: "png" });

// Mobile capture (always)
await page.setViewport({ width: 375, height: 812, isMobile: true, deviceScaleFactor: 2 });
const mobilePng = await page.screenshot({ fullPage: true, type: "png" });

if (formats.includes("pdf"))  pdfBuf  = await page.pdf({ printBackground: true, preferCSSPageSize: true });
if (formats.includes("html")) htmlStr = await page.content();
await browser.close();

// R2 put artifacts; D1 batch insert links (with root_domain); update job
// On any failure: set status=error, error_code, error_reason
```

## 8. Guardrails
- Cloudflare Access on all routes; verify JWT server-side, derive `user_email`.
- Enforce 10-job quota per user in `POST /api/jobs`.
- Validate/normalize input URL; reject non-http(s), private IPs, `localhost` (SSRF).
- Bounded concurrency for HEAD checks; timeout + treat failures as NULL status.
- Rendering timeouts; mark job `error` on failure. Queue retry with max-attempts cap.
- Sanitize anchor text before rendering in the dashboard (XSS).
- Retention: R2 lifecycle rule expires snapshots at 90 days; a scheduled (Cron Trigger)
  Worker deletes D1 rows for jobs older than 90 days.
- Duplicate guard: before enqueuing, check for a same-URL job by this user within the
  last 2 minutes and short-circuit to reuse it.

### Exact queries & cron (reference implementation)

Quota check (reject when 10 retained), in `POST /api/jobs`:
```sql
SELECT COUNT(*) AS n FROM jobs WHERE user_email = ?1;
-- if n >= 10 → respond 409 { error: "quota_exceeded" }
```

Duplicate-reuse guard (2-minute window), in `POST /api/jobs` before insert
(`?2` = now epoch ms, 120000 = 2 min):
```sql
SELECT id FROM jobs
WHERE user_email = ?1 AND url = ?url
  AND created_at >= (?2 - 120000)
ORDER BY created_at DESC
LIMIT 1;
-- if a row exists → respond 200 { jobId: <id>, reused: true }
```

90-day retention. R2: apply a bucket lifecycle rule expiring objects under
`snapshots/` after 90 days. D1: a **Cron Trigger** Worker (schedule `0 3 * * *`,
daily 03:00 UTC) runs:
```sql
-- delete links belonging to expired jobs first (FK-safe)
DELETE FROM links WHERE job_id IN (
  SELECT id FROM jobs WHERE created_at < (?now - 7776000000)  -- 90 days in ms
);
DELETE FROM jobs WHERE created_at < (?now - 7776000000);
```
The same cron should also `env.BUCKET.delete(keys)` for any snapshot keys of the
deleted jobs (belt-and-suspenders in case the R2 lifecycle rule is not yet applied).

## 9. Build order (milestones = Devin tasks)
1. Scaffold: wrangler project, Pages dashboard shell, D1 + R2 + Queue + Browser
   Rendering bindings in `wrangler.toml`; apply D1 schema.
2. Access integration: verify JWT, expose current user email to API + dashboard.
3. `POST /api/jobs` + quota enforcement + enqueue.
4. Queue consumer: extract links + HEAD-check statuses → D1.
5. Add snapshots (PNG default; PDF/HTML optional) → R2 + snapshot serving endpoints.
6. Dashboard (React, fancy): submit form (with format checkboxes), job list, job detail
   with links table (sortable, grouped by root domain, status/scope filters, CSV
   export), dual-viewport snapshot preview (mobile + desktop) + PDF/HTML download,
   delete, and a Retry button on failed jobs showing error code + reason.
7. Polish: error handling, retries, SSRF guardrails, pagination, 90-day cleanup cron.
