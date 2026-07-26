import { Hono } from "hono";
import type { Env, JobRow } from "../types";
import { requireUser } from "../lib/access";
import { isSafeFetchTarget } from "../lib/domain";

const QUOTA = 10;
const DUP_WINDOW_MS = 2 * 60 * 1000;

export const jobsRoute = new Hono<{ Bindings: Env }>();

jobsRoute.post("/", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);

  const body = await c.req.json<{ url?: string; formats?: string[] }>().catch(() => null);
  if (!body?.url) return c.json({ error: "url is required" }, 400);

  const safety = isSafeFetchTarget(body.url);
  if (!safety.ok) return c.json({ error: safety.reason }, 400);

  const formats = Array.from(new Set(["png", ...(body.formats ?? [])])).filter((f) =>
    ["png", "pdf", "html"].includes(f)
  );

  const now = Date.now();

  const dup = await c.env.DB.prepare(
    `SELECT id FROM jobs WHERE user_email = ?1 AND url = ?2 AND created_at >= ?3
     ORDER BY created_at DESC LIMIT 1`
  ).bind(userEmail, body.url, now - DUP_WINDOW_MS).first<{ id: string }>();

  if (dup) {
    return c.json({ jobId: dup.id, reused: true, message: "Reusing recent result" });
  }

  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM jobs WHERE user_email = ?1"
  ).bind(userEmail).first<{ n: number }>();

  if ((countRow?.n ?? 0) >= QUOTA) {
    return c.json({ error: "quota_exceeded" }, 409);
  }

  const jobId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO jobs (id, url, status, formats, user_email, created_at, updated_at)
     VALUES (?1, ?2, 'queued', ?3, ?4, ?5, ?5)`
  ).bind(jobId, body.url, JSON.stringify(formats), userEmail, now).run();

  await c.env.JOB_QUEUE.send({ jobId, url: body.url, formats, userEmail });

  return c.json({ jobId }, 202);
});

jobsRoute.get("/", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);

  const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);
  const offset = Number(c.req.query("offset") ?? 0);

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM jobs WHERE user_email = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`
  ).bind(userEmail, limit, offset).all<JobRow>();

  return c.json({ jobs: (results ?? []).map(serializeJob) });
});

jobsRoute.get("/:id", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);

  const job = await getOwnedJob(c.env, c.req.param("id"), userEmail);
  if (!job) return c.json({ error: "not_found" }, 404);

  return c.json(serializeJob(job));
});

jobsRoute.post("/:id/retry", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);

  const job = await getOwnedJob(c.env, c.req.param("id"), userEmail);
  if (!job) return c.json({ error: "not_found" }, 404);

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE jobs SET status = 'queued', error = NULL, error_code = NULL, error_reason = NULL, updated_at = ?1 WHERE id = ?2`
  ).bind(now, job.id).run();

  const formats: string[] = JSON.parse(job.formats);
  await c.env.JOB_QUEUE.send({ jobId: job.id, url: job.url, formats, userEmail });

  return c.json({ jobId: job.id });
});

jobsRoute.delete("/:id", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);

  const job = await getOwnedJob(c.env, c.req.param("id"), userEmail);
  if (!job) return c.json({ error: "not_found" }, 404);

  const keys = [
    job.snapshot_desktop_png_key,
    job.snapshot_mobile_png_key,
    job.snapshot_pdf_key,
    job.snapshot_html_key,
  ].filter((k): k is string => !!k);

  await Promise.all(keys.map((k) => c.env.SNAPSHOTS.delete(k)));
  await c.env.DB.prepare("DELETE FROM links WHERE job_id = ?1").bind(job.id).run();
  await c.env.DB.prepare("DELETE FROM jobs WHERE id = ?1").bind(job.id).run();

  return c.json({ ok: true });
});

jobsRoute.get("/:id/links", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);

  const job = await getOwnedJob(c.env, c.req.param("id"), userEmail);
  if (!job) return c.json({ error: "not_found" }, 404);

  const links = await queryLinks(c.env, job.id, c.req.query());
  return c.json({
    links: links.map((l) => ({
      href: l.href,
      anchorText: l.anchor_text,
      rootDomain: l.root_domain,
      isInternal: !!l.is_internal,
      httpStatus: l.http_status,
    })),
  });
});

jobsRoute.get("/:id/links.csv", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);

  const job = await getOwnedJob(c.env, c.req.param("id"), userEmail);
  if (!job) return c.json({ error: "not_found" }, 404);

  const links = await queryLinks(c.env, job.id, c.req.query());
  const header = "href,anchor_text,root_domain,is_internal,http_status\n";
  const rows = links
    .map((l) =>
      [l.href, l.anchor_text ?? "", l.root_domain ?? "", l.is_internal ? "internal" : "external", l.http_status ?? ""]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");

  return new Response(header + rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="links-${job.id}.csv"`,
    },
  });
});

async function queryLinks(env: Env, jobId: string, query: Record<string, string>) {
  let sql = "SELECT * FROM links WHERE job_id = ?1";
  const binds: unknown[] = [jobId];
  let n = 2;

  if (query.status) {
    sql += ` AND http_status = ?${n++}`;
    binds.push(Number(query.status));
  }
  if (query.scope === "internal") {
    sql += " AND is_internal = 1";
  } else if (query.scope === "external") {
    sql += " AND is_internal = 0";
  }

  const sortMap: Record<string, string> = {
    href: "href",
    status: "http_status",
    domain: "root_domain",
  };
  const sortCol = sortMap[query.sort ?? ""] ?? "id";
  sql += ` ORDER BY ${sortCol} ASC`;

  const { results } = await env.DB.prepare(sql).bind(...binds).all<import("../types").LinkRow>();
  return results ?? [];
}

async function getOwnedJob(env: Env, id: string, userEmail: string): Promise<JobRow | null> {
  const row = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?1 AND user_email = ?2")
    .bind(id, userEmail)
    .first<JobRow>();
  return row ?? null;
}

function serializeJob(job: JobRow) {
  return {
    id: job.id,
    url: job.url,
    status: job.status,
    formats: JSON.parse(job.formats),
    linkCount: job.link_count,
    snapshots: {
      desktopPng: job.snapshot_desktop_png_key ? true : false,
      mobilePng: job.snapshot_mobile_png_key ? true : false,
      pdf: job.snapshot_pdf_key ? true : false,
      html: job.snapshot_html_key ? true : false,
    },
    errorCode: job.error_code,
    errorReason: job.error_reason,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
