"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Guide } from "@/lib/guides-store";

export default function GuideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/guides/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setGuide(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-400">Loading...</div>
    );
  }

  if (!guide) {
    return (
      <div className="py-20 text-center text-sm text-slate-400">
        Guide not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <Link
        href="/guides"
        className="flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-red-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Guides
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {guide.category}
          </span>
          <span className="text-xs text-slate-400">
            Updated {new Date(guide.updated_at).toLocaleDateString()} by{" "}
            {guide.author}
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          {guide.title}
        </h1>
      </div>

      <div className="prose prose-slate max-w-none prose-headings:tracking-tight prose-a:text-red-600 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-pre:bg-slate-900 prose-pre:text-slate-100">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {guide.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
