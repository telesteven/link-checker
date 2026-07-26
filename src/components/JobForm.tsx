import { useState, FormEvent } from "react";
import { api } from "../api";

const FORMAT_OPTIONS = [
  { id: "pdf", label: "PDF" },
  { id: "html", label: "HTML" },
];

export function JobForm({ onCreated }: { onCreated: (jobId: string, message?: string) => void }) {
  const [url, setUrl] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.createJob(url.trim(), formats);
      if (res.reused) setNotice(res.message ?? "Reusing recent result");
      onCreated(res.jobId, res.message);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create job");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleFormat(id: string) {
    setFormats((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="url"
          required
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
        >
          {submitting ? "Analyzing..." : "Analyze"}
        </button>
      </div>
      <div className="flex items-center gap-4 text-sm text-slate-600">
        <span className="font-medium">Snapshot formats:</span>
        <span className="rounded-full bg-slate-100 px-3 py-1">PNG (default)</span>
        {FORMAT_OPTIONS.map((f) => (
          <label key={f.id} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={formats.includes(f.id)}
              onChange={() => toggleFormat(f.id)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            {f.label}
          </label>
        ))}
      </div>
      {notice && <p className="text-sm text-indigo-600">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
