# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Security

- **Removed `DEV_BYPASS_AUTH`**: dropped the dev-auth fallback in
  `worker/lib/access.ts` (and the corresponding `Env` field, `wrangler.jsonc`
  var, and README/`.dev.vars.example` docs). Requests without valid
  `Cf-Access-*` headers now always get `401 unauthorized` — no bypass
  identity, in dev or prod.

### Added

- **User email + logout in header**: `src/App.tsx` now fetches the signed-in
  user via `GET /api/me` and shows their email plus a "Log out" link
  (`/cdn-cgi/access/logout`, the standard Cloudflare Access app-logout path)
  in the top-right of the header.
- **Light/dark theme toggle**: new `src/useTheme.ts` hook manages theme
  state (persisted in `localStorage`, falls back to
  `prefers-color-scheme`), toggled via a sun/moon button in the header.
  Enabled `darkMode: "class"` in `tailwind.config.js` and added `dark:`
  variants across `App.tsx`, `JobForm.tsx`, `JobList.tsx`, and
  `JobDetail.tsx` (backgrounds, borders, text, status badges, table rows,
  inputs) so all existing UI remains readable/contrast-appropriate in dark
  mode.

- **Snapshot watermark**: desktop/mobile PNG and PDF snapshots now include a
  thin watermark bar at the bottom of the page showing the source URL,
  requesting user's email, and ISO timestamp of the run
  (`worker/lib/watermark.ts`). Injected as a DOM overlay before capture so it
  doesn't alter layout; positioned at the true bottom of the full page
  (not viewport-fixed) so it renders once, correctly, in `fullPage`
  screenshots. The raw HTML export (`page.html`) has the watermark stripped
  before capture so it stays a clean copy of the actual page source.
  Styled as a light-blue bar (`#bfdbfe` background, `#1e3a8a` text) for
  visibility against most page backgrounds — the initial dark/translucent
  styling was too low-contrast to notice.
- **Watermark redesign**: replaced the single bottom bar with a tiled,
  diagonal (45deg, top-left-to-bottom-right) repeating pattern covering the
  full page — long pages now get multiple repeats instead of just one.
  Doubled font size (12px → 24px); grey, no-fill text with a light-blue
  dotted border instead of a solid light-blue bar. Also fixed the watermark
  not appearing on mobile snapshots: it's now re-injected after every
  `page.setViewport()` call (and again before PDF capture), since some
  sites reflow/rerender on resize and silently drop a one-time injection.
- **Watermark toned down**: the 24px dense tiled grid was too disruptive.
  Halved font size to 12px, lightened text to a low-opacity slate grey, and
  widened tile spacing so an A4-sized page (~794×1123 CSS px) gets roughly
  2 repeats instead of a dense grid.

### Fixed

- **Raw HTML export (`page.html`) was broken/unstyled when viewed** — icons
  rendered huge and layout was misaligned. Root cause: sites commonly use
  root-relative or relative URLs for CSS/fonts/images (e.g.
  `/_astro/fonts/x.woff2`); those resolve fine on the live page, but once
  the serialized HTML is viewed from our own domain, they 404, breaking all
  styling and leaving unstyled elements/icons at intrinsic (often huge)
  sizes. Fixed by injecting a `<base href="{original url}">` tag before
  calling `page.content()`, so relative resources keep resolving back to
  the source site (`worker/lib/runJob.ts`).
- **Snapshot links showed the SPA shell instead of the image**: full-page
  navigations (e.g. clicking a snapshot link, opening it in a new tab) send
  `Sec-Fetch-Mode: navigate`, which Workers Static Assets' SPA fallback
  (`not_found_handling: "single-page-application"`) intercepts and serves
  `index.html` for — never reaching the Worker's `/api/*` routes. `<img>`
  previews worked because image loads don't carry that header. Fixed by
  adding `assets.run_worker_first: ["/api/*"]` in `wrangler.jsonc` so all
  `/api/*` requests always hit the Worker first, regardless of navigation
  type.
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
