import { describe, expect, it } from "vitest";

/**
 * WCAG AA contrast checks for the HiveSight design tokens declared in
 * `src/app/globals.css`. Each pair below documents a guarantee the design
 * system makes — drift below the declared minimum fails CI before publish.
 *
 * The tokens live in CSS as HSL triplets (`H S% L%`); we resolve them to hex
 * here so the assertions don't depend on a browser to compute relative
 * luminance.
 *
 * @see https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */

/** Convert a CSS `H S% L%` triplet to `#rrggbb`. */
function hslToHex(h: number, s: number, l: number): string {
  // Standard CSS HSL → RGB conversion.
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const lum = l / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = lum - c / 2;
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/** WCAG 2.x relative luminance for `#rrggbb`. */
function relativeLuminance(hex: string): number {
  const value = hex.replace(/^#/, "");
  const rgb = [0, 1, 2].map((i) => {
    const channel = parseInt(value.slice(i * 2, i * 2 + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(fg: string, bg: string): number {
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Tokens resolved from `src/app/globals.css`. Keep in sync with that file. */
const lightTokens = {
  background: hslToHex(40, 33, 99),
  foreground: hslToHex(30, 10, 12),
  card: hslToHex(40, 50, 99),
  cardForeground: hslToHex(30, 10, 12),
  primary: hslToHex(32, 95, 35),
  primaryForeground: hslToHex(40, 100, 98),
  secondary: hslToHex(35, 30, 95),
  secondaryForeground: hslToHex(30, 10, 15),
  muted: hslToHex(35, 20, 95),
  mutedForeground: hslToHex(30, 5, 45),
  accent: hslToHex(35, 40, 94),
  accentForeground: hslToHex(30, 10, 15),
  destructive: hslToHex(0, 73, 49),
  destructiveForeground: hslToHex(0, 0, 98),
  border: hslToHex(35, 15, 88),
  borderStrong: hslToHex(35, 15, 50),
  ring: hslToHex(32, 95, 35),
} as const;

const darkTokens = {
  background: hslToHex(30, 8, 6),
  foreground: hslToHex(35, 20, 95),
  card: hslToHex(30, 8, 8),
  cardForeground: hslToHex(35, 20, 95),
  primary: hslToHex(38, 92, 50),
  primaryForeground: hslToHex(30, 10, 8),
  secondary: hslToHex(30, 8, 14),
  secondaryForeground: hslToHex(35, 20, 95),
  muted: hslToHex(30, 8, 14),
  mutedForeground: hslToHex(30, 8, 55),
  accent: hslToHex(30, 10, 14),
  accentForeground: hslToHex(35, 20, 95),
  destructive: hslToHex(0, 73, 50),
  destructiveForeground: hslToHex(0, 0, 98),
  border: hslToHex(30, 8, 18),
  borderStrong: hslToHex(30, 8, 45),
  ring: hslToHex(38, 92, 50),
} as const;

type ContrastPair = {
  description: string;
  fg: string;
  bg: string;
  /** WCAG SC 1.4.3 normal text: 4.5. SC 1.4.11 non-text (borders, focus
   * rings, control boundaries): 3.0. */
  minRatio: number;
};

const lightPairs: ContrastPair[] = [
  // Body and surface text
  {
    description: "light: foreground on background",
    fg: lightTokens.foreground,
    bg: lightTokens.background,
    minRatio: 4.5,
  },
  {
    description: "light: card-foreground on card",
    fg: lightTokens.cardForeground,
    bg: lightTokens.card,
    minRatio: 4.5,
  },
  {
    description: "light: muted-foreground on background (caption text limit)",
    fg: lightTokens.mutedForeground,
    bg: lightTokens.background,
    minRatio: 4.5,
  },
  {
    description: "light: accent-foreground on accent",
    fg: lightTokens.accentForeground,
    bg: lightTokens.accent,
    minRatio: 4.5,
  },
  {
    description: "light: secondary-foreground on secondary",
    fg: lightTokens.secondaryForeground,
    bg: lightTokens.secondary,
    minRatio: 4.5,
  },
  // Brand and status fills
  {
    description: "light: primary as text on background (link / status text)",
    fg: lightTokens.primary,
    bg: lightTokens.background,
    minRatio: 4.5,
  },
  {
    description: "light: primary-foreground on primary (button label)",
    fg: lightTokens.primaryForeground,
    bg: lightTokens.primary,
    minRatio: 4.5,
  },
  {
    description: "light: destructive-foreground on destructive (button label)",
    fg: lightTokens.destructiveForeground,
    bg: lightTokens.destructive,
    minRatio: 4.5,
  },
  // Non-text per SC 1.4.11
  {
    description: "light: border-strong on background (form input border)",
    fg: lightTokens.borderStrong,
    bg: lightTokens.background,
    minRatio: 3.0,
  },
  {
    description: "light: ring on background (focus indicator)",
    fg: lightTokens.ring,
    bg: lightTokens.background,
    minRatio: 3.0,
  },
];

const darkPairs: ContrastPair[] = [
  {
    description: "dark: foreground on background",
    fg: darkTokens.foreground,
    bg: darkTokens.background,
    minRatio: 4.5,
  },
  {
    description: "dark: card-foreground on card",
    fg: darkTokens.cardForeground,
    bg: darkTokens.card,
    minRatio: 4.5,
  },
  {
    description: "dark: muted-foreground on background",
    fg: darkTokens.mutedForeground,
    bg: darkTokens.background,
    minRatio: 4.5,
  },
  {
    description: "dark: accent-foreground on accent",
    fg: darkTokens.accentForeground,
    bg: darkTokens.accent,
    minRatio: 4.5,
  },
  {
    description: "dark: secondary-foreground on secondary",
    fg: darkTokens.secondaryForeground,
    bg: darkTokens.secondary,
    minRatio: 4.5,
  },
  {
    description: "dark: primary as text on background (link)",
    fg: darkTokens.primary,
    bg: darkTokens.background,
    minRatio: 4.5,
  },
  {
    description: "dark: primary-foreground on primary",
    fg: darkTokens.primaryForeground,
    bg: darkTokens.primary,
    minRatio: 4.5,
  },
  {
    description: "dark: destructive-foreground on destructive",
    fg: darkTokens.destructiveForeground,
    bg: darkTokens.destructive,
    minRatio: 4.5,
  },
  {
    description: "dark: destructive on background (SC 1.4.11 surface)",
    fg: darkTokens.destructive,
    bg: darkTokens.background,
    minRatio: 3.0,
  },
  {
    description: "dark: border-strong on background (form input border)",
    fg: darkTokens.borderStrong,
    bg: darkTokens.background,
    minRatio: 3.0,
  },
  {
    description: "dark: ring on background (focus indicator)",
    fg: darkTokens.ring,
    bg: darkTokens.background,
    minRatio: 3.0,
  },
];

describe("token contrast", () => {
  it("contrastRatio matches known WCAG values", () => {
    // Maximum contrast.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    // Same color always returns 1.
    expect(contrastRatio("#92400e", "#92400e")).toBeCloseTo(1, 5);
  });

  it("hslToHex matches a known WCAG-tested value", () => {
    // amber-700-ish; sanity check the conversion routine.
    expect(hslToHex(32, 95, 35)).toBe("#ae5f04");
  });

  it("each light-mode pair clears its declared WCAG minimum", () => {
    const failures = lightPairs
      .map((pair) => {
        const ratio = contrastRatio(pair.fg, pair.bg);
        return ratio < pair.minRatio
          ? `${pair.description}: ${pair.fg} on ${pair.bg} = ${ratio.toFixed(
              2,
            )}:1 (need ${pair.minRatio.toFixed(1)}:1)`
          : null;
      })
      .filter((m): m is string => m !== null);
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} light-mode pair(s) below WCAG minimum:\n  ${failures.join(
          "\n  ",
        )}`,
      );
    }
  });

  it("each dark-mode pair clears its declared WCAG minimum", () => {
    const failures = darkPairs
      .map((pair) => {
        const ratio = contrastRatio(pair.fg, pair.bg);
        return ratio < pair.minRatio
          ? `${pair.description}: ${pair.fg} on ${pair.bg} = ${ratio.toFixed(
              2,
            )}:1 (need ${pair.minRatio.toFixed(1)}:1)`
          : null;
      })
      .filter((m): m is string => m !== null);
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} dark-mode pair(s) below WCAG minimum:\n  ${failures.join(
          "\n  ",
        )}`,
      );
    }
  });
});
