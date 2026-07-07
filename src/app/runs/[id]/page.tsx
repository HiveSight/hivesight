import { notFound } from "next/navigation";
import { Results } from "@/components/results";
import { getRun } from "@/lib/store";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const result = await getRun(id);
  if (!result) notFound();

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <p className="eyebrow mb-3">Shared estimate</p>
      <h1 className="mb-8 max-w-3xl text-2xl font-extrabold tracking-tight sm:text-3xl">
        “{result.question}”
      </h1>
      <Results result={result} runId={id} />
    </div>
  );
}
