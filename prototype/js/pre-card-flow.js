/* ============================================================
   pre-card-flow.js — 選卡前即興前綴、女主打斷、重複卡預判
   ------------------------------------------------------------
   所有前綴、打斷與預判都直接共用遊戲原本的 #dialog，
   不建立另一套對話框，確保字體、名牌、位置與點擊節奏一致。
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

const TYPE_SPEED = 18;
const cardUseCounts = new Map();
let lastScenePrefix = "";
let sequenceBusy = false;
let handCycle = 0;
let handledCycle = -1;
let internalReveal = false;
let typingTimer = null;
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

function heroineName() {
  const previousName = document.getElementById("nameplate")?.textContent?.trim();
  const previousClass = document.getElementById("nameplate")?.className || "";
  if (previousName && previousClass.includes("speaker-heroine")) return previousName;
  return document.querySelector("#sprite-heroine img")?.alt || "女主角";
}

function setSpeaker(speaker) {
  const nameplate = document.getElementById("nameplate");
  const guma = document.getElementById("sprite-guma");
  const heroine = document.getElementById("sprite-heroine");
  if (!nameplate) return;

  if (speaker === "heroine") {
    nameplate.textContent = heroineName();
    nameplate.className = "nameplate speaker-heroine";
    guma?.classList.remove("active");
    guma?.classList.add("dim");
    heroine?.classList.remove("dim");
    heroine?.classList.add("active");
  } else {
    nameplate.textContent = "Gumayuwei";
    nameplate.className = "nameplate speaker-guma";
    heroine?.classList.remove("active");
    heroine?.classList.add("dim");
    guma?.classList.remove("dim");
    guma?.classList.add("active");
  }
}

function typeIntoOriginalDialog(text, onFinished) {
  const textBox = document.getElementById("dialog-text");
  const hint = document.getElementById("advance-hint");
  if (!textBox || !hint) {
    onFinished?.();
    return () => {};
  }

  window.clearInterval(typingTimer);
  textBox.textContent = "";
  hint.classList.add("hidden");
  let index = 0;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearInterval(typingTimer);
    textBox.textContent = text;
    hint.classList.remove("hidden");
    onFinished?.();
  };

  typingTimer = window.setInterval(() => {
    index += 1;
    textBox.textContent = text.slice(0, index);
    if (index >= text.length) finish();
  }, TYPE_SPEED);

  return finish;
}

function showSequence(lines, onDone, { hideHand = false } = {}) {
  if (sequenceBusy || !lines.length) return;
  sequenceBusy = true;

  const dialog = document.getElementById("dialog");
  const handOverlay = document.getElementById("hand-overlay");
  if (!dialog) {
    sequenceBusy = false;
    onDone?.();
    return;
  }

  if (hideHand) handOverlay?.classList.add("hidden");
  dialog.classList.remove("hidden", "narration");

  let index = 0;
  let lineFinished = false;
  let finishTyping = () => {};

  const render = () => {
    const line = lines[index];
    lineFinished = false;
    setSpeaker(line.speaker);
    finishTyping = typeIntoOriginalDialog(line.text, () => {
      lineFinished = true;
    });
  };

  const advance = (event) => {
    event?.preventDefault();
    event?.stopPropagation();
    event?.stopImmediatePropagation?.();

    if (!lineFinished) {
      finishTyping();
      return;
    }

    index += 1;
    if (index < lines.length) {
      render();
      return;
    }

    dialog.removeEventListener("click", advance, true);
    sequenceBusy = false;
    onDone?.();
  };

  dialog.addEventListener("click", advance, true);
  render();
}

function interruptionForTolerance(tolerance) {
  if (tolerance < 30) return pick(HARD_INTERRUPTS);
  if (tolerance < 70 && Math.random() < 0.5) return pick(MILD_INTERRUPTS);
  return "";
}

function runPreSelectionLeadIn(handOverlay) {
  if (sequenceBusy || handledCycle === handCycle) return;
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
  }, { hideHand: true });
}

function resetRuntime() {
  cardUseCounts.clear();
  lastScenePrefix = "";
  handCycle = 0;
  handledCycle = -1;
  internalReveal = false;
  sequenceBusy = false;
  window.clearInterval(typingTimer);
}

export function installPreCardFlow() {
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
