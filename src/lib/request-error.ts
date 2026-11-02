/**
 * The message the form shows when /api/run refuses a request. The route answers
 * with JSON, but Vercel's firewall answers a rate-limited request itself, before
 * the route runs, so its body can hold anything.
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
