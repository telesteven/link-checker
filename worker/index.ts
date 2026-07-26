import { Hono } from "hono";
import type { Env, JobMessage } from "./types";
import { jobsRoute } from "./routes/jobs";
import { snapshotsRoute } from "./routes/snapshots";
import { runJob } from "./lib/runJob";
import { requireUser } from "./lib/access";

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const app = new Hono<{ Bindings: Env }>();

app.route("/api/jobs", jobsRoute);
app.route("/api/snapshots", snapshotsRoute);

app.get("/api/me", async (c) => {
  const userEmail = await requireUser(c);
  if (!userEmail) return c.json({ error: "unauthorized" }, 401);
  return c.json({ email: userEmail });
});

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await runJob(env, message.body);
        message.ack();
      } catch (err) {
        console.error("Job failed", message.body.jobId, err);
        message.retry();
      }
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const cutoff = Date.now() - RETENTION_MS;

    const expiredJobs = await env.DB.prepare(
      "SELECT id, snapshot_desktop_png_key, snapshot_mobile_png_key, snapshot_pdf_key, snapshot_html_key FROM jobs WHERE created_at < ?1"
    ).bind(cutoff).all<{
      id: string;
      snapshot_desktop_png_key: string | null;
      snapshot_mobile_png_key: string | null;
      snapshot_pdf_key: string | null;
      snapshot_html_key: string | null;
    }>();

    const jobs = expiredJobs.results ?? [];
    const keys = jobs.flatMap((j) =>
      [j.snapshot_desktop_png_key, j.snapshot_mobile_png_key, j.snapshot_pdf_key, j.snapshot_html_key].filter(
        (k): k is string => !!k
      )
    );

    await Promise.all(keys.map((k) => env.SNAPSHOTS.delete(k)));

    await env.DB.prepare(
      "DELETE FROM links WHERE job_id IN (SELECT id FROM jobs WHERE created_at < ?1)"
    ).bind(cutoff).run();
    await env.DB.prepare("DELETE FROM jobs WHERE created_at < ?1").bind(cutoff).run();
  },
} satisfies ExportedHandler<Env, JobMessage>;
