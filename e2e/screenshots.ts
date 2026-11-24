/**
 * Capture the README screenshots at desktop width against a running production server.
 *   pnpm build && pnpm start -p 3111   (in another terminal)
 *   pnpm screenshots docs/screenshots/after [theme: dark|light]
 */
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "docs/screenshots/after";
const theme = process.argv[3] ?? "dark";
const base = process.env.ASSAY_URL ?? "http://localhost:3111";
const VIEWS = ["seeded", "verdicts", "authorship"];

const browser = await chromium.launch();
for (const [name, width, height] of [["desktop", 1440, 900]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme === "light" ? "light" : "dark", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.getByTestId("stat-tile").first().waitFor();
  for (const v of VIEWS) {
    await page.evaluate((id) => { window.location.hash = `/${id}`; }, v);
    await page.waitForTimeout(v === "tournament" || v === "handoffs" || v === "authorship" ? 1800 : 300);
    await page.screenshot({ path: `${out}/${v}-${name}${theme === "light" ? "-light" : ""}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(`screenshots written to ${out}`);
