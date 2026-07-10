/* ============================================================
   Gumayuwei 搞笑戀愛模擬器 Demo 主程式
   ------------------------------------------------------------
   給非工程背景的讀者：
   這個檔案負責整個遊戲的流程，順序是：
   1. 從 /data 資料夾讀取 JSON 資料（卡片、女主角、事件、結局）
   2. 顯示開始畫面
   3. 依序播放 3 個事件：顯示劇情 → 玩家出牌 → 顯示結果 → 數值變化
   4. 3 個事件結束後，依數值判定結局

   想改遊戲內容（台詞、數值、事件）不用改這個檔案，
   直接改 /data 裡的 JSON 檔就可以了。
   ============================================================ */

// ------------------------------------------------------------
// 遊戲狀態（會隨遊戲進行而改變的資料都放在這裡）
// ------------------------------------------------------------
const state = {
  // 六個核心數值，全部從 0 開始
  stats: {
    favorability: 0,  // 好感度
    awkwardness: 0,   // 尷尬值
    comedy: 0,        // 搞笑值
    sincerity: 0,     // 真誠值
    confidence: 0,    // 自信值
    social_death: 0,  // 社死值
  },
  eventIndex: 0, // 目前進行到第幾個事件（從 0 開始）
};

// 數值的中文名稱（畫面顯示用）
const STAT_LABELS = {
  favorability: "好感度",
  awkwardness: "尷尬值",
  comedy: "搞笑值",
  sincerity: "真誠值",
  confidence: "自信值",
  social_death: "社死值",
};

// 這兩個數值越高越糟糕，畫面上用紅色顯示
const DANGER_STATS = ["awkwardness", "social_death"];

// 從 JSON 載入的遊戲資料（載入完成後就不會再改動）
let DATA = { cards: [], heroines: [], events: [], endings: [] };

// ------------------------------------------------------------
// 工具函式：用 id 找到對應的畫面元素
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
// 第一步：載入 JSON 資料
// ------------------------------------------------------------
async function loadData() {
  // 四個 JSON 檔一起讀取（都在 ../data 資料夾）
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

// 用卡片 id 找卡片資料，例如 "card_002" → 「不急」那張卡
function getCard(cardId) {
  return DATA.cards.find((c) => c.id === cardId);
}

// 用女主角 id 找女主角資料
function getHeroine(heroineId) {
  return DATA.heroines.find((h) => h.id === heroineId);
}

// ------------------------------------------------------------
// 畫面切換：一次只顯示一個畫面（開始 / 事件 / 結局）
// ------------------------------------------------------------
function showScreen(screenId) {
  ["screen-start", "screen-event", "screen-ending"].forEach((id) => {
    $(id).classList.toggle("hidden", id !== screenId);
  });
}

// ------------------------------------------------------------
// 數值面板：畫出六條數值條
// ------------------------------------------------------------
function renderStats() {
  const panel = $("stats-panel");
  panel.innerHTML = ""; // 先清空再重畫

  Object.keys(state.stats).forEach((key) => {
    const value = state.stats[key];
    // 數值條的長度：以 40 為滿版（demo 的數值大概落在 0～40 之間）
    const percent = Math.min(100, Math.max(0, (value / 40) * 100));
    const isDanger = DANGER_STATS.includes(key);

    const div = document.createElement("div");
    div.className = "stat";
    div.innerHTML = `
      <div class="stat-label"><span>${STAT_LABELS[key]}</span><span>${value}</span></div>
      <div class="stat-bar"><div class="stat-fill ${isDanger ? "danger" : ""}" style="width:${percent}%"></div></div>
    `;
    panel.appendChild(div);
  });
}

// ------------------------------------------------------------
// 事件流程：顯示目前的事件
// ------------------------------------------------------------
function renderEvent() {
  const event = DATA.events[state.eventIndex];
  const heroine = getHeroine(event.heroine);

  // 上方資訊
  $("event-progress").textContent = `事件 ${state.eventIndex + 1} / ${DATA.events.length}`;
  $("event-location").textContent = event.location;

  // 劇情文字
  $("event-title").textContent = event.title;
  $("event-intro").textContent = event.intro;
  $("heroine-name").textContent = `${heroine.name}（${heroine.title}）`;
  $("heroine-line").textContent = event.heroine_line;

  // 隱藏上一輪的結果，顯示手牌
  $("result-box").classList.add("hidden");
  $("hand-area").classList.remove("hidden");

  renderStats();
  renderHand(event);
}

// ------------------------------------------------------------
// 手牌區：把這個事件可用的卡片畫成按鈕
// ------------------------------------------------------------
function renderHand(event) {
  const hand = $("hand");
  hand.innerHTML = "";

  event.choices.forEach((choice) => {
    const card = getCard(choice.card);

    // 每張卡片做成一個可點擊的按鈕
    const btn = document.createElement("button");
    btn.className = "card";
    btn.innerHTML = `
      <span class="card-rarity rarity-${card.rarity}">${card.rarity}</span>
      <div class="card-name">${card.name}</div>
      <div class="card-line">「${card.line}」</div>
      <div class="card-desc">${card.description}</div>
    `;
    // 點下去就出牌
    btn.addEventListener("click", () => playCard(choice));
    hand.appendChild(btn);
  });
}

// ------------------------------------------------------------
// 出牌：套用效果、顯示演出結果
// ------------------------------------------------------------
function playCard(choice) {
  // 1. 把這次選擇的數值變化加到遊戲狀態上
  Object.keys(choice.effects).forEach((key) => {
    if (key in state.stats) {
      // 數值不會低於 0（例如尷尬值 -5 但目前只有 2，就變 0）
      state.stats[key] = Math.max(0, state.stats[key] + choice.effects[key]);
    }
  });

  // 2. 顯示演出文字（Gumayuwei 的行動 + 女主角的反應）
  $("result-narration").textContent = choice.narration;
  $("result-reaction").textContent = choice.reaction;

  // 3. 顯示這次的數值變化摘要（例如「搞笑值 +12」）
  const effectsBox = $("result-effects");
  effectsBox.innerHTML = "";
  Object.entries(choice.effects).forEach(([key, delta]) => {
    if (delta === 0) return; // 沒有變化的數值不顯示
    const chip = document.createElement("span");
    // 好的變化顯示綠色、壞的顯示紅色（尷尬/社死是「增加=壞」）
    const isDanger = DANGER_STATS.includes(key);
    const isGood = isDanger ? delta < 0 : delta > 0;
    chip.className = `effect-chip ${isGood ? "up" : "down"}`;
    chip.textContent = `${STAT_LABELS[key]} ${delta > 0 ? "+" : ""}${delta}`;
    effectsBox.appendChild(chip);
  });

  // 4. 隱藏手牌、顯示結果區，並更新數值面板
  $("hand-area").classList.add("hidden");
  $("result-box").classList.remove("hidden");
  renderStats();
}

// ------------------------------------------------------------
// 進入下一個事件；如果事件都跑完了，就判定結局
// ------------------------------------------------------------
function nextEvent() {
  state.eventIndex += 1;
  if (state.eventIndex < DATA.events.length) {
    renderEvent();
  } else {
    renderEnding();
  }
}

// ------------------------------------------------------------
// 結局判定：依 endings.json 的順序，找到第一個條件全符合的結局
// ------------------------------------------------------------
function decideEnding() {
  for (const ending of DATA.endings) {
    const conditions = ending.conditions || {};
    // 檢查這個結局的所有條件是否都符合
    const allMet = Object.entries(conditions).every(([statKey, rule]) => {
      const value = state.stats[statKey];
      if (rule.min !== undefined && value < rule.min) return false;
      if (rule.max !== undefined && value > rule.max) return false;
      return true;
    });
    if (allMet) return ending; // 找到就直接回傳（所以 JSON 裡的順序很重要）
  }
  // 理論上最後一個結局沒有條件，一定會被選到；這行只是保險
  return DATA.endings[DATA.endings.length - 1];
}

function renderEnding() {
  const ending = decideEnding();

  $("ending-title").textContent = ending.title;
  $("ending-title").className = `ending-title ${ending.mood}`; // good / normal / bad 決定顏色
  $("ending-text").textContent = ending.text;

  // 顯示最終數值，讓玩家知道自己是怎麼走到這個結局的
  const statsBox = $("ending-stats");
  statsBox.innerHTML = "";
  Object.keys(state.stats).forEach((key) => {
    const chip = document.createElement("span");
    chip.className = "effect-chip";
    chip.textContent = `${STAT_LABELS[key]} ${state.stats[key]}`;
    statsBox.appendChild(chip);
  });

  showScreen("screen-ending");
}

// ------------------------------------------------------------
// 重新開始：把狀態歸零，回到第一個事件
// ------------------------------------------------------------
function restart() {
  Object.keys(state.stats).forEach((key) => (state.stats[key] = 0));
  state.eventIndex = 0;
  renderEvent();
  showScreen("screen-event");
}

// ------------------------------------------------------------
// 遊戲入口：載入資料、綁定按鈕、顯示開始畫面
// ------------------------------------------------------------
async function init() {
  try {
    await loadData();
  } catch (err) {
    // 直接雙擊打開 index.html 時，瀏覽器會擋 fetch 讀取本機檔案，
    // 所以顯示提示，教使用者用本機伺服器開啟
    $("game").innerHTML = `
      <div class="load-error">
        <h2>資料載入失敗</h2>
        <p>請不要直接雙擊開啟 index.html，改用本機伺服器：</p>
        <p>在專案根目錄（Guma_Game）執行 <code>python3 -m http.server 8000</code></p>
        <p>然後用瀏覽器打開 <code>http://localhost:8000/prototype/</code></p>
      </div>
    `;
    console.error(err);
    return;
  }

  // 綁定三顆按鈕
  $("btn-start").addEventListener("click", restart);   // 開始遊戲
  $("btn-next").addEventListener("click", nextEvent);  // 繼續下一個事件
  $("btn-restart").addEventListener("click", restart); // 結局後再來一次

  showScreen("screen-start");
}

// 網頁載入完成後啟動遊戲
init();
