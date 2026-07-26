// Lightweight best-effort registrable-domain extraction (no full PSL dependency,
// keeps the Worker bundle small). Good enough for grouping links by domain in
// the MVP; swap in `tldts`/`psl` later if exact multi-part TLD handling
// (e.g. co.uk) matters for your use case.
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "co.jp", "com.au", "com.br", "co.nz",
  "co.in", "com.cn", "co.za", "com.sg",
]);

export function rootDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;

  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

export function isInternalLink(linkUrl: string, sourceUrl: string): boolean {
  try {
    const linkHost = new URL(linkUrl).hostname.toLowerCase().replace(/^www\./, "");
    const sourceHost = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
    return linkHost === sourceHost;
  } catch {
    return false;
  }
}

export function isSafeFetchTarget(rawUrl: string): { ok: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Only http/https URLs are allowed" };
  }
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host.endsWith(".local")
  ) {
    return { ok: false, reason: "Private/internal addresses are not allowed" };
  }
  return { ok: true };
}
