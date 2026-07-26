# Link_checker

Paste a URL, get its links checked (HTTP status), and see mobile/desktop
snapshots — powered entirely by Cloudflare (Workers, D1, R2, Queues, Browser
Rendering, Access).

Single Cloudflare Worker serves both the React dashboard (Workers Static
Assets) and the JSON API. **Deployment is handled by Cloudflare Workers
Builds** (Git integration): push to `main` on GitHub and Cloudflare builds +
deploys automatically — no local `wrangler deploy`.

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

## Environment variables & secrets checklist

Since deploys run inside Cloudflare (via Workers Builds), you do **not** need
a `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` locally or in GitHub — the
Cloudflare GitHub App authenticates builds for you. Only these remain:

| Name | Type | Where | Required for | Notes |
|---|---|---|---|---|
| `database_id` | config value | `wrangler.jsonc` → `d1_databases[0]` | deploy | Output of `wrangler d1 create link_checker_db`. Placeholder: `REPLACE_WITH_D1_DATABASE_ID`. Commit the real value so Workers Builds picks it up. |
| `ACCESS_TEAM_DOMAIN` | Worker secret | Dashboard → Worker → Settings → Variables and Secrets (or `wrangler secret put`) | production auth | e.g. `https://your-team.cloudflareaccess.com`. See step 5. |
| `ACCESS_AUD` | Worker secret | Dashboard → Worker → Settings → Variables and Secrets (or `wrangler secret put`) | production auth | Application Audience (AUD) tag from the Access application. See step 5. |
| `DEV_BYPASS_AUTH` | Worker var (already set) | `wrangler.jsonc` → `vars` | local dev only | Already `"true"`; flip to `"false"` in `wrangler.jsonc` before merging to `main` once Access is wired up. |

Local-only (never commit): copy `.dev.vars.example` to `.dev.vars` if you
want to test real Access JWTs locally instead of the dev bypass.

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
> `queued`/errors locally, that's expected — verify the render pipeline once
> deployed, or use `wrangler dev --remote`.

## 4. Push to GitHub

```bash
git add -A
git commit -m "Your change"
git push
```

`.dev.vars`, `node_modules/`, `dist/`, and `.wrangler/` are gitignored.
`wrangler.jsonc` (with resource names/IDs) is committed — make sure
`database_id` is the real value (not the placeholder) before pushing.

## 5. Connect the repo to Cloudflare Workers Builds (deploy on push)

1. Cloudflare dashboard → **Workers & Pages** → select this Worker (or
   **Create application** → **Connect to Git** if it doesn't exist yet) →
   **Settings** → **Builds** → **Connect**.
2. Authorize the **Cloudflare Workers and Pages** GitHub App for this repo.
3. Configure the trigger:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy` (default)
   - **Branch**: `main` → production
4. Push a commit (or click **Retry**) to trigger the first build. Future
   pushes to `main` deploy automatically; other branches/PRs get a preview
   deployment (`wrangler versions upload`).

No local `wrangler deploy` or CI secrets needed — Cloudflare builds and
deploys directly from GitHub.

## 6. Secure it with Cloudflare Access (before sharing with real users)

1. In Zero Trust dashboard → Access → Applications → **Add an application** →
   Self-hosted, pointing at your Worker's domain (workers.dev URL or a custom
   domain routed to this Worker).
2. Add a policy allowing your team's emails/domain.
3. Set `ACCESS_TEAM_DOMAIN` (e.g. `https://your-team.cloudflareaccess.com`)
   and `ACCESS_AUD` (the Application Audience Tag, shown in the app's
   overview page) as Worker vars/secrets, and set `DEV_BYPASS_AUTH` to
   `"false"` in `wrangler.jsonc` for the deployed environment.

Set secrets either via the dashboard (Settings → Variables and Secrets) or:

```bash
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
```

Without this step, the app is **unauthenticated** in production (fine for a
quick personal MVP, not for sharing).

## Known MVP simplifications (see PLAN.md for full spec)

- Root-domain grouping in `worker/lib/domain.ts` is a lightweight heuristic,
  not a full Public Suffix List — swap in `tldts`/`psl` if exact multi-part
  TLD handling matters.
- Queue consumer runs one job per invocation (`max_batch_size: 1`); tune in
  `wrangler.jsonc` once you understand your Browser Rendering concurrency
  limits (see Cloudflare dashboard for your plan's limits).
