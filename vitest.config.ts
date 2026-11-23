import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // UI tests opt into jsdom with a `// @vitest-environment jsdom` docblock; everything else runs in node.
  test: { include: ["tests/**/*.test.{ts,tsx}"], testTimeout: 30000, environment: "node" },
});
