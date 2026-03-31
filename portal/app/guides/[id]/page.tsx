"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Guide } from "@/lib/guides-schema";

export default function GuideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/guides/${id}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setGuide(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-400">Loading guide...</div>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/guides"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-red-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Guides
        </Link>
        <Link
          href="/guides/admin"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-200 hover:text-red-600"
        >
          <ShieldCheck className="h-4 w-4" />
          Open Admin CMS
        </Link>
      </div>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.45)] sm:p-8">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            {guide.category}
          </span>
          <span>Updated {new Date(guide.updated_at).toLocaleDateString()}</span>
          <span>by {guide.author}</span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          {guide.title}
        </h1>
        <div className="prose prose-slate mt-8 max-w-none prose-headings:tracking-tight prose-a:text-red-600 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-pre:bg-slate-900 prose-pre:text-slate-100">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {guide.content}
          </ReactMarkdown>
        </div>
      </section>
    </div>
  );
}
