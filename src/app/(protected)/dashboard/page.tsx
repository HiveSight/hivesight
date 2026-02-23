import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Database } from "@/types/database";
import { Plus } from "lucide-react";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Survey = Database["public"]["Tables"]["surveys"]["Row"];

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  processing: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const profile = profileData as Profile | null;

  const { data: surveysData } = await supabase
    .from("surveys")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const surveys = (surveysData ?? []) as Survey[];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-serif">Dashboard</h1>
        <Button asChild>
          <Link href="/survey/new" className="gap-2">
            <Plus className="h-4 w-4" />
            New survey
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3 stagger-children">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-sans">
              Credit balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-serif text-amber-700 dark:text-amber-400">{profile?.credit_balance ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-sans">
              Subscription tier
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold capitalize font-serif">
              {profile?.tier ?? "free"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-sans">
              Total surveys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold font-serif">{surveys.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Recent surveys</CardTitle>
        </CardHeader>
        <CardContent>
          {surveys.length > 0 ? (
            <div className="space-y-3">
              {surveys.map((survey) => (
                <div
                  key={survey.id}
                  className="flex items-center justify-between p-4 border border-amber-900/[0.04] rounded-xl bg-background/50 transition-all duration-200 hover:bg-amber-50/30 hover:border-amber-200/50 dark:border-amber-100/[0.04] dark:hover:bg-amber-950/20"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate max-w-md">
                      {survey.question}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {survey.hive_size} respondents
                      {survey.location &&
                        typeof survey.location === "object" &&
                        "label" in (survey.location as Record<string, unknown>) &&
                        ` in ${(survey.location as { label: string }).label}`}
                      {" "}&middot;{" "}
                      {new Date(survey.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                        STATUS_STYLES[survey.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {survey.status}
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/survey/${survey.id}`}>View</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No surveys yet. Create your first one!
              </p>
              <Button asChild variant="outline">
                <Link href="/survey/new" className="gap-2">
                  <Plus className="h-4 w-4" />
                  New survey
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
