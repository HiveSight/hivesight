import { createHmac } from "node:crypto";
import { isIPv6 } from "node:net";

/** The caller's address from the header Vercel sets. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function ipv6Groups(address: string): number[] {
  const hex = address.replace(
    /(\d+)\.(\d+)\.(\d+)\.(\d+)$/,
    (_, a, b, c, d) =>
      `${((Number(a) << 8) | Number(b)).toString(16)}:${((Number(c) << 8) | Number(d)).toString(16)}`
  );
  const [head, tail] = hex.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = hex.includes("::") ? 8 - left.length - right.length : 0;
  return [...left, ...Array<string>(missing).fill("0"), ...right].map((g) => parseInt(g, 16));
}

/**
 * The network a daily allowance applies to. An IPv4 address stands alone, but
 * one IPv6 host usually holds a whole /64 and could rotate through it.
 */
export function visitorNetwork(ip: string): string {
  const address = ip.split("%")[0].toLowerCase();
  if (!isIPv6(address)) return address;
  const groups = ipv6Groups(address);
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [high, low] = groups.slice(6);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`;
}

/** Keyed hash of a visitor's network, so the database never holds an address. */
export function visitorKey(network: string, secret: string): string {
  return createHmac("sha256", secret).update(`hivesight:run-quota:${network}`).digest("hex");
}
