#!/usr/bin/env node
/* ============================================================
   validate.js — 遊戲資料完整性驗證（零依賴，node tests/validate.js）
   ------------------------------------------------------------
   改動 /data 的任何 JSON 之後必跑。檢查：
   - JSON 格式、必填欄位、id 唯一性
   - 場景引用的卡片/女主/下一站/背景圖是否存在
   - 結局條件引用的數值鍵與卡片是否有效、保底結局契約
   出錯以非零狀態碼結束（可接 CI）。
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const errors = [];
const warns = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warns.push(msg);

const STAT_KEYS = ["favorability", "awkwardness", "comedy", "sincerity", "confidence", "social_death", "appetite", "battle"];
const RARITIES = ["N", "R", "SR", "SSR", "UR"];
const BGM_MOODS = ["office", "chill", "festive", "romance"];
// 與 prototype/js/config.js 的 TUTORIAL_HAND 同步（教學手牌必須存在）
const TUTORIAL_HAND = ["card_001", "card_002", "card_003", "card_004", "card_005"];

let cards, heroines, scenesData, endings;
try {
  cards = read("data/cards.json").cards;
  heroines = read("data/heroines.json").heroines;
  scenesData = read("data/scenes.json");
  endings = read("data/endings.json").endings;
} catch (e) {
  console.error(`❌ JSON 解析失敗：${e.message}`);
  process.exit(1);
}

// ---------- 卡片 ----------
const cardIds = new Set();
for (const c of cards) {
  if (cardIds.has(c.id)) err(`cards: 重複的卡片 id ${c.id}`);
  cardIds.add(c.id);
  for (const key of ["id", "name", "rarity", "line", "description", "image"]) {
    if (!c[key]) err(`cards: ${c.id || "(無 id)"} 缺少欄位 ${key}`);
  }
  if (!RARITIES.includes(c.rarity)) err(`cards: ${c.id} 稀有度不合法 ${c.rarity}`);
  if (!Array.isArray(c.tags) || c.tags.length === 0) warn(`cards: ${c.id} 沒有 tags（標籤加成不會作用）`);
  for (const key of Object.keys(c.effects || {})) {
    if (!STAT_KEYS.includes(key)) err(`cards: ${c.id} effects 有未知數值 ${key}`);
  }
}
for (const id of TUTORIAL_HAND) if (!cardIds.has(id)) err(`教學手牌卡片不存在：${id}`);

// ---------- 女主角 ----------
const heroineIds = new Set(heroines.map((h) => h.id));
for (const h of heroines) {
  if (!h.id || !h.name) err(`heroines: 缺 id 或 name`);
  if (!Array.isArray(h.likes) || !Array.isArray(h.dislikes)) warn(`heroines: ${h.id} 缺 likes/dislikes 標籤`);
}

// ---------- 場景 ----------
const sceneIds = new Set(scenesData.scenes.map((s) => s.scene_id));
const validNext = (n) => n === "ending" || sceneIds.has(n);
if (!sceneIds.has(scenesData.start)) err(`scenes: start 指向不存在的場景 ${scenesData.start}`);

const checkScriptLines = (lines, where) => {
  for (const line of lines || []) {
    if (!["narration", "dialogue"].includes(line.type)) err(`${where}: 劇本行 type 不合法 ${line.type}`);
    if (line.type === "dialogue" && !line.speaker) err(`${where}: dialogue 缺 speaker`);
    if (typeof line.text !== "string" || !line.text) err(`${where}: 劇本行缺 text`);
  }
};

for (const s of scenesData.scenes) {
  const where = `scenes/${s.scene_id}`;
  if (!heroineIds.has(s.heroine)) err(`${where}: 女主角不存在 ${s.heroine}`);
  if (!fs.existsSync(path.join(ROOT, s.background))) err(`${where}: 背景圖不存在 ${s.background}`);
  if (!s.bgm) warn(`${where}: 沒有 bgm 欄位（會用預設 office）`);
  else if (!BGM_MOODS.includes(s.bgm)) err(`${where}: bgm 曲風不合法 ${s.bgm}（可用：${BGM_MOODS.join("/")}）`);
  checkScriptLines(s.intro_script, `${where}/intro`);
  for (const [cid, r] of Object.entries(s.card_results || {})) {
    if (!cardIds.has(cid)) err(`${where}: card_results 引用不存在的卡 ${cid}`);
    if (!validNext(r.next)) err(`${where}/${cid}: next 指向不存在的場景 ${r.next}`);
    checkScriptLines(r.script, `${where}/${cid}`);
    if (r.danger) {
      if (!r.rescue || !Array.isArray(r.rescue.script) || !r.rescue.effects) {
        err(`${where}/${cid}: danger 結果缺完整的 rescue（script + effects）`);
      }
    }
  }
  if (!s.fallback || !validNext(s.fallback.next)) err(`${where}: fallback 缺失或 next 不合法`);
}
for (const key of Object.keys(scenesData.repeat_reactions || {})) {
  if (key !== "default" && !cardIds.has(key)) err(`repeat_reactions: 引用不存在的卡 ${key}`);
}

// ---------- 結局 ----------
const endingIds = new Set();
for (const e of endings) {
  if (endingIds.has(e.ending_id)) err(`endings: 重複的結局 id ${e.ending_id}`);
  endingIds.add(e.ending_id);
  if (!["good", "normal", "bad"].includes(e.mood)) err(`endings: ${e.ending_id} mood 不合法 ${e.mood}`);
  for (const key of Object.keys(e.conditions?.stats || {})) {
    if (!STAT_KEYS.includes(key)) err(`endings: ${e.ending_id} 條件有未知數值 ${key}`);
  }
  for (const cid of Object.keys(e.conditions?.cards || {})) {
    if (!cardIds.has(cid)) err(`endings: ${e.ending_id} 條件引用不存在的卡 ${cid}`);
  }
}
// 契約：最後一個結局必須無條件（保底），否則可能沒有結局可判
const last = endings[endings.length - 1];
if (Object.keys(last.conditions?.stats || {}).length || Object.keys(last.conditions?.cards || {}).length) {
  err(`endings: 最後一個結局 ${last.ending_id} 必須是無條件的保底結局`);
}

// ---------- 報告 ----------
warns.forEach((w) => console.log(`⚠️  ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`❌ ${e}`));
  console.error(`\n驗證失敗：${errors.length} 個錯誤`);
  process.exit(1);
}
console.log(`✅ 資料驗證通過：卡片 ${cards.length}、場景 ${scenesData.scenes.length}、結局 ${endings.length}、女主角 ${heroines.length}${warns.length ? `（${warns.length} 個警告）` : ""}`);
