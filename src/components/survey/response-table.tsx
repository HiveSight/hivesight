"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";

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
        <Button variant="outline" size="sm" onClick={downloadCSV}>
          Download CSV
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3">Age</th>
              <th className="text-left py-2 px-3">Sex</th>
              <th className="text-left py-2 px-3">Race/Ethnicity</th>
              <th className="text-left py-2 px-3">Occupation</th>
              <th className="text-left py-2 px-3">Income</th>
              <th className="text-left py-2 px-3">ZIP</th>
              <th className="text-left py-2 px-3">Response</th>
              {responseType === "likert" && (
                <th className="text-left py-2 px-3">Reasoning</th>
              )}
            </tr>
          </thead>
          <tbody>
            {paginatedResponses.map((response) => (
              <tr key={response.id} className="border-b">
                <td className="py-2 px-3">{response.respondent.age}</td>
                <td className="py-2 px-3">
                  {response.respondent.sex ?? "-"}
                </td>
                <td className="py-2 px-3 max-w-[120px] truncate">
                  {response.respondent.race_ethnicity ?? "-"}
                </td>
                <td className="py-2 px-3 max-w-[120px] truncate">
                  {response.respondent.occupation ?? "-"}
                </td>
                <td className="py-2 px-3">
                  ${response.respondent.income.toLocaleString()}
                </td>
                <td className="py-2 px-3">
                  {response.respondent.zip_code ?? "-"}
                </td>
                <td className="py-2 px-3">
                  {responseType === "likert"
                    ? response.likert_response
                      ? LIKERT_LABELS[response.likert_response]
                      : "-"
                    : response.open_ended_response || "-"}
                </td>
                {responseType === "likert" && (
                  <td className="py-2 px-3 max-w-xs truncate">
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
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
