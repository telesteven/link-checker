import puppeteer from "@cloudflare/puppeteer";
import type { Env, JobMessage } from "../types";
import { isInternalLink, isSafeFetchTarget, rootDomain } from "./domain";
import { checkLinkStatuses } from "./linkStatus";
import { buildSnapshotKey } from "./snapshotKey";
import { buildWatermarkText, injectWatermark, removeWatermark } from "./watermark";

interface RawLink {
  href: string;
  text: string;
}

export async function runJob(env: Env, msg: JobMessage): Promise<void> {
  const now = () => Date.now();
  const safety = isSafeFetchTarget(msg.url);
  if (!safety.ok) {
    await failJob(env, msg.jobId, "invalid_url", safety.reason ?? "URL rejected");
    return;
  }

  await env.DB.prepare(
    "UPDATE jobs SET status = 'running', updated_at = ?1 WHERE id = ?2"
  ).bind(now(), msg.jobId).run();

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);

    await page.goto(msg.url, { waitUntil: "load", timeout: 30000 });

    const rawLinks: RawLink[] = await page.$$eval("a[href]", (anchors: HTMLAnchorElement[]) =>
      anchors.map((a) => ({ href: a.href, text: (a.innerText || "").trim() }))
    );

    const dedup = new Map<string, string>();
    for (const l of rawLinks) {
      if (!l.href) continue;
      if (!dedup.has(l.href)) dedup.set(l.href, l.text);
    }

    const uniqueHrefs = Array.from(dedup.keys());
    const statuses = await checkLinkStatuses(uniqueHrefs);

    const runTimestamp = now();
    const watermarkText = buildWatermarkText(msg.url, msg.userEmail, runTimestamp);

    // Desktop snapshot (always) — watermarked. Inject *after* setting the
    // viewport, and again after the next setViewport call below — sites can
    // reflow/rerender on resize and silently drop a one-time injection.
    await page.setViewport({ width: 1280, height: 800 });
    await injectWatermark(page, watermarkText);
    const desktopPng = await page.screenshot({ fullPage: true, type: "png" });

    // Mobile snapshot (always) — watermarked
    await page.setViewport({ width: 375, height: 812, isMobile: true, deviceScaleFactor: 2 });
    await injectWatermark(page, watermarkText);
    const mobilePng = await page.screenshot({ fullPage: true, type: "png" });

    let pdfBuf: Uint8Array | null = null;
    let htmlStr: string | null = null;
    if (msg.formats.includes("pdf")) {
      // PDF is a visual snapshot too — keep the watermark. Re-inject since
      // the mobile viewport/resize above may have altered the page.
      await injectWatermark(page, watermarkText);
      pdfBuf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    }
    if (msg.formats.includes("html")) {
      // Raw HTML export should reflect the actual page source, not our overlay.
      await removeWatermark(page);
      htmlStr = await page.content();
    }

    await browser.close();
    browser = undefined;

    const desktopKey = buildSnapshotKey(msg.url, runTimestamp, "desktop.png");
    const mobileKey = buildSnapshotKey(msg.url, runTimestamp, "mobile.png");
    await env.SNAPSHOTS.put(desktopKey, desktopPng as unknown as ArrayBuffer, {
      httpMetadata: { contentType: "image/png" },
    });
    await env.SNAPSHOTS.put(mobileKey, mobilePng as unknown as ArrayBuffer, {
      httpMetadata: { contentType: "image/png" },
    });

    let pdfKey: string | null = null;
    let htmlKey: string | null = null;
    if (pdfBuf) {
      pdfKey = buildSnapshotKey(msg.url, runTimestamp, "page.pdf");
      await env.SNAPSHOTS.put(pdfKey, pdfBuf as unknown as ArrayBuffer, {
        httpMetadata: { contentType: "application/pdf" },
      });
    }
    if (htmlStr) {
      htmlKey = buildSnapshotKey(msg.url, runTimestamp, "page.html");
      await env.SNAPSHOTS.put(htmlKey, htmlStr, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
      });
    }

    const insertStmts = uniqueHrefs.map((href) =>
      env.DB.prepare(
        `INSERT INTO links (job_id, href, anchor_text, root_domain, is_internal, http_status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(
        msg.jobId,
        href,
        dedup.get(href) ?? null,
        safeRootDomain(href),
        isInternalLink(href, msg.url) ? 1 : 0,
        statuses.get(href) ?? null,
        now()
      )
    );
    if (insertStmts.length > 0) {
      await env.DB.batch(insertStmts);
    }

    await env.DB.prepare(
      `UPDATE jobs SET status = 'done', link_count = ?1,
        snapshot_desktop_png_key = ?2, snapshot_mobile_png_key = ?3,
        snapshot_pdf_key = ?4, snapshot_html_key = ?5, updated_at = ?6
       WHERE id = ?7`
    ).bind(
      uniqueHrefs.length,
      desktopKey,
      mobileKey,
      pdfKey,
      htmlKey,
      now(),
      msg.jobId
    ).run();
  } catch (err) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    await failJob(env, msg.jobId, "render_error", message);
  }
}

function safeRootDomain(href: string): string | null {
  try {
    return rootDomain(new URL(href).hostname);
  } catch {
    return null;
  }
}

async function failJob(env: Env, jobId: string, code: string, reason: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE jobs SET status = 'error', error_code = ?1, error_reason = ?2, updated_at = ?3 WHERE id = ?4`
  ).bind(code, reason, Date.now(), jobId).run();
}
