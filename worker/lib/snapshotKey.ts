/**
 * Builds organized, collision-free R2 keys for snapshots:
 *   snapshots/<normalized-url>/<ISO-timestamp>-<filename>
 *
 * Namespacing by normalized URL groups all runs of the same page together,
 * and the per-run ISO timestamp guarantees each job run (including retries)
 * gets a brand-new key — so browser/edge caching never serves a stale
 * snapshot from a previous run.
 */
export function normalizeUrlForKey(rawUrl: string): string {
  let host = "unknown-host";
  let path = "";
  try {
    const u = new URL(rawUrl);
    host = u.hostname.toLowerCase();
    path = u.pathname;
  } catch {
    path = rawUrl;
  }
  const combined = `${host}${path}`
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\/{2,}/g, "/");
  return combined || "unknown-url";
}

export function isoTimestampForKey(ms: number): string {
  // Colons/dots aren't ideal in object keys/URLs, but keep it recognizably ISO 8601.
  return new Date(ms).toISOString().replace(/[:.]/g, "-");
}

export function buildSnapshotKey(url: string, runTimestampMs: number, filename: string): string {
  const folder = normalizeUrlForKey(url);
  const ts = isoTimestampForKey(runTimestampMs);
  return `snapshots/${folder}/${ts}-${filename}`;
}
