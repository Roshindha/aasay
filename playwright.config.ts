import { defineConfig } from "@playwright/test";

const port = Number(process.env.ASSAY_E2E_PORT ?? 3112);

/** Smoke tests run against the production build: `pnpm build && pnpm e2e` (browsers: `pnpm exec playwright install chromium`). */
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { ASSAY_OFFLINE: "1" },
  },
});
