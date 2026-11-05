"use strict";
const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const child = require("node:child_process");

const root = path.resolve(__dirname, "..");
const base = "file://" + path.join(root, "redesign-preview.html");
const chrome = process.env.CHROME_BIN ||
  child.execFileSync("bash", ["-lc", "command -v google-chrome || command -v chromium || command -v chromium-browser"]).toString().trim();

(async () => {
  fs.mkdirSync(path.join(root, "test-artifacts"), { recursive: true });
  const browser = await chromium.launch({ executablePath: chrome, headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
      acceptDownloads: true, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#heroCanvas");
    assert.equal(await page.title(), "Lokal Audio Lab — Sound makes the scene.");
    assert.equal(await page.locator(".sound-row").count(), 6);
    assert.equal(await page.locator(".category-row").count(), 5);

    // A real browser must run the Web Audio engine after a user gesture.
    await page.locator("#heroPlay").click();
    await page.waitForTimeout(100);
    assert.match(await page.locator("#visualStatus").textContent(), /SIGNAL ACTIVE/);
    await page.locator("#heroPlay").click();

    // Before/after is a meaningful A/B switch, with the same scene animation.
    await page.locator('#compareModes button[data-mode="before"]').click();
    assert.match(await page.locator("#sceneAudioState").textContent(), /OFF/);
    await page.locator("#sceneReplay").click();
    assert.match(await page.locator("#sceneStatus").textContent(), /SILENT/);
    await page.locator('#compareModes button[data-mode="after"]').click();
    assert.match(await page.locator("#sceneAudioState").textContent(), /ON/);

    // Use-case context updates headline, sound and preview.
    await page.locator('[data-category="gaming"].category-row').click();
    assert.match(await page.locator("#categoryHeading").textContent(), /every action/);
    assert.equal(await page.locator("#categoryPlay").getAttribute("data-play"), "game");

    // Sound library filters without hiding the original free sampler controls.
    await page.locator('[data-filter="gaming"]').click();
    assert.equal(await page.locator(".sound-row:visible").count(), 1);
    assert.equal(await page.locator(".sound-row:visible").getAttribute("data-sound"), "game");
    await page.locator('[data-filter="all"]').click();
    assert.equal(await page.locator(".sound-row:visible").count(), 6);
    const download = page.waitForEvent("download");
    await page.locator('[data-download="impact"]').click();
    const file = await download;
    assert.equal(file.suggestedFilename(), "LokalAudioLab_Demo_impact.wav");

    await page.screenshot({ path: path.join(root, "test-artifacts/desktop.png"), fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1, acceptDownloads: true, reducedMotion: "reduce" });
    mobile.on("pageerror", (e) => errors.push(e.message));
    await mobile.goto(base, { waitUntil: "domcontentloaded" });
    assert.equal(await mobile.locator(".menu-toggle").isVisible(), true);
    await mobile.locator("#menuToggle").click();
    assert.equal(await mobile.locator("#mobileNav").isVisible(), true);
    await mobile.locator('#mobileNav a[href="#library"]').click();
    assert.equal(await mobile.locator("#mobileNav").isVisible(), false);
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 2, "mobile horizontal overflow = " + overflow);
    await mobile.screenshot({ path: path.join(root, "test-artifacts/mobile.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log("Browser UX PASS: sound engine, A/B modes, 5 categories, 6 sounds, download, mobile menu, no overflow or JS errors");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
