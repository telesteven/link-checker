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

    // Shrunk back down (half of the previous 24px) and spaced out so an
    // A4-sized page (~794 x 1123 CSS px) gets roughly 2 repeats, not a dense
    // grid — the tiled version at 24px/tight spacing was too disruptive.
    const fontSizePx = 12;
    const stepX = 820;
    const stepY = 560;

    for (let y = 0; y < pageHeight + stepY; y += stepY) {
      for (let x = 0; x < pageWidth + stepX; x += stepX) {
        const tile = document.createElement("div");
        tile.textContent = watermarkText;
        Object.assign(tile.style, {
          position: "absolute",
          top: `${y}px`,
          left: `${x}px`,
          transform: "translate(-50%, -50%) rotate(45deg)",
          padding: "3px 8px",
          border: "1px dotted rgba(96, 165, 250, 0.55)", // light blue (Tailwind blue-400), softened
          borderRadius: "3px",
          background: "transparent", // no fill, outline only
          color: "rgba(148, 163, 184, 0.45)", // much lighter grey (Tailwind slate-400, low opacity)
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: `${fontSizePx}px`,
          fontWeight: "500",
          whiteSpace: "nowrap",
        } satisfies Partial<CSSStyleDeclaration>);
        container.appendChild(tile);
      }
    }

    document.body.appendChild(container);
  }, text);
}

export function buildWatermarkText(url: string, userEmail: string, timestampMs: number): string {
  // Replace '@' so macOS Preview/Quick Look doesn't auto-linkify this as a
  // mailto: link (which was prompting Mail.app to open when viewing the PDF).
  const safeEmail = userEmail.replace(/@/g, "#");
  return `${url}  •  ${safeEmail}  •  ${new Date(timestampMs).toISOString()}`;
}

/** Removes the injected watermark, e.g. before capturing a clean raw-HTML export. */
export async function removeWatermark(page: {
  evaluate: (fn: () => void) => Promise<unknown>;
}): Promise<void> {
  await page.evaluate(() => {
    document.getElementById("__link_checker_watermark__")?.remove();
  });
}
