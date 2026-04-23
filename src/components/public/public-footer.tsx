import Link from "next/link";
import { Hexagon } from "lucide-react";

export function PublicFooter({ showBrandLink = false }: { showBrandLink?: boolean }) {
  return (
    <footer className="border-t border-amber-950/10 bg-background/70 px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Hexagon className="h-5 w-5 fill-amber-500/20 text-amber-500" />
            <span>&copy; {new Date().getFullYear()} HiveSight</span>
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-muted-foreground/70">
            Built for fast audience research
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground sm:gap-6">
          {showBrandLink && (
            <Link
              href="/brand"
              className="transition-colors duration-200 hover:text-amber-700 dark:hover:text-amber-400"
            >
              Brand
            </Link>
          )}
          <Link
            href="/benchmarks"
            className="transition-colors duration-200 hover:text-amber-700 dark:hover:text-amber-400"
          >
            Benchmarks
          </Link>
          <Link
            href="/thesis"
            className="transition-colors duration-200 hover:text-amber-700 dark:hover:text-amber-400"
          >
            Thesis
          </Link>
          <Link
            href="/privacy"
            className="transition-colors duration-200 hover:text-amber-700 dark:hover:text-amber-400"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="transition-colors duration-200 hover:text-amber-700 dark:hover:text-amber-400"
          >
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
