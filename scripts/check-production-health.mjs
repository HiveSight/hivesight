const baseUrl =
  process.env.HEALTHCHECK_URL?.replace(/\/$/, "") ?? "https://hivesight.ai";
const target = `${baseUrl}/api/health`;
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS ?? 15000);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(target, {
    signal: controller.signal,
    headers: {
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => null);

  console.log(
    JSON.stringify(
      {
        url: target,
        httpStatus: response.status,
        ok: response.ok,
        body,
      },
      null,
      2
    )
  );

  if (!response.ok || body?.status !== "ok") {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        url: target,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
