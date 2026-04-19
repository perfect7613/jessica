import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jessica — AI Legal Team",
  description: "AI-powered NDA risk analysis and legal contract review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="dark min-h-full flex flex-col bg-background text-foreground">
        <header className="relative z-10 border-b border-[rgb(40_40_45)]/80 backdrop-blur-sm bg-background/60">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-6 sm:px-10 h-16">
            <Link
              href="/"
              className="group flex items-baseline gap-3"
              aria-label="Jessica — home"
            >
              <span className="font-serif text-2xl tracking-[0.32em] uppercase text-foreground transition-colors group-hover:text-[rgb(217_172_95)]">
                Jessica
              </span>
              <span className="hidden sm:inline text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
                AI Legal Team
              </span>
            </Link>

            <nav className="flex items-center gap-8">
              <Link
                href="/"
                className="text-xs uppercase tracking-[0.24em] text-[rgb(160_160_170)] hover:text-[rgb(217_172_95)] transition-colors"
              >
                Upload
              </Link>
              <Link
                href="/history"
                className="text-xs uppercase tracking-[0.24em] text-[rgb(160_160_170)] hover:text-[rgb(217_172_95)] transition-colors"
              >
                History
              </Link>
            </nav>
          </div>
        </header>

        <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-6 sm:px-10 py-12">
          {children}
        </main>

        <footer className="relative z-10 border-t border-[rgb(40_40_45)]/80 mt-16">
          <div className="max-w-7xl mx-auto px-6 sm:px-10 h-14 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)]">
            <span>© Jessica Legal · Confidential Review</span>
            <span className="font-serif italic text-[11px] normal-case tracking-normal text-[rgb(160_160_170)]">
              Counsel, rendered in silicon.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
