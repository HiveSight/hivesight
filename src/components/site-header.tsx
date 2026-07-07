import Link from "next/link";

export function HexMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline-block"
    >
      <path
        d="M12 2 L20.66 7 V17 L12 22 L3.34 17 V7 Z"
        fill="var(--color-honey)"
        stroke="var(--color-ink)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-5xl px-5 py-4 flex items-baseline justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <HexMark />
          <span className="font-sans font-extrabold tracking-tight text-lg text-ink">
            HiveSight
          </span>
        </Link>
        <nav className="flex gap-6 text-sm text-muted">
          <Link href="/methodology" className="hover:text-ink">
            Methodology
          </Link>
          <Link href="/benchmarks" className="hover:text-ink">
            Benchmarks
          </Link>
        </nav>
      </div>
    </header>
  );
}
