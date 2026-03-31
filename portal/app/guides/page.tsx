"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Search, ShieldCheck } from "lucide-react";
import type { Guide } from "@/lib/guides-schema";

function toExcerpt(markdown: string): string {
  return markdown
    .replace(/[`#>*_-]/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export default function GuidesPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/guides")
      .then((response) => response.json())
      .then((data) => {
        setGuides(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setGuides([]);
        setLoading(false);
      });
  }, []);

  const categories = useMemo(() => {
    const values = Array.from(new Set(guides.map((guide) => guide.category))).sort();
    return ["All", ...values];
  }, [guides]);

  const filteredGuides = useMemo(() => {
    const query = search.trim().toLowerCase();

    return guides.filter((guide) => {
      const categoryMatch = category === "All" || guide.category === category;
      if (!categoryMatch) return false;
      if (!query) return true;

      return (
        guide.title.toLowerCase().includes(query) ||
        guide.content.toLowerCase().includes(query) ||
        guide.author.toLowerCase().includes(query)
      );
    });
  }, [category, guides, search]);

  const categoryCounts = useMemo(() => {
    return guides.reduce<Record<string, number>>((acc, guide) => {
      acc[guide.category] = (acc[guide.category] || 0) + 1;
      return acc;
    }, {});
  }, [guides]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <section className="overflow-hidden rounded-[28px] border border-red-100/80 bg-white/92 p-6 shadow-[0_24px_80px_-48px_rgba(127,29,29,0.28)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-red-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Portal
            </Link>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.32em] text-red-500">
              Guide Hub
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Quick Guides CMS
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Internal walkthroughs for recurring company workflows, published from
              the same portal runtime and ready for admin maintenance.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <div className="rounded-2xl border border-red-100 bg-red-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">
                Published Guides
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {guides.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Filtered Results
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {filteredGuides.length}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title, body, or author..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <Link
            href="/guides/admin"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <ShieldCheck className="h-4 w-4" />
            Admin CMS
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {categories.map((value) => {
            const active = value === category;
            const count = value === "All" ? guides.length : categoryCounts[value] || 0;

            return (
              <button
                key={value}
                onClick={() => setCategory(value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-red-50 text-red-600 ring-1 ring-red-200"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {value} ({count})
              </button>
            );
          })}
        </div>
        <p className="text-sm text-slate-500">
          Use the public hub for discovery and open the admin workspace only when
          you need to publish or revise content.
        </p>
      </section>

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">Loading guides...</p>
      ) : filteredGuides.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-12 text-center text-sm text-slate-500">
          No guides matched the current search and category filters.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {filteredGuides.map((guide) => (
            <Link
              key={guide.id}
              href={`/guides/${guide.id}`}
              className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(15,23,42,0.45)] transition hover:-translate-y-1 hover:border-red-200 hover:shadow-[0_28px_70px_-38px_rgba(127,29,29,0.24)]"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                      {guide.category}
                    </span>
                    <span>Updated {new Date(guide.updated_at).toLocaleDateString()}</span>
                    <span>by {guide.author}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                    {guide.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {toExcerpt(guide.content)}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm font-medium text-red-600 transition group-hover:text-red-700">
                Open guide
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
