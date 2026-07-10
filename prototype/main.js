/* ============================================================
   Gumayuwei 搞笑戀愛模擬器（galgame 式）主程式
   ------------------------------------------------------------
   給非工程背景的讀者，整體流程是：

   1. 從 /data 讀取 JSON（卡片、女主角、事件劇本、結局）
   2. 開始畫面 → 進入事件
   3. 事件劇本一行一行播放（旁白 / 台詞），點擊畫面推進，
      文字有打字機效果
   4. 劇本遇到「choice」節點 → 彈出手牌，玩家選一張道具卡
   5. 出牌 → 全螢幕特寫演出（cut-in）→ 播放出牌後的結果劇本
   6. 三個事件跑完 → 依數值判定結局

   想改劇情、台詞、數值，直接改 /data 的 JSON 就好，
   不需要動這個檔案。
   ============================================================ */

// ------------------------------------------------------------
// 常數設定
// ------------------------------------------------------------

// 數值的中文名稱（畫面顯示用）
const STAT_LABELS = {
  favorability: "好感",
  awkwardness: "尷尬",
  comedy: "搞笑",
  sincerity: "真誠",
  confidence: "自信",
  social_death: "社死",
};

// 這兩個數值越高越糟糕，顯示成紅色
const DANGER_STATS = ["awkwardness", "social_death"];

// 情緒代號 → 頭上泡泡顯示的符號
const EMOTION_SYMBOLS = {
  none: "",
  dots: "…",       // 無言 / 沉默
  shock: "！？",    // 震驚 / 傻眼
  tsukkomi: "💢",   // 吐槽 / 不爽
  laugh: "哈哈",    // 大笑
  smile: "♪",      // 愉快 / 得意
  soft: "❣",       // 心動 / 溫柔
  shout: "‼",      // 吶喊
};

// 打字機效果：每個字出現的間隔（毫秒）
const TYPE_SPEED = 28;

// 舞台的設計尺寸（16:9），縮放時以這個為基準
const STAGE_W = 1280;
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
  },
  eventIndex: 0,   // 進行到第幾個事件
  cardUse: {},     // 這一輪每張卡用過幾次（例如 { card_005: 2 }），結局判定會用到
  script: [],      // 目前正在播放的劇本（一行一行）
  lineIndex: -1,   // 播到劇本的第幾行
  inOutcome: false, // 是否正在播「出牌後的結果劇本」
  mode: "start",   // start / story / hand / cutin / ending
  typing: false,   // 打字機是否進行中
  typeTimer: null, // 打字機的計時器
};

// 從 JSON 載入的遊戲資料
let DATA = { cards: [], heroines: [], events: [], endings: [] };

// 縮寫：用 id 抓畫面元素
const $ = (id) => document.getElementById(id);

// 資料裡的資源路徑（assets/...）是從專案根目錄算的，
// 這個頁面在 prototype/ 裡，所以要加上 ../
const assetPath = (p) => "../" + p;

// ------------------------------------------------------------
// 資料載入
// ------------------------------------------------------------
async function loadData() {
  const [cards, heroines, events, endings] = await Promise.all([
    fetch("../data/cards.json").then((r) => r.json()),
    fetch("../data/heroines.json").then((r) => r.json()),
    fetch("../data/events.json").then((r) => r.json()),
    fetch("../data/endings.json").then((r) => r.json()),
  ]);
  DATA = {
    cards: cards.cards,
    heroines: heroines.heroines,
    events: events.events,
    endings: endings.endings,
  };
}

const getCard = (id) => DATA.cards.find((c) => c.id === id);
const getHeroine = (id) => DATA.heroines.find((h) => h.id === id);

// ------------------------------------------------------------
// 舞台縮放：把 1280x720 的舞台縮放到剛好塞進視窗（維持 16:9）
// ------------------------------------------------------------
function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  $("stage").style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener("resize", fitStage);

// ------------------------------------------------------------
// HUD：上方的場景名與六個數值
// ------------------------------------------------------------
function renderHud(changedKeys = []) {
  const box = $("hud-stats");
  box.innerHTML = "";
  Object.keys(state.stats).forEach((key) => {
    const chip = document.createElement("span");
    const danger = DANGER_STATS.includes(key) ? " danger" : "";
    // 剛變動過的數值加上 pulse 動畫提醒玩家
    const pulse = changedKeys.includes(key) ? " pulse" : "";
    chip.className = `hud-chip${danger}${pulse}`;
    chip.innerHTML = `${STAT_LABELS[key]} <b>${state.stats[key]}</b>`;
    box.appendChild(chip);
  });
}

// ------------------------------------------------------------
// 立繪控制
// ------------------------------------------------------------

// 讓某個角色亮起來（speaker: guma / heroine / 其他=全部變暗）
function highlightSpeaker(speaker) {
  const guma = $("sprite-guma");
  const heroine = $("sprite-heroine");
  guma.classList.toggle("active", speaker === "guma");
  guma.classList.toggle("dim", speaker !== "guma");
  heroine.classList.toggle("active", speaker === "heroine");
  heroine.classList.toggle("dim", speaker !== "heroine");
}

// 顯示 / 隱藏角色頭上的情緒泡泡
function showEmotion(speaker, emotion) {
  // 先清掉兩個角色的泡泡
  document.querySelectorAll(".emotion-badge").forEach((b) => b.classList.add("hidden"));
  const symbol = EMOTION_SYMBOLS[emotion] || "";
  if (!symbol) return;
  const sprite = speaker === "guma" ? $("sprite-guma") : speaker === "heroine" ? $("sprite-heroine") : null;
  if (!sprite) return; // 主管等沒有立繪的角色就不顯示泡泡
  const badge = sprite.querySelector(".emotion-badge");
  badge.textContent = symbol;
  badge.classList.remove("hidden");
  // 重新觸發 pop 動畫
  badge.style.animation = "none";
  void badge.offsetWidth; // 強制瀏覽器重算，讓動畫能重播
  badge.style.animation = "";
}

// 說話者代號 → 名牌顯示的名字
function speakerName(speaker) {
  if (speaker === "guma") return "Gumayuwei";
  if (speaker === "heroine") {
    const event = DATA.events[state.eventIndex];
    return getHeroine(event.heroine).name;
  }
  if (speaker === "boss") return "主管";
  return speaker;
}

// ------------------------------------------------------------
// 打字機效果：文字一個字一個字出現
// ------------------------------------------------------------
function typeText(text, onDone) {
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
    if (onDone) onDone();
  }

  // 讓外部可以「跳過打字」（玩家在打字中點擊）
  state.skipTyping = finishTyping;
}

// ------------------------------------------------------------
// 劇本播放
// ------------------------------------------------------------

// 播放下一行劇本
function advance() {
  // 打字進行中 → 這次點擊只是「跳過打字」，直接顯示整句
  if (state.typing) {
    state.skipTyping();
    return;
  }

  state.lineIndex += 1;
  const line = state.script[state.lineIndex];

  // 劇本播完了
  if (!line) {
    onScriptEnd();
    return;
  }

  if (line.type === "choice") {
    openHand(); // 劇情節點：彈出手牌
    return;
  }

  renderLine(line);
}

// 把一行劇本畫到對話框上
function renderLine(line) {
  const dialog = $("dialog");
  const nameplate = $("nameplate");
  dialog.classList.remove("hidden");

  if (line.type === "narration") {
    // 旁白：沒有名牌、文字用斜體灰色，兩個角色都變暗
    dialog.classList.add("narration");
    highlightSpeaker(null);
    showEmotion(null, "none");
  } else {
    // 角色台詞：顯示名牌、亮起說話者、顯示情緒泡泡
    dialog.classList.remove("narration");
    nameplate.textContent = speakerName(line.speaker);
    nameplate.className = `nameplate speaker-${line.speaker}`;
    highlightSpeaker(line.speaker);
    showEmotion(line.speaker, line.emotion || "none");
  }

  typeText(line.text);
}

// 目前這段劇本播完之後要做什麼
function onScriptEnd() {
  if (state.inOutcome) {
    // 出牌結果劇本播完 → 進下一個事件（或結局）
    state.inOutcome = false;
    state.eventIndex += 1;
    if (state.eventIndex < DATA.events.length) {
      startEvent(state.eventIndex);
    } else {
      showEnding();
    }
  }
  // 事件主劇本的最後一行一定是 choice，不會走到這裡，
  // 所以不用處理其他情況
}

// ------------------------------------------------------------
// 事件開場
// ------------------------------------------------------------
function startEvent(index) {
  const event = DATA.events[index];

  // 換背景
  $("bg").src = assetPath(event.background);

  // HUD
  $("topbar").classList.remove("hidden");
  $("hud-location").textContent = `第 ${index + 1} 話・${event.title}｜${event.location}`;
  renderHud();

  // 載入這個事件的劇本，開始播放
  state.mode = "story";
  state.script = event.script;
  state.lineIndex = -1;
  state.inOutcome = false;
  advance();
}

// ------------------------------------------------------------
// 手牌（劇情節點的卡片選擇）
// ------------------------------------------------------------
function openHand() {
  state.mode = "hand";
  const event = DATA.events[state.eventIndex];
  const hand = $("hand");
  hand.innerHTML = "";

  event.choices.forEach((choice) => {
    const card = getCard(choice.card);
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
    // 如果卡片圖存在，就蓋掉占位樣式（圖載入失敗則維持占位卡面）
    tryLoadCardArt(btn.querySelector(".card-art"), card);
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // 不要觸發舞台的「點擊推進」
      playCard(choice);
    });
    hand.appendChild(btn);
  });

  $("hand-overlay").classList.remove("hidden");
}

// 嘗試載入卡片圖：成功才放進畫面，失敗就保留文字占位卡面
function tryLoadCardArt(artBox, card) {
  if (!card.image) return;
  const img = new Image();
  img.onload = () => {
    artBox.querySelector(".placeholder-line")?.remove();
    artBox.appendChild(img);
  };
  img.src = assetPath(card.image);
}

// ------------------------------------------------------------
// 出牌：套用數值 → 全螢幕特寫演出 → 播結果劇本
// ------------------------------------------------------------
function playCard(choice) {
  const card = getCard(choice.card);
  $("hand-overlay").classList.add("hidden");

  // 0. 記錄卡片使用次數（某些結局的條件是「同一張卡用了幾次」）
  state.cardUse[choice.card] = (state.cardUse[choice.card] || 0) + 1;

  // 1. 套用數值變化（不讓數值低於 0）
  const changedKeys = [];
  Object.entries(choice.effects).forEach(([key, delta]) => {
    if (key in state.stats && delta !== 0) {
      state.stats[key] = Math.max(0, state.stats[key] + delta);
      changedKeys.push(key);
    }
  });
  renderHud(changedKeys);

  // 2. 特寫演出：卡面 + 台詞 + 數值變化
  const cardBox = $("cutin-card");
  cardBox.innerHTML = `<span class="placeholder-line">「${card.line}」</span>`;
  tryLoadCardArt(cardBox, card);
  $("cutin-name").textContent = `${card.rarity}・${card.name}`;
  $("cutin-line").textContent = `「${card.line}」`;

  const effectsBox = $("cutin-effects");
  effectsBox.innerHTML = "";
  Object.entries(choice.effects).forEach(([key, delta]) => {
    if (delta === 0) return;
    const chip = document.createElement("span");
    const isDanger = DANGER_STATS.includes(key);
    const isGood = isDanger ? delta < 0 : delta > 0;
    chip.className = `effect-chip ${isGood ? "up" : "down"}`;
    chip.textContent = `${STAT_LABELS[key]} ${delta > 0 ? "+" : ""}${delta}`;
    effectsBox.appendChild(chip);
  });

  state.mode = "cutin";
  $("cutin").classList.remove("hidden");

  // 3. 點擊特寫畫面（或超時自動）→ 關閉特寫、播結果劇本
  const dismiss = () => {
    clearTimeout(autoTimer);
    $("cutin").classList.add("hidden");
    state.mode = "story";
    state.inOutcome = true;
    state.script = choice.script;
    state.lineIndex = -1;
    advance();
  };
  const autoTimer = setTimeout(dismiss, 4000); // 4 秒沒點就自動繼續
  $("cutin").onclick = (e) => {
    e.stopPropagation();
    dismiss();
  };
}

// ------------------------------------------------------------
// 結局
// ------------------------------------------------------------

// 依 endings.json 的順序，找到第一個條件全部符合的結局。
// 條件有兩種：stats（數值高低）與 cards（某張卡這輪用了幾次），
// 規則都是 { min: 最小值 } / { max: 最大值 }，兩種條件要同時滿足。
function decideEnding() {
  // 檢查一組規則是否全部符合（values 是要對照的數字表）
  const meets = (rules, values) =>
    Object.entries(rules).every(([key, rule]) => {
      const value = values[key] || 0;
      if (rule.min !== undefined && value < rule.min) return false;
      if (rule.max !== undefined && value > rule.max) return false;
      return true;
    });

  for (const ending of DATA.endings) {
    const conditions = ending.conditions || {};
    const statsOk = meets(conditions.stats || {}, state.stats);
    const cardsOk = meets(conditions.cards || {}, state.cardUse);
    if (statsOk && cardsOk) return ending;
  }
  return DATA.endings[DATA.endings.length - 1]; // 保險：最後一個是無條件結局
}

function showEnding() {
  const ending = decideEnding();
  state.mode = "ending";

  $("ending-title").textContent = ending.title;
  $("ending-title").className = `ending-title ${ending.mood}`;
  $("ending-text").textContent = ending.text;

  // 最終數值一覽
  const statsBox = $("ending-stats");
  statsBox.innerHTML = "";
  Object.keys(state.stats).forEach((key) => {
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
// 開始 / 重新開始
// ------------------------------------------------------------
function startGame() {
  // 數值與卡片使用紀錄歸零
  Object.keys(state.stats).forEach((key) => (state.stats[key] = 0));
  state.cardUse = {};
  state.eventIndex = 0;
  $("screen-start").classList.add("hidden");
  $("screen-ending").classList.add("hidden");
  startEvent(0);
}

// ------------------------------------------------------------
// 遊戲入口
// ------------------------------------------------------------
async function init() {
  fitStage();

  try {
    await loadData();
  } catch (err) {
    // 直接雙擊 index.html 會被瀏覽器擋 fetch，顯示教學
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

  // 開始 / 重來按鈕
  $("btn-start").addEventListener("click", (e) => { e.stopPropagation(); startGame(); });
  $("btn-restart").addEventListener("click", (e) => { e.stopPropagation(); startGame(); });

  // 點擊舞台任何地方 → 推進劇情（只在 story 模式有效）
  $("stage").addEventListener("click", () => {
    if (state.mode === "story") advance();
  });

  // 空白鍵 / Enter 也能推進劇情（鍵盤黨友善）
  window.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && state.mode === "story") {
      e.preventDefault();
      advance();
    }
  });
}

init();
