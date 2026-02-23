import Link from "next/link";
import { Hexagon, ArrowLeft } from "lucide-react";

export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-linear-to-b from-amber-50/50 to-background">
      {/* Header */}
      <header className="py-4 px-4 border-b bg-background/80 backdrop-blur-xs sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Hexagon className="h-8 w-8 text-amber-500 fill-amber-500/20" />
            <span className="text-xl font-bold">HiveSight</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </header>

      {children}

      {/* Footer */}
      <footer className="py-8 px-4 border-t mt-auto">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Hexagon className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            <span>&copy; {new Date().getFullYear()} HiveSight</span>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/brand" className="hover:text-foreground">
              Brand
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
