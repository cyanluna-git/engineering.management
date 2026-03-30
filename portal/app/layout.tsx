import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PCAS Engineering Portal",
  description: "Edwards PCAS unified service portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[radial-gradient(circle_at_top,#fff5f5_0%,#fff8f6_28%,#f8fafc_100%)]">
        <header className="sticky top-0 z-20 border-b border-red-100/80 bg-white/90 px-6 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <a href="/" className="text-sm font-semibold tracking-tight text-slate-700">
              PCAS Portal
            </a>
            <div />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
