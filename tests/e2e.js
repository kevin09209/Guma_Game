#!/usr/bin/env node
/* ============================================================
   e2e.js — v0.6 端到端測試（Playwright）
   ------------------------------------------------------------
   覆蓋：場景選擇、男主/女主對話、出牌、汰換可重選、翻面補牌、
   忍受條、等等！！！、緊急任務、固定骰子、結局圖鑑與 BGM。
   ============================================================ */
const BASE = (process.env.E2E_BASE || "http://localhost:8000") + "/prototype/";

async function main() {
  const { chromium } = require("playwright");
  const launchOpts = process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {};
  const browser = await chromium.launch(launchOpts);
  let failures = 0;
  const report = (ok, name, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
    if (!ok) failures += 1;
  };

  async function newPage(url = BASE) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => localStorage.clear());
    page.on("pageerror", (error) => {
      console.error("PAGE ERROR:", error.message);
      failures += 1;
    });
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("404")) console.error("CONSOLE ERROR:", message.text());
    });
    await page.goto(url);
    return page;
  }

  async function completeOpeningDraw(page) {
    await page.click("#btn-start");
    await page.click("#btn-run-draw");
    await page.waitForTimeout(120);
    await page.click("#btn-run-draw");
  }

  async function advanceStory(page) {
    await page.mouse.click(640, 180);
    await page.waitForTimeout(25);
  }

  async function chooseFirstSceneOption(page) {
    await page.waitForSelector("#scene-choice-overlay:not(.hidden)", { timeout: 5000 });
    await page.click("#scene-choice-options .scene-choice-option >> nth=0");
  }

  async function playRun(page, cards, { doSwap = false, chooseOption = 0, emergencyCard = null } = {}) {
    let cardIndex = 0;
    let swapped = false;
    let emergencySeen = false;
    let sceneChoiceCount = 0;

    for (let step = 0; step < 1000; step += 1) {
      if (await page.locator("#screen-ending:not(.hidden)").count()) break;
      if (await page.locator("#scene-choice-overlay:not(.hidden)").count()) {
        const options = page.locator("#scene-choice-options .scene-choice-option");
        const count = await options.count();
        await options.nth(Math.min(chooseOption, count - 1)).click();
        sceneChoiceCount += 1;
        continue;
      }
      if (await page.locator("#cutin:not(.hidden)").count()) {
        await page.click("#cutin");
        continue;
      }
      if (await page.locator("#emergency-overlay:not(.hidden)").count()) {
        emergencySeen = true;
        if (emergencyCard && await page.locator(`#emergency-cards .card:has(.card-name:text-is("${emergencyCard}"))`).count()) {
          await page.click(`#emergency-cards .card:has(.card-name:text-is("${emergencyCard}"))`);
          await page.waitForTimeout(150);
          await page.click("#btn-emergency-roll");
        } else {
          await page.click("#btn-emergency-give-up");
        }
        continue;
      }
      if (await page.locator("#rescue-overlay:not(.hidden)").count()) {
        await page.click("#btn-no-rescue");
        continue;
      }
      if (await page.locator("#swap-overlay:not(.hidden)").count()) {
        if (doSwap && !swapped) {
          const hand = page.locator("#swap-hand .card");
          await hand.nth(0).click();
          const firstSelected = await hand.nth(0).evaluate((element) => element.classList.contains("selected-card"));
          await page.locator("#swap-hand .card").nth(1).click();
          const secondSelected = await page.locator("#swap-hand .card").nth(1).evaluate((element) => element.classList.contains("selected-card"));
          report(firstSelected && secondSelected, "汰換卡可反覆改選");
          await page.click("#btn-confirm-swap");
          await page.waitForSelector(".swap-flip-card", { timeout: 3000 });
          swapped = true;
          await page.waitForTimeout(1100);
        } else {
          await page.click("#btn-no-swap");
        }
        continue;
      }
      if (await page.locator("#hand-overlay:not(.hidden)").count()) {
        const name = cards[Math.min(cardIndex, cards.length - 1)];
        const target = page.locator(`#hand .card:has(.card-name:text-is("${name}"))`);
        if (await target.count()) await target.click();
        else await page.locator("#hand .card").first().click();
        cardIndex += 1;
        continue;
      }
      await advanceStory(page);
    }

    await page.waitForSelector("#screen-ending:not(.hidden)", { timeout: 10000 });
    return {
      title: (await page.textContent("#ending-title")).trim(),
      swapped,
      emergencySeen,
      sceneChoiceCount,
    };
  }

  // 場景選擇後必須先顯示男主台詞，再顯示女主回覆。
  {
    const page = await newPage(`${BASE}?hand=card_001,card_002,card_003,card_004,card_005`);
    await completeOpeningDraw(page);
    while (!(await page.locator("#scene-choice-overlay:not(.hidden)").count())) await advanceStory(page);
    await page.click("#scene-choice-options .scene-choice-option >> nth=0");
    await page.waitForSelector("#dialog:not(.hidden)");
    const firstSpeaker = (await page.textContent("#nameplate")).trim();
    await advanceStory(page);
    await advanceStory(page);
    const secondSpeaker = (await page.textContent("#nameplate")).trim();
    report(firstSpeaker === "Gumayuwei" && secondSpeaker !== "Gumayuwei", "場景選項進入對話框", `${firstSpeaker} → ${secondSpeaker}`);
    await page.close();
  }

  // 正常路線＋場景選擇題＋汰換翻面。
  {
    const page = await newPage(`${BASE}?hand=card_001,card_002,card_003,card_004,card_005`);
    await completeOpeningDraw(page);
    const result = await playRun(page, ["疑惑問號", "不急", "還有嗎？", "摩艾沉默"], { doSwap: true });
    report(result.sceneChoiceCount >= 1, "每場景選擇題", `出現 ${result.sceneChoiceCount} 次`);
    report(result.swapped, "確認後翻面補牌", `結局=${result.title}`);
    await page.close();
  }

  // 固定骰子 4：忍受度設為 0，進場後要先出現「等等！！！」並解鎖 Four 壞結局。
  {
    const page = await newPage(`${BASE}?hand=card_017,card_018,card_019,card_020,card_021&tolerance=0&dice=4`);
    await completeOpeningDraw(page);
    let sawWait = false;
    for (let step = 0; step < 250; step += 1) {
      if (await page.locator("#dialog:not(.hidden)").count()) {
        const text = await page.textContent("#dialog-text");
        if (text.includes("等等")) sawWait = true;
      }
      if (await page.locator("#emergency-overlay:not(.hidden)").count()) break;
      if (await page.locator("#scene-choice-overlay:not(.hidden)").count()) await page.click("#scene-choice-options .scene-choice-option >> nth=0");
      else if (await page.locator("#hand-overlay:not(.hidden)").count()) await page.click("#hand .card >> nth=0");
      else if (await page.locator("#cutin:not(.hidden)").count()) await page.click("#cutin");
      else await advanceStory(page);
    }
    await page.waitForSelector("#emergency-overlay:not(.hidden)", { timeout: 5000 });
    await page.click("#emergency-cards .card >> nth=0");
    await page.waitForTimeout(150);
    await page.click("#btn-emergency-roll");
    await page.waitForSelector("#screen-ending:not(.hidden)", { timeout: 5000 });
    const title = (await page.textContent("#ending-title")).trim();
    report(sawWait, "忍受歸零先喊等等");
    report(title === "Four! 回家自己爽了", "固定骰子 4 壞結局", title);
    await page.close();
  }

  // 固定骰子 1：SSR 救援應成功，不能立刻進壞結局。
  {
    const page = await newPage(`${BASE}?hand=card_017,card_018,card_019,card_020,card_021&tolerance=0&dice=1`);
    await completeOpeningDraw(page);
    let rescued = false;
    for (let step = 0; step < 350; step += 1) {
      if (await page.locator("#emergency-overlay:not(.hidden)").count()) {
        await page.click("#emergency-cards .card >> nth=0");
        await page.waitForTimeout(150);
        await page.click("#btn-emergency-roll");
        await page.waitForTimeout(850);
        rescued = !(await page.locator("#screen-ending:not(.hidden)").count());
        break;
      }
      if (await page.locator("#scene-choice-overlay:not(.hidden)").count()) await page.click("#scene-choice-options .scene-choice-option >> nth=0");
      else if (await page.locator("#hand-overlay:not(.hidden)").count()) await page.click("#hand .card >> nth=0");
      else if (await page.locator("#cutin:not(.hidden)").count()) await page.click("#cutin");
      else await advanceStory(page);
    }
    report(rescued, "固定骰子 1 救援成功");
    await page.close();
  }

  // 圖鑑應包含 13 個原結局＋4 個緊急結局。
  {
    const page = await newPage(BASE);
    await page.click("#btn-open-endings");
    const endingCards = await page.locator("#ending-gallery .ending-card").count();
    report(endingCards === 17, "緊急結局加入圖鑑", `結局格數=${endingCards}`);
    await page.click("#btn-close-endings");

    const icon0 = (await page.textContent("#btn-bgm")).trim();
    await page.click("#btn-bgm");
    const icon1 = (await page.textContent("#btn-bgm")).trim();
    await page.click("#btn-bgm");
    const icon2 = (await page.textContent("#btn-bgm")).trim();
    report(icon0 === "🔊" && icon1 === "🔇" && icon2 === "🔊", "BGM 靜音切換", `${icon0}→${icon1}→${icon2}`);
    await page.close();
  }

  await browser.close();
  if (failures) {
    console.error(`\n❌ e2e 失敗：${failures} 項`);
    process.exit(1);
  }
  console.log("\n✅ v0.6 e2e 全部通過");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
