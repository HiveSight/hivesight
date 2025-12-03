"use client";

import { useUser } from "@/hooks/use-user";
import { LoginButton } from "./login-button";
import { LogoutButton } from "./logout-button";

export function UserNav() {
  const { user, profile, loading } = useUser();

  if (loading) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
    );
  }

  if (!user) {
    return <LoginButton />;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm">
        <span className="font-medium">{profile?.name || user.email}</span>
        {profile && (
          <span className="ml-2 text-muted-foreground">
            {profile.credit_balance} credits
          </span>
        )}
      </div>
      <LogoutButton />
    </div>
  );
}
