// Bounded-concurrency HTTP status check for a list of links.
// HEAD first, GET fallback on 405/501, treats network errors/timeouts as null.
export async function checkLinkStatuses(
  urls: string[],
  concurrency = 8,
  timeoutMs = 8000
): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const i = index++;
      const url = urls[i];
      results.set(url, await checkOne(url, timeoutMs));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker())
  );

  return results;
}

async function checkOne(url: string, timeoutMs: number): Promise<number | null> {
  const status = await tryFetch(url, "HEAD", timeoutMs);
  if (status === 405 || status === 501) {
    return await tryFetch(url, "GET", timeoutMs);
  }
  return status;
}

async function tryFetch(url: string, method: "HEAD" | "GET", timeoutMs: number): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Link_checker/1.0 (+https://workers.dev)" },
    });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
