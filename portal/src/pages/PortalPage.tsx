import { PORTAL_SERVICES } from "@/config/services";
import { ServiceCard } from "@/components/portal/ServiceCard";

const CATEGORY_LABELS: Record<string, string> = {
  engineering: "Engineering Tools",
  business: "Business Systems",
  guide: "Quick Guides",
};

const CATEGORY_ORDER = ["engineering", "business", "guide"] as const;

export function PortalPage() {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    key: cat,
    label: CATEGORY_LABELS[cat],
    services: PORTAL_SERVICES.filter((s) => s.category === cat),
  })).filter((g) => g.services.length > 0);

  const serviceCount = PORTAL_SERVICES.length;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-6 py-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-red-100/80 bg-white/92 px-6 py-6 shadow-[0_24px_80px_-48px_rgba(127,29,29,0.28)] sm:px-8 sm:py-7">
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(220,38,38,0.14),transparent_52%),radial-gradient(circle_at_top_right,rgba(239,68,68,0.10),transparent_40%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-500">
              Unified Access
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              PCAS Engineering Portal
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Launch your engineering services, quality systems, and AI tools
              from one place.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[280px]">
            <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">
                Available Services
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                {serviceCount}
              </p>
            </div>
            <div className="rounded-2xl border border-red-100 bg-white p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-500">
                Environment
              </p>
              <p className="mt-2 text-base font-semibold tracking-tight text-slate-950">
                Edwards Digital Workspace
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Service categories */}
      {grouped.map(({ key, label, services }) => (
        <section key={key} className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">
            {label}
          </h2>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default PortalPage;
