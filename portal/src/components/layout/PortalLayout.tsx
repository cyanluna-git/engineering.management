import { Outlet } from "react-router-dom";

export function PortalLayout() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff5f5_0%,#fff8f6_28%,#f8fafc_100%)]">
      <header className="sticky top-0 z-20 border-b border-red-100/80 bg-white/90 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-slate-700">
            PCAS Portal
          </span>
          <div />
        </div>
      </header>

      <main className="overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
