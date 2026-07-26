import { useEffect, useState } from "react";
import { Job, LinkItem, api } from "../api";

export function JobDetail({ job, onChanged }: { job: Job; onChanged: () => void }) {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [sort, setSort] = useState("domain");
  const [scope, setScope] = useState<"" | "internal" | "external">("");
  const [status, setStatus] = useState("");
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (job.status !== "done") {
      setLinks([]);
      return;
    }
    setLoadingLinks(true);
    const params: Record<string, string> = { sort };
    if (scope) params.scope = scope;
    if (status) params.status = status;
    api
      .getLinks(job.id, params)
      .then((res) => setLinks(res.links))
      .finally(() => setLoadingLinks(false));
  }, [job.id, job.status, sort, scope, status]);

  async function retry() {
    setRetrying(true);
    try {
      await api.retryJob(job.id);
      onChanged();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg break-all">{job.url}</h2>
            <p className="text-sm text-slate-400 mt-1 dark:text-slate-500">
              Created {new Date(job.createdAt).toLocaleString()}
            </p>
          </div>
          {job.status === "error" && (
            <button
              onClick={retry}
              disabled={retrying}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
            >
              {retrying ? "Retrying..." : "Retry"}
            </button>
          )}
        </div>

        {job.status === "error" && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            <span className="font-medium">{job.errorCode}</span> — {job.errorReason}
          </div>
        )}

        {(job.status === "queued" || job.status === "running") && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
            Job is {job.status}... this page auto-refreshes.
          </div>
        )}

        {job.status === "done" && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            <SnapshotPreview jobId={job.id} label="Desktop" variant="desktop-png" available={job.snapshots.desktopPng} />
            <SnapshotPreview jobId={job.id} label="Mobile" variant="mobile-png" available={job.snapshots.mobilePng} />
          </div>
        )}

        {job.status === "done" && (job.snapshots.pdf || job.snapshots.html) && (
          <div className="mt-4 flex gap-3 text-sm">
            {job.snapshots.pdf && (
              <a className="text-indigo-600 hover:underline dark:text-indigo-400" href={api.snapshotUrl(job.id, "pdf")} target="_blank" rel="noreferrer">
                Download PDF
              </a>
            )}
            {job.snapshots.html && (
              <a className="text-indigo-600 hover:underline dark:text-indigo-400" href={api.snapshotUrl(job.id, "html")} target="_blank" rel="noreferrer">
                Download HTML
              </a>
            )}
          </div>
        )}
      </div>

      {job.status === "done" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3 dark:border-slate-700">
            <h3 className="font-medium mr-auto">Links ({job.linkCount})</h3>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="text-sm rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
              <option value="domain">Sort: Domain</option>
              <option value="href">Sort: URL</option>
              <option value="status">Sort: Status</option>
            </select>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "" | "internal" | "external")}
              className="text-sm rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">All links</option>
              <option value="internal">Internal only</option>
              <option value="external">External only</option>
            </select>
            <input
              placeholder="Filter by status (e.g. 404)"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="text-sm rounded border-slate-300 w-44 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <a
              href={api.csvUrl(job.id)}
              className="text-sm rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700/50"
            >
              Export CSV
            </a>
          </div>
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 dark:bg-slate-700">
                <tr className="text-left text-slate-500 dark:text-slate-300">
                  <th className="px-4 py-2 font-medium">URL</th>
                  <th className="px-4 py-2 font-medium">Domain</th>
                  <th className="px-4 py-2 font-medium">Scope</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loadingLinks && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loadingLinks && links.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                      No links found
                    </td>
                  </tr>
                )}
                {links.map((link, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-2 max-w-md truncate" title={link.href}>
                      <a href={link.href} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">
                        {link.href}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{link.rootDomain}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${link.isInternal ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" : "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"}`}>
                        {link.isInternal ? "internal" : "external"}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={link.httpStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: number | null }) {
  if (status === null) return <span className="text-xs text-slate-400 dark:text-slate-500">unreachable</span>;
  const ok = status >= 200 && status < 400;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
      {status}
    </span>
  );
}

function SnapshotPreview({
  jobId,
  label,
  variant,
  available,
}: {
  jobId: string;
  label: string;
  variant: string;
  available: boolean;
}) {
  if (!available) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 aspect-video flex items-center justify-center text-slate-400 text-sm dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500">
        {label} unavailable
      </div>
    );
  }
  return (
    <a href={api.snapshotUrl(jobId, variant)} target="_blank" rel="noreferrer" className="block group">
      <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
        <img src={api.snapshotUrl(jobId, variant)} alt={label} className="w-full object-cover object-top h-48 group-hover:opacity-90 transition" />
      </div>
      <p className="text-xs text-slate-500 mt-1 text-center dark:text-slate-400">{label}</p>
    </a>
  );
}
