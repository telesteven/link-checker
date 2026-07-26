import { useEffect, useState, useCallback } from "react";
import { api, Job } from "./api";
import { JobForm } from "./components/JobForm";
import { JobList } from "./components/JobList";
import { JobDetail } from "./components/JobDetail";
import { useTheme } from "./useTheme";

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  const refresh = useCallback(async () => {
    try {
      const { jobs } = await api.listJobs();
      setJobs(jobs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    api.me().then(({ email }) => setUserEmail(email)).catch(() => setUserEmail(null));
  }, []);

  const selectedJob = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 transition-colors">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-indigo-600 dark:text-indigo-400">Link_</span>checker
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded-lg border border-slate-200 dark:border-slate-700 w-9 h-9 flex items-center justify-center text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {userEmail && (
              <>
                <span className="text-sm text-slate-500 dark:text-slate-400 hidden sm:inline">
                  {userEmail}
                </span>
                <a
                  href="/cdn-cgi/access/logout"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Log out
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <JobForm
          onCreated={(jobId, message) => {
            refresh();
            setSelectedId(jobId);
            if (message) setError(null);
          }}
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <JobList
            jobs={jobs}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDeleted={refresh}
          />
          <div>
            {selectedJob ? (
              <JobDetail job={selectedJob} onChanged={refresh} />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center text-slate-400 dark:text-slate-500">
                Select a job to see details
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
