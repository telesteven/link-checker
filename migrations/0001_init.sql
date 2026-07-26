CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  status       TEXT NOT NULL,
  error        TEXT,
  formats      TEXT NOT NULL,
  link_count   INTEGER DEFAULT 0,
  snapshot_desktop_png_key TEXT,
  snapshot_mobile_png_key  TEXT,
  snapshot_pdf_key         TEXT,
  snapshot_html_key        TEXT,
  error_code   TEXT,
  error_reason TEXT,
  user_email   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_jobs_user ON jobs(user_email);
CREATE INDEX idx_jobs_user_url ON jobs(user_email, url);

CREATE TABLE links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL REFERENCES jobs(id),
  href        TEXT NOT NULL,
  anchor_text TEXT,
  root_domain TEXT,
  is_internal INTEGER NOT NULL,
  http_status INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_links_job ON links(job_id);
CREATE INDEX idx_links_job_domain ON links(job_id, root_domain);
