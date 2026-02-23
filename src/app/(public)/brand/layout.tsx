import Link from "next/link";
import { Hexagon, ArrowLeft } from "lucide-react";

export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 to-background bg-honeycomb dark:from-amber-950/10 dark:to-background">
      {/* Header */}
      <header className="py-4 px-4 border-b border-amber-900/[0.06] bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Hexagon className="h-8 w-8 text-amber-500 fill-amber-500/20 transition-transform duration-300 group-hover:rotate-[30deg]" />
            <span className="text-xl font-bold font-serif tracking-tight">HiveSight</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 transition-colors duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </header>

      {children}

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-amber-900/[0.06] mt-auto">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Hexagon className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            <span>&copy; {new Date().getFullYear()} HiveSight</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/brand" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors duration-200">
              Brand
            </Link>
            <Link href="/privacy" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors duration-200">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors duration-200">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
