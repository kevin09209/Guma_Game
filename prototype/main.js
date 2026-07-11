/* ============================================================
   main.js — v0.6.0 單局流程協調器
   ------------------------------------------------------------
   內容在 /data，系統分別由 tolerance / choices / swap / emergency 管理。
   main.js 只負責串接：劇情 → 選擇 → 出牌 → 救援 → 汰換 → 結局。
   ============================================================ */

import {
  STAT_LABELS, DANGER_STATS, OPTIONAL_STATS, EMOTION_SYMBOLS, EMOTION_TEXT,
  TUTORIAL_HAND, HAND_SIZE, TYPE_SPEED, ENDING_BGM,
} from "./js/config.js";
import * as store from "./js/storage.js";
import {
  DATA, loadData, getCard, getHeroine, getScene, getEnding,
  assetPath, preloadBackgrounds,
} from "./js/data.js";
import { $, esc, fitStage, buildCardButton, tryLoadCardArt } from "./js/ui.js";
import * as gacha from "./js/gacha.js";
import * as audio from "./js/audio.js";
import {
  TOLERANCE_MAX, applyTolerance, renderTolerance, clamp,
} from "./js/tolerance.js";
import {
  openSceneChoice as showSceneChoice, applyChoiceFlags, choiceScript, getMemoryLines,
} from "./js/choices.js";
import {
  drawReplacementCard, renderSwapHand, renderReplacementFlip,
} from "./js/swap.js";
import {
  DICE_FACES, rollDice, scaleEffects, rescuePower,
  eligibleEmergencyCards, findEmergencyEnding,
} from "./js/emergency.js";
import {
  loadCardLeadIns, buildCardLeadIn,
} from "./js/card-lead-ins.js";

const query = new URLSearchParams(location.search);
const forcedDice = query.get("dice");
const debugTolerance = Number(query.get("tolerance"));
const debugScene = query.get("scene");

const state = {
  stats: freshStats(),
  tolerance: TOLERANCE_MAX,
  emergencyPending: false,
  emergencyCardId: null,
  forcedEnding: null,
  hand: [],
  cardUse: {},
  flags: new Set(),
  choiceHistory: [],
  sceneId: null,
  stopCount: 0,
  script: [],
  lineIndex: -1,
  mode: "start",
  typing: false,
  typeTimer: null,
  skipTyping: null,
  afterScript: null,
  lastDialogue: null,
  lastUsedCard: null,
  lastCardLeadIn: "",
  pendingNext: null,
  pendingDanger: null,
  pendingDiscard: null,
  runDrawDone: false,
  runDrawCardId: null,
};

function freshStats() {
  return {
    favorability: 0,
    awkwardness: 0,
    comedy: 0,
    sincerity: 0,
    confidence: 0,
    social_death: 0,
    appetite: 0,
    battle: 0,
  };
}

const currentScene = () => getScene(state.sceneId);

function createCardLeadIn(card, context = "normal", emotion = "thinking") {
  const result = buildCardLeadIn({
    card,
    sceneId: state.sceneId,
    context,
    previous: state.lastCardLeadIn,
  });
  state.lastCardLeadIn = result.signature;
  return {
    type: "dialogue",
    speaker: "guma",
    emotion,
    text: result.text,
  };
}

function prependCardLeadIn(lines, card, context = "normal", emotion = "thinking") {
  return [createCardLeadIn(card, context, emotion), ...(Array.isArray(lines) ? lines : [])];
}

function getPlayablePool() {
  let owned = store.getOwnedIds().filter((id) => getCard(id));
  if (owned.length < HAND_SIZE) {
    owned = Array.from(new Set([...owned, ...TUTORIAL_HAND]));
    store.setOwnedIds(owned);
  }
  return owned;
}

function drawCardFromCollection() {
  const owned = getPlayablePool();
  let pool = owned.filter((id) => !state.hand.includes(id));
  if (!pool.length) pool = owned;
  return pool[Math.floor(Math.random() * pool.length)];
}

function dealHand() {
  const urlHand = query.get("hand");
  state.hand = [];
  if (urlHand) {
    state.hand = urlHand.split(",").filter((id) => getCard(id)).slice(0, HAND_SIZE);
  } else if (!store.hasPlayed()) {
    state.hand = [...TUTORIAL_HAND];
    store.setOwnedIds(Array.from(new Set([...store.getOwnedIds(), ...TUTORIAL_HAND])));
  }
  while (state.hand.length < HAND_SIZE) state.hand.push(drawCardFromCollection());
  if (state.runDrawCardId && !state.hand.includes(state.runDrawCardId)) {
    state.hand[state.hand.length - 1] = state.runDrawCardId;
  }
}

function mergeEffects(...lists) {
  const merged = {};
  lists.forEach((effects) => {
    Object.entries(effects || {}).forEach(([key, value]) => {
      merged[key] = (merged[key] || 0) + (Number(value) || 0);
    });
  });
  return merged;
}

function tagModifiers(card, scene, heroine) {
  const bonus = { favorability: 0, awkwardness: 0, social_death: 0 };
  (card.tags || []).forEach((tag) => {
    if ((scene.preferred_tags || []).includes(tag)) bonus.favorability += 1;
    if ((scene.danger_tags || []).includes(tag)) {
      bonus.social_death += 2;
      bonus.awkwardness += 2;
    }
    if ((heroine.likes || []).includes(tag)) bonus.favorability += 1;
    if ((heroine.dislikes || []).includes(tag)) {
      bonus.favorability -= 2;
      bonus.awkwardness += 2;
    }
  });
  return bonus;
}

function applyEffects(effects = {}) {
  Object.entries(effects).forEach(([key, value]) => {
    if (key in state.stats && value) state.stats[key] = Math.max(0, state.stats[key] + value);
  });
  const toleranceResult = applyTolerance(state.tolerance, effects);
  state.tolerance = toleranceResult.value;
  if (toleranceResult.emergency) state.emergencyPending = true;
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
  renderTolerance(state.tolerance, $);
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
  const element = $("guma-emotion-text");
  if (!element) return;
  element.textContent = `Gumayuwei 表情：${EMOTION_TEXT[emotion] || emotion || "待機"}`;
  element.classList.remove("hidden");
}

function hideGumaEmotionText() {
  $("guma-emotion-text")?.classList.add("hidden");
}

function showEmotion(speaker, emotion) {
  document.querySelectorAll(".emotion-badge").forEach((badge) => badge.classList.add("hidden"));
  if (speaker === "guma") updateGumaEmotionText(emotion || "none");
  const symbol = EMOTION_SYMBOLS[emotion] || "";
  if (!symbol) return;
  const sprite = speaker === "guma" ? $("sprite-guma") : speaker === "heroine" ? $("sprite-heroine") : null;
  const badge = sprite?.querySelector(".emotion-badge");
  if (!badge) return;
  badge.textContent = symbol;
  badge.classList.remove("hidden");
}

function speakerName(speaker) {
  if (speaker === "guma") return "Gumayuwei";
  if (speaker === "heroine") return getHeroine(currentScene()?.heroine)?.name || "女主角";
  if (speaker === "boss") return "主管";
  return speaker || "";
}

function typeText(text) {
  const box = $("dialog-text");
  box.textContent = "";
  $("advance-hint").classList.add("hidden");
  state.typing = true;
  let index = 0;

  const finish = () => {
    clearInterval(state.typeTimer);
    box.textContent = text;
    state.typing = false;
    $("advance-hint").classList.remove("hidden");
  };

  state.typeTimer = setInterval(() => {
    index += 1;
    box.textContent = text.slice(0, index);
    if (index >= text.length) finish();
  }, TYPE_SPEED);
  state.skipTyping = finish;
}

function playScript(lines, onDone) {
  state.script = Array.isArray(lines) ? lines : [];
  state.lineIndex = -1;
  state.afterScript = onDone;
  state.mode = "story";
  advance();
}

function advance() {
  if (state.typing) {
    state.skipTyping?.();
    return;
  }
  state.lineIndex += 1;
  const line = state.script[state.lineIndex];
  if (!line) {
    const callback = state.afterScript;
    state.afterScript = null;
    callback?.();
    return;
  }
  renderLine(line);
}

function renderLine(line) {
  const dialog = $("dialog");
  dialog.classList.remove("hidden");
  if (line.type === "narration") {
    dialog.classList.add("narration");
    highlightSpeaker(null);
    state.lastDialogue = { speaker: "旁白", text: line.text };
  } else {
    dialog.classList.remove("narration");
    const name = speakerName(line.speaker);
    $("nameplate").textContent = name;
    $("nameplate").className = `nameplate speaker-${line.speaker}`;
    highlightSpeaker(line.speaker);
    showEmotion(line.speaker, line.emotion || "none");
    state.lastDialogue = { speaker: name, text: line.text };
  }
  typeText(line.text || "");
}

function templateScript(lines, variables) {
  return (lines || []).map((line) => ({
    ...line,
    text: String(line.text || "").replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`),
  }));
}

function loadScene(sceneId) {
  state.sceneId = sceneId;
  state.stopCount += 1;
  const scene = currentScene();
  if (!scene) {
    showEnding();
    return;
  }
  $("bg").src = assetPath(scene.background);
  $("topbar").classList.remove("hidden");
  $("hud-location").textContent = `第 ${state.stopCount} 站・${scene.title}｜${scene.location}`;
  renderHud();
  audio.setMood(scene.bgm || "office");

  const memory = getMemoryLines(DATA.sceneChoices[sceneId], state.flags);
  playScript([...(scene.intro_script || []), ...memory], openSceneChoice);
}

function openSceneChoice() {
  state.mode = "sceneChoice";
  const opened = showSceneChoice({
    choiceData: DATA.sceneChoices[state.sceneId],
    flags: state.flags,
    onChoose: chooseSceneOption,
  });
  if (!opened) openHand();
}

function chooseSceneOption(option) {
  applyChoiceFlags(state, option);
  applyEffects(option.effects || {});
  renderHud(Object.keys(option.effects || {}));
  playScript(choiceScript(option), () => {
    if (state.emergencyPending) maybeEmergencyMission();
    else openHand();
  });
}

function openHand() {
  state.mode = "hand";
  const context = state.lastDialogue || { speaker: "提示", text: "請根據目前情境選擇一張卡。" };
  $("choice-context").innerHTML = `
    <div><span class="context-speaker">${esc(context.speaker)}</span>${esc(context.text)}</div>
    <div class="context-note">選錯不一定會輸，但會扣女主忍受條。</div>`;
  const handBox = $("hand");
  handBox.innerHTML = "";
  state.hand.forEach((cardId) => handBox.appendChild(buildCardButton(cardId, playCard)));
  $("hand-overlay").classList.remove("hidden");
}

function resolveResult(scene, cardId, card) {
  const bespoke = scene.card_results?.[cardId];
  const fallback = scene.fallback || {};
  const result = bespoke || fallback;
  return {
    script: Array.isArray(result.script) ? result.script : [
      { type: "narration", text: `Gumayuwei 使出了「${card.name}」，現場陷入一陣難以解釋的沉默。` },
    ],
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
  const bonus = tagModifiers(card, scene, heroine);
  const combined = mergeEffects(result.effects, bonus);

  state.cardUse[cardId] = (state.cardUse[cardId] || 0) + 1;
  state.lastUsedCard = cardId;
  state.pendingNext = result.next;
  state.pendingDanger = result.rescue;

  applyEffects(combined);
  renderHud(Object.keys(combined));
  showCutin(card, result.effects, bonus, () => {
    const resolvedScript = templateScript(result.script, { card_name: card.name });
    playScript(prependCardLeadIn(resolvedScript, card, "normal", "thinking"), () => afterResult(cardId));
  });
}

function afterResult(cardId) {
  const reaction = state.cardUse[cardId] === 3
    ? (DATA.repeatReactions[cardId] || DATA.repeatReactions.default)
    : null;
  if (reaction) {
    applyEffects(reaction.effects || {});
    renderHud(Object.keys(reaction.effects || {}));
    playScript([
      { type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: reaction.line },
    ], maybeEmergencyMission);
    return;
  }
  maybeEmergencyMission();
}

function maybeEmergencyMission() {
  if (state.emergencyPending) {
    playScript([
      { type: "dialogue", speaker: "guma", emotion: "shout", text: "等等！！！" },
    ], openEmergencyMission);
    return;
  }
  maybeNormalRescue();
}

function maybeNormalRescue() {
  const rescue = state.pendingDanger;
  state.pendingDanger = null;
  if (!rescue) {
    openSwap();
    return;
  }
  const candidates = state.hand.filter((id) =>
    id !== state.lastUsedCard && (getCard(id)?.tags || []).includes("補救")
  );
  if (!candidates.length) {
    openSwap();
    return;
  }

  state.mode = "rescue";
  $("rescue-prompt").textContent = rescue.prompt || "場面即將死亡，是否使用補救卡？";
  const box = $("rescue-cards");
  box.innerHTML = "";
  candidates.forEach((id) => {
    box.appendChild(buildCardButton(id, (rescueId) => {
      $("rescue-overlay").classList.add("hidden");
      const rescueCard = getCard(rescueId);
      state.cardUse[rescueId] = (state.cardUse[rescueId] || 0) + 1;
      applyEffects(rescue.effects || {});
      renderHud(Object.keys(rescue.effects || {}));
      const resolvedScript = templateScript(rescue.script, { rescue_card_name: rescueCard.name });
      playScript(prependCardLeadIn(resolvedScript, rescueCard, "rescue", "awkward"), openSwap);
    }));
  });
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

  const candidates = eligibleEmergencyCards(state.hand, getCard, state.lastUsedCard);
  const box = $("emergency-cards");
  box.innerHTML = "";
  if (!candidates.length) {
    $("emergency-prompt").textContent = "女主忍受條已歸零，但你手上沒有 SSR 以上卡可以救場。";
    $("btn-emergency-give-up").textContent = "沒有救援卡，進入壞結局";
  } else {
    $("emergency-prompt").textContent = "局勢已經失控。選擇 1 張 SSR / UR 卡，再擲骰決定命運。";
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

function emergencySceneEffects(cardId) {
  const scene = currentScene();
  const card = getCard(cardId);
  const result = resolveResult(scene, cardId, card);
  return mergeEffects(result.effects, tagModifiers(card, scene, getHeroine(scene.heroine)));
}

function rollEmergencyDice() {
  if (!state.emergencyCardId) return;
  const roll = rollDice(forcedDice);
  const face = DICE_FACES[roll];
  const card = getCard(state.emergencyCardId);
  $("btn-emergency-roll").disabled = true;
  $("btn-emergency-roll").classList.add("disabled");

  if (face.type === "fail") {
    $("emergency-roll-result").textContent = `擲出 ${roll} ${face.label}，救援失敗。`;
    $("emergency-roll-result").className = "emergency-roll-result fail";
    $("emergency-roll-result").classList.remove("hidden");
    window.setTimeout(() => emergencyFail(face.key), 600);
    return;
  }

  const effects = scaleEffects(emergencySceneEffects(card.id), face.multiplier);
  const power = rescuePower(effects);
  state.cardUse[card.id] = (state.cardUse[card.id] || 0) + 1;
  applyEffects(effects);
  renderHud(Object.keys(effects));
  $("emergency-roll-result").textContent = `擲出 ${roll} 點：${card.name} ×${face.multiplier}，救援力 ${power}。`;
  $("emergency-roll-result").className = "emergency-roll-result success";
  $("emergency-roll-result").classList.remove("hidden");
  window.setTimeout(() => emergencySuccess(card, face, power), 600);
}

function emergencySuccess(card, face, power) {
  state.tolerance = clamp(Math.max(12, power), 12, 70);
  state.emergencyPending = false;
  state.emergencyCardId = null;
  $("emergency-overlay").classList.add("hidden");
  renderHud();
  playScript([
    createCardLeadIn(card, "emergency", "shout"),
    { type: "narration", text: `緊急救援成功！${card.name} 被放大到 ×${face.multiplier}，硬是把局勢拉了回來。` },
    { type: "dialogue", speaker: "heroine", emotion: "tsukkomi", text: "你剛剛那聲『等等』很吵，但這次至少真的有救到。" },
  ], openSwap);
}

function emergencyFail(reason) {
  state.forcedEnding = findEmergencyEnding(DATA.endings, reason || "no_card") || getEnding("ending_emergency_no_card");
  state.emergencyPending = false;
  state.emergencyCardId = null;
  $("emergency-overlay").classList.add("hidden");
  showEnding();
}

function openSwap() {
  if (state.pendingNext === "ending") {
    goNext();
    return;
  }
  state.mode = "swap";
  state.pendingDiscard = null;
  $("swap-hint").textContent = "選擇 1 張想汰換的手牌，可反覆改選；確認後會翻出一張新牌。";
  $("swap-result").classList.add("hidden");
  $("btn-confirm-swap").disabled = true;
  $("btn-confirm-swap").classList.add("disabled");
  refreshSwapHand();
  $("swap-overlay").classList.remove("hidden");
}

function refreshSwapHand() {
  renderSwapHand({
    hand: state.hand,
    getCard,
    selectedId: state.pendingDiscard,
    onSelect: selectSwapCard,
  });
}

function selectSwapCard(cardId) {
  state.pendingDiscard = cardId;
  $("swap-hint").textContent = `目前選擇汰換「${getCard(cardId).name}」。可以再點其他手牌改選。`;
  $("swap-result").textContent = "按下方「確認汰換」後才會真正換牌。";
  $("swap-result").classList.remove("hidden");
  $("btn-confirm-swap").disabled = false;
  $("btn-confirm-swap").classList.remove("disabled");
  refreshSwapHand();
}

function confirmSwap() {
  if (!state.pendingDiscard) return;
  const discardedId = state.pendingDiscard;
  state.hand = state.hand.filter((id) => id !== discardedId);
  const replacementId = drawReplacementCard({
    cards: DATA.cards,
    ownedIds: getPlayablePool(),
    currentHand: state.hand,
    discardedId,
  });
  if (!store.getOwnedIds().includes(replacementId)) {
    store.setOwnedIds([...store.getOwnedIds(), replacementId]);
  }
  state.hand.push(replacementId);
  state.pendingDiscard = null;
  $("swap-hand").innerHTML = "";
  $("swap-hint").textContent = "翻面補牌中……";
  $("btn-confirm-swap").disabled = true;
  $("btn-confirm-swap").classList.add("disabled");
  renderReplacementFlip(getCard(replacementId));
  window.setTimeout(goNext, 950);
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
  const meets = (rules, values) => Object.entries(rules || {}).every(([key, rule]) => {
    const value = values[key] || 0;
    if (rule.min !== undefined && value < rule.min) return false;
    if (rule.max !== undefined && value > rule.max) return false;
    return true;
  });
  for (const ending of DATA.endings) {
    if (ending.forced_only) continue;
    if (meets(ending.conditions?.stats, state.stats) && meets(ending.conditions?.cards, state.cardUse)) return ending;
  }
  return DATA.endings.filter((ending) => !ending.forced_only).at(-1);
}

function showEnding() {
  const ending = decideEnding();
  state.mode = "ending";
  store.markPlayed();
  const isNewEnding = gacha.unlockEnding(ending.ending_id);
  const reward = isNewEnding ? 2 : 1;
  store.addTickets(reward);
  gacha.renderHomeProgress();
  audio.setMood(ENDING_BGM[ending.mood] || "chill");
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
  const toleranceChip = document.createElement("span");
  toleranceChip.className = "effect-chip down";
  toleranceChip.textContent = `忍受 ${state.tolerance}%`;
  statsBox.appendChild(toleranceChip);

  ["dialog", "topbar", "emergency-overlay", "swap-overlay", "scene-choice-overlay"].forEach((id) => $(id).classList.add("hidden"));
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

  const addChip = (key, value, bonusChip) => {
    if (!value) return;
    const chip = document.createElement("span");
    const positive = DANGER_STATS.includes(key) ? value < 0 : value > 0;
    chip.className = `effect-chip ${positive ? "up" : "down"}${bonusChip ? " bonus" : ""}`;
    chip.textContent = `${bonusChip ? "加成 " : ""}${STAT_LABELS[key]} ${value > 0 ? "+" : ""}${value}`;
    effectsBox.appendChild(chip);
  };
  Object.entries(effects || {}).forEach(([key, value]) => addChip(key, value, false));
  Object.entries(bonus || {}).forEach(([key, value]) => addChip(key, value, true));

  state.mode = "cutin";
  audio.playSting();
  $("cutin").classList.remove("hidden");
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    $("cutin").onclick = null;
    $("cutin").classList.add("hidden");
    onDismiss();
  };
  const timer = window.setTimeout(dismiss, 3500);
  $("cutin").onclick = (event) => {
    event.stopPropagation();
    clearTimeout(timer);
    dismiss();
  };
}

function openRunDraw() {
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
  loadScene(debugScene && getScene(debugScene) ? debugScene : DATA.start);
}

function hidePanels() {
  ["screen-gacha", "screen-collection", "screen-endings", "screen-ending", "screen-run-draw"].forEach((id) => $(id).classList.add("hidden"));
}

function resetRunState() {
  state.stats = freshStats();
  state.tolerance = Number.isFinite(debugTolerance) && debugTolerance >= 0
    ? clamp(debugTolerance, 0, TOLERANCE_MAX)
    : TOLERANCE_MAX;
  state.emergencyPending = state.tolerance <= 0;
  state.emergencyCardId = null;
  state.forcedEnding = null;
  state.hand = [];
  state.cardUse = {};
  state.flags = new Set();
  state.choiceHistory = [];
  state.stopCount = 0;
  state.pendingNext = null;
  state.pendingDanger = null;
  state.lastUsedCard = null;
  state.lastCardLeadIn = "";
  state.pendingDiscard = null;
  state.runDrawCardId = null;
  state.lastDialogue = null;
  renderHud();
}

function startGame() {
  resetRunState();
  hidePanels();
  $("screen-start").classList.add("hidden");
  openRunDraw();
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
    await Promise.all([loadData(), loadCardLeadIns()]);
  } catch (error) {
    const box = document.createElement("div");
    box.className = "load-error";
    box.innerHTML = "<h2>資料載入失敗</h2><p>請使用本機伺服器或 GitHub Pages 開啟。</p>";
    $("stage").appendChild(box);
    console.error(error);
    return;
  }

  store.bootstrapPlayerData();
  preloadBackgrounds();
  gacha.renderHomeProgress();
  audio.updateButton();
  audio.setMood("office");
  renderHud();
  window.addEventListener("pointerdown", () => audio.unlock(), { once: true });

  const on = (id, handler) => $(id).addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });

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
  on("btn-ending-gallery", () => {
    $("screen-ending").classList.add("hidden");
    gacha.openEndings();
  });
  on("btn-no-rescue", () => {
    $("rescue-overlay").classList.add("hidden");
    openSwap();
  });
  on("btn-no-swap", goNext);
  on("btn-confirm-swap", confirmSwap);
  on("btn-bgm", audio.toggleMute);
  on("btn-emergency-roll", rollEmergencyDice);
  on("btn-emergency-give-up", () => emergencyFail(state.emergencyCardId ? "four" : "no_card"));

  $("stage").addEventListener("click", () => {
    if (state.mode === "story") advance();
  });
  window.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && state.mode === "story") {
      event.preventDefault();
      advance();
    }
  });
}

init();
