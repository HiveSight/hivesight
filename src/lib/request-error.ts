/**
 * The message the form shows when a request to /api/run fails. The route answers
 * with JSON, but when Vercel's firewall refuses a request, it answers with a
 * plain-text body before the route runs.
 */
export function requestErrorMessage(status: number, data: unknown): string {
  const body = (data ?? {}) as { error?: unknown; details?: Array<{ message?: unknown }> };
  if (typeof body.error === "string") {
    const detail = body.details?.[0]?.message;
    return typeof detail === "string" && detail ? `${body.error}: ${detail}` : body.error;
  }
  if (status === 429) {
    return "Your network sent too many requests in the last minute. Please wait a minute and try again.";
  }
  return `Request failed (${status})`;
}
