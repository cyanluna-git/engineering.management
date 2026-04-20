"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

import { ServiceCard } from "@/components/portal/ServiceCard";
import { PORTAL_SERVICES } from "@/lib/services";

const CATEGORY_META: Record<
  string,
  { label: string; description: string; emptyMessage: string }
> = {
  engineering: {
    label: "Engineering Tools",
    description:
      "Core engineering systems, quality tooling, and delivery workspaces.",
    emptyMessage: "No engineering services are registered yet.",
  },
  business: {
    label: "Business Systems",
    description:
      "Cross-functional systems for service requests, approvals, and operational workflows.",
    emptyMessage: "Business systems will appear here as they are onboarded.",
  },
  guide: {
    label: "Quick Guides",
    description:
      "Internal navigation and how-to content for frequent company workflows.",
    emptyMessage: "Guide destinations will appear here as content hubs are added.",
  },
};

const CATEGORY_ORDER = ["engineering", "business", "guide"] as const;

interface PortalHomeClientProps {
  currentUserName: string | null;
}

function getPortalStatusMessage(
  authError: string | null,
  authStatus: string | null,
  launchError: string | null,
  service: string | null,
): string | null {
  if (authStatus === "signed-out") {
    return "You have been signed out of the portal session.";
  }

  if (authError === "oidc-disabled") {
    return "Portal sign-in is currently disabled.";
  }
  if (authError === "oidc-misconfigured") {
    return "Portal sign-in is not configured yet. Check the portal OIDC settings.";
  }
  if (authError === "oidc-denied") {
    return "Microsoft sign-in was cancelled or denied.";
  }
  if (authError === "invalid-state") {
    return "The sign-in request expired or had an invalid state. Please try again.";
  }
  if (authError === "missing-code" || authError === "token-exchange") {
    return "Portal sign-in could not be completed. Please try again.";
  }

  if (launchError === "handoff-not-ready") {
    return `Signed in to portal, but the ${service || "requested"} handoff path is not enabled yet.`;
  }

  return null;
}

export function PortalHomeClient({ currentUserName }: PortalHomeClientProps) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!search.trim()) return PORTAL_SERVICES;
    const q = search.toLowerCase();
    return PORTAL_SERVICES.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }, [search]);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    key: cat,
    ...CATEGORY_META[cat],
    services: filtered.filter((s) => s.category === cat),
  }));

  const totalMatches = filtered.length;
  const statusMessage = getPortalStatusMessage(
    searchParams.get("authError"),
    searchParams.get("authStatus"),
    searchParams.get("launchError"),
    searchParams.get("service"),
  );
  const isAuthenticated = Boolean(currentUserName);

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-8">
      <section className="relative overflow-hidden rounded-[28px] border border-red-100/80 bg-white/92 px-6 py-6 shadow-[0_24px_80px_-48px_rgba(127,29,29,0.28)] sm:px-8 sm:py-7">
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(220,38,38,0.14),transparent_52%),radial-gradient(circle_at_top_right,rgba(239,68,68,0.10),transparent_40%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-500">
              Unified Access
            </p>
            <img
              src="/branding/edwards-logo-color.png"
              alt="Edwards"
              className="mt-4 h-12 w-auto object-contain sm:h-13"
            />
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Edwards Portal
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Launch your engineering services, quality systems, and AI tools
              from one portal-owned Microsoft sign-in entry point.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {isAuthenticated ? (
                <>
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                    Signed in as {currentUserName}
                  </div>
                  <a
                    href="/auth/logout"
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-red-200 hover:text-red-600"
                  >
                    Sign out
                  </a>
                </>
              ) : (
                <a
                  href="/auth/login"
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Sign in with Microsoft Entra
                </a>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[280px]">
            <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">
                Available Services
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {PORTAL_SERVICES.length}
              </p>
            </div>
            <div className="rounded-2xl border border-red-100 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">
                Session Owner
              </p>
              <p className="mt-2 text-base font-semibold tracking-tight text-slate-950">
                PCAS Portal Gateway
              </p>
            </div>
          </div>
        </div>
      </section>

      {statusMessage && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          {statusMessage}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search services..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-2 focus:ring-red-100"
        />
      </div>

      {totalMatches === 0 && search.trim() && (
        <p className="py-12 text-center text-sm text-slate-400">
          No services matching &ldquo;{search}&rdquo;
        </p>
      )}

      {grouped.map(({ key, label, description, emptyMessage, services }) => {
        const isCollapsed = collapsed[key] ?? false;
        return (
          <section key={key} className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <button
                  onClick={() => toggle(key)}
                  className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-800 transition hover:text-red-600"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                  {label}
                  <span className="ml-1 text-sm font-normal text-slate-400">
                    ({services.length})
                  </span>
                </button>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {description}
                </p>
              </div>
            </div>
            {!isCollapsed &&
              (services.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {services.map((service) => (
                    <ServiceCard key={service.id} service={service} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-5 py-6 text-sm text-slate-500">
                  {search.trim()
                    ? "No matching services in this category."
                    : emptyMessage}
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
