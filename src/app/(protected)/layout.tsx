import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserNav } from "@/components/auth/user-nav";
import Link from "next/link";
import { Hexagon } from "lucide-react";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex flex-col bg-honeycomb">
      <header className="border-b border-amber-900/[0.06] bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <Hexagon className="h-7 w-7 text-amber-500 fill-amber-500/20 transition-transform duration-300 group-hover:rotate-[30deg]" />
            <span className="text-xl font-bold font-serif tracking-tight">HiveSight</span>
          </Link>
          <UserNav />
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-10">{children}</main>
    </div>
  );
}
