"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, FileText, ArrowLeft } from "lucide-react";
import type { Guide } from "@/lib/guides-store";

const GUIDE_CATEGORIES = ["IT", "HR", "Finance", "General"] as const;

export default function GuidesPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    fetch(`/api/guides?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setGuides(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setGuides([]);
        setLoading(false);
      });
  }, [search, category]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-red-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Portal
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Quick Guides
        </h1>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guides..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCategory("")}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
              !category
                ? "bg-red-50 text-red-600 ring-1 ring-red-200"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          {GUIDE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat === category ? "" : cat)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                category === cat
                  ? "bg-red-50 text-red-600 ring-1 ring-red-200"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading...</p>
      ) : guides.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          No guides found.
        </p>
      ) : (
        <div className="space-y-3">
          {guides.map((guide) => (
            <Link
              key={guide.id}
              href={`/guides/${guide.id}`}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-900">{guide.title}</h3>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    {guide.category}
                  </span>
                  <span>
                    {new Date(guide.updated_at).toLocaleDateString()}
                  </span>
                  <span>by {guide.author}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
