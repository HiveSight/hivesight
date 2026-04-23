import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export default function BrandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 to-background bg-honeycomb dark:from-amber-950/10 dark:to-background">
      <PublicHeader
        rightSlot={
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-amber-700 dark:hover:text-amber-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        }
      />

      {children}

      <PublicFooter showBrandLink />
    </div>
  );
}
