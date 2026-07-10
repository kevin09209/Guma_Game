#!/usr/bin/env node
/* ============================================================
   e2e.js — 端到端測試（Playwright，node tests/e2e.js）
   ------------------------------------------------------------
   需求：npm i playwright（或全域安裝），以及本機伺服器：
     python3 -m http.server 8000   （在專案根目錄）
   環境變數：
     E2E_BASE=http://localhost:8000  伺服器位址（預設如左）
     E2E_CHROMIUM=/path/to/chrome    指定 Chromium 執行檔（可省略）

   覆蓋：開局抽卡流程、劇本推進、出牌、補救、汰換抽卡、
   結局判定、票券經濟、抽卡機、收藏、結局圖鑑、BGM 靜音鈕。
   使用 ?hand= 固定起手牌讓結局可預期；注意開局抽的卡會頂掉
   手牌最後一張，所以測試用牌一律放在前 4 格。
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

  // 建立乾淨分頁（每個情境重置 localStorage 確保可重現）
  async function newPage() {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => localStorage.clear());
    page.on("pageerror", (e) => { console.error("PAGE ERROR:", e.message); failures += 1; });
    page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) console.error("CONSOLE ERROR:", m.text()); });
    return page;
  }

  // 通用駕駛：不斷推進，遇到各種 overlay 做對應動作，直到結局畫面
  async function playRun(page, cards, { rescue = "skip", doSwap = false } = {}) {
    let cardIdx = 0;
    let rescueSeen = false;
    let swapped = false;
    for (let step = 0; step < 800; step += 1) {
      if (await page.locator("#screen-ending:not(.hidden)").count()) break;
      if (await page.locator("#screen-run-draw:not(.hidden)").count()) { await page.click("#btn-run-draw"); await page.waitForTimeout(120); continue; }
      if (await page.locator("#cutin:not(.hidden)").count()) { await page.click("#cutin"); continue; }
      if (await page.locator("#rescue-overlay:not(.hidden)").count()) {
        rescueSeen = true;
        if (rescue !== "skip") await page.click(`#rescue-cards .card:has(.card-name:text-is("${rescue}"))`);
        else await page.click("#btn-no-rescue");
        continue;
      }
      if (await page.locator("#swap-overlay:not(.hidden)").count()) {
        if (doSwap && !swapped) { swapped = true; await page.click("#swap-hand .card >> nth=4"); }
        else await page.click("#btn-no-swap");
        await page.waitForTimeout(80);
        continue;
      }
      if (await page.locator("#hand-overlay:not(.hidden)").count()) {
        const name = cards[Math.min(cardIdx, cards.length - 1)];
        await page.click(`#hand .card:has(.card-name:text-is("${name}"))`);
        cardIdx += 1;
        continue;
      }
      await page.mouse.click(640, 200);
      await page.waitForTimeout(45);
    }
    await page.waitForSelector("#screen-ending:not(.hidden)", { timeout: 8000 });
    const title = (await page.textContent("#ending-title")).trim();
    return { title, rescueSeen, swapped };
  }

  // ---------- 劇情與結局路線（測試卡放前 4 格；第 5 格會被開局抽卡頂掉）----------
  const routes = [
    { name: "湯圓純愛路線", hand: "card_004,card_005,card_001,card_002,card_006", cards: ["還有嗎？", "摩艾沉默", "疑惑問號", "還有嗎？"], expect: "紅豆湯圓純愛" },
    { name: "不急告白路線", hand: "card_002,card_001,card_003,card_004,card_006", cards: ["不急", "不急", "不急", "不急"], expect: "不急告白" },
    { name: "霸總過量路線(不補救)", hand: "card_009,card_001,card_002,card_004,card_006", cards: ["怎麼跟我鬥", "怎麼跟我鬥", "怎麼跟我鬥", "怎麼跟我鬥"], expect: "霸總過量" },
  ];
  for (const route of routes) {
    const page = await newPage();
    await page.goto(`${BASE}?hand=${route.hand}`);
    await page.click("#btn-start");
    const { title } = await playRun(page, route.cards);
    report(title === route.expect, route.name, `結局=「${title}」預期=「${route.expect}」`);
    await page.close();
  }

  // ---------- 補救流程（會議室宣戰 → 用「蛤？」救場）----------
  {
    const page = await newPage();
    await page.goto(`${BASE}?hand=card_009,card_006,card_002,card_004,card_001`);
    await page.click("#btn-start");
    const { rescueSeen, title } = await playRun(page, ["怎麼跟我鬥", "怎麼跟我鬥", "怎麼跟我鬥", "不急"], { rescue: "蛤？" });
    report(rescueSeen, "錯卡補救流程", `補救提示出現=${rescueSeen}，結局=「${title}」`);
    await page.close();
  }

  // ---------- 汰換抽卡流程（v0.4：汰換後進抽卡畫面補牌）----------
  {
    const page = await newPage();
    await page.goto(`${BASE}?hand=card_001,card_002,card_003,card_004,card_006`);
    await page.click("#btn-start");
    const { swapped, title } = await playRun(page, ["疑惑問號", "疑惑問號", "疑惑問號", "疑惑問號"], { doSwap: true });
    report(swapped, "手牌汰換抽卡流程", `有執行汰換=${swapped}，結局=「${title}」`);
    await page.close();
  }

  // ---------- 票券經濟＋抽卡機＋收藏＋結局圖鑑＋BGM ----------
  {
    const page = await newPage();
    await page.goto(`${BASE}?hand=card_001,card_002,card_003,card_004,card_006`);
    await page.click("#btn-start");
    await playRun(page, ["疑惑問號", "不急", "還有嗎？", "不急"]); // 跑完一輪拿票券（新結局 +2）
    await page.click("#btn-back-home");
    const progress = await page.textContent("#home-progress");
    report(/抽卡券/.test(progress), "結局發放抽卡券", progress.replace(/\s+/g, " ").trim());

    await page.click("#btn-open-gacha");
    await page.click("#btn-draw-one");
    await page.waitForTimeout(300);
    const drew = await page.locator("#gacha-results .gacha-card").count();
    report(drew === 1, "抽卡機（用 1 張券）", `結果卡數=${drew}`);
    await page.click("#btn-close-gacha");

    await page.click("#btn-open-collection");
    const colCards = await page.locator("#collection-grid .collection-card").count();
    report(colCards === 25, "卡片收藏頁", `顯示卡數=${colCards}/25`);
    await page.click("#btn-close-collection");

    await page.click("#btn-open-endings");
    const endingCards = await page.locator("#ending-gallery .ending-card").count();
    const unlockedCount = await page.locator("#ending-gallery .ending-card.unlocked").count();
    report(endingCards === 13 && unlockedCount >= 1, "結局圖鑑", `共 ${endingCards} 格，已解鎖 ${unlockedCount}`);
    await page.click("#btn-close-endings");

    // BGM 靜音鈕：點一下變 🔇、再點回 🔊
    const icon0 = (await page.textContent("#btn-bgm")).trim();
    await page.click("#btn-bgm");
    const icon1 = (await page.textContent("#btn-bgm")).trim();
    await page.click("#btn-bgm");
    const icon2 = (await page.textContent("#btn-bgm")).trim();
    report(icon0 === "🔊" && icon1 === "🔇" && icon2 === "🔊", "BGM 靜音切換", `${icon0}→${icon1}→${icon2}`);
    await page.close();
  }

  await browser.close();
  if (failures) { console.error(`\n❌ e2e 失敗：${failures} 項`); process.exit(1); }
  console.log("\n✅ e2e 全部通過");
}

main().catch((e) => { console.error(e); process.exit(1); });
