/* ============================================================
   card-lead-ins.js — 依稀有度、場景與使用情境組合即興前綴
   ============================================================ */

let CONFIG = {
  defaults: ["其實……"],
  rarity: {},
  scenes: {},
  contexts: {},
};

export async function loadCardLeadIns() {
  try {
    const response = await fetch("../data/card_lead_ins.json");
    if (!response.ok) return;
    const data = await response.json();
    CONFIG = {
      defaults: data.defaults || CONFIG.defaults,
      rarity: data.rarity || {},
      scenes: data.scenes || {},
      contexts: data.contexts || {},
    };
  } catch {
    // 保留最小預設值，避免文案檔載入失敗時中斷遊戲。
  }
}

function pick(list, avoid = "") {
  const candidates = (list || []).filter((item) => item && item !== avoid);
  const pool = candidates.length ? candidates : (list || []).filter(Boolean);
  if (!pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}

export function buildCardLeadIn({ card, sceneId, context = "normal", previous = "" }) {
  const contextLine = pick(CONFIG.contexts?.[context], previous);
  const sceneLine = pick(CONFIG.scenes?.[sceneId], previous);
  const rarityLine = pick(CONFIG.rarity?.[card?.rarity], previous);
  const fallback = pick(CONFIG.defaults, previous);

  const parts = [];
  if (context !== "normal" && contextLine) parts.push(contextLine);
  if (sceneLine) parts.push(sceneLine);
  if (rarityLine) parts.push(rarityLine);
  if (!parts.length && fallback) parts.push(fallback);

  return {
    text: parts.join(" "),
    signature: parts.join(" "),
  };
}
