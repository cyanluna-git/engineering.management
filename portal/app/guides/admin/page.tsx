"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, PencilLine, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  GUIDE_CATEGORY_OPTIONS,
  type Guide,
} from "@/lib/guides-schema";
import MarkdownEditor from "@/components/guides/MarkdownEditor";

const HTML_MAX_BYTES = 1_048_576; // 1 MiB

type GuideDraft = {
  id: string | null;
  title: string;
  category: string;
  author: string;
  content: string;
  format: "markdown" | "static-html";
};

const EMPTY_DRAFT: GuideDraft = {
  id: null,
  title: "",
  category: GUIDE_CATEGORY_OPTIONS[0],
  author: "admin",
  content: "",
  format: "markdown",
};

function toDraft(guide: Guide): GuideDraft {
  return {
    id: guide.id,
    title: guide.title,
    category: guide.category,
    author: guide.author,
    content: guide.content,
    format: guide.format === "static-html" ? "static-html" : "markdown",
  };
}

export default function GuideAdminPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [draft, setDraft] = useState<GuideDraft>(EMPTY_DRAFT);
  const [adminToken, setAdminToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeGuide = useMemo(
    () => guides.find((guide) => guide.id === draft.id) || null,
    [draft.id, guides],
  );
  const activeGuideReadonly = Boolean(activeGuide?.readonly);

  async function loadGuides(nextSelectedId?: string | null) {
    const response = await fetch("/api/guides");
    const data = await response.json();
    const nextGuides = Array.isArray(data) ? data : [];
    setGuides(nextGuides);

    if (nextSelectedId) {
      const selected = nextGuides.find((guide) => guide.id === nextSelectedId);
      if (selected) {
        setDraft(toDraft(selected));
        return;
      }
    }

    if (!draft.id && draft.title) return;
    if (nextGuides[0]) {
      setDraft(toDraft(nextGuides[0]));
    } else {
      setDraft(EMPTY_DRAFT);
    }
  }

  useEffect(() => {
    const storedToken = window.localStorage.getItem("portal-guide-admin-token");
    if (storedToken) {
      setAdminToken(storedToken);
    }

    loadGuides()
      .catch(() => setMessage("Failed to load guides."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("portal-guide-admin-token", adminToken);
  }, [adminToken]);

  function handleHtmlFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setHtmlFile(null);
      return;
    }
    if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
      setFileError("Only .html files are accepted.");
      setHtmlFile(null);
      event.target.value = "";
      return;
    }
    if (file.size > HTML_MAX_BYTES) {
      setFileError(`File exceeds 1 MiB limit (${(file.size / 1024).toFixed(0)} KB).`);
      setHtmlFile(null);
      event.target.value = "";
      return;
    }
    setHtmlFile(file);
  }

  async function saveGuide() {
    setSaving(true);
    setMessage(null);

    try {
      let content = draft.content;

      // For static-html drafts being edited, read the replacement file if provided
      if (draft.format === "static-html" && htmlFile) {
        content = await htmlFile.text();
        if (!content.trim()) {
          setMessage("The selected HTML file is empty.");
          setSaving(false);
          return;
        }
      }

      const payload = {
        title: draft.title,
        category: draft.category,
        author: draft.author,
        content,
        format: draft.format,
      };

      const response = await fetch(
        draft.id ? `/api/guides/${draft.id}` : "/api/guides",
        {
          method: draft.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            "x-portal-admin-token": adminToken,
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Save failed.");
      }

      await loadGuides(result.id);
      setMessage("Guide saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGuide() {
    if (!draft.id) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/guides/${draft.id}`, {
        method: "DELETE",
        headers: {
          "x-portal-admin-token": adminToken,
        },
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Delete failed.");
      }

      await loadGuides(null);
      setMessage("Guide deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/guides"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-red-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Guide Hub
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Quick Guides Admin CMS
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create, edit, preview, and retire internal guides from the portal
            runtime.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:min-w-[320px]">
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Admin Token
          </label>
          <input
            type="password"
            value={adminToken}
            onChange={(event) => setAdminToken(event.target.value)}
            placeholder="Enter x-portal-admin-token"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          {message}
        </div>
      )}

      <div className={`grid gap-6 ${activeGuideReadonly || draft.format === "static-html" ? "xl:grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)]" : "xl:grid-cols-[280px_minmax(0,1fr)]"}`}>
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              Guides
            </h2>
            <button
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setMessage(null);
              }}
              className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <button
              onClick={() => loadGuides(draft.id).catch(() => setMessage("Refresh failed."))}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="py-10 text-sm text-slate-400">Loading guides...</p>
            ) : guides.length === 0 ? (
              <p className="py-10 text-sm text-slate-400">
                No guides published yet.
              </p>
            ) : (
              guides.map((guide) => {
                const selected = guide.id === draft.id;
                return (
                  <button
                    key={guide.id}
                    onClick={() => {
                      setDraft(toDraft(guide));
                      setMessage(null);
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-red-200 bg-red-50/70"
                        : "border-slate-200 bg-slate-50/70 hover:bg-white"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {guide.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>
                        {guide.category} · {guide.author}
                      </span>
                      {guide.readonly ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                          Read-only
                        </span>
                      ) : null}
                      {guide.format === "static-html" && !guide.readonly ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                          HTML
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.45)]">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <PencilLine className="h-4 w-4" />
            Editor
          </div>

          <div className="mt-5 space-y-4">
            {activeGuideReadonly ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This guide is sourced from static HTML files and cannot be edited
                from the CMS. Update the source under
                <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">
                  portal/content/static-guides
                </code>
                instead.
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-600">
                <span>Title</span>
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  disabled={activeGuideReadonly}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Category</span>
                <select
                  value={draft.category}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  disabled={activeGuideReadonly}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
                >
                  {GUIDE_CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-2 text-sm text-slate-600">
              <span>Author</span>
              <input
                value={draft.author}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, author: event.target.value }))
                }
                disabled={activeGuideReadonly}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
            </label>

            {draft.format === "static-html" && !activeGuideReadonly ? (
              <div className="space-y-2 text-sm text-slate-600">
                <span className="block font-medium">Replace HTML File</span>
                <div
                  className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[28px] border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 transition hover:border-red-300 hover:bg-red-50/30"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-7 w-7 text-slate-400" />
                  {htmlFile ? (
                    <div className="text-center">
                      <p className="font-medium text-slate-700">{htmlFile.name}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {(htmlFile.size / 1024).toFixed(1)} KB — click to replace
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-500">
                      Click to select replacement .html file (leave empty to keep existing)
                    </p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm"
                  onChange={handleHtmlFileChange}
                  className="sr-only"
                />
                {fileError && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                    {fileError}
                  </p>
                )}
              </div>
            ) : activeGuideReadonly ? (
              <label className="space-y-2 text-sm text-slate-600">
                <span>Read-only Summary</span>
                <textarea
                  value={draft.content}
                  rows={18}
                  disabled
                  className="w-full rounded-[28px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 shadow-sm outline-none"
                />
              </label>
            ) : (
              <div className="space-y-2 text-sm text-slate-600">
                <span className="block">Markdown Body</span>
                <MarkdownEditor
                  value={draft.content}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, content: value }))
                  }
                  height={400}
                />
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => saveGuide()}
              disabled={saving || activeGuideReadonly}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : draft.id ? "Save Changes" : "Publish Guide"}
            </button>
            <button
              onClick={() => setDraft(activeGuide ? toDraft(activeGuide) : EMPTY_DRAFT)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Reset Draft
            </button>
            <button
              onClick={() => deleteGuide()}
              disabled={!draft.id || saving || activeGuideReadonly}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete Guide
            </button>
          </div>
        </section>

        {(activeGuideReadonly || draft.format === "static-html") && (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.45)]">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              <Eye className="h-4 w-4" />
              Preview
            </div>

            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                  {draft.category || "Uncategorized"}
                </span>
                <span>{draft.author || "admin"}</span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                {draft.title || "Untitled guide"}
              </h2>
              <div className="prose prose-slate mt-6 max-w-none prose-headings:tracking-tight prose-a:text-red-600 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-pre:bg-slate-900 prose-pre:text-slate-100">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {draft.content || "Start writing markdown to preview the published guide."}
                </ReactMarkdown>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
