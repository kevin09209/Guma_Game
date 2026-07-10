/* ============================================================
   main.js — 遊戲流程引擎（單局狀態機）
   ------------------------------------------------------------
   v0.5.9：選項對話化 × 汰換可重選 × 選卡降延遲
   - 選完場景選項後，先在文字框顯示 Gumayuwei 的選擇，再顯示女主回覆。
   - 汰換牌可反覆挑選，不會點一次就鎖死。
   - 汰換與不換按鈕下方常駐。
   ============================================================ */

import {
  STAT_LABELS, DANGER_STATS, OPTIONAL_STATS, EMOTION_SYMBOLS, EMOTION_TEXT,
  TUTORIAL_HAND, HAND_SIZE, TYPE_SPEED, ENDING_BGM, RARITY_ORDER,
} from "./js/config.js";
import * as store from "./js/storage.js";
import { DATA, loadData, getCard, getHeroine, getScene, assetPath, preloadBackgrounds } from "./js/data.js";
import { $, esc, fitStage, buildCardButton, tryLoadCardArt } from "./js/ui.js";
import * as gacha from "./js/gacha.js";
import * as audio from "./js/audio.js";

const TOLERANCE_MAX = 100;
const TOLERANCE_EMERGENCY_THRESHOLD = 0;
const EMERGENCY_RARITY_MIN = RARITY_ORDER.SSR;
const DICE_FACES = {
  1: { type: "success", key: "one", label: "1", multiplier: 1 },
  2: { type: "success", key: "two", label: "2", multiplier: 2 },
  3: { type: "success", key: "three", label: "3", multiplier: 3 },
  4: { type: "fail", key: "four", label: "Four!" },
  5: { type: "fail", key: "water", label: "水床沒玩到" },
  6: { type: "fail", key: "law", label: "完全法克" },
};

const EMERGENCY_BAD_ENDINGS = {
  no_card: {
    ending_id: "ending_emergency_no_card",
    title: "沒有救援卡的夜晚",
    mood: "bad",
    text: "女主的忍受條歸零時，你大喊「等等！！！」，然後翻遍手牌，卻發現沒有任何 SSR 以上的卡可以救場。\n\n現場安靜得像專案上線前一分鐘。\n\n她看著你，露出非常禮貌、非常遙遠的微笑：\n\n「今天先到這裡吧。我需要回去重新理解一下人類。」\n\n你想補救，但系統提示：沒有救援卡。戀愛流程中止。",
  },
  four: {
    ending_id: "ending_emergency_four_self",
    title: "Four! 回家自己爽了",
    mood: "bad",
    text: "你在緊急任務中擲出了 4 Four!。\n\nGumayuwei 的「等等！！！」還在空氣中迴盪，但骰子已經替你做出判決。\n\n她看著你，像看著一個準備把人生存檔關掉的人：\n\n「你真的很努力，但方向完全不對。」\n\n那天晚上，你沒有挽回女主，只挽回了獨自回家的時間。",
  },
  water: {
    ending_id: "ending_emergency_waterbed",
    title: "水床沒玩到",
    mood: "bad",
    text: "你在緊急任務中擲出了 5 水床沒玩到。\n\n救援環節還沒開始，現場就像被倒了一桶冷水。\n\n她沉默三秒後說：\n\n「我本來以為你至少會有一點補救能力，結果你連幻想都安排得很失敗。」\n\n水床沒玩到，戀愛也沒玩到。",
  },
  law: {
    ending_id: "ending_emergency_law_fucked",
    title: "完全法克",
    mood: "bad",
    text: "你在緊急任務中擲出了 6 完全法克。\n\n這不是普通失誤，這是可以寫進魔法史的災難。\n\n她扶著額頭說：\n\n「我不知道你剛剛召喚了什麼，但我確定它不叫戀愛。」\n\n大法師施法失敗，局勢徹底法克。",
  },
};

const SCENE_CHOICES = {
  ev_pantry_invite: {
    question: "她問你下班要不要一起走，你要先怎麼回？",
    options: [
      { label: "是，直接答應", say: "好啊，一起走。", effects: { favorability: 2, sincerity: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "smile", text: "答應得這麼快？好，至少這次沒有當機。" }] },
      { label: "否，先假裝很忙", say: "我可能有點忙。", effects: { awkwardness: 3, confidence: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: "你桌上明明只有空杯子，忙什麼？忙著逃避嗎？" }] },
      { label: "反問：有含晚餐嗎？", say: "那這個一起走，有含晚餐嗎？", effects: { comedy: 2, appetite: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "laugh", text: "你的人生是不是所有邀約都要先判斷能不能吃？" }] },
    ],
  },
  ev_elevator: {
    question: "電梯裡突然安靜，你要怎麼打破沉默？",
    options: [
      { label: "問她今天累不累", say: "妳今天是不是很累？", effects: { favorability: 2, sincerity: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "soft", text: "你居然會問正常問題，我有點不習慣。" }] },
      { label: "盯著樓層燈裝冷靜", say: "這個樓層燈……滿穩的。", effects: { awkwardness: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "dots", text: "你盯得像電梯欠你錢。" }] },
      { label: "說這電梯很適合展開劇情", say: "這個電梯很適合展開劇情。", effects: { comedy: 3, social_death: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: "不要在密閉空間展開任何東西。" }] },
    ],
  },
  ev_conv_store: {
    question: "便利商店冰櫃前，她問你想吃哪個，你選？",
    options: [
      { label: "牛奶冰棒", say: "牛奶冰棒好了。", effects: { favorability: 1, appetite: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "smile", text: "很安全的答案，跟你本人不太一樣。" }] },
      { label: "巧克力脆皮", say: "巧克力脆皮。這個很穩。", effects: { appetite: 3, comedy: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "laugh", text: "你眼神突然亮了，冰棒比我有吸引力是不是？" }] },
      { label: "我都要", say: "我都要。", effects: { appetite: 5, awkwardness: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: "你不是選擇困難，你是胃口太大。" }] },
    ],
  },
  ev_dinner_shop: {
    question: "晚餐店老闆問要不要加湯圓，你要？",
    options: [
      { label: "是，加一份", say: "加一份。", effects: { appetite: 4, comedy: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "laugh", text: "你答應加湯圓的速度比答應約會還快。" }] },
      { label: "否，先留胃給下次", say: "先不要，留胃給下次。", effects: { favorability: 2, sincerity: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "soft", text: "下次？你這句話倒是滿會鋪梗的。" }] },
      { label: "問她要不要分你一顆", say: "妳要不要分我一顆？", effects: { favorability: 3, awkwardness: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "smile", text: "可以，但你要自己說這不是搶食物，是交流感情。" }] },
    ],
  },
  ev_night_market: {
    question: "夜市人很多，她問要不要牽著走，你要？",
    options: [
      { label: "是，伸手", say: "好，那我牽著妳。", effects: { favorability: 4, sincerity: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "soft", text: "這次你倒是沒有搞砸。手不要抖成那樣就更好了。" }] },
      { label: "否，嘴硬說不會走散", say: "不用啦，我不會走散。", effects: { awkwardness: 3, confidence: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: "你剛剛才差點跟鹽酥雞攤走。" }] },
      { label: "提議用地瓜球當路標", say: "我們可以用地瓜球當路標。", effects: { comedy: 3, appetite: 3 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "laugh", text: "你不要把戀愛路線規劃成美食導航。" }] },
    ],
  },
  ev_gossip: {
    question: "同事開始八卦你們，你要怎麼處理？",
    options: [
      { label: "大方說只是一起吃飯", say: "我們只是一起吃飯。", effects: { sincerity: 2, favorability: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "smile", text: "至少你這次沒有越描越黑。" }] },
      { label: "裝死滑手機", say: "……我先看一下手機。", effects: { awkwardness: 3, social_death: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "dots", text: "你現在裝死，只會讓他們覺得真的有事。" }] },
      { label: "反問：你們要入股嗎？", say: "你們要入股嗎？", effects: { comedy: 4, social_death: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: "不要把八卦講成募資案！" }] },
    ],
  },
  ev_meeting_room: {
    question: "會議室氣氛很硬，你要先做什麼？",
    options: [
      { label: "認真看資料", say: "我先看一下資料。", effects: { sincerity: 2, confidence: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "smile", text: "你認真起來還是有點可靠，雖然只有一點。" }] },
      { label: "先喝水拖時間", say: "我先喝口水。", effects: { awkwardness: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "dots", text: "你那杯水已經被你喝出戰術價值了。" }] },
      { label: "提議用抽卡決定簡報順序", say: "不然我們用抽卡決定簡報順序？", effects: { comedy: 3, social_death: 3 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "shock", text: "不要把會議變成迷因卡池。" }] },
    ],
  },
  ev_confession: {
    question: "告白前最後一秒，你要先做什麼？",
    options: [
      { label: "深呼吸，直視她", say: "我有話想跟妳說。", effects: { sincerity: 4, favorability: 3 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "soft", text: "你這次看起來像是真的有話想說。" }] },
      { label: "先開玩笑緩和氣氛", say: "如果我現在講錯話，妳可以當作系統錯誤嗎？", effects: { comedy: 3, awkwardness: 1 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "laugh", text: "你很緊張對吧？笑點都開始冒汗了。" }] },
      { label: "突然問她餓不餓", say: "妳……餓不餓？", effects: { appetite: 4, comedy: 2, awkwardness: 2 }, script: [{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: "你連告白前都能接到吃飯線，真的很 Gumayuwei。" }] },
    ],
  },
};

const state = {
  stats: { favorability: 0, awkwardness: 0, comedy: 0, sincerity: 0, confidence: 0, social_death: 0, appetite: 0, battle: 0 },
  tolerance: TOLERANCE_MAX,
  emergencyPending: false,
  emergencyCardId: null,
  forcedEnding: null,
  hand: [],
  cardUse: {},
  sceneId: null,
  stopCount: 0,
  script: [],
  lineIndex: -1,
  mode: "start",
  typing: false,
  typeTimer: null,
  pendingNext: null,
  pendingDanger: null,
  lastUsedCard: null,
  afterScript: null,
  lastDialogue: null,
  runDrawMode: null,
  runDrawDone: false,
  runDrawCardId: null,
  pendingDiscard: null,
};

const currentScene = () => getScene(state.sceneId);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function getPlayablePool() {
  let owned = store.getOwnedIds().filter((id) => getCard(id));
  if (owned.length < HAND_SIZE) {
    owned = Array.from(new Set([...owned, ...TUTORIAL_HAND]));
    store.setOwnedIds(owned);
  }
  return owned;
}
function dealHand() {
  const urlHand = new URLSearchParams(location.search).get("hand");
  if (urlHand) {
    state.hand = urlHand.split(",").filter((id) => getCard(id)).slice(0, HAND_SIZE);
    while (state.hand.length < HAND_SIZE) state.hand.push(drawCardFromCollection());
  } else if (!store.hasPlayed()) {
    state.hand = [...TUTORIAL_HAND];
    store.setOwnedIds([...store.getOwnedIds(), ...TUTORIAL_HAND]);
  } else {
    state.hand = [];
    while (state.hand.length < HAND_SIZE) state.hand.push(drawCardFromCollection());
  }
  if (state.runDrawCardId && !state.hand.includes(state.runDrawCardId)) {
    state.hand[state.hand.length - 1] = state.runDrawCardId;
  }
}
function drawCardFromCollection() {
  const owned = getPlayablePool();
  let pool = owned.filter((id) => !state.hand.includes(id));
  if (pool.length === 0) pool = owned;
  return pool[Math.floor(Math.random() * pool.length)];
}
function drawReplacementCardExcluding(excludedIds = []) {
  const excluded = new Set(excludedIds);
  const owned = getPlayablePool();
  let pool = owned.filter((id) => !excluded.has(id));
  if (pool.length === 0) pool = DATA.cards.map((c) => c.id).filter((id) => !excluded.has(id));
  if (pool.length === 0) pool = DATA.cards.map((c) => c.id);
  const cardId = pool[Math.floor(Math.random() * pool.length)];
  const ownedNow = store.getOwnedIds();
  if (!ownedNow.includes(cardId)) store.setOwnedIds([...ownedNow, cardId]);
  return cardId;
}

function tagModifiers(card, scene, heroine) {
  const bonus = { favorability: 0, awkwardness: 0, social_death: 0 };
  (card.tags || []).forEach((tag) => {
    if ((scene.preferred_tags || []).includes(tag)) bonus.favorability += 1;
    if ((scene.danger_tags || []).includes(tag)) { bonus.social_death += 2; bonus.awkwardness += 2; }
    if ((heroine.likes || []).includes(tag)) bonus.favorability += 1;
    if ((heroine.dislikes || []).includes(tag)) { bonus.favorability -= 2; bonus.awkwardness += 2; }
  });
  return bonus;
}
function mergeEffects(...effectsList) {
  const merged = {};
  effectsList.forEach((effects) => {
    Object.entries(effects || {}).forEach(([key, delta]) => {
      merged[key] = (merged[key] || 0) + (Number(delta) || 0);
    });
  });
  return merged;
}
function scaleEffects(effects, multiplier) {
  const scaled = {};
  Object.entries(effects || {}).forEach(([key, value]) => {
    scaled[key] = Math.round((Number(value) || 0) * multiplier);
  });
  return scaled;
}
function applyEffects(effects) {
  Object.entries(effects || {}).forEach(([key, delta]) => {
    if (key in state.stats && delta !== 0) state.stats[key] = Math.max(0, state.stats[key] + delta);
  });
}
function toleranceDeltaFromEffects(effects) {
  const bad = Math.max(0, effects.awkwardness || 0) * 4 + Math.max(0, effects.social_death || 0) * 5 + Math.max(0, -(effects.favorability || 0)) * 5 + Math.max(0, -(effects.sincerity || 0)) * 4;
  const good = Math.max(0, effects.favorability || 0) * 1.5 + Math.max(0, effects.sincerity || 0) * 1.8 + Math.max(0, effects.comedy || 0) * 0.25 + Math.max(0, effects.confidence || 0) * 0.2;
  return Math.round(good - bad);
}
function adjustToleranceFromEffects(effects) {
  const delta = toleranceDeltaFromEffects(effects);
  if (!delta) return;
  state.tolerance = clamp(state.tolerance + delta, 0, TOLERANCE_MAX);
  if (state.tolerance <= TOLERANCE_EMERGENCY_THRESHOLD) state.emergencyPending = true;
}
function renderTolerance() {
  const widget = $("heroine-tolerance");
  const fill = $("tolerance-fill");
  const value = $("tolerance-value");
  if (!widget || !fill || !value) return;
  value.textContent = `${state.tolerance}%`;
  fill.style.width = `${state.tolerance}%`;
  widget.classList.toggle("warn", state.tolerance <= 35 && state.tolerance > 0);
  widget.classList.toggle("danger", state.tolerance <= 0);
}
function renderHud(changedKeys = []) {
  const box = $("hud-stats");
  box.innerHTML = "";
  Object.keys(state.stats).forEach((key) => {
    if (OPTIONAL_STATS.includes(key) && state.stats[key] === 0) return;
    const chip = document.createElement("span");
    chip.className = `hud-chip${DANGER_STATS.includes(key) ? " danger" : ""}${changedKeys.includes(key) ? " pulse" : ""}`;
    chip.innerHTML = `${STAT_LABELS[key]} <b>${state.stats[key]}</b>`;
    box.appendChild(chip);
  });
  renderTolerance();
}

function highlightSpeaker(speaker) {
  const guma = $("sprite-guma");
  const heroine = $("sprite-heroine");
  guma.classList.toggle("active", speaker === "guma");
  guma.classList.toggle("dim", speaker !== "guma");
  heroine.classList.toggle("active", speaker === "heroine");
  heroine.classList.toggle("dim", speaker !== "heroine");
}
function updateGumaEmotionText(emotion) {
  const el = $("guma-emotion-text");
  if (!el) return;
  el.textContent = `Gumayuwei 表情：${EMOTION_TEXT[emotion] || emotion || "待機"}`;
  el.classList.remove("hidden");
}
function hideGumaEmotionText() { $("guma-emotion-text")?.classList.add("hidden"); }
function showEmotion(speaker, emotion) {
  document.querySelectorAll(".emotion-badge").forEach((b) => b.classList.add("hidden"));
  if (speaker === "guma") updateGumaEmotionText(emotion || "none");
  const symbol = EMOTION_SYMBOLS[emotion] || "";
  if (!symbol) return;
  const sprite = speaker === "guma" ? $("sprite-guma") : speaker === "heroine" ? $("sprite-heroine") : null;
  if (!sprite) return;
  const badge = sprite.querySelector(".emotion-badge");
  badge.textContent = symbol;
  badge.classList.remove("hidden");
  badge.style.animation = "none";
  void badge.offsetWidth;
  badge.style.animation = "";
}
function speakerName(speaker) {
  if (speaker === "guma") return "Gumayuwei";
  if (speaker === "heroine") return getHeroine(currentScene().heroine).name;
  if (speaker === "boss") return "主管";
  return speaker;
}

function typeText(text) {
  const box = $("dialog-text");
  box.textContent = "";
  $("advance-hint").classList.add("hidden");
  state.typing = true;
  let i = 0;
  state.typeTimer = setInterval(() => { box.textContent = text.slice(0, ++i); if (i >= text.length) finishTyping(); }, TYPE_SPEED);
  function finishTyping() {
    clearInterval(state.typeTimer);
    box.textContent = text;
    state.typing = false;
    $("advance-hint").classList.remove("hidden");
  }
  state.skipTyping = finishTyping;
}
function playScript(lines, onDone) {
  state.script = Array.isArray(lines) ? lines : [];
  state.lineIndex = -1;
  state.afterScript = onDone;
  state.mode = "story";
  advance();
}
function advance() {
  if (state.typing) { state.skipTyping(); return; }
  state.lineIndex += 1;
  const line = state.script[state.lineIndex];
  if (!line) { const next = state.afterScript; state.afterScript = null; if (next) next(); return; }
  renderLine(line);
}
function renderLine(line) {
  const dialog = $("dialog");
  const nameplate = $("nameplate");
  dialog.classList.remove("hidden");
  if (line.type === "narration") {
    dialog.classList.add("narration");
    highlightSpeaker(null);
    showEmotion(null, "none");
    state.lastDialogue = { speaker: "旁白", text: line.text };
  } else {
    dialog.classList.remove("narration");
    const name = speakerName(line.speaker);
    nameplate.textContent = name;
    nameplate.className = `nameplate speaker-${line.speaker}`;
    highlightSpeaker(line.speaker);
    showEmotion(line.speaker, line.emotion || "none");
    state.lastDialogue = { speaker: name, text: line.text };
  }
  typeText(line.text || "");
}
function templateScript(lines, vars) {
  return (lines || []).map((line) => ({ ...line, text: String(line.text || "").replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`) }));
}

function loadScene(sceneId) {
  state.sceneId = sceneId;
  state.stopCount += 1;
  const scene = getScene(sceneId);
  if (!scene) { showEnding(); return; }
  $("bg").src = assetPath(scene.background);
  $("topbar").classList.remove("hidden");
  $("hud-location").textContent = `第 ${state.stopCount} 站・${scene.title}｜${scene.location}`;
  renderHud();
  audio.setMood(scene.bgm || "office");
  playScript(scene.intro_script, openSceneChoice);
}
function openSceneChoice() {
  const scene = currentScene();
  const choice = SCENE_CHOICES[scene?.scene_id];
  if (!choice) { openHand(); return; }
  state.mode = "sceneChoice";
  $("dialog").classList.add("hidden");
  $("scene-choice-question").textContent = choice.question;
  const box = $("scene-choice-options");
  box.innerHTML = "";
  choice.options.forEach((option, index) => {
    const btn = document.createElement("button");
    btn.className = "scene-choice-option";
    btn.textContent = `${index + 1}. ${option.label}`;
    btn.addEventListener("click", (e) => { e.stopPropagation(); chooseSceneOption(option); });
    box.appendChild(btn);
  });
  $("scene-choice-overlay").classList.remove("hidden");
}
function chooseSceneOption(option) {
  $("scene-choice-overlay").classList.add("hidden");
  applyEffects(option.effects || {});
  adjustToleranceFromEffects(option.effects || {});
  renderHud(Object.keys(option.effects || {}));
  const playerLine = { type: "dialogue", speaker: "guma", emotion: "smile", text: option.say || option.label };
  playScript([playerLine, ...(option.script || [])], () => {
    if (state.emergencyPending) maybeEmergencyMission();
    else openHand();
  });
}
function openHand() {
  state.mode = "hand";
  const context = state.lastDialogue || { speaker: "提示", text: "請根據目前情境選擇一張卡。" };
  $("choice-context").innerHTML = `<div><span class="context-speaker">${esc(context.speaker)}</span>${esc(context.text)}</div><div class="context-note">選錯不一定會輸，但會扣女主忍受條。</div>`;
  const hand = $("hand");
  hand.innerHTML = "";
  state.hand.forEach((cardId) => hand.appendChild(buildCardButton(cardId, playCard)));
  $("hand-overlay").classList.remove("hidden");
}

function resolveResult(scene, cardId, card) {
  const bespoke = (scene.card_results || {})[cardId];
  const fallback = scene.fallback || {};
  const result = bespoke || fallback;
  return {
    script: Array.isArray(result.script) ? result.script : [{ type: "narration", text: `Gumayuwei 使出了「${card.name}」，現場陷入一陣難以解釋的沉默。` }],
    effects: bespoke ? (result.effects || {}) : (card.effects || {}),
    next: result.next || "ending",
    rescue: bespoke && bespoke.danger ? result.rescue : null,
  };
}
function playCard(cardId) {
  $("hand-overlay").classList.add("hidden");
  const scene = currentScene();
  const card = getCard(cardId);
  const heroine = getHeroine(scene.heroine);
  const result = resolveResult(scene, cardId, card);
  state.cardUse[cardId] = (state.cardUse[cardId] || 0) + 1;
  state.lastUsedCard = cardId;
  updateGumaEmotionText(`準備使用「${card.name}」`);
  const bonus = tagModifiers(card, scene, heroine);
  const combined = mergeEffects(result.effects, bonus);
  const changed = [];
  applyEffects(result.effects);
  applyEffects(bonus);
  adjustToleranceFromEffects(combined);
  Object.keys(result.effects || {}).forEach((k) => result.effects[k] && changed.push(k));
  Object.keys(bonus).forEach((k) => bonus[k] && changed.push(k));
  renderHud(changed);
  state.pendingNext = result.next;
  state.pendingDanger = result.rescue;
  showCutin(card, result.effects, bonus, () => {
    playScript(templateScript(result.script, { card_name: card.name }), () => afterResult(cardId));
  });
}
function afterResult(cardId) {
  if (state.cardUse[cardId] === 3) {
    const reaction = DATA.repeatReactions[cardId] || DATA.repeatReactions.default;
    if (reaction) {
      applyEffects(reaction.effects);
      adjustToleranceFromEffects(reaction.effects || {});
      renderHud(Object.keys(reaction.effects || {}));
      playScript([{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: reaction.line }], maybeEmergencyMission);
      return;
    }
  }
  maybeEmergencyMission();
}
function maybeEmergencyMission() {
  if (state.emergencyPending) {
    playScript([{ type: "dialogue", speaker: "guma", emotion: "shout", text: "等等！！！" }], openEmergencyMission);
    return;
  }
  maybeRescue();
}
function maybeRescue() {
  const rescue = state.pendingDanger;
  state.pendingDanger = null;
  if (!rescue) { openSwap(); return; }
  const candidates = state.hand.filter((id) => id !== state.lastUsedCard && (getCard(id).tags || []).includes("補救"));
  if (candidates.length === 0) { openSwap(); return; }
  state.mode = "rescue";
  $("rescue-prompt").textContent = rescue.prompt || "場面即將死亡，是否使用補救卡？";
  const box = $("rescue-cards");
  box.innerHTML = "";
  candidates.forEach((id) => box.appendChild(buildCardButton(id, (rescueId) => {
    $("rescue-overlay").classList.add("hidden");
    const rescueCard = getCard(rescueId);
    state.cardUse[rescueId] = (state.cardUse[rescueId] || 0) + 1;
    applyEffects(rescue.effects);
    adjustToleranceFromEffects(rescue.effects || {});
    renderHud(Object.keys(rescue.effects || {}));
    playScript(templateScript(rescue.script, { rescue_card_name: rescueCard.name }), openSwap);
  })));
  $("rescue-overlay").classList.remove("hidden");
}

function openEmergencyMission() {
  state.mode = "emergency";
  state.emergencyCardId = null;
  state.pendingDanger = null;
  $("dialog").classList.add("hidden");
  $("emergency-selected").classList.add("hidden");
  $("emergency-roll-result").classList.add("hidden");
  $("btn-emergency-roll").disabled = true;
  $("btn-emergency-roll").classList.add("disabled");
  const candidates = state.hand.filter((id) => id !== state.lastUsedCard && RARITY_ORDER[getCard(id).rarity] >= EMERGENCY_RARITY_MIN);
  const box = $("emergency-cards");
  box.innerHTML = "";
  if (candidates.length === 0) {
    $("emergency-prompt").textContent = "女主忍受條已歸零，但你手上沒有 SSR 以上卡可以救場。";
    $("btn-emergency-give-up").textContent = "沒有救援卡，進入壞結局";
  } else {
    $("emergency-prompt").textContent = "局勢已經失控。選擇 1 張 SSR / UR 卡作為緊急救援卡，再擲骰決定命運。";
    $("btn-emergency-give-up").textContent = "放棄救援，接受壞結局";
    candidates.forEach((id) => box.appendChild(buildCardButton(id, selectEmergencyCard)));
  }
  $("emergency-overlay").classList.remove("hidden");
}
function selectEmergencyCard(cardId) {
  state.emergencyCardId = cardId;
  const card = getCard(cardId);
  $("emergency-selected").textContent = `已選擇救援卡：${card.rarity}・${card.name}`;
  $("emergency-selected").classList.remove("hidden");
  $("btn-emergency-roll").disabled = false;
  $("btn-emergency-roll").classList.remove("disabled");
}
function sceneEffectsForEmergencyCard(cardId) {
  const scene = currentScene();
  const card = getCard(cardId);
  const heroine = getHeroine(scene.heroine);
  const result = resolveResult(scene, cardId, card);
  const bonus = tagModifiers(card, scene, heroine);
  return mergeEffects(result.effects, bonus);
}
function rescuePowerFromEffects(effects) {
  return Math.round(Math.max(0, effects.favorability || 0) * 4 + Math.max(0, effects.sincerity || 0) * 4 + Math.max(0, effects.confidence || 0) * 1.5 + Math.max(0, effects.comedy || 0) * 1 + Math.max(0, effects.battle || 0) * 0.5 + Math.max(0, effects.appetite || 0) * 0.3 - Math.max(0, effects.awkwardness || 0) * 4 - Math.max(0, effects.social_death || 0) * 6);
}
function rollEmergencyDice() {
  if (!state.emergencyCardId) return;
  const roll = Math.floor(Math.random() * 6) + 1;
  const face = DICE_FACES[roll];
  const card = getCard(state.emergencyCardId);
  $("btn-emergency-roll").disabled = true;
  $("btn-emergency-roll").classList.add("disabled");
  if (face.type === "fail") {
    $("emergency-roll-result").textContent = `擲出 ${roll} ${face.label}，救援失敗。`;
    $("emergency-roll-result").className = "emergency-roll-result fail";
    $("emergency-roll-result").classList.remove("hidden");
    window.setTimeout(() => emergencyFail(face.key), 900);
    return;
  }
  const baseEffects = sceneEffectsForEmergencyCard(state.emergencyCardId);
  const effects = scaleEffects(baseEffects, face.multiplier);
  const power = rescuePowerFromEffects(effects);
  state.cardUse[state.emergencyCardId] = (state.cardUse[state.emergencyCardId] || 0) + 1;
  applyEffects(effects);
  renderHud(Object.keys(effects || {}));
  $("emergency-roll-result").textContent = `擲出 ${roll} 點：${card.name} ×${face.multiplier}，救援力 ${power}。`;
  $("emergency-roll-result").className = "emergency-roll-result success";
  $("emergency-roll-result").classList.remove("hidden");
  window.setTimeout(() => emergencySuccess(card, face, effects, power), 900);
}
function emergencySuccess(card, face, effects, power) {
  state.tolerance = clamp(Math.max(12, power), 12, 70);
  state.emergencyPending = false;
  state.emergencyCardId = null;
  $("emergency-overlay").classList.add("hidden");
  renderHud(Object.keys(effects || {}));
  playScript([
    { type: "narration", text: `緊急救援成功！${card.name} 被骰子放大到 ×${face.multiplier}，硬是把局勢拉了回來。` },
    { type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: "你剛剛那聲『等等』很吵，但這次……至少真的有救到。" },
  ], openSwap);
}
function emergencyFail(reasonKey = "no_card") {
  state.forcedEnding = EMERGENCY_BAD_ENDINGS[reasonKey] || EMERGENCY_BAD_ENDINGS.no_card;
  state.emergencyPending = false;
  state.emergencyCardId = null;
  $("emergency-overlay").classList.add("hidden");
  showEnding();
}

function buildSwapCardButton(cardId) {
  const card = getCard(cardId);
  const btn = document.createElement("button");
  btn.className = `card swap-select-card${state.pendingDiscard === cardId ? " selected-card" : ""}`;
  btn.innerHTML = `
    <div class="card-art"><span class="card-rarity rarity-${esc(card.rarity)}">${esc(card.rarity)}</span><span class="placeholder-line">「${esc(card.line)}」</span></div>
    <div class="card-meta"><div class="card-name">${esc(card.name)}</div><div class="card-desc">${esc(card.description)}</div></div>`;
  tryLoadCardArt(btn.querySelector(".card-art"), card);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    selectSwapCard(cardId);
  });
  return btn;
}
function renderSwapHand() {
  const box = $("swap-hand");
  box.innerHTML = "";
  state.hand.forEach((id) => box.appendChild(buildSwapCardButton(id)));
}
function openSwap() {
  if (state.pendingNext === "ending") { goNext(); return; }
  state.mode = "swap";
  state.pendingDiscard = null;
  $("swap-hint").textContent = "選擇 1 張想汰換的手牌，可反覆改選；確認後會翻出一張新牌補進手牌。";
  $("swap-result").classList.add("hidden");
  $("swap-result").innerHTML = "";
  $("btn-confirm-swap").disabled = true;
  $("btn-confirm-swap").classList.add("disabled");
  renderSwapHand();
  $("swap-overlay").classList.remove("hidden");
}
function selectSwapCard(discardId) {
  state.pendingDiscard = discardId;
  const card = getCard(discardId);
  $("swap-hint").textContent = `目前選擇汰換「${card.name}」。可以再點其他手牌改選。`;
  $("swap-result").textContent = "按下方「確認汰換」後才會真正換牌。";
  $("swap-result").classList.remove("hidden");
  $("btn-confirm-swap").disabled = false;
  $("btn-confirm-swap").classList.remove("disabled");
  renderSwapHand();
}
function confirmSwap() {
  if (!state.pendingDiscard) return;
  const discardedId = state.pendingDiscard;
  state.hand = state.hand.filter((h) => h !== discardedId);
  const replacementId = drawReplacementCardExcluding([...state.hand, discardedId]);
  const replacement = getCard(replacementId);
  state.hand.push(replacementId);
  state.pendingDiscard = null;
  $("btn-confirm-swap").disabled = true;
  $("btn-confirm-swap").classList.add("disabled");
  $("swap-hand").innerHTML = "";
  $("swap-hint").textContent = "翻面補牌中……";
  $("swap-result").innerHTML = `
    <div class="swap-flip-card">
      <div class="swap-flip-inner">
        <div class="swap-card-face swap-card-back">NEW CARD</div>
        <div class="swap-card-face swap-card-front">
          <span class="card-rarity rarity-${esc(replacement.rarity)}">${esc(replacement.rarity)}</span>
          <div class="card-name">${esc(replacement.name)}</div>
          <div class="card-line">「${esc(replacement.line)}」</div>
        </div>
      </div>
    </div>`;
  $("swap-result").classList.remove("hidden");
  window.setTimeout(goNext, 1050);
}
function goNext() {
  $("swap-overlay").classList.add("hidden");
  const next = state.pendingNext;
  state.pendingNext = null;
  if (next === "ending") showEnding();
  else loadScene(next || DATA.start);
}

function decideEnding() {
  if (state.forcedEnding) return state.forcedEnding;
  const meets = (rules, values) => Object.entries(rules).every(([key, rule]) => {
    const value = values[key] || 0;
    if (rule.min !== undefined && value < rule.min) return false;
    if (rule.max !== undefined && value > rule.max) return false;
    return true;
  });
  for (const ending of DATA.endings) {
    const conditions = ending.conditions || {};
    if (meets(conditions.stats || {}, state.stats) && meets(conditions.cards || {}, state.cardUse)) return ending;
  }
  return DATA.endings[DATA.endings.length - 1];
}
function showEnding() {
  const ending = decideEnding();
  const isForcedEnding = !!state.forcedEnding;
  state.mode = "ending";
  store.markPlayed();
  const isNewEnding = isForcedEnding ? false : gacha.unlockEnding(ending.ending_id);
  const reward = isNewEnding ? 2 : 1;
  store.addTickets(reward);
  gacha.renderHomeProgress();
  audio.setMood(ENDING_BGM[ending.mood] || "chill");
  $("ending-title").textContent = ending.title;
  $("ending-title").className = `ending-title ${ending.mood}`;
  $("ending-text").textContent = ending.text;
  $("ending-reward").textContent = `本輪獎勵：抽卡券 +${reward}${isNewEnding ? "（新結局加成）" : isForcedEnding ? "（緊急任務壞結局）" : ""}`;
  const statsBox = $("ending-stats");
  statsBox.innerHTML = "";
  Object.keys(state.stats).forEach((key) => {
    if (OPTIONAL_STATS.includes(key) && state.stats[key] === 0) return;
    const chip = document.createElement("span");
    chip.className = "effect-chip";
    chip.textContent = `${STAT_LABELS[key]} ${state.stats[key]}`;
    statsBox.appendChild(chip);
  });
  const toleranceChip = document.createElement("span");
  toleranceChip.className = "effect-chip down";
  toleranceChip.textContent = `忍受 ${state.tolerance}%`;
  statsBox.appendChild(toleranceChip);
  $("dialog").classList.add("hidden");
  $("topbar").classList.add("hidden");
  $("emergency-overlay").classList.add("hidden");
  hideGumaEmotionText();
  $("screen-ending").classList.remove("hidden");
}

function showCutin(card, effects, bonus, onDismiss) {
  const cardBox = $("cutin-card");
  cardBox.innerHTML = `<span class="placeholder-line">「${esc(card.line)}」</span>`;
  tryLoadCardArt(cardBox, card);
  $("cutin-name").textContent = `${card.rarity}・${card.name}`;
  $("cutin-line").textContent = `「${card.line}」`;
  const effectsBox = $("cutin-effects");
  effectsBox.innerHTML = "";
  const addChip = (key, delta, isBonus) => {
    if (!delta) return;
    const chip = document.createElement("span");
    const isDanger = DANGER_STATS.includes(key);
    const isGood = isDanger ? delta < 0 : delta > 0;
    chip.className = `effect-chip ${isGood ? "up" : "down"}${isBonus ? " bonus" : ""}`;
    chip.textContent = `${isBonus ? "加成 " : ""}${STAT_LABELS[key]} ${delta > 0 ? "+" : ""}${delta}`;
    effectsBox.appendChild(chip);
  };
  Object.entries(effects || {}).forEach(([k, v]) => addChip(k, v, false));
  Object.entries(bonus || {}).forEach(([k, v]) => addChip(k, v, true));
  state.mode = "cutin";
  audio.playSting();
  $("cutin").classList.remove("hidden");
  let dismissed = false;
  let autoTimer = null;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(autoTimer);
    $("cutin").onclick = null;
    $("cutin").classList.add("hidden");
    try { onDismiss(); } catch (err) { console.error("cutin dismiss failed", err); openSwap(); }
  };
  autoTimer = setTimeout(dismiss, 4500);
  $("cutin").onclick = (e) => { e.stopPropagation(); dismiss(); };
}

function openRunDraw(mode) {
  state.runDrawMode = mode;
  state.runDrawDone = false;
  $("run-draw-result").innerHTML = "";
  $("btn-run-draw").textContent = "抽 1 張";
  $("run-draw-title").textContent = "開始前抽一張卡";
  $("run-draw-desc").textContent = "本輪開始前先抽 1 張，卡片會加入收藏，並有機會進入本輪手牌。";
  $("screen-run-draw").classList.remove("hidden");
}
function resolveRunDraw() {
  if (!state.runDrawDone) {
    const result = gacha.drawOneGachaCard();
    state.runDrawCardId = result.card.id;
    store.addGachaCount(1);
    gacha.renderGachaResults([result], $("run-draw-result"));
    gacha.renderHomeProgress();
    state.runDrawDone = true;
    $("btn-run-draw").textContent = "進入劇情 ▶";
    return;
  }
  $("screen-run-draw").classList.add("hidden");
  dealHand();
  $("screen-start").classList.add("hidden");
  loadScene(DATA.start);
}

function hidePanels() {
  ["screen-gacha", "screen-collection", "screen-endings", "screen-ending", "screen-run-draw"].forEach((id) => $(id).classList.add("hidden"));
}
function resetRunState() {
  Object.keys(state.stats).forEach((key) => (state.stats[key] = 0));
  state.tolerance = TOLERANCE_MAX;
  state.emergencyPending = false;
  state.emergencyCardId = null;
  state.forcedEnding = null;
  state.hand = [];
  state.cardUse = {};
  state.stopCount = 0;
  state.pendingNext = null;
  state.pendingDanger = null;
  state.lastUsedCard = null;
  state.pendingDiscard = null;
  state.runDrawCardId = null;
  state.lastDialogue = null;
  renderTolerance();
}
function startGame() {
  resetRunState();
  hidePanels();
  $("screen-start").classList.add("hidden");
  openRunDraw("start");
}
function backHome() {
  state.mode = "start";
  hidePanels();
  ["dialog", "topbar", "hand-overlay", "scene-choice-overlay", "rescue-overlay", "swap-overlay", "emergency-overlay", "cutin"].forEach((id) => $(id).classList.add("hidden"));
  hideGumaEmotionText();
  audio.setMood("office");
  gacha.renderHomeProgress();
  $("screen-start").classList.remove("hidden");
}

async function init() {
  fitStage();
  window.addEventListener("resize", fitStage);
  try {
    await loadData();
  } catch (err) {
    const box = document.createElement("div");
    box.className = "load-error";
    box.innerHTML = `<h2>資料載入失敗</h2><p>請不要直接雙擊開啟 index.html，改用本機伺服器：</p><p>在專案根目錄執行 <code>python3 -m http.server 8000</code></p>`;
    $("stage").appendChild(box);
    console.error(err);
    return;
  }
  store.bootstrapPlayerData();
  preloadBackgrounds();
  gacha.renderHomeProgress();
  audio.updateButton();
  renderTolerance();
  window.addEventListener("pointerdown", () => audio.unlock(), { once: true });
  const on = (id, handler) => $(id).addEventListener("click", (e) => { e.stopPropagation(); handler(); });
  on("btn-start", startGame);
  on("btn-restart", startGame);
  on("btn-back-home", backHome);
  on("btn-run-draw", resolveRunDraw);
  on("btn-open-gacha", gacha.openGacha);
  on("btn-close-gacha", gacha.closeGacha);
  on("btn-draw-one", () => gacha.drawGacha(1));
  on("btn-draw-ten", () => gacha.drawGacha(10));
  on("btn-open-collection", gacha.openCollection);
  on("btn-close-collection", gacha.closeCollection);
  on("btn-open-endings", gacha.openEndings);
  on("btn-close-endings", gacha.closeEndings);
  on("btn-ending-gallery", () => { $("screen-ending").classList.add("hidden"); gacha.openEndings(); });
  on("btn-no-rescue", () => { $("rescue-overlay").classList.add("hidden"); openSwap(); });
  on("btn-no-swap", goNext);
  on("btn-confirm-swap", confirmSwap);
  on("btn-bgm", audio.toggleMute);
  on("btn-emergency-roll", rollEmergencyDice);
  on("btn-emergency-give-up", () => emergencyFail(state.emergencyCardId ? "four" : "no_card"));
  $("stage").addEventListener("click", () => { if (state.mode === "story") advance(); });
  window.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && state.mode === "story") { e.preventDefault(); advance(); }
  });
}

init();
