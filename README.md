# Link_checker

Paste a URL, get its links checked (HTTP status), and see mobile/desktop
snapshots — powered entirely by Cloudflare (Workers, D1, R2, Queues, Browser
Rendering, Access).

Single Cloudflare Worker serves both the React dashboard (Workers Static
Assets) and the JSON API — one `wrangler deploy` ships the whole app.

## Stack

- **Worker + API**: Hono (`worker/index.ts`, `worker/routes/*`)
- **Frontend**: React + Vite + Tailwind (`src/`), built and served as static
  assets by the same Worker
- **DB**: D1 (`link_checker_db`) — see `migrations/`
- **Storage**: R2 (`link-checker-snapshots`)
- **Async jobs**: Queues (`link-checker-jobs`), consumed in `worker/index.ts`
- **Rendering**: Browser Rendering (`@cloudflare/puppeteer`) in
  `worker/lib/runJob.ts`
- **Auth**: Cloudflare Access (see below)
- **Retention**: Cron Trigger (daily) purges jobs/snapshots older than 90 days

## 1. Install

```bash
npm install
```

## 2. Provision Cloudflare resources (one-time)

```bash
npx wrangler login

npx wrangler d1 create link_checker_db
# copy the returned database_id into wrangler.jsonc -> d1_databases[0].database_id

npx wrangler r2 bucket create link-checker-snapshots

npx wrangler queues create link-checker-jobs

# Apply the D1 schema
npm run db:migrate:remote
```

Also enable **Browser Rendering** for your account in the Cloudflare
dashboard if not already enabled (Workers & Pages → Browser Rendering).

## 3. Local development

```bash
cp .dev.vars.example .dev.vars   # optional, only needed once Access is configured
npm run db:migrate:local
npm run dev
```

This starts a single Vite dev server (frontend + Worker via
`@cloudflare/vite-plugin`) at `http://localhost:5173`. Local dev auto-logs in
as `dev@local.test` (`DEV_BYPASS_AUTH=true` in `wrangler.jsonc`) so you don't
need Access configured to develop.

> Browser Rendering does **not** work in pure local simulation. If a job stays
> `queued`/errors locally, that's expected — verify the render pipeline by
> deploying (`npm run deploy`) or using `wrangler dev --remote`.

## 4. Deploy (MVP)

```bash
npm run deploy
```

This runs `vite build` then `wrangler deploy`. The Worker will be live at
`https://link-checker.<your-subdomain>.workers.dev`.

## 5. Secure it with Cloudflare Access (before sharing with real users)

1. In Zero Trust dashboard → Access → Applications → **Add an application** →
   Self-hosted, pointing at your Worker's domain (workers.dev URL or a custom
   domain routed to this Worker).
2. Add a policy allowing your team's emails/domain.
3. Set `ACCESS_TEAM_DOMAIN` (e.g. `https://your-team.cloudflareaccess.com`)
   and `ACCESS_AUD` (the Application Audience Tag, shown in the app's
   overview page) as Worker vars/secrets, and set `DEV_BYPASS_AUTH` to
   `"false"` in `wrangler.jsonc` for the deployed environment.

```bash
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
```

Without this step, the app is **unauthenticated** in production (fine for a
quick personal MVP, not for sharing).

## 6. Push to GitHub (for the team)

```bash
git init
git add -A
git commit -m "Initial Link_checker MVP"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

`.dev.vars`, `node_modules/`, `dist/`, and `.wrangler/` are already
gitignored. `wrangler.jsonc` (with resource names/IDs) is committed — replace
`REPLACE_WITH_D1_DATABASE_ID` with your real D1 database id before pushing,
or have each teammate use their own `.dev.vars`/environment.

## Known MVP simplifications (see PLAN.md for full spec)

- Root-domain grouping in `worker/lib/domain.ts` is a lightweight heuristic,
  not a full Public Suffix List — swap in `tldts`/`psl` if exact multi-part
  TLD handling matters.
- Queue consumer runs one job per invocation (`max_batch_size: 1`); tune in
  `wrangler.jsonc` once you understand your Browser Rendering concurrency
  limits (see Cloudflare dashboard for your plan's limits).
