import { notFound } from "next/navigation";
import { Results } from "@/components/results";
import { getRun } from "@/lib/store";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const outcome = await getRun(id);
  if (outcome.status === "missing") notFound();
  if (outcome.status === "unavailable") {
    return (
      <div className="mx-auto max-w-3xl px-5 py-14">
        <p className="eyebrow mb-3">Shared estimate</p>
        <h1 className="text-2xl font-extrabold tracking-tight">
          This estimate can&apos;t be loaded right now
        </h1>
        <p className="mt-3 text-muted">
          Saved estimates are temporarily unavailable. The link is not broken; please try again
          later.
        </p>
      </div>
    );
  }
  const result = outcome.result;

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <p className="eyebrow mb-3">Shared estimate</p>
      <h1 className="mb-8 max-w-3xl text-2xl font-extrabold tracking-tight sm:text-3xl">
        “{result.question}”
      </h1>
      <Results result={result} runId={id} showQuestion={false} />
    </div>
  );
}
