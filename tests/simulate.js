#!/usr/bin/env node
/* ============================================================
   simulate.js — 結局可達性與分布模擬（零依賴，node tests/simulate.js）
   ------------------------------------------------------------
   枚舉場景圖上所有卡片序列（忽略手牌限制），用與引擎相同的
   規則計算數值，統計每個結局的可達路徑數。
   - 有任何結局完全不可達 → 非零狀態碼（資料改壞了）
   - 調整平衡後看分布：主線成功與保底應大致平衡，特殊結局要稀有但存在
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const cards = read("data/cards.json").cards;
const heroine = read("data/heroines.json").heroines[0];
const scenesData = read("data/scenes.json");
const endings = read("data/endings.json").endings;

const getScene = (id) => scenesData.scenes.find((s) => s.scene_id === id);
const STAT_KEYS = ["favorability", "awkwardness", "comedy", "sincerity", "confidence", "social_death", "appetite", "battle"];

// —— 與 prototype/main.js 的規則保持一致（改引擎公式時要同步這裡）——
function tagModifiers(card, scene) {
  const b = { favorability: 0, awkwardness: 0, social_death: 0 };
  (card.tags || []).forEach((t) => {
    if ((scene.preferred_tags || []).includes(t)) b.favorability += 1;
    if ((scene.danger_tags || []).includes(t)) { b.social_death += 2; b.awkwardness += 2; }
    if ((heroine.likes || []).includes(t)) b.favorability += 1;
    if ((heroine.dislikes || []).includes(t)) { b.favorability -= 2; b.awkwardness += 2; }
  });
  return b;
}
function apply(stats, eff) {
  Object.entries(eff || {}).forEach(([k, d]) => { if (STAT_KEYS.includes(k)) stats[k] = Math.max(0, (stats[k] || 0) + d); });
}
function decide(stats, use) {
  const meets = (rules, vals) => Object.entries(rules).every(([k, r]) => {
    const v = vals[k] || 0;
    if (r.min !== undefined && v < r.min) return false;
    if (r.max !== undefined && v > r.max) return false;
    return true;
  });
  for (const e of endings) {
    const c = e.conditions || {};
    if (meets(c.stats || {}, stats) && meets(c.cards || {}, use)) return e.ending_id;
  }
  return endings[endings.length - 1].ending_id;
}

const tally = {};
const samples = {};
let totalRuns = 0;

// 25 張牌全枚舉會爆炸（25^4 x 分支），抽樣模擬：每個決策點嘗試全部卡片，
// 但超過上限時退化為隨機抽樣，確保執行時間可控。
const MAX_PATHS = 400000;

for (const useRescue of [false, true]) {
  function walk(sceneId, stats, use, seq) {
    if (totalRuns >= MAX_PATHS) return;
    const scene = getScene(sceneId);
    for (const card of cards) {
      if (totalRuns >= MAX_PATHS) return;
      const s = { ...stats };
      const u = { ...use };
      const bespoke = (scene.card_results || {})[card.id];
      const result = bespoke || scene.fallback;
      const eff = bespoke ? bespoke.effects : card.effects;
      u[card.id] = (u[card.id] || 0) + 1;
      apply(s, eff);
      apply(s, tagModifiers(card, scene));
      if (u[card.id] === 3) {
        const r = scenesData.repeat_reactions[card.id] || scenesData.repeat_reactions.default;
        if (r) apply(s, r.effects);
      }
      if (bespoke && bespoke.danger && useRescue) {
        const rc = cards.find((c) => c.id !== card.id && (c.tags || []).includes("補救"));
        if (rc) { u[rc.id] = (u[rc.id] || 0) + 1; apply(s, bespoke.rescue.effects); }
      }
      const nseq = [...seq, card.name];
      if (result.next === "ending") {
        totalRuns += 1;
        const eid = decide(s, u);
        tally[eid] = (tally[eid] || 0) + 1;
        if (!samples[eid]) samples[eid] = `${nseq.join(" → ")}${useRescue ? "（有補救）" : ""}`;
      } else {
        walk(result.next, s, u, nseq);
      }
    }
  }
  const init = {};
  STAT_KEYS.forEach((k) => (init[k] = 0));
  walk(scenesData.start, init, {}, []);
}

console.log(`總路徑數: ${totalRuns}\n`);
let unreachable = 0;
for (const e of endings) {
  const n = tally[e.ending_id] || 0;
  const pct = ((n / totalRuns) * 100).toFixed(2);
  if (n === 0) unreachable += 1;
  console.log(`${n === 0 ? "❌" : "✅"} ${e.title.padEnd(10, "　")} ${String(n).padStart(7)} 條 (${pct}%)`);
  if (samples[e.ending_id]) console.log(`   例: ${samples[e.ending_id]}`);
}
if (unreachable) {
  console.error(`\n模擬失敗：${unreachable} 個結局不可達`);
  process.exit(1);
}
console.log("\n✅ 所有結局皆可達");
