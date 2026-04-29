"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GUIDE_CATEGORY_OPTIONS } from "@/lib/guides-schema";
import MarkdownEditor from "@/components/guides/MarkdownEditor";

interface GuideEditClientProps {
  id: string;
  initialTitle: string;
  initialCategory: string;
  initialContent: string;
  authorName: string;
}

export default function GuideEditClient({
  id,
  initialTitle,
  initialCategory,
  initialContent,
  authorName,
}: GuideEditClientProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState(initialCategory);
  const [content, setContent] = useState(initialContent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!content.trim()) {
      setError("Content is required.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/guides/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          content,
          author: authorName,
          format: "markdown",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save guide.");
      }

      router.push(`/guides/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <Link
          href={`/guides/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-red-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Guide
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          Edit Guide
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.45)] sm:p-8"
      >
        <div className="space-y-5">
          <label className="block space-y-2 text-sm text-slate-600">
            <span className="font-medium">Title *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Guide title"
              required
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </label>

          <label className="block space-y-2 text-sm text-slate-600">
            <span className="font-medium">Category *</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
            >
              {GUIDE_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2 text-sm text-slate-600">
            <span className="block font-medium">Content *</span>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              height={400}
            />
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </button>
          <Link
            href={`/guides/${id}`}
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
