import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// Flat config for the ESLint CLI (`next lint` is deprecated). FlatCompat loads
// Next's shareable configs, as the Next.js 15 docs describe.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "react/no-unescaped-entities": "off" } },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/**", "paper/**"] },
];

export default eslintConfig;
