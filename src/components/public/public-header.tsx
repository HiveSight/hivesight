import Link from "next/link";
import { Hexagon } from "lucide-react";

export function PublicHeader({
  rightSlot,
}: {
  rightSlot?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-amber-950/10 bg-background/78 px-4 py-4 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="group flex items-center gap-2.5">
            <Hexagon className="h-8 w-8 fill-amber-500/20 text-amber-500 transition-transform duration-300 group-hover:rotate-[30deg]" />
            <span className="font-serif text-xl font-bold tracking-tight text-foreground">
              HiveSight
            </span>
          </Link>
          <div className="hidden h-6 w-px bg-amber-950/10 md:block" />
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground md:block">
            Audience research desk
          </p>
          <Link
            href="/benchmarks"
            className="hidden text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground transition-colors duration-200 hover:text-amber-700 md:block dark:hover:text-amber-400"
          >
            Benchmarks
          </Link>
          <Link
            href="/thesis"
            className="hidden text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground transition-colors duration-200 hover:text-amber-700 md:block dark:hover:text-amber-400"
          >
            Thesis
          </Link>
        </div>
        {rightSlot}
      </div>
    </header>
  );
}
