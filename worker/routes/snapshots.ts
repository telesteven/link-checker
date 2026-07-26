import { Hono } from "hono";
import type { Env, JobRow } from "../types";
import { requireUser } from "../lib/access";

const VARIANT_KEY_COLUMN: Record<string, keyof JobRow> = {
  "desktop-png": "snapshot_desktop_png_key",
  "mobile-png": "snapshot_mobile_png_key",
  pdf: "snapshot_pdf_key",
  html: "snapshot_html_key",
};

const VARIANT_CONTENT_TYPE: Record<string, string> = {
  "desktop-png": "image/png",
  "mobile-png": "image/png",
  pdf: "application/pdf",
  html: "text/html; charset=utf-8",
};

export const snapshotsRoute = new Hono<{ Bindings: Env }>();

snapshotsRoute.get("/:id/:variant", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);

  const { id, variant } = c.req.param();
  const column = VARIANT_KEY_COLUMN[variant];
  if (!column) return c.json({ error: "invalid_variant" }, 400);

  const job = await c.env.DB.prepare("SELECT * FROM jobs WHERE id = ?1 AND user_email = ?2")
    .bind(id, userEmail)
    .first<JobRow>();
  if (!job) return c.json({ error: "not_found" }, 404);

  const key = job[column] as string | null;
  if (!key) return c.json({ error: "not_found" }, 404);

  const object = await c.env.SNAPSHOTS.get(key);
  if (!object) return c.json({ error: "not_found" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": VARIANT_CONTENT_TYPE[variant] ?? "application/octet-stream",
      // Keys are unique per job run (URL folder + ISO timestamp), so content
      // at a given URL never changes — safe to cache long-term.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
