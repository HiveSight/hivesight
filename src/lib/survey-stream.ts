/**
 * Shared utilities for SSE-based survey streaming.
 * Used by both the hero survey form and the new survey page.
 */

import type { ProgressState } from "@/types";

export type { ProgressState };

export interface StreamCallbacks {
  onProgress: (state: ProgressState) => void;
  onComplete: (surveyId: string) => void;
  onError: (message: string) => void;
}

/**
 * Read an SSE response stream and dispatch events via callbacks.
 */
export async function readSurveyStream(
  response: Response,
  callbacks: StreamCallbacks
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7);
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));

        if (eventType === "progress") {
          callbacks.onProgress({
            stage: data.stage,
            message: data.message,
            progress: data.progress,
            completed: data.completed,
            total: data.total,
          });
        } else if (eventType === "complete") {
          callbacks.onComplete(data.surveyId);
        } else if (eventType === "error") {
          callbacks.onError(data.message);
        }
      }
    }
  }
}
