/* ============================================================
   data.js — 遊戲內容資料的載入與查詢
   ------------------------------------------------------------
   /data 的 JSON 是「內容」，這個模組是唯一的讀取入口。

   v0.5.3：補齊全卡 × 全場景矩陣
   - 手寫 card_results 永遠優先。
   - phase2 補充檔次優先。
   - 仍缺漏時，依卡片 tags、場景 tags、女主喜好自動產生情境反應與分數。
   - 目標：每張卡在每個場景都有不同反應，不再落入完全通用 fallback。
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hasAny = (source = [], targets = []) => targets.some((target) => source.includes(target));

function sceneMood(scene) {
  if (scene.scene_id.includes("pantry")) return { key: "pantry", prompt: "邀約", place: "茶水間", soft: 1 };
  if (scene.scene_id.includes("elevator")) return { key: "elevator", prompt: "密閉電梯", place: "電梯", soft: 0 };
  if (scene.scene_id.includes("conv_store")) return { key: "store", prompt: "冰棒二選一", place: "便利商店", soft: 1 };
  if (scene.scene_id.includes("dinner")) return { key: "dinner", prompt: "私藏晚餐店", place: "甜湯店", soft: 2 };
  if (scene.scene_id.includes("night_market")) return { key: "night", prompt: "夜市挑戰", place: "夜市", soft: 1 };
  if (scene.scene_id.includes("gossip")) return { key: "gossip", prompt: "八卦危機", place: "公司走廊", soft: -1 };
  if (scene.scene_id.includes("meeting")) return { key: "meeting", prompt: "會議壓力", place: "會議室", soft: -1 };
  if (scene.scene_id.includes("confession")) return { key: "confession", prompt: "告白時刻", place: "夜晚街角", soft: 2 };
  return { key: "default", prompt: scene.title || "目前情境", place: scene.location || "現場", soft: 0 };
}

function cardPersona(card) {
  const tags = card.tags || [];
  if (hasAny(tags, ["食物"])) return "food";
  if (hasAny(tags, ["布偶", "裝可愛"])) return "cute";
  if (hasAny(tags, ["霸總", "挑釁", "高風險"])) return "risky";
  if (hasAny(tags, ["沉默", "神秘", "文青"])) return "silent";
  if (hasAny(tags, ["社死"])) return "chaos";
  if (hasAny(tags, ["自信", "智力"])) return "smart";
  if (hasAny(tags, ["裝傻", "補救"])) return "fool";
  return "weird";
}

function heroineReaction({ persona, scene, card, heroine, danger, preferred, liked, disliked }) {
  const mood = sceneMood(scene);
  const name = card.name;
  const line = card.line;

  const positive = preferred || liked;
  const negative = danger || disliked;

  if (negative && persona === "risky") {
    return {
      emotion: "tsukkomi",
      text: `你在${mood.place}講「${line}」真的很勇。${name} 這張卡用在這裡，基本上是把氣氛推去加班。`,
      note: `她先把吐槽權收回來，避免你繼續把${mood.prompt}變成災難。`,
    };
  }
  if (positive && persona === "food") {
    return {
      emotion: "smile",
      text: `你只要跟吃的有關就突然很真誠。${name} 在${mood.place}意外合理。`,
      note: `她嘴上嫌你貪吃，身體卻很誠實地往下一攤／下一碗移動。`,
    };
  }
  if (positive && persona === "cute") {
    return {
      emotion: "laugh",
      text: `好，${name} 這招很荒謬，但在${mood.place}有用。我先笑，等一下再嫌你。`,
      note: `她笑到防線鬆動，現場的尷尬被包成一顆很醜但有效的糖。`,
    };
  }
  if (persona === "silent") {
    return {
      emotion: mood.key === "confession" ? "soft" : "dots",
      text: `你又沉默了。可是這次的沉默在「${mood.prompt}」裡，居然有一點像是在認真。`,
      note: `她沒有急著逼問，反而給了你幾秒鐘，把空氣留給你表演石化。`,
    };
  }
  if (persona === "chaos") {
    return {
      emotion: "laugh",
      text: `你每次一慌就把音量開到全公司都聽得到。${name} 很丟臉，但也很像你。`,
      note: `旁人開始注意這邊，她一邊想逃，一邊又忍不住笑。`,
    };
  }
  if (persona === "smart") {
    return {
      emotion: positive ? "smile" : "shock",
      text: `等一下，你居然把「${mood.prompt}」分析成作戰計畫？${name} 這張卡有點欠揍，但不算沒用。`,
      note: `她重新評估你：也許你不是完全沒救，只是救法比較奇怪。`,
    };
  }
  if (persona === "fool") {
    return {
      emotion: "tsukkomi",
      text: `你不要用「${line}」假裝逃過問題。${mood.prompt}不是選擇題，但我可以給你部分分數。`,
      note: `她吐槽得很快，但沒有真的生氣，甚至替你把話接了下去。`,
    };
  }
  return {
    emotion: negative ? "dots" : "smile",
    text: `${name} 用在${mood.place}，效果很難說，但至少不是無聊的答案。`,
    note: `她看著你三秒，決定把這件事記進「Gumayuwei 奇怪行為觀察筆記」。`,
  };
}

function scoreSyntheticResult({ card, scene, heroine, persona, danger, preferred, liked, disliked }) {
  const base = card.effects || {};
  const mood = sceneMood(scene);
  const effects = {
    favorability: Math.round((base.favorability || 0) * 0.6),
    awkwardness: Math.round((base.awkwardness || 0) * 0.5),
    comedy: Math.round((base.comedy || 0) * 0.7),
    sincerity: Math.round((base.sincerity || 0) * 0.5),
    confidence: Math.round((base.confidence || 0) * 0.5),
    social_death: Math.round((base.social_death || 0) * 0.55),
    appetite: Math.round((base.appetite || 0) * 0.65),
    battle: Math.round((base.battle || 0) * 0.55),
  };

  if (preferred) effects.favorability += 2;
  if (liked) effects.favorability += 2;
  if (danger) { effects.awkwardness += 3; effects.social_death += 2; effects.favorability -= 2; }
  if (disliked) { effects.awkwardness += 2; effects.favorability -= 2; }

  if (persona === "food") effects.appetite += 4 + Math.max(0, mood.soft);
  if (persona === "cute") { effects.comedy += 3; effects.awkwardness -= 1; }
  if (persona === "risky") { effects.confidence += 4; effects.battle += 2; }
  if (persona === "silent") { effects.sincerity += mood.soft > 0 ? 3 : 1; effects.awkwardness -= 1; }
  if (persona === "chaos") { effects.comedy += 4; effects.social_death += 3; }
  if (persona === "smart") { effects.confidence += 4; effects.comedy += 2; }
  if (persona === "fool") { effects.comedy += 2; effects.awkwardness += 1; }

  if (mood.key === "confession") effects.sincerity += 2;
  if (mood.key === "meeting" || mood.key === "gossip") effects.social_death += danger ? 2 : 1;

  Object.keys(effects).forEach((key) => { effects[key] = clamp(effects[key], -6, 14); });
  return effects;
}

function synthesizeCardResult(scene, card) {
  const heroine = DATA.heroines.find((h) => h.id === scene.heroine) || {};
  const tags = card.tags || [];
  const preferred = hasAny(tags, scene.preferred_tags || []);
  const danger = hasAny(tags, scene.danger_tags || []);
  const liked = hasAny(tags, heroine.likes || []);
  const disliked = hasAny(tags, heroine.dislikes || []);
  const persona = cardPersona(card);
  const mood = sceneMood(scene);
  const reaction = heroineReaction({ persona, scene, card, heroine, danger, preferred, liked, disliked });
  const effects = scoreSyntheticResult({ card, scene, heroine, persona, danger, preferred, liked, disliked });

  const gumaEmotion = persona === "chaos" || persona === "risky" ? "shout" : persona === "silent" ? "dots" : persona === "cute" ? "smile" : "shock";

  return {
    generated: true,
    script: [
      { type: "dialogue", speaker: "guma", emotion: gumaEmotion, text: card.line },
      { type: "dialogue", speaker: "heroine", emotion: reaction.emotion, text: reaction.text },
      { type: "narration", text: reaction.note },
    ],
    effects,
    next: scene.fallback?.next || (mood.key === "confession" ? "ending" : DATA.scenes[Math.min(DATA.scenes.findIndex((s) => s.scene_id === scene.scene_id) + 1, DATA.scenes.length - 1)]?.scene_id || "ending"),
  };
}

function fillMissingCardResults() {
  DATA.scenes.forEach((scene) => {
    scene.card_results = scene.card_results || {};
    DATA.cards.forEach((card) => {
      if (scene.card_results[card.id]) return;
      scene.card_results[card.id] = synthesizeCardResult(scene, card);
    });
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
  fillMissingCardResults();
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
