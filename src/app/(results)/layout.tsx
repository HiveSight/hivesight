import { createClient } from "@/lib/supabase/server";
import { UserNav } from "@/components/auth/user-nav";
import { LoginButton } from "@/components/auth/login-button";
import Link from "next/link";
import { Hexagon } from "lucide-react";

export default async function ResultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2">
            <Hexagon className="h-6 w-6 text-amber-500 fill-amber-500/20" />
            <span className="text-xl font-bold">HiveSight</span>
          </Link>
          {user ? <UserNav /> : <LoginButton />}
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
