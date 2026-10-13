import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const origin = process.env.PERPL_TEST_URL;
if (!origin) throw Error("Set PERPL_TEST_URL to a configured deployment.");
const browser = await chromium.launch({
  channel: process.env.PERPL_BROWSER_CHANNEL || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir(".sites-runtime/qa", { recursive: true });
  for (const width of [1440, 1024, 390])
    for (const theme of ["dark", "light"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin);
      const toggle = page.getByRole("button", {
        name: "Switch to " + theme + " mode",
        exact: true,
      });
      if (await toggle.count()) await toggle.click();
      for (const tab of [
        "Overview",
        "Markets",
        "Fees",
        "Capital flows",
        "Users & activity",
        "Risk & funding",
        "Traders",
        "Liquidations",
      ]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        await expect(
          page.getByRole("heading", { name: tab, exact: true }),
        ).toBeVisible();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 2,
          ),
          tab + " must not overflow",
        );
        await page.screenshot({
          path:
            ".sites-runtime/qa/" +
            tab.replaceAll(/[^a-z0-9]/gi, "-") +
            "-" +
            width +
            "-" +
            theme +
            ".png",
          fullPage: true,
        });
      }
    }
  assert.deepEqual(errors, []);
  console.log("PASS: all tabs at three widths in two themes.");
} finally {
  await browser.close();
}
