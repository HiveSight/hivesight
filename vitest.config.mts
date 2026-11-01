import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig leaves JSX for Next; tests that import a page need it compiled here.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
