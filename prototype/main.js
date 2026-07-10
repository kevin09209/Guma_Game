/* ============================================================
   Gumayuwei 搞笑戀愛模擬器（v0.2：牌庫 × 場景跳轉版）主程式
   ------------------------------------------------------------
   給非工程背景的讀者，整體流程是：

   1. 從 /data 讀 JSON：卡片（cards）、女主角（heroines）、
      場景圖（scenes）、結局（endings）
   2. 開局發手牌：第一次玩發固定教學手牌，之後從 10 張牌庫隨機抽 5 張
   3. 進入場景 → 播放開場劇本 → 彈出手牌 → 玩家出 1 張卡
   4. 出牌後：
      - 套用數值變化（含「標籤加成」：場景屬性 × 女主喜好）
      - 播放全螢幕特寫與結果劇本
      - 同一張卡用到第 3 次 → 女主額外吐槽
      - 出到危險卡 → 觸發「錯卡補救」：可用手牌中的補救卡救場
      - 可淘汰 1 張手牌從牌庫重抽（手牌汰換）
   5. 卡片決定下一個場景（場景跳轉），走到 "ending" 就判定結局

   想改劇情、卡片、數值、跳轉路線，直接改 /data 的 JSON，
   不需要動這個檔案。
   ============================================================ */

// ------------------------------------------------------------
// 常數設定
// ------------------------------------------------------------

// 八個數值的中文名稱（畫面顯示用）
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

// 這兩個數值越高越糟糕，顯示成紅色
const DANGER_STATS = ["awkwardness", "social_death"];

// 這兩個數值平常隱藏，有值才顯示（避免 HUD 太擠）
const OPTIONAL_STATS = ["appetite", "battle"];

// 情緒代號 → 頭上泡泡顯示的符號
const EMOTION_SYMBOLS = {
  none: "",
  dots: "…",
  shock: "！？",
  tsukkomi: "💢",
  laugh: "哈哈",
  smile: "♪",
  soft: "❣",
  shout: "‼",
};

// 第一次玩的固定教學手牌（之後每局隨機抽）
const TUTORIAL_HAND = ["card_001", "card_002", "card_003", "card_004", "card_005"];

const HAND_SIZE = 5;      // 手牌上限
const TYPE_SPEED = 28;    // 打字機速度（毫秒/字）
const STAGE_W = 1280;     // 舞台設計尺寸（16:9）
const STAGE_H = 720;

// ------------------------------------------------------------
// 遊戲狀態
// ------------------------------------------------------------
const state = {
  stats: {
    favorability: 0,
    awkwardness: 0,
    comedy: 0,
    sincerity: 0,
    confidence: 0,
    social_death: 0,
    appetite: 0,
    battle: 0,
  },
  hand: [],        // 目前手牌（卡片 id）
  cardUse: {},     // 這一輪每張卡用過幾次
  sceneId: null,   // 目前場景
  stopCount: 0,    // 第幾站（顯示用）
  script: [],      // 目前正在播放的劇本
  lineIndex: -1,
  mode: "start",   // start / story / hand / cutin / rescue / swap / ending
  typing: false,
  typeTimer: null,
  // 出牌後暫存的流程資訊
  pendingNext: null,    // 結果劇本播完後要去的下一個場景
  pendingDanger: null,  // 危險結果的補救設定（沒有就是 null）
  lastUsedCard: null,   // 這次用的卡（補救時要排除它）
  afterScript: null,    // 劇本播完後要執行的函式
};

let DATA = { cards: [], heroines: [], scenes: [], endings: [], start: "", repeatReactions: {} };

const $ = (id) => document.getElementById(id);
const assetPath = (p) => "../" + p;

// ------------------------------------------------------------
// 資料載入
// ------------------------------------------------------------
async function loadData() {
  const [cards, heroines, scenes, endings] = await Promise.all([
    fetch("../data/cards.json").then((r) => r.json()),
    fetch("../data/heroines.json").then((r) => r.json()),
    fetch("../data/scenes.json").then((r) => r.json()),
    fetch("../data/endings.json").then((r) => r.json()),
  ]);
  DATA = {
    cards: cards.cards,
    heroines: heroines.heroines,
    scenes: scenes.scenes,
    start: scenes.start,
    repeatReactions: scenes.repeat_reactions || {},
    endings: endings.endings,
  };
}

const getCard = (id) => DATA.cards.find((c) => c.id === id);
const getHeroine = (id) => DATA.heroines.find((h) => h.id === id);
const getScene = (id) => DATA.scenes.find((s) => s.scene_id === id);
const currentScene = () => getScene(state.sceneId);

// ------------------------------------------------------------
// 舞台縮放
// ------------------------------------------------------------
function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  $("stage").style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener("resize", fitStage);

// ------------------------------------------------------------
// 發牌與抽牌
// ------------------------------------------------------------

// 開局發 5 張手牌
function dealHand() {
  // 開發測試用：網址加 ?hand=card_001,card_002,... 可以指定起手牌
  const urlHand = new URLSearchParams(location.search).get("hand");
  if (urlHand) {
    state.hand = urlHand.split(",").filter((id) => getCard(id)).slice(0, HAND_SIZE);
    while (state.hand.length < HAND_SIZE) state.hand.push(drawCard());
    return;
  }
  // 第一次玩：固定教學手牌（保證新手能體驗到完整劇情）
  if (!localStorage.getItem("guma_played")) {
    state.hand = [...TUTORIAL_HAND];
    return;
  }
  // 之後每局：從牌庫隨機抽 5 張（不重複）
  state.hand = [];
  while (state.hand.length < HAND_SIZE) state.hand.push(drawCard());
}

// 從牌庫抽一張「目前不在手牌裡」的卡
function drawCard() {
  const pool = DATA.cards.filter((c) => !state.hand.includes(c.id));
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ------------------------------------------------------------
// 標籤加成：卡片 tags × 場景屬性 × 女主喜好
// ------------------------------------------------------------
function tagModifiers(card, scene, heroine) {
  const bonus = { favorability: 0, awkwardness: 0, social_death: 0 };
  (card.tags || []).forEach((tag) => {
    if ((scene.preferred_tags || []).includes(tag)) bonus.favorability += 1;      // 場景適合
    if ((scene.danger_tags || []).includes(tag)) { bonus.social_death += 2; bonus.awkwardness += 2; } // 場景危險
    if ((heroine.likes || []).includes(tag)) bonus.favorability += 1;             // 女主喜歡
    if ((heroine.dislikes || []).includes(tag)) { bonus.favorability -= 2; bonus.awkwardness += 2; }  // 女主討厭
  });
  return bonus;
}

// 把一組數值變化套用到遊戲狀態（數值不低於 0）
function applyEffects(effects) {
  Object.entries(effects || {}).forEach(([key, delta]) => {
    if (key in state.stats && delta !== 0) {
      state.stats[key] = Math.max(0, state.stats[key] + delta);
    }
  });
}

// ------------------------------------------------------------
// HUD
// ------------------------------------------------------------
function renderHud(changedKeys = []) {
  const box = $("hud-stats");
  box.innerHTML = "";
  Object.keys(state.stats).forEach((key) => {
    // 食慾 / 戰鬥沒有值就先不顯示，避免 HUD 太擠
    if (OPTIONAL_STATS.includes(key) && state.stats[key] === 0) return;
    const chip = document.createElement("span");
    const danger = DANGER_STATS.includes(key) ? " danger" : "";
    const pulse = changedKeys.includes(key) ? " pulse" : "";
    chip.className = `hud-chip${danger}${pulse}`;
    chip.innerHTML = `${STAT_LABELS[key]} <b>${state.stats[key]}</b>`;
    box.appendChild(chip);
  });
}

// ------------------------------------------------------------
// 立繪與情緒
// ------------------------------------------------------------
function highlightSpeaker(speaker) {
  const guma = $("sprite-guma");
  const heroine = $("sprite-heroine");
  guma.classList.toggle("active", speaker === "guma");
  guma.classList.toggle("dim", speaker !== "guma");
  heroine.classList.toggle("active", speaker === "heroine");
  heroine.classList.toggle("dim", speaker !== "heroine");
}

function showEmotion(speaker, emotion) {
  document.querySelectorAll(".emotion-badge").forEach((b) => b.classList.add("hidden"));
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

// ------------------------------------------------------------
// 打字機
// ------------------------------------------------------------
function typeText(text) {
  const box = $("dialog-text");
  box.textContent = "";
  $("advance-hint").classList.add("hidden");
  state.typing = true;

  let i = 0;
  state.typeTimer = setInterval(() => {
    box.textContent = text.slice(0, ++i);
    if (i >= text.length) finishTyping();
  }, TYPE_SPEED);

  function finishTyping() {
    clearInterval(state.typeTimer);
    box.textContent = text;
    state.typing = false;
    $("advance-hint").classList.remove("hidden");
  }
  state.skipTyping = finishTyping;
}

// ------------------------------------------------------------
// 劇本播放：playScript(劇本, 播完要做的事)
// ------------------------------------------------------------
function playScript(lines, onDone) {
  state.script = lines;
  state.lineIndex = -1;
  state.afterScript = onDone;
  state.mode = "story";
  advance();
}

function advance() {
  if (state.typing) {
    state.skipTyping(); // 打字中點擊 → 直接顯示整句
    return;
  }
  state.lineIndex += 1;
  const line = state.script[state.lineIndex];
  if (!line) {
    // 劇本播完了 → 執行接下來的流程
    const next = state.afterScript;
    state.afterScript = null;
    if (next) next();
    return;
  }
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
  } else {
    dialog.classList.remove("narration");
    nameplate.textContent = speakerName(line.speaker);
    nameplate.className = `nameplate speaker-${line.speaker}`;
    highlightSpeaker(line.speaker);
    showEmotion(line.speaker, line.emotion || "none");
  }
  typeText(line.text);
}

// ------------------------------------------------------------
// 場景流程
// ------------------------------------------------------------
function loadScene(sceneId) {
  state.sceneId = sceneId;
  state.stopCount += 1;
  const scene = getScene(sceneId);

  $("bg").src = assetPath(scene.background);
  $("topbar").classList.remove("hidden");
  $("hud-location").textContent = `第 ${state.stopCount} 站・${scene.title}｜${scene.location}`;
  renderHud();

  // 開場劇本播完 → 彈出手牌
  playScript(scene.intro_script, openHand);
}

// ------------------------------------------------------------
// 手牌
// ------------------------------------------------------------

// 建立一張卡片按鈕（手牌、補救、汰換都用這個）
function buildCardButton(cardId, onClick, small = false) {
  const card = getCard(cardId);
  const btn = document.createElement("button");
  btn.className = "card";
  btn.innerHTML = `
    <div class="card-art">
      <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
      <span class="placeholder-line">「${card.line}」</span>
    </div>
    <div class="card-meta">
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${card.description}</div>
    </div>
  `;
  tryLoadCardArt(btn.querySelector(".card-art"), card);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(cardId);
  });
  return btn;
}

function tryLoadCardArt(artBox, card) {
  if (!card.image) return;
  const img = new Image();
  img.onload = () => {
    artBox.querySelector(".placeholder-line")?.remove();
    artBox.appendChild(img);
  };
  img.src = assetPath(card.image);
}

function openHand() {
  state.mode = "hand";
  const hand = $("hand");
  hand.innerHTML = "";
  state.hand.forEach((cardId) => hand.appendChild(buildCardButton(cardId, playCard)));
  $("hand-overlay").classList.remove("hidden");
}

// ------------------------------------------------------------
// 出牌主流程
// ------------------------------------------------------------
function playCard(cardId) {
  $("hand-overlay").classList.add("hidden");
  const scene = currentScene();
  const card = getCard(cardId);
  const heroine = getHeroine(scene.heroine);

  // 1. 找結果：場景有專屬結果就用它，否則用 fallback（效果 = 卡片基礎效果）
  const bespoke = (scene.card_results || {})[cardId];
  const result = bespoke || scene.fallback;
  const baseEffects = bespoke ? bespoke.effects : card.effects;

  // 2. 記錄使用次數
  state.cardUse[cardId] = (state.cardUse[cardId] || 0) + 1;
  state.lastUsedCard = cardId;

  // 3. 標籤加成 + 套用數值
  const bonus = tagModifiers(card, scene, heroine);
  const changed = [];
  applyEffects(baseEffects);
  applyEffects(bonus);
  Object.keys(baseEffects || {}).forEach((k) => baseEffects[k] && changed.push(k));
  Object.keys(bonus).forEach((k) => bonus[k] && changed.push(k));
  renderHud(changed);

  // 4. 暫存流程資訊：結果劇本 → (重複反應) → (補救) → 汰換 → 下一站
  state.pendingNext = result.next;
  state.pendingDanger = bespoke && bespoke.danger ? bespoke.rescue : null;

  // 5. 特寫演出 → 結果劇本
  showCutin(card, baseEffects, bonus, () => {
    const script = templateScript(result.script, { card_name: card.name });
    playScript(script, () => afterResult(cardId));
  });
}

// 把劇本裡的 {card_name} 之類的占位字換成實際名稱
function templateScript(lines, vars) {
  return lines.map((line) => ({
    ...line,
    text: line.text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`),
  }));
}

// 結果劇本播完之後：重複使用反應 → 錯卡補救 → 手牌汰換
function afterResult(cardId) {
  // 同一張卡在這一輪用到第 3 次 → 女主的額外吐槽
  if (state.cardUse[cardId] === 3) {
    const reaction = DATA.repeatReactions[cardId] || DATA.repeatReactions.default;
    if (reaction) {
      applyEffects(reaction.effects);
      renderHud(Object.keys(reaction.effects || {}));
      playScript(
        [{ type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: reaction.line }],
        () => maybeRescue()
      );
      return;
    }
  }
  maybeRescue();
}

// 錯卡補救：這次結果是危險的，而且手牌裡有「補救」標籤的卡 → 給玩家救場機會
function maybeRescue() {
  const rescue = state.pendingDanger;
  state.pendingDanger = null;
  if (!rescue) { openSwap(); return; }

  const candidates = state.hand.filter(
    (id) => id !== state.lastUsedCard && (getCard(id).tags || []).includes("補救")
  );
  if (candidates.length === 0) { openSwap(); return; } // 沒有補救卡，只能硬吃

  state.mode = "rescue";
  $("rescue-prompt").textContent = rescue.prompt || "場面即將死亡，是否使用補救卡？";
  const box = $("rescue-cards");
  box.innerHTML = "";
  candidates.forEach((id) =>
    box.appendChild(
      buildCardButton(id, (rescueId) => {
        $("rescue-overlay").classList.add("hidden");
        const rescueCard = getCard(rescueId);
        state.cardUse[rescueId] = (state.cardUse[rescueId] || 0) + 1; // 補救也算使用
        applyEffects(rescue.effects);
        renderHud(Object.keys(rescue.effects || {}));
        const script = templateScript(rescue.script, { rescue_card_name: rescueCard.name });
        playScript(script, openSwap);
      }, true)
    )
  );
  $("rescue-overlay").classList.remove("hidden");
}

// ------------------------------------------------------------
// 手牌汰換：可淘汰 1 張、從牌庫重抽 1 張
// ------------------------------------------------------------
function openSwap() {
  // 下一站就是結局的話，汰換沒有意義，直接進結局
  if (state.pendingNext === "ending") { goNext(); return; }

  state.mode = "swap";
  $("swap-result").classList.add("hidden");
  const box = $("swap-hand");
  box.innerHTML = "";
  state.hand.forEach((id) =>
    box.appendChild(
      buildCardButton(id, (discardId) => {
        // 淘汰選中的卡，從牌庫抽一張新的
        state.hand = state.hand.filter((h) => h !== discardId);
        const newId = drawCard();
        state.hand.push(newId);
        const info = $("swap-result");
        info.textContent = `淘汰了「${getCard(discardId).name}」，抽到了「${getCard(newId).name}」！`;
        info.classList.remove("hidden");
        // 停 1.2 秒讓玩家看到抽了什麼，然後前往下一站
        box.querySelectorAll("button").forEach((b) => (b.disabled = true));
        setTimeout(() => {
          $("swap-overlay").classList.add("hidden");
          goNext();
        }, 1200);
      }, true)
    )
  );
  $("swap-overlay").classList.remove("hidden");
}

function goNext() {
  $("swap-overlay").classList.add("hidden");
  const next = state.pendingNext;
  state.pendingNext = null;
  if (next === "ending") {
    showEnding();
  } else {
    loadScene(next);
  }
}

// ------------------------------------------------------------
// 結局
// ------------------------------------------------------------
function decideEnding() {
  const meets = (rules, values) =>
    Object.entries(rules).every(([key, rule]) => {
      const value = values[key] || 0;
      if (rule.min !== undefined && value < rule.min) return false;
      if (rule.max !== undefined && value > rule.max) return false;
      return true;
    });

  for (const ending of DATA.endings) {
    const conditions = ending.conditions || {};
    if (meets(conditions.stats || {}, state.stats) && meets(conditions.cards || {}, state.cardUse)) {
      return ending;
    }
  }
  return DATA.endings[DATA.endings.length - 1];
}

function showEnding() {
  const ending = decideEnding();
  state.mode = "ending";
  localStorage.setItem("guma_played", "1"); // 之後開局改成隨機手牌

  $("ending-title").textContent = ending.title;
  $("ending-title").className = `ending-title ${ending.mood}`;
  $("ending-text").textContent = ending.text;

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

// ------------------------------------------------------------
// 特寫演出（cut-in）
// ------------------------------------------------------------
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

  const dismiss = () => {
    clearTimeout(autoTimer);
    $("cutin").classList.add("hidden");
    onDismiss();
  };
  const autoTimer = setTimeout(dismiss, 4500); // 沒點擊就自動繼續
  $("cutin").onclick = (e) => {
    e.stopPropagation();
    dismiss();
  };
}

// ------------------------------------------------------------
// 開始 / 重新開始
// ------------------------------------------------------------
function startGame() {
  Object.keys(state.stats).forEach((key) => (state.stats[key] = 0));
  state.cardUse = {};
  state.stopCount = 0;
  state.pendingNext = null;
  state.pendingDanger = null;
  dealHand();
  $("screen-start").classList.add("hidden");
  $("screen-ending").classList.add("hidden");
  loadScene(DATA.start);
}

// ------------------------------------------------------------
// 遊戲入口
// ------------------------------------------------------------
async function init() {
  fitStage();

  try {
    await loadData();
  } catch (err) {
    const box = document.createElement("div");
    box.className = "load-error";
    box.innerHTML = `
      <h2>資料載入失敗</h2>
      <p>請不要直接雙擊開啟 index.html，改用本機伺服器：</p>
      <p>在專案根目錄（Guma_Game）執行 <code>python3 -m http.server 8000</code></p>
      <p>然後用瀏覽器打開 <code>http://localhost:8000/prototype/</code></p>
    `;
    $("stage").appendChild(box);
    console.error(err);
    return;
  }

  $("btn-start").addEventListener("click", (e) => { e.stopPropagation(); startGame(); });
  $("btn-restart").addEventListener("click", (e) => { e.stopPropagation(); startGame(); });
  $("btn-no-rescue").addEventListener("click", (e) => {
    e.stopPropagation();
    $("rescue-overlay").classList.add("hidden");
    openSwap(); // 不補救，硬著頭皮往下走
  });
  $("btn-no-swap").addEventListener("click", (e) => {
    e.stopPropagation();
    goNext(); // 保留手牌，直接前往下一站
  });

  // 點擊舞台 → 推進劇情（只在 story 模式有效）
  $("stage").addEventListener("click", () => {
    if (state.mode === "story") advance();
  });
  window.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && state.mode === "story") {
      e.preventDefault();
      advance();
    }
  });
}

init();
