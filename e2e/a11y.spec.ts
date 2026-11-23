import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const VIEWS = ["seeded", "live", "verdicts", "graph", "deps", "budget", "tournament", "handoffs"];

for (const scheme of ["dark", "light"] as const) {
  test(`WCAG 2.1 A/AA scan of every view (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByTestId("stat-tile").first()).toBeVisible();
    for (const v of VIEWS) {
      await page.evaluate((id) => { window.location.hash = `/${id}`; }, v);
      if (v === "tournament") await expect(page.getByTestId("candidate").first()).toBeVisible({ timeout: 15_000 });
      if (v === "handoffs") await expect(page.getByRole("button", { name: /Copy Handoff brief/ })).toBeVisible({ timeout: 15_000 });
      if (v === "verdicts") await expect(page.getByTestId("finding").first()).toBeVisible();
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = res.violations.map((x) => `${v}: ${x.id} (${x.nodes.length}) ${x.nodes[0]?.html.slice(0, 120)}`);
      expect(summary, `axe violations on ${v}`).toEqual([]);
    }
    await ctx.close();
  });
}
