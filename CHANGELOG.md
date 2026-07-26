# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed

- **Stale snapshot bug**: R2 keys for snapshots were static per job ID
  (`snapshots/{jobId}/desktop.png`), so retrying a job overwrote the same
  key while the browser/edge cache (`max-age=3600`) kept serving the old
  image — clicking a snapshot could show stale content. Fixed by giving
  every job run a unique, timestamped key (see below), so the cache
  collision can no longer happen.

### Added

- `worker/lib/snapshotKey.ts`: builds organized R2 keys as
  `snapshots/<normalized-url>/<ISO-timestamp>-<file>`, grouping all runs of
  the same URL together while keeping each run's files unique.

### Changed

- Snapshot `Cache-Control` bumped to `private, max-age=31536000, immutable`
  now that keys are content-unique per run.

- **Deployment model switched to Cloudflare Workers Builds (Git integration).**
  Pushing to `main` on GitHub now triggers Cloudflare to build
  (`npm run build`) and deploy (`npx wrangler deploy`) automatically —
  no local `wrangler deploy` needed.
- README restructured: "Push to GitHub" now comes before "Connect to
  Cloudflare Workers Builds"; local deploy instructions replaced with the
  Git integration setup steps.

### Removed

- `deploy` script from `package.json` (`vite build && wrangler deploy`) —
  unused now that Cloudflare runs the build/deploy commands itself.
- `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` from the required
  environment variables list — the Cloudflare GitHub App authenticates
  builds, so no local or CI secrets are needed for deployment.

## 2026-07-26 — Initial MVP

### Added

- Single Cloudflare Worker (Hono) serving both the JSON API and the React
  dashboard via Workers Static Assets (`@cloudflare/vite-plugin`).
- Job pipeline: submit a URL → Queue → Browser Rendering (`@cloudflare/puppeteer`)
  captures desktop/mobile PNG snapshots (+ optional PDF/HTML) and extracts
  all links, checked concurrently for HTTP status.
- D1 schema (`migrations/0001_init.sql`) for jobs and links.
- R2 storage for snapshots, served via `/api/snapshots/:id/:variant`.
- Links table with filter/sort (internal/external, status, domain, URL) and
  CSV export (`/api/jobs/:id/links.csv`).
- Per-user quota (10 jobs), recent-duplicate reuse window, retry and delete
  endpoints.
- Daily Cron Trigger purging jobs/snapshots older than 90 days.
- Cloudflare Access-based auth (`Cf-Access-Authenticated-User-Email` +
  optional JWT verification via `jose`), with a `DEV_BYPASS_AUTH` local dev
  fallback.
- React + Vite + Tailwind dashboard: job submission form, job list, job
  detail with snapshot previews and links table.
- Initial GitHub repository created and pushed (`telesteven/link-checker`).
