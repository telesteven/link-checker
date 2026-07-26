export interface Job {
  id: string;
  url: string;
  status: "queued" | "running" | "done" | "error";
  formats: string[];
  linkCount: number;
  snapshots: { desktopPng: boolean; mobilePng: boolean; pdf: boolean; html: boolean };
  errorCode: string | null;
  errorReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LinkItem {
  href: string;
  anchorText: string | null;
  rootDomain: string | null;
  isInternal: boolean;
  httpStatus: number | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => req<{ email: string }>("/api/me"),
  createJob: (url: string, formats: string[]) =>
    req<{ jobId: string; reused?: boolean; message?: string }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ url, formats }),
    }),
  listJobs: () => req<{ jobs: Job[] }>("/api/jobs"),
  getJob: (id: string) => req<Job>(`/api/jobs/${id}`),
  getLinks: (id: string, params?: Record<string, string>) =>
    req<{ links: LinkItem[] }>(`/api/jobs/${id}/links${params ? `?${new URLSearchParams(params)}` : ""}`),
  csvUrl: (id: string) => `/api/jobs/${id}/links.csv`,
  snapshotUrl: (id: string, variant: string) => `/api/snapshots/${id}/${variant}`,
  retryJob: (id: string) => req<{ jobId: string }>(`/api/jobs/${id}/retry`, { method: "POST" }),
  deleteJob: (id: string) => req<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" }),
};
