/* ============================================================
   Gumayuwei 搞笑戀愛模擬器 v0.4.1
   ------------------------------------------------------------
   修正：出牌後偶發卡住、選卡參考對話、男主角情緒文字暫代。
   調整：卡片隨遊玩累積；開始遊戲先抽卡；汰換手牌也改成抽卡。
   ============================================================ */

const STAT_LABELS = {
  favorability: "好感",
  awkwardness: "尷尬",
  comedy: "搞笑",
  sincerity: "真誠",
  confidence: "自信",
  social_death: "社死",
  appetite: "食慾",
  battle: "戰鬥",
};
const DANGER_STATS = ["awkwardness", "social_death"];
const OPTIONAL_STATS = ["appetite", "battle"];
const EMOTION_SYMBOLS = { none: "", dots: "…", shock: "！？", tsukkomi: "💢", laugh: "哈哈", smile: "♪", soft: "❣", shout: "‼" };
const EMOTION_TEXT = {
  none: "待機",
  dots: "無言",
  shock: "震驚",
  tsukkomi: "被吐槽中",
  laugh: "尷尬陪笑",
  smile: "裝鎮定",
  soft: "有點心動",
  shout: "崩潰大喊",
};

const TUTORIAL_HAND = ["card_001", "card_002", "card_003", "card_004", "card_005"];
const HAND_SIZE = 5;
const TYPE_SPEED = 28;
const STAGE_W = 1280;
const STAGE_H = 720;

const STORAGE_KEYS = {
  owned: "guma_owned_cards",
  shards: "guma_meme_shards",
  firstTen: "guma_first_ten_done",
  gachaCount: "guma_gacha_count",
  played: "guma_played",
  endings: "guma_unlocked_endings",
  tickets: "guma_gacha_tickets",
};

const GACHA_RATES = [
  { rarity: "N", rate: 50 },
  { rarity: "R", rate: 30 },
  { rarity: "SR", rate: 13 },
  { rarity: "SSR", rate: 5 },
  { rarity: "UR", rate: 2 },
];
const SHARD_REWARD = { N: 1, R: 3, SR: 10, SSR: 30, UR: 80 };
const RARITY_ORDER = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5 };

const state = {
  stats: { favorability: 0, awkwardness: 0, comedy: 0, sincerity: 0, confidence: 0, social_death: 0, appetite: 0, battle: 0 },
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

let DATA = { cards: [], heroines: [], scenes: [], endings: [], start: "", repeatReactions: {} };

const $ = (id) => document.getElementById(id);
const assetPath = (p) => "../" + p;

function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function readNumber(key, fallback = 0) { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) ? value : fallback; }
function writeNumber(key, value) { localStorage.setItem(key, String(value)); }
function getOwnedIds() { return readJson(STORAGE_KEYS.owned, []); }
function setOwnedIds(ids) { writeJson(STORAGE_KEYS.owned, Array.from(new Set(ids)).filter(Boolean)); }
function getUnlockedEndingIds() { return readJson(STORAGE_KEYS.endings, []); }
function setUnlockedEndingIds(ids) { writeJson(STORAGE_KEYS.endings, Array.from(new Set(ids))); }
function getShards() { return readNumber(STORAGE_KEYS.shards, 0); }
function addShards(amount) { writeNumber(STORAGE_KEYS.shards, getShards() + amount); }
function getTickets() { return readNumber(STORAGE_KEYS.tickets, 0); }
function addTickets(amount) { writeNumber(STORAGE_KEYS.tickets, Math.max(0, getTickets() + amount)); }

function bootstrapPlayerData() {
  const owned = getOwnedIds();
  if (owned.length === 0) setOwnedIds(TUTORIAL_HAND);
  if (localStorage.getItem(STORAGE_KEYS.tickets) === null) writeNumber(STORAGE_KEYS.tickets, 0);
}

function grantCard(cardId) {
  const owned = getOwnedIds();
  const card = getCard(cardId);
  const isNew = !owned.includes(cardId);
  if (isNew) {
    owned.push(cardId);
    setOwnedIds(owned);
  } else {
    addShards(SHARD_REWARD[card.rarity] || 1);
  }
  return { card, isNew, shardGain: isNew ? 0 : (SHARD_REWARD[card.rarity] || 1) };
}

async function loadData() {
  const [cards, heroines, scenes, endings] = await Promise.all([
    fetch("../data/cards.json").then((r) => r.json()),
    fetch("../data/heroines.json").then((r) => r.json()),
    fetch("../data/scenes.json").then((r) => r.json()),
    fetch("../data/endings.json").then((r) => r.json()),
  ]);
  DATA = { cards: cards.cards, heroines: heroines.heroines, scenes: scenes.scenes, start: scenes.start, repeatReactions: scenes.repeat_reactions || {}, endings: endings.endings };
  bootstrapPlayerData();
}
const getCard = (id) => DATA.cards.find((c) => c.id === id);
const getHeroine = (id) => DATA.heroines.find((h) => h.id === id);
const getScene = (id) => DATA.scenes.find((s) => s.scene_id === id);
const currentScene = () => getScene(state.sceneId);

function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  $("stage").style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener("resize", fitStage);

function pickRarity(forceMinRarity = null) {
  const rates = forceMinRarity ? GACHA_RATES.filter((r) => RARITY_ORDER[r.rarity] >= RARITY_ORDER[forceMinRarity]) : GACHA_RATES;
  const total = rates.reduce((sum, r) => sum + r.rate, 0);
  let roll = Math.random() * total;
  for (const item of rates) { roll -= item.rate; if (roll <= 0) return item.rarity; }
  return rates[rates.length - 1].rarity;
}
function pickCardByRarity(rarity) {
  const pool = DATA.cards.filter((card) => card.rarity === rarity);
  const fallback = DATA.cards.filter((card) => RARITY_ORDER[card.rarity] >= RARITY_ORDER[rarity]);
  const finalPool = pool.length ? pool : fallback.length ? fallback : DATA.cards;
  return finalPool[Math.floor(Math.random() * finalPool.length)].id;
}
function drawOneGachaCard(forceMinRarity = null) {
  return grantCard(pickCardByRarity(pickRarity(forceMinRarity)));
}

function drawGacha(count, useTickets = true) {
  if (useTickets && getTickets() < count) {
    renderGachaMessage(`抽卡券不足：需要 ${count} 張，目前只有 ${getTickets()} 張。請透過遊玩、汰換與達成結局慢慢累積。`, true);
    return [];
  }
  if (useTickets) addTickets(-count);
  const firstTen = !localStorage.getItem(STORAGE_KEYS.firstTen) && count >= 10;
  const results = [];
  for (let i = 0; i < count; i += 1) {
    results.push(drawOneGachaCard(firstTen && i === count - 1 ? "SR" : null));
  }
  if (firstTen) localStorage.setItem(STORAGE_KEYS.firstTen, "1");
  writeNumber(STORAGE_KEYS.gachaCount, readNumber(STORAGE_KEYS.gachaCount, 0) + count);
  renderGachaResults(results, $("gacha-results"));
  renderHomeProgress();
  renderGachaSummary();
  return results;
}
function openGacha() { renderGachaSummary(); $("gacha-results").innerHTML = ""; $("screen-gacha").classList.remove("hidden"); }
function closeGacha() { $("screen-gacha").classList.add("hidden"); }
function renderGachaSummary() {
  $("gacha-summary").textContent = `抽卡券 ${getTickets()}｜收藏 ${getOwnedIds().length}/${DATA.cards.length}｜迷因碎片 ${getShards()}｜累計抽卡 ${readNumber(STORAGE_KEYS.gachaCount, 0)} 次`;
}
function renderGachaMessage(message, warn = false) {
  const box = $("gacha-results");
  box.innerHTML = `<p class="panel-note ${warn ? "warn" : ""}">${message}</p>`;
}
function renderGachaResults(results, box) {
  box.innerHTML = "";
  results.forEach((result, index) => {
    const el = document.createElement("div");
    el.className = `gacha-card ${result.isNew ? "new" : ""}`;
    el.style.animationDelay = `${index * 0.035}s`;
    el.innerHTML = `
      <span class="card-rarity rarity-${result.card.rarity} rarity-label">${result.card.rarity}</span>
      <h3>${result.card.name}</h3>
      <p>「${result.card.line}」</p>
      <p>${result.card.description}</p>
      <div class="new-label">${result.isNew ? "NEW！加入收藏" : `重複卡 → 迷因碎片 +${result.shardGain}`}</div>
    `;
    box.appendChild(el);
  });
}

function openCollection() { renderCollection(); $("screen-collection").classList.remove("hidden"); }
function closeCollection() { $("screen-collection").classList.add("hidden"); }
function renderCollection() {
  const owned = getOwnedIds();
  const percent = Math.round((owned.length / DATA.cards.length) * 100);
  $("collection-summary").textContent = `已收藏 ${owned.length}/${DATA.cards.length}｜完成度 ${percent}%｜迷因碎片 ${getShards()}`;
  const box = $("collection-grid");
  box.innerHTML = "";
  DATA.cards.forEach((card) => {
    const unlocked = owned.includes(card.id);
    const el = document.createElement("div");
    el.className = `collection-card ${unlocked ? "" : "locked"}`;
    el.innerHTML = unlocked ? `
      <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span><h3>${card.name}</h3><p>「${card.line}」</p><p>${card.description}</p>
      <div class="collection-tags">${(card.tags || []).slice(0, 4).map((tag) => `<span>${tag}</span>`).join("")}</div>
    ` : `
      <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span><h3>？？？？？</h3><p>尚未抽到這張卡。</p><p>提示：${card.rarity}｜${(card.type || ["未知"])[0]}</p>
    `;
    box.appendChild(el);
  });
}

function openEndings() { renderEndingGallery(); $("screen-endings").classList.remove("hidden"); }
function closeEndings() { $("screen-endings").classList.add("hidden"); }
function endingHint(ending) {
  const conditions = ending.conditions || {};
  if (conditions.cards) return "提示：和特定卡片使用次數有關。";
  const stats = conditions.stats || {};
  if (stats.social_death) return "提示：有人在公司或公共場合社死了。";
  if (stats.appetite) return "提示：和食物、續攤、吃太多有關。";
  if (stats.sincerity) return "提示：真誠值是關鍵。";
  if (ending.mood === "good") return "提示：提高好感，並避免場面失控。";
  if (ending.mood === "bad") return "提示：錯誤的卡連續使用。";
  return "提示：嘗試不同場景和卡片組合。";
}
function renderEndingGallery() {
  const unlocked = getUnlockedEndingIds();
  const total = DATA.endings.length;
  const percent = total ? Math.round((unlocked.length / total) * 100) : 0;
  $("ending-summary").textContent = `已解鎖 ${unlocked.length}/${total}｜還有 ${Math.max(0, total - unlocked.length)} 個結局等待探索｜完成度 ${percent}%`;
  $("ending-progress-bar").querySelector("span").style.width = `${percent}%`;
  const box = $("ending-gallery");
  box.innerHTML = "";
  DATA.endings.forEach((ending, index) => {
    const isUnlocked = unlocked.includes(ending.ending_id);
    const el = document.createElement("div");
    el.className = `ending-card ${isUnlocked ? "unlocked" : "locked"}`;
    el.innerHTML = isUnlocked ? `
      <span class="mood-${ending.mood}">已解鎖｜${ending.mood.toUpperCase()}</span><h3>${ending.title}</h3><p>${ending.text.split("\n")[0]}</p>
    ` : `
      <span>未解鎖｜No.${String(index + 1).padStart(2, "0")}</span><h3>？？？？？</h3><p>這個結局尚未被 Gumayuwei 走到。</p><p class="hint">${endingHint(ending)}</p>
    `;
    box.appendChild(el);
  });
}
function unlockEnding(endingId) {
  const unlocked = getUnlockedEndingIds();
  const wasNew = !unlocked.includes(endingId);
  if (wasNew) { unlocked.push(endingId); setUnlockedEndingIds(unlocked); }
  return wasNew;
}

function getPlayablePool() {
  let owned = getOwnedIds().filter((id) => getCard(id));
  if (owned.length < HAND_SIZE) { owned = Array.from(new Set([...owned, ...TUTORIAL_HAND])); setOwnedIds(owned); }
  return owned;
}
function dealHand() {
  const urlHand = new URLSearchParams(location.search).get("hand");
  if (urlHand) {
    state.hand = urlHand.split(",").filter((id) => getCard(id)).slice(0, HAND_SIZE);
    while (state.hand.length < HAND_SIZE) state.hand.push(drawCardFromCollection());
  } else if (!localStorage.getItem(STORAGE_KEYS.played)) {
    state.hand = [...TUTORIAL_HAND];
    setOwnedIds(Array.from(new Set([...getOwnedIds(), ...TUTORIAL_HAND])));
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
function applyEffects(effects) { Object.entries(effects || {}).forEach(([key, delta]) => { if (key in state.stats && delta !== 0) state.stats[key] = Math.max(0, state.stats[key] + delta); }); }
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
  function finishTyping() { clearInterval(state.typeTimer); box.textContent = text; state.typing = false; $("advance-hint").classList.remove("hidden"); }
  state.skipTyping = finishTyping;
}
function playScript(lines, onDone) { state.script = Array.isArray(lines) ? lines : []; state.lineIndex = -1; state.afterScript = onDone; state.mode = "story"; advance(); }
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

function loadScene(sceneId) {
  state.sceneId = sceneId;
  state.stopCount += 1;
  const scene = getScene(sceneId);
  if (!scene) { showEnding(); return; }
  $("bg").src = assetPath(scene.background);
  $("topbar").classList.remove("hidden");
  $("hud-location").textContent = `第 ${state.stopCount} 站・${scene.title}｜${scene.location}`;
  renderHud();
  playScript(scene.intro_script, openHand);
}
function buildCardButton(cardId, onClick) {
  const card = getCard(cardId);
  const btn = document.createElement("button");
  btn.className = "card";
  btn.innerHTML = `<div class="card-art"><span class="card-rarity rarity-${card.rarity}">${card.rarity}</span><span class="placeholder-line">「${card.line}」</span></div><div class="card-meta"><div class="card-name">${card.name}</div><div class="card-desc">${card.description}</div></div>`;
  tryLoadCardArt(btn.querySelector(".card-art"), card);
  btn.addEventListener("click", (e) => { e.stopPropagation(); if (!btn.disabled) onClick(cardId); });
  return btn;
}
function tryLoadCardArt(artBox, card) {
  if (!card.image || !artBox) return;
  const img = new Image();
  img.onload = () => { artBox.querySelector(".placeholder-line")?.remove(); artBox.appendChild(img); };
  img.src = assetPath(card.image);
}
function openHand() {
  state.mode = "hand";
  const context = state.lastDialogue || { speaker: "提示", text: "請根據目前情境選擇一張卡。" };
  $("choice-context").innerHTML = `<div><span class="context-speaker">${context.speaker}</span>${context.text}</div><div class="context-note">選錯不一定會輸，但可能會社死。</div>`;
  const hand = $("hand");
  hand.innerHTML = "";
  state.hand.forEach((cardId) => hand.appendChild(buildCardButton(cardId, playCard)));
  $("hand-overlay").classList.remove("hidden");
}

function safeResult(scene, cardId, card) {
  const bespoke = (scene.card_results || {})[cardId];
  const fallback = scene.fallback || {};
  const result = bespoke || fallback;
  return {
    bespoke,
    script: Array.isArray(result.script) ? result.script : [{ type: "narration", text: `Gumayuwei 使出了「${card.name}」，現場陷入一陣難以解釋的沉默。` }],
    effects: bespoke ? (bespoke.effects || {}) : (card.effects || {}),
    next: result.next || "ending",
    rescue: bespoke && bespoke.danger ? bespoke.rescue : null,
  };
}
function playCard(cardId) {
  $("hand-overlay").classList.add("hidden");
  const scene = currentScene();
  const card = getCard(cardId);
  const heroine = getHeroine(scene.heroine);
  const result = safeResult(scene, cardId, card);
  state.cardUse[cardId] = (state.cardUse[cardId] || 0) + 1;
  state.lastUsedCard = cardId;
  updateGumaEmotionText(`準備使用「${card.name}」`);
  const bonus = tagModifiers(card, scene, heroine);
  const changed = [];
  applyEffects(result.effects);
  applyEffects(bonus);
  Object.keys(result.effects || {}).forEach((k) => result.effects[k] && changed.push(k));
  Object.keys(bonus).forEach((k) => bonus[k] && changed.push(k));
  renderHud(changed);
  state.pendingNext = result.next;
  state.pendingDanger = result.rescue;
  showCutin(card, result.effects, bonus, () => {
    playScript(templateScript(result.script, { card_name: card.name }), () => afterResult(cardId));
  });
}
function templateScript(lines, vars) { return (lines || []).map((line) => ({ ...line, text: String(line.text || "").replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`) })); }
function afterResult(cardId) {
  if (state.cardUse[cardId] === 3) {
    const reaction = DATA.repeatReactions[cardId] || DATA.repeatReactions.default;
    if (reaction) { applyEffects(reaction.effects); renderHud(Object.keys(reaction.effects || {})); playScript([{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: reaction.line }], maybeRescue); return; }
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
    renderHud(Object.keys(rescue.effects || {}));
    playScript(templateScript(rescue.script, { rescue_card_name: rescueCard.name }), openSwap);
  })));
  $("rescue-overlay").classList.remove("hidden");
}
function openSwap() {
  if (state.pendingNext === "ending") { goNext(); return; }
  state.mode = "swap";
  $("swap-result").classList.add("hidden");
  const box = $("swap-hand");
  box.innerHTML = "";
  state.hand.forEach((id) => box.appendChild(buildCardButton(id, (discardId) => {
    state.pendingDiscard = discardId;
    state.hand = state.hand.filter((h) => h !== discardId);
    $("swap-overlay").classList.add("hidden");
    openRunDraw("swap");
  })));
  $("swap-overlay").classList.remove("hidden");
}
function goNext() {
  $("swap-overlay").classList.add("hidden");
  const next = state.pendingNext;
  state.pendingNext = null;
  if (next === "ending") showEnding(); else loadScene(next || DATA.start);
}

function decideEnding() {
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
  state.mode = "ending";
  localStorage.setItem(STORAGE_KEYS.played, "1");
  const isNewEnding = unlockEnding(ending.ending_id);
  const reward = isNewEnding ? 2 : 1;
  addTickets(reward);
  renderHomeProgress();
  $("ending-title").textContent = ending.title;
  $("ending-title").className = `ending-title ${ending.mood}`;
  $("ending-text").textContent = ending.text;
  $("ending-reward").textContent = `本輪獎勵：抽卡券 +${reward}${isNewEnding ? "（新結局加成）" : ""}`;
  const statsBox = $("ending-stats");
  statsBox.innerHTML = "";
  Object.keys(state.stats).forEach((key) => {
    if (OPTIONAL_STATS.includes(key) && state.stats[key] === 0) return;
    const chip = document.createElement("span");
    chip.className = "effect-chip";
    chip.textContent = `${STAT_LABELS[key]} ${state.stats[key]}`;
    statsBox.appendChild(chip);
  });
  $("dialog").classList.add("hidden");
  $("topbar").classList.add("hidden");
  $("screen-ending").classList.remove("hidden");
}

function showCutin(card, effects, bonus, onDismiss) {
  const cardBox = $("cutin-card");
  cardBox.innerHTML = `<span class="placeholder-line">「${card.line}」</span>`;
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

function resetRunState() {
  Object.keys(state.stats).forEach((key) => (state.stats[key] = 0));
  state.hand = [];
  state.cardUse = {};
  state.stopCount = 0;
  state.pendingNext = null;
  state.pendingDanger = null;
  state.lastUsedCard = null;
  state.pendingDiscard = null;
  state.runDrawCardId = null;
  state.lastDialogue = null;
}
function openRunDraw(mode) {
  state.runDrawMode = mode;
  state.runDrawDone = false;
  $("run-draw-result").innerHTML = "";
  $("btn-run-draw").textContent = "抽 1 張";
  if (mode === "start") {
    $("run-draw-title").textContent = "開始前抽一張卡";
    $("run-draw-desc").textContent = "本輪開始前先抽 1 張，卡片會加入收藏，並有機會進入本輪手牌。";
  } else {
    $("run-draw-title").textContent = "手牌汰換抽卡";
    $("run-draw-desc").textContent = `已淘汰「${getCard(state.pendingDiscard)?.name || "一張卡"}」，現在抽 1 張新卡補進手牌。`;
  }
  $("screen-run-draw").classList.remove("hidden");
}
function resolveRunDraw() {
  if (!state.runDrawDone) {
    const result = drawOneGachaCard();
    state.runDrawCardId = result.card.id;
    writeNumber(STORAGE_KEYS.gachaCount, readNumber(STORAGE_KEYS.gachaCount, 0) + 1);
    renderGachaResults([result], $("run-draw-result"));
    renderHomeProgress();
    state.runDrawDone = true;
    $("btn-run-draw").textContent = state.runDrawMode === "start" ? "進入劇情 ▶" : "補進手牌 ▶";
    return;
  }
  $("screen-run-draw").classList.add("hidden");
  if (state.runDrawMode === "start") {
    dealHand();
    $("screen-start").classList.add("hidden");
    loadScene(DATA.start);
  } else {
    state.hand.push(state.runDrawCardId);
    state.pendingDiscard = null;
    state.runDrawCardId = null;
    goNext();
  }
}

function hidePanels() { ["screen-gacha", "screen-collection", "screen-endings", "screen-ending", "screen-run-draw"].forEach((id) => $(id).classList.add("hidden")); }
function renderHomeProgress() {
  if (!DATA.cards.length) return;
  const owned = getOwnedIds().length;
  const endings = getUnlockedEndingIds().length;
  const endingTotal = DATA.endings.length;
  $("home-progress").innerHTML = `
    <span class="home-chip">卡片 <b>${owned}/${DATA.cards.length}</b></span>
    <span class="home-chip">結局 <b>${endings}/${endingTotal}</b></span>
    <span class="home-chip">未解鎖 <b>${Math.max(0, endingTotal - endings)}</b></span>
    <span class="home-chip">抽卡券 <b>${getTickets()}</b></span>
    <span class="home-chip">碎片 <b>${getShards()}</b></span>
  `;
}
function startGame() { resetRunState(); hidePanels(); openRunDraw("start"); }
function backHome() {
  state.mode = "start";
  hidePanels();
  $("dialog").classList.add("hidden");
  $("topbar").classList.add("hidden");
  $("hand-overlay").classList.add("hidden");
  $("rescue-overlay").classList.add("hidden");
  $("swap-overlay").classList.add("hidden");
  $("cutin").classList.add("hidden");
  renderHomeProgress();
  $("screen-start").classList.remove("hidden");
}

async function init() {
  fitStage();
  try { await loadData(); }
  catch (err) {
    const box = document.createElement("div");
    box.className = "load-error";
    box.innerHTML = `<h2>資料載入失敗</h2><p>請不要直接雙擊開啟 index.html，改用本機伺服器：</p><p>在專案根目錄執行 <code>python3 -m http.server 8000</code></p>`;
    $("stage").appendChild(box);
    console.error(err);
    return;
  }
  renderHomeProgress();
  $("btn-start").addEventListener("click", (e) => { e.stopPropagation(); startGame(); });
  $("btn-restart").addEventListener("click", (e) => { e.stopPropagation(); startGame(); });
  $("btn-back-home").addEventListener("click", (e) => { e.stopPropagation(); backHome(); });
  $("btn-run-draw").addEventListener("click", (e) => { e.stopPropagation(); resolveRunDraw(); });
  $("btn-open-gacha").addEventListener("click", (e) => { e.stopPropagation(); openGacha(); });
  $("btn-close-gacha").addEventListener("click", (e) => { e.stopPropagation(); closeGacha(); });
  $("btn-draw-one").addEventListener("click", (e) => { e.stopPropagation(); drawGacha(1, true); });
  $("btn-draw-ten").addEventListener("click", (e) => { e.stopPropagation(); drawGacha(10, true); });
  $("btn-open-collection").addEventListener("click", (e) => { e.stopPropagation(); openCollection(); });
  $("btn-close-collection").addEventListener("click", (e) => { e.stopPropagation(); closeCollection(); });
  $("btn-open-endings").addEventListener("click", (e) => { e.stopPropagation(); openEndings(); });
  $("btn-close-endings").addEventListener("click", (e) => { e.stopPropagation(); closeEndings(); });
  $("btn-ending-gallery").addEventListener("click", (e) => { e.stopPropagation(); $("screen-ending").classList.add("hidden"); openEndings(); });
  $("btn-no-rescue").addEventListener("click", (e) => { e.stopPropagation(); $("rescue-overlay").classList.add("hidden"); openSwap(); });
  $("btn-no-swap").addEventListener("click", (e) => { e.stopPropagation(); goNext(); });
  $("stage").addEventListener("click", () => { if (state.mode === "story") advance(); });
  window.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && state.mode === "story") { e.preventDefault(); advance(); } });
}

init();
