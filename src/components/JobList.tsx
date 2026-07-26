import type { MouseEvent } from "react";
import { Job, api } from "../api";

const STATUS_STYLES: Record<Job["status"], string> = {
  queued: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  running: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function JobList({
  jobs,
  loading,
  selectedId,
  onSelect,
  onDeleted,
}: {
  jobs: Job[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleted: () => void;
}) {
  async function handleDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this job and its snapshots?")) return;
    await api.deleteJob(id);
    onDeleted();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between dark:border-slate-700">
        <h2 className="font-medium">Jobs</h2>
        <span className="text-xs text-slate-400 dark:text-slate-500">{jobs.length}/10 used</span>
      </div>
      <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto dark:divide-slate-700">
        {loading && <li className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">Loading...</li>}
        {!loading && jobs.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">No jobs yet. Analyze a URL to get started.</li>
        )}
        {jobs.map((job) => (
          <li
            key={job.id}
            onClick={() => onSelect(job.id)}
            className={`px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition ${
              selectedId === job.id ? "bg-indigo-50 dark:bg-indigo-950/40" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium truncate" title={job.url}>
                {job.url}
              </p>
              <button
                onClick={(e) => handleDelete(e, job.id)}
                className="text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 text-xs shrink-0"
                title="Delete"
              >
                ✕
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[job.status]}`}>
                {job.status}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{job.linkCount} links</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
