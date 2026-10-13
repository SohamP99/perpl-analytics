import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const origin = process.env.PERPL_TEST_URL;
if (!origin)
  throw Error("Set PERPL_TEST_URL to a configured test or hosted deployment.");
const browser = await chromium.launch({
  channel: process.env.PERPL_BROWSER_CHANNEL || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  const card = page.locator("#total-volume");
  await expect(card.locator(".recharts-surface")).toBeVisible({
    timeout: 90000,
  });
  await expect(
    card.getByRole("button", { name: "Total volume: D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const cumulative = card.getByRole("switch", {
    name: "Total volume cumulative",
  });
  await expect(cumulative).toHaveAttribute("aria-checked", "false");
  await cumulative.click();
  await expect(cumulative).toHaveAttribute("aria-checked", "true");
  await card
    .getByRole("button", { name: "Total volume: W", exact: true })
    .click();
  await page.getByRole("button", { name: "30D", exact: true }).click();
  assert.ok(page.url().includes("range=30d"));
  await page.getByRole("button", { name: "Markets", exact: true }).click();
  assert.ok(page.url().includes("tab=markets"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Markets", exact: true }),
  ).toBeVisible();
  await page.goto(
    origin + "/?view=wallet&address=0xd14fb3f7411d2a5672ee2f66ba4b08c45850bba8",
  );
  await expect(
    page.getByRole("heading", { name: "Wallet explorer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Watch|Watching/, exact: false }).first(),
  ).toBeVisible({ timeout: 90000 });
  await page.goto(origin + "/methodology");
  await expect(
    page.getByRole("heading", { name: "Methodology", exact: true }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: chart controls, shareable state, wallet and methodology navigation.",
  );
} finally {
  await browser.close();
}
