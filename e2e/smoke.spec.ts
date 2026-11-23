import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const VIEWS: Array<[string, string]> = [
  ["seeded", "Seeded run"], ["live", "Live scan"], ["verdicts", "Verdicts"], ["graph", "Evidence graph"],
  ["deps", "Dependencies"], ["budget", "Context budget"], ["tournament", "Patch tournament"], ["handoffs", "Handoff"],
];

function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m: ConsoleMessage) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  return problems;
}

for (const [width, height, name] of [[1440, 900, "desktop"], [390, 844, "mobile"]] as const) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } });

    test(`every view loads without console errors (${name})`, async ({ page }) => {
      const problems = watch(page);
      await page.goto("/");
      await expect(page.getByTestId("stat-tile").first()).toBeVisible();
      for (const [id, title] of VIEWS) {
        await page.evaluate((v) => { window.location.hash = `/${v}`; }, id);
        await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
        if (id === "verdicts") await expect(page.getByTestId("finding")).toHaveCount(11);
        if (id === "graph") await expect(page.getByTestId(width < 768 ? "graph-list" : "graph-canvas")).toBeVisible();
        if (id === "tournament") await expect(page.getByTestId("candidate").first()).toBeVisible({ timeout: 15_000 });
        if (id === "handoffs") await expect(page.getByRole("button", { name: /Copy Handoff brief/ })).toBeVisible({ timeout: 15_000 });
        if (id === "live") await expect(page.getByTestId("empty-state")).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `horizontal overflow on ${id}`).toBeLessThanOrEqual(0);
      }
      expect(problems).toEqual([]);
    });
  });
}

test("keyboard: skip link is first tab stop and focus is visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("stat-tile").first()).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});

test("theme toggle switches and persists; first load follows prefers-color-scheme", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await ctx.close();
});

test("live scan failure shows the reason and never a token", async ({ page }) => {
  await page.route("**/api/live", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "GitHub API 403 (Bearer ghp_abcdefghijklmnopqrstuv)" }) }));
  await page.goto("/#/live");
  await page.getByLabel(/GitHub repository or pull request URL/).fill("https://github.com/o/r");
  await page.getByRole("button", { name: "Scan" }).click();
  const alert = page.getByTestId("error-state");
  await expect(alert).toContainText("GitHub API 403");
  await expect(alert).not.toContainText("ghp_abcdefghijklmnopqrstuv");
});

test("dependencies reflow into cards at 390px with no horizontal scroll; table on desktop", async ({ browser }) => {
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await mobile.newPage();
  await m.goto("/#/deps");
  await expect(m.getByTestId("dep-card")).toHaveCount(2);
  await expect(m.getByTestId("dep-cards")).toBeVisible();
  await expect(m.getByRole("table")).toBeHidden();
  expect(await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await mobile.close();

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const d = await desktop.newPage();
  await d.goto("/#/deps");
  await expect(d.getByRole("table")).toBeVisible();
  await expect(d.getByTestId("dep-cards")).toBeHidden();
  await desktop.close();
});
