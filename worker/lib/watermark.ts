/**
 * Injects a small, unobtrusive watermark bar (URL, user email, timestamp)
 * into the page before it's screenshotted, so exported snapshots are
 * traceable to who requested them, from where, and when.
 *
 * Implementation notes:
 * - Appended directly to `document.body` with `position: absolute; bottom: 0`
 *   (not `fixed`) and no positioned ancestor assumed, so it anchors to the
 *   bottom of the full page's content box rather than the visible viewport.
 *   This means it renders once, in the correct place, in Puppeteer's
 *   `fullPage` screenshots — `position: fixed` elements are prone to being
 *   duplicated/stretched across full-page screenshots.
 * - Kept short, semi-transparent, and pinned to a thin strip at the very
 *   bottom edge so it never covers meaningful page content.
 */
export async function injectWatermark(
  page: { evaluate: (fn: (text: string) => void, arg: string) => Promise<unknown> },
  text: string
): Promise<void> {
  await page.evaluate((watermarkText: string) => {
    const WATERMARK_ID = "__link_checker_watermark__";
    document.getElementById(WATERMARK_ID)?.remove();

    const el = document.createElement("div");
    el.id = WATERMARK_ID;
    el.textContent = watermarkText;
    Object.assign(el.style, {
      position: "absolute",
      left: "0",
      bottom: "0",
      width: "100%",
      boxSizing: "border-box",
      margin: "0",
      padding: "4px 10px",
      background: "rgba(191, 219, 254, 0.92)", // light blue (Tailwind blue-200), high visibility
      color: "#1e3a8a", // blue-900, strong contrast against the light blue bar
      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      fontSize: "12px",
      fontWeight: "600",
      lineHeight: "1.4",
      letterSpacing: "0.01em",
      borderTop: "1px solid rgba(30, 58, 138, 0.35)",
      zIndex: "2147483647",
      pointerEvents: "none",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    } satisfies Partial<CSSStyleDeclaration>);

    document.body.appendChild(el);
  }, text);
}

export function buildWatermarkText(url: string, userEmail: string, timestampMs: number): string {
  return `${url}  •  ${userEmail}  •  ${new Date(timestampMs).toISOString()}`;
}

/** Removes the injected watermark, e.g. before capturing a clean raw-HTML export. */
export async function removeWatermark(page: {
  evaluate: (fn: () => void) => Promise<unknown>;
}): Promise<void> {
  await page.evaluate(() => {
    document.getElementById("__link_checker_watermark__")?.remove();
  });
}
