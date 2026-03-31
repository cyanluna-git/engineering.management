import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getGuide } from "@/lib/guides-store";
import {
  getStaticGuideChrome,
  getStaticGuideDocument,
  getStaticGuideLocales,
  normalizeStaticGuideLocale,
} from "@/lib/static-guides";

export default async function GuideDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const guide = await getGuide(id);

  if (!guide) {
    notFound();
  }

  if (guide.format === "static-html") {
    const locale = normalizeStaticGuideLocale(resolvedSearchParams?.lang);
    const chrome = getStaticGuideChrome(locale);
    const document = await getStaticGuideDocument(id, locale);
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
            {chrome.backToGuides}
          </Link>
          <Link
            href="/guides/admin"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-200 hover:text-red-600"
          >
            <ShieldCheck className="h-4 w-4" />
            {chrome.openAdmin}
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
              {chrome.staticHtmlGuide}
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {document.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {chrome.summaryIntro}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href="#type1-recovery-detail"
              className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              {chrome.jumpToDetail}
            </a>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500">
              <span className="px-2 uppercase tracking-[0.18em] text-slate-400">
                {chrome.languageLabel}
              </span>
              {getStaticGuideLocales().map((option) => {
                const active = option === locale;
                return (
                  <Link
                    key={option}
                    href={`/guides/${id}?lang=${option}`}
                    className={`rounded-full px-3 py-1.5 transition ${
                      active
                        ? "bg-slate-950 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {chrome.languageOptions[option]}
                  </Link>
                );
              })}
            </div>
          </div>
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
