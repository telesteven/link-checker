/**
 * Injects a tiled, diagonal watermark (URL, user email, timestamp) across the
 * whole page before it's screenshotted, so exported snapshots are traceable
 * to who requested them, from where, and when.
 *
 * Implementation notes:
 * - Tiles are laid out in a grid covering the full scrollable page (not just
 *   the viewport), so long pages get multiple repeats of the watermark
 *   rather than just one at the top or bottom.
 * - Each tile is rotated 45deg (top-left -> bottom-right diagonal), styled
 *   as outlined-only text (grey, transparent fill) with a light-blue dotted
 *   border, so it reads clearly without blocking underlying content.
 * - Call this again after every `page.setViewport(...)` (and again before
 *   `page.pdf()`), not just once — many sites reflow/rerender on resize,
 *   which can silently drop a one-time injection (this was the mobile bug:
 *   the watermark injected for desktop was gone after switching to the
 *   mobile viewport). Re-injecting also lets tile coverage match each
 *   viewport's own (often much taller, for mobile) document height.
 */
export async function injectWatermark(
  page: { evaluate: (fn: (text: string) => void, arg: string) => Promise<unknown> },
  text: string
): Promise<void> {
  await page.evaluate((watermarkText: string) => {
    const CONTAINER_ID = "__link_checker_watermark__";
    document.getElementById(CONTAINER_ID)?.remove();

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    const pageWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const pageHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    Object.assign(container.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: `${pageWidth}px`,
      height: `${pageHeight}px`,
      overflow: "visible",
      pointerEvents: "none",
      zIndex: "2147483647",
    } satisfies Partial<CSSStyleDeclaration>);

    // Doubled from the original single-line bar's ~12px baseline.
    const fontSizePx = 24;
    const stepX = 380;
    const stepY = 260;

    for (let y = 0; y < pageHeight + stepY; y += stepY) {
      for (let x = 0; x < pageWidth + stepX; x += stepX) {
        const tile = document.createElement("div");
        tile.textContent = watermarkText;
        Object.assign(tile.style, {
          position: "absolute",
          top: `${y}px`,
          left: `${x}px`,
          transform: "translate(-50%, -50%) rotate(45deg)",
          padding: "6px 14px",
          border: "1.5px dotted #60a5fa", // light blue (Tailwind blue-400)
          borderRadius: "4px",
          background: "transparent", // no fill, outline only
          color: "rgba(107, 114, 128, 0.8)", // grey (Tailwind gray-500)
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: `${fontSizePx}px`,
          fontWeight: "600",
          whiteSpace: "nowrap",
        } satisfies Partial<CSSStyleDeclaration>);
        container.appendChild(tile);
      }
    }

    document.body.appendChild(container);
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
