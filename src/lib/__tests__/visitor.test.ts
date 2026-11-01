import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clientIp, visitorKey, visitorNetwork } from "../visitor";

const group = fc.integer({ min: 0, max: 0xffff });
const groups = (n: number) => fc.array(group, { minLength: n, maxLength: n });
/** An address outside ::/80, which holds the IPv4-mapped block. */
const hex = (g: number[]) => g.map((x) => x.toString(16)).join(":");

describe("clientIp", () => {
  it("reads the first forwarded address", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });

  it("groups callers with no usable header together", () => {
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": " " }))).toBe("unknown");
  });
});

describe("visitorNetwork", () => {
  it.each([
    ["203.0.113.9", "203.0.113.9"],
    ["::ffff:203.0.113.9", "203.0.113.9"],
    ["::ffff:cb00:7109", "203.0.113.9"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:DB8:1:2::1", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::1%eth0", "2001:db8:1:2::/64"],
    ["::1", "0:0:0:0::/64"],
    ["not an address", "not an address"],
    ["unknown", "unknown"],
  ])("maps %s to %s", (ip, network) => {
    expect(visitorNetwork(ip)).toBe(network);
  });

  it("leaves every IPv4 address alone and folds its mapped form into it", () => {
    fc.assert(
      fc.property(fc.ipV4(), (ip) => {
        expect(visitorNetwork(ip)).toBe(ip);
        expect(visitorNetwork(`::ffff:${ip}`)).toBe(ip);
      })
    );
  });

  it("gives every spelling of an IPv6 address the same network", () => {
    fc.assert(
      fc.property(fc.ipV6(), (ip) => {
        const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
        expect(visitorNetwork(canonical)).toBe(visitorNetwork(ip));
        expect(visitorNetwork(ip.toUpperCase())).toBe(visitorNetwork(ip));
      })
    );
  });

  it("ignores the host half of an IPv6 address and keeps the network half", () => {
    fc.assert(
      fc.property(groups(4), groups(4), groups(4), group, (network, hostA, hostB, other) => {
        const first = [network[0] | 1, ...network.slice(1)];
        expect(visitorNetwork(hex([...first, ...hostA]))).toBe(visitorNetwork(hex([...first, ...hostB])));
        fc.pre(other !== first[3]);
        expect(visitorNetwork(hex([...first.slice(0, 3), other, ...hostA]))).not.toBe(
          visitorNetwork(hex([...first, ...hostA]))
        );
      })
    );
  });
});

describe("visitorKey", () => {
  it("hides the address and depends on both the address and the secret", () => {
    fc.assert(
      fc.property(fc.ipV4(), fc.ipV4(), fc.string({ minLength: 1 }), (a, b, secret) => {
        const key = visitorKey(a, secret);
        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(visitorKey(a, secret)).toBe(key);
        expect(visitorKey(a, `${secret}x`)).not.toBe(key);
        if (a !== b) expect(visitorKey(b, secret)).not.toBe(key);
      })
    );
  });
});
