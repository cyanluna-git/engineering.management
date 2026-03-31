import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getGuide } from "@/lib/guides-store";
import { getStaticGuideDocument } from "@/lib/static-guides";

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const guide = await getGuide(id);

  if (!guide) {
    notFound();
  }

  if (guide.format === "static-html") {
    const document = await getStaticGuideDocument(id);
    if (!document) {
      notFound();
    }

    return (
      <div className="px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="mx-auto mt-6 max-w-6xl rounded-[28px] border border-red-100/80 bg-white/92 p-6 shadow-[0_24px_80px_-48px_rgba(127,29,29,0.28)] sm:p-8">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
              {guide.category}
            </span>
            <span>Updated {new Date(guide.updated_at).toLocaleDateString()}</span>
            <span>by {guide.author}</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              Static HTML Guide
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {document.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Summary comes first. Scroll down for the full technical recovery
            procedure rendered from the original HTML source.
          </p>
          <a
            href="#type1-recovery-detail"
            className="mt-5 inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Jump to Detailed Procedure
          </a>
        </div>

        <style dangerouslySetInnerHTML={{ __html: document.summaryCss }} />
        <style dangerouslySetInnerHTML={{ __html: document.detailCss }} />

        <div className="mx-auto mt-8 max-w-7xl space-y-10">
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_-40px_rgba(15,23,42,0.45)]">
            <div
              className="type1-recovery-summary"
              dangerouslySetInnerHTML={{ __html: document.summaryHtml }}
            />
          </section>

          <section
            id="type1-recovery-detail"
            className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_-40px_rgba(15,23,42,0.45)]"
          >
            <div
              className="type1-recovery-detail"
              dangerouslySetInnerHTML={{ __html: document.detailHtml }}
            />
          </section>
        </div>
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
