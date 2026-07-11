/* ============================================================
   pre-card-flow.js — 選卡前即興前綴、女主打斷、重複卡預判
   ------------------------------------------------------------
   流程：
   場景對話 → 男主場景前綴 → 女主可能打斷 → 顯示手牌
   重複選卡時，女主會先預判，再讓原本出牌流程繼續。
   ============================================================ */

const SCENE_PREFIXES = {
  ev_pantry_invite: [
    "既然都聊到下班了……",
    "茶水間的氣氛都到這裡了……",
    "我本來只是想來裝水，但……",
  ],
  ev_elevator: [
    "趁電梯門還沒開……",
    "反正現在也逃不出去……",
    "這幾秒可能有點漫長，但……",
  ],
  ev_conv_store: [
    "在冰櫃前講這句很怪，但……",
    "便利商店的燈光讓我突然想通了……",
    "先不要管冰棒，我有句話……",
  ],
  ev_dinner_shop: [
    "湯圓先等一下，我有話要說……",
    "這句話可能比甜湯更甜，也可能不是……",
    "在下一口之前，我想補充一下……",
  ],
  ev_night_market: [
    "這裡很吵，所以我只講一次……",
    "趁人潮還沒把我們沖散……",
    "先不要看旁邊那攤，我突然想到……",
  ],
  ev_gossip: [
    "既然大家都在偷聽……",
    "這句話講完可能會傳到全公司……",
    "我先聲明，等等不要截圖……",
  ],
  ev_meeting_room: [
    "這句不在會議資料裡……",
    "主管可能不會同意，但……",
    "先暫停一下專業模式……",
  ],
  ev_confession: [
    "我練習過很多次，但現在還是忘光了……",
    "接下來這句，我沒有辦法撤回……",
    "如果我現在不說，以後一定會後悔……",
  ],
  default: [
    "其實……",
    "我想說的是……",
    "等一下，我整理一下語言……",
  ],
};

const MILD_INTERRUPTS = [
  "你這個開場聽起來很危險。",
  "你先講重點，我有在聽。",
  "等一下，你又在鋪陳什麼？",
  "你每次這樣開頭，我都會有點不安。",
];

const HARD_INTERRUPTS = [
  "停。你已經鋪陳太久了，直接講。",
  "我忍受度不夠聽你繞圈，重點。",
  "你再多講一個前綴，我就先走。",
  "不用營造氣氛了，直接選你要講的。",
];

const cardUseCounts = new Map();
let lastScenePrefix = "";
let overlayBusy = false;
let handCycle = 0;
let handledCycle = -1;
let internalReveal = false;
const bypassButtons = new WeakSet();

function pick(list, avoid = "") {
  const candidates = list.filter((item) => item !== avoid);
  const pool = candidates.length ? candidates : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function inferSceneId() {
  const text = document.getElementById("hud-location")?.textContent || "";
  if (text.includes("茶水間")) return "ev_pantry_invite";
  if (text.includes("電梯")) return "ev_elevator";
  if (text.includes("便利商店")) return "ev_conv_store";
  if (text.includes("甜湯") || text.includes("晚餐")) return "ev_dinner_shop";
  if (text.includes("夜市")) return "ev_night_market";
  if (text.includes("八卦") || text.includes("公司走廊")) return "ev_gossip";
  if (text.includes("會議室")) return "ev_meeting_room";
  if (text.includes("告白") || text.includes("夜晚街角")) return "ev_confession";
  return "default";
}

function readTolerance() {
  const raw = document.getElementById("tolerance-value")?.textContent || "100";
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 100;
}

function ensureStyles() {
  if (document.getElementById("pre-card-flow-style")) return;
  const style = document.createElement("style");
  style.id = "pre-card-flow-style";
  style.textContent = `
    .pre-card-flow-overlay {
      position: absolute;
      inset: 0;
      z-index: 70;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0 70px 38px;
      background: rgba(7, 7, 14, 0.24);
      pointer-events: auto;
    }
    .pre-card-flow-panel {
      width: min(1080px, 100%);
      min-height: 132px;
      padding: 22px 28px 18px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(19,18,31,.97), rgba(8,8,16,.98));
      box-shadow: 0 24px 70px rgba(0,0,0,.58);
      color: #fff;
    }
    .pre-card-flow-name {
      margin-bottom: 10px;
      color: #ffd34d;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: .08em;
    }
    .pre-card-flow-text {
      min-height: 48px;
      font-size: 24px;
      font-weight: 800;
      line-height: 1.55;
    }
    .pre-card-flow-next {
      margin-top: 8px;
      color: rgba(255,255,255,.62);
      font-size: 13px;
      text-align: right;
    }
    .pre-card-flow-panel.heroine .pre-card-flow-name { color: #ff9fcf; }
    @media (max-height: 760px) {
      .pre-card-flow-overlay { padding-bottom: 24px; }
      .pre-card-flow-panel { min-height: 108px; padding: 16px 22px 13px; }
      .pre-card-flow-text { min-height: 38px; font-size: 20px; }
    }
  `;
  document.head.appendChild(style);
}

function showSequence(lines, onDone) {
  if (overlayBusy) return;
  overlayBusy = true;
  const overlay = document.createElement("div");
  overlay.className = "pre-card-flow-overlay";
  overlay.innerHTML = `
    <div class="pre-card-flow-panel">
      <div class="pre-card-flow-name"></div>
      <div class="pre-card-flow-text"></div>
      <div class="pre-card-flow-next">點擊繼續 ▼</div>
    </div>`;
  document.getElementById("stage")?.appendChild(overlay);

  let index = 0;
  const render = () => {
    const line = lines[index];
    const panel = overlay.querySelector(".pre-card-flow-panel");
    panel.classList.toggle("heroine", line.speaker === "heroine");
    overlay.querySelector(".pre-card-flow-name").textContent = line.speaker === "heroine" ? "女主角" : "Gumayuwei";
    overlay.querySelector(".pre-card-flow-text").textContent = line.text;
  };
  const next = (event) => {
    event?.stopPropagation();
    index += 1;
    if (index < lines.length) {
      render();
      return;
    }
    overlay.remove();
    overlayBusy = false;
    onDone?.();
  };
  overlay.addEventListener("click", next);
  render();
}

function interruptionForTolerance(tolerance) {
  if (tolerance < 30) return pick(HARD_INTERRUPTS);
  if (tolerance < 70 && Math.random() < 0.5) return pick(MILD_INTERRUPTS);
  return "";
}

function runPreSelectionLeadIn(handOverlay) {
  if (overlayBusy || handledCycle === handCycle) return;
  handledCycle = handCycle;
  handOverlay.classList.add("hidden");

  const sceneId = inferSceneId();
  const prefix = pick(SCENE_PREFIXES[sceneId] || SCENE_PREFIXES.default, lastScenePrefix);
  lastScenePrefix = prefix;
  const interruption = interruptionForTolerance(readTolerance());
  const lines = [{ speaker: "guma", text: prefix }];
  if (interruption) lines.push({ speaker: "heroine", text: interruption });

  showSequence(lines, () => {
    internalReveal = true;
    handOverlay.classList.remove("hidden");
  });
}

function cardInfo(button) {
  return {
    name: button.querySelector(".card-name")?.textContent?.trim() || "這張卡",
    line: button.querySelector(".placeholder-line")?.textContent?.trim() || "",
  };
}

function predictionLines(info, previousUses) {
  if (previousUses >= 3) {
    return [
      { speaker: "heroine", text: `不用開口了。你又要用「${info.name}」，對吧？` },
      { speaker: "guma", text: "……妳現在連我的手牌都看得懂了？" },
    ];
  }
  if (previousUses === 2) {
    return [
      { speaker: "heroine", text: `我已經知道了。你等等一定又要講 ${info.line || `「${info.name}」`}。` },
      { speaker: "guma", text: "等一下，這次語氣不一樣。" },
    ];
  }
  return [
    { speaker: "heroine", text: `等一下……你該不會又要用「${info.name}」吧？` },
    { speaker: "guma", text: "妳先不要預判，我還沒選完。" },
  ];
}

function handleCardCapture(event) {
  const button = event.target.closest("#hand .card");
  if (!button) return;

  if (bypassButtons.has(button)) {
    bypassButtons.delete(button);
    const info = cardInfo(button);
    cardUseCounts.set(info.name, (cardUseCounts.get(info.name) || 0) + 1);
    return;
  }

  const info = cardInfo(button);
  const previousUses = cardUseCounts.get(info.name) || 0;
  if (previousUses === 0) {
    cardUseCounts.set(info.name, 1);
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  showSequence(predictionLines(info, previousUses), () => {
    bypassButtons.add(button);
    button.click();
  });
}

function resetRuntime() {
  cardUseCounts.clear();
  lastScenePrefix = "";
  handCycle = 0;
  handledCycle = -1;
  internalReveal = false;
}

export function installPreCardFlow() {
  ensureStyles();
  document.addEventListener("click", handleCardCapture, true);
  document.getElementById("btn-start")?.addEventListener("click", resetRuntime, true);
  document.getElementById("btn-restart")?.addEventListener("click", resetRuntime, true);

  const handOverlay = document.getElementById("hand-overlay");
  if (!handOverlay) return;
  let wasHidden = handOverlay.classList.contains("hidden");
  const observer = new MutationObserver(() => {
    const hidden = handOverlay.classList.contains("hidden");
    if (internalReveal && !hidden) {
      internalReveal = false;
      wasHidden = false;
      return;
    }
    if (wasHidden && !hidden) {
      handCycle += 1;
      queueMicrotask(() => runPreSelectionLeadIn(handOverlay));
    }
    wasHidden = hidden;
  });
  observer.observe(handOverlay, { attributes: true, attributeFilter: ["class"] });
}
