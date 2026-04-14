import type { Metadata } from "next";
import Link from "next/link";

import { getPortalSession } from "@/lib/portal-auth";

import "./globals.css";

export const metadata: Metadata = {
  title: "Edwards Portal",
  description: "Edwards unified service portal",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPortalSession();

  return (
    <html lang="en">
      <body className="min-h-screen bg-[radial-gradient(circle_at_top,#fff5f5_0%,#fff8f6_28%,#f8fafc_100%)]">
        <header className="sticky top-0 z-20 border-b border-red-100/80 bg-white/90 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Link href="/" className="text-sm font-semibold tracking-tight text-slate-700">
              Edwards Portal
            </Link>
            <div className="flex items-center gap-3">
              {session ? (
                <>
                  <span className="hidden text-sm text-slate-500 sm:inline">
                    {session.name}
                  </span>
                  <Link
                    href="/auth/logout"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-red-200 hover:text-red-600"
                  >
                    Sign out
                  </Link>
                </>
              ) : (
                <Link
                  href="/auth/login"
                  className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
