"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

type Respondent = Database["public"]["Tables"]["respondents"]["Row"];
type Response = Database["public"]["Tables"]["responses"]["Row"];

interface ResponseWithRespondent extends Response {
  respondent: Respondent;
}

interface ResponseTableProps {
  responses: ResponseWithRespondent[];
  responseType: "likert" | "open_ended";
}

const LIKERT_LABELS: Record<string, string> = {
  strongly_disagree: "Strongly Disagree",
  disagree: "Disagree",
  neutral: "Neutral",
  agree: "Agree",
  strongly_agree: "Strongly Agree",
};

export function ResponseTable({ responses, responseType }: ResponseTableProps) {
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const paginatedResponses = responses.slice(
    page * pageSize,
    (page + 1) * pageSize
  );
  const totalPages = Math.ceil(responses.length / pageSize);

  const downloadCSV = () => {
    const headers =
      responseType === "likert"
        ? ["Age", "Sex", "Race/Ethnicity", "Occupation", "Income", "State", "ZIP", "Response", "Reasoning"]
        : ["Age", "Sex", "Race/Ethnicity", "Occupation", "Income", "State", "ZIP", "Response"];

    const rows = responses.map((r) => {
      const base = [
        r.respondent.age,
        r.respondent.sex ?? "",
        r.respondent.race_ethnicity ?? "",
        r.respondent.occupation ?? "",
        r.respondent.income,
        r.respondent.state,
        r.respondent.zip_code ?? "",
      ];
      if (responseType === "likert") {
        return [
          ...base,
          r.likert_response ? LIKERT_LABELS[r.likert_response] : "",
          r.reasoning || "",
        ];
      }
      return [...base, r.open_ended_response || ""];
    });

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "survey-responses.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-2">
          <Download className="h-3.5 w-3.5" />
          Download CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-amber-900/[0.04] dark:border-amber-100/[0.04]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-amber-900/[0.06] bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-100/[0.06]">
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">Age</th>
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">Sex</th>
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">Race/Ethnicity</th>
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">Occupation</th>
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">Income</th>
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">ZIP</th>
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">Response</th>
              {responseType === "likert" && (
                <th className="text-left py-3 px-3 font-medium text-muted-foreground">Reasoning</th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedResponses.map((response, i) => (
              <tr key={response.id} className={`border-b border-amber-900/[0.03] transition-colors duration-150 hover:bg-amber-50/30 dark:border-amber-100/[0.03] dark:hover:bg-amber-950/10 ${i % 2 === 0 ? '' : 'bg-amber-50/20 dark:bg-amber-950/5'}`}>
                <td className="py-2.5 px-3">{response.respondent.age}</td>
                <td className="py-2.5 px-3">
                  {response.respondent.sex ?? "-"}
                </td>
                <td className="py-2.5 px-3 max-w-[120px] truncate">
                  {response.respondent.race_ethnicity ?? "-"}
                </td>
                <td className="py-2.5 px-3 max-w-[120px] truncate">
                  {response.respondent.occupation ?? "-"}
                </td>
                <td className="py-2.5 px-3">
                  ${response.respondent.income.toLocaleString()}
                </td>
                <td className="py-2.5 px-3">
                  {response.respondent.zip_code ?? "-"}
                </td>
                <td className="py-2.5 px-3">
                  {responseType === "likert"
                    ? response.likert_response
                      ? LIKERT_LABELS[response.likert_response]
                      : "-"
                    : response.open_ended_response || "-"}
                </td>
                {responseType === "likert" && (
                  <td className="py-2.5 px-3 max-w-xs truncate">
                    {response.reasoning || "-"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1} -{" "}
            {Math.min((page + 1) * pageSize, responses.length)} of{" "}
            {responses.length}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
              className="gap-1.5"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="gap-1.5"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
