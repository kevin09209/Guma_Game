/* ============================================================
   data.js — 遊戲內容資料的載入與查詢
   ------------------------------------------------------------
   /data 的 JSON 是「內容」，這個模組是唯一的讀取入口。
   載入完成後 DATA 視為唯讀：引擎不得修改內容資料。
   ============================================================ */

export const DATA = { cards: [], heroines: [], scenes: [], endings: [], start: "", repeatReactions: {} };

// 資料裡的資源路徑（assets/...）是從專案根目錄算的；頁面在 prototype/ 下
export const assetPath = (p) => "../" + p;

async function fetchOptionalJson(path, fallback) {
  try {
    const response = await fetch(path);
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function mergePhase2CardResults(phase2) {
  const sceneResults = phase2?.scene_card_results || {};
  DATA.scenes.forEach((scene) => {
    const extra = sceneResults[scene.scene_id];
    if (!extra) return;
    scene.card_results = {
      ...(scene.card_results || {}),
      ...extra,
    };
  });
}

export async function loadData() {
  const [cards, heroines, scenes, endings, phase2] = await Promise.all([
    fetch("../data/cards.json").then((r) => r.json()),
    fetch("../data/heroines.json").then((r) => r.json()),
    fetch("../data/scenes.json").then((r) => r.json()),
    fetch("../data/endings.json").then((r) => r.json()),
    fetchOptionalJson("../data/scene_card_results_phase2.json", {}),
  ]);
  DATA.cards = cards.cards;
  DATA.heroines = heroines.heroines;
  DATA.scenes = scenes.scenes;
  DATA.start = scenes.start;
  DATA.repeatReactions = scenes.repeat_reactions || {};
  DATA.endings = endings.endings;
  mergePhase2CardResults(phase2);
}

export const getCard = (id) => DATA.cards.find((c) => c.id === id);
export const getHeroine = (id) => DATA.heroines.find((h) => h.id === id);
export const getScene = (id) => DATA.scenes.find((s) => s.scene_id === id);

// 預先載入所有場景背景，換場時不會閃白（手機弱網尤其有感）
export function preloadBackgrounds() {
  DATA.scenes.forEach((scene) => {
    const img = new Image();
    img.src = assetPath(scene.background);
  });
}
