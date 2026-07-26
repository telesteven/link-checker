export interface Env {
  DB: D1Database;
  SNAPSHOTS: R2Bucket;
  JOB_QUEUE: Queue<JobMessage>;
  BROWSER: Fetcher;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

export interface JobMessage {
  jobId: string;
  url: string;
  formats: string[];
  userEmail: string;
}

export type JobFormat = "png" | "pdf" | "html";

export interface JobRow {
  id: string;
  url: string;
  status: "queued" | "running" | "done" | "error";
  error: string | null;
  formats: string;
  link_count: number;
  snapshot_desktop_png_key: string | null;
  snapshot_mobile_png_key: string | null;
  snapshot_pdf_key: string | null;
  snapshot_html_key: string | null;
  error_code: string | null;
  error_reason: string | null;
  user_email: string;
  created_at: number;
  updated_at: number;
}

export interface LinkRow {
  id: number;
  job_id: string;
  href: string;
  anchor_text: string | null;
  root_domain: string | null;
  is_internal: number;
  http_status: number | null;
  created_at: number;
}
