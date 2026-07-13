#!/usr/bin/env node
/* ============================================================
   validate.js — v0.6 資料完整性驗證（零依賴）
   ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const errors = [];
const warns = [];
const err = (message) => errors.push(message);
const warn = (message) => warns.push(message);

const STAT_KEYS = ["favorability", "awkwardness", "comedy", "sincerity", "confidence", "social_death", "appetite", "battle"];
const RARITIES = ["N", "R", "SR", "SSR", "UR"];
const BGM_MOODS = ["office", "chill", "festive", "romance"];
const TUTORIAL_HAND = ["card_001", "card_002", "card_003", "card_004", "card_005"];

let cardsData, heroinesData, scenesData, endingsData, phase2, confession, profilesData, choicesData, emergencyData;
try {
  cardsData = read("data/cards.json");
  heroinesData = read("data/heroines.json");
  scenesData = read("data/scenes.json");
  endingsData = read("data/endings.json");
  phase2 = read("data/scene_card_results_phase2.json");
  confession = read("data/scene_card_results_v055_confession.json");
  profilesData = read("data/card_reaction_profiles.json");
  choicesData = read("data/scene_choices.json");
  emergencyData = read("data/emergency_endings.json");
} catch (error) {
  console.error(`❌ JSON 解析失敗：${error.message}`);
  process.exit(1);
}

const cards = cardsData.cards || [];
const heroines = heroinesData.heroines || [];
const scenes = scenesData.scenes || [];
const endings = [...(emergencyData.endings || []), ...(endingsData.endings || [])];
const cardIds = new Set();
const heroineIds = new Set();
const sceneIds = new Set(scenes.map((scene) => scene.scene_id));
const endingIds = new Set();
const validNext = (value) => value === "ending" || sceneIds.has(value);

function checkEffects(effects, where) {
  if (!effects || typeof effects !== "object") return;
  for (const [key, value] of Object.entries(effects)) {
    if (!STAT_KEYS.includes(key)) err(`${where}: 未知數值鍵 ${key}`);
    if (typeof value !== "number" || !Number.isFinite(value)) err(`${where}: ${key} 必須是有限數字`);
  }
}

function checkScript(lines, where) {
  if (!Array.isArray(lines)) {
    err(`${where}: script 必須是陣列`);
    return;
  }
  lines.forEach((line, index) => {
    if (!["narration", "dialogue"].includes(line.type)) err(`${where}[${index}]: type 不合法 ${line.type}`);
    if (line.type === "dialogue" && !line.speaker) err(`${where}[${index}]: dialogue 缺 speaker`);
    if (typeof line.text !== "string" || !line.text.trim()) err(`${where}[${index}]: 缺 text`);
  });
}

function checkCardResult(result, where) {
  if (!result || typeof result !== "object") {
    err(`${where}: 結果不是物件`);
    return;
  }
  checkScript(result.script || [], `${where}/script`);
  checkEffects(result.effects || {}, `${where}/effects`);
  if (result.next !== undefined && !validNext(result.next)) err(`${where}: next 不合法 ${result.next}`);
  if (result.danger) {
    if (!result.rescue) err(`${where}: danger 缺 rescue`);
    else {
      checkScript(result.rescue.script || [], `${where}/rescue/script`);
      checkEffects(result.rescue.effects || {}, `${where}/rescue/effects`);
    }
  }
}

for (const card of cards) {
  if (!card.id) err("cards: 卡片缺 id");
  if (cardIds.has(card.id)) err(`cards: 重複 id ${card.id}`);
  cardIds.add(card.id);
  for (const key of ["name", "rarity", "line", "description", "image"]) if (!card[key]) err(`cards/${card.id}: 缺 ${key}`);
  if (!RARITIES.includes(card.rarity)) err(`cards/${card.id}: 稀有度不合法 ${card.rarity}`);
  if (!Array.isArray(card.tags) || !card.tags.length) warn(`cards/${card.id}: 沒有 tags`);
  checkEffects(card.effects || {}, `cards/${card.id}/effects`);
}
TUTORIAL_HAND.forEach((id) => { if (!cardIds.has(id)) err(`教學手牌不存在：${id}`); });

for (const heroine of heroines) {
  if (!heroine.id || !heroine.name) err("heroines: 缺 id 或 name");
  if (heroineIds.has(heroine.id)) err(`heroines: 重複 id ${heroine.id}`);
  heroineIds.add(heroine.id);
  if (!Array.isArray(heroine.likes) || !Array.isArray(heroine.dislikes)) warn(`heroines/${heroine.id}: 缺 likes/dislikes`);
}

if (!sceneIds.has(scenesData.start)) err(`scenes: start 不存在 ${scenesData.start}`);
for (const scene of scenes) {
  const where = `scenes/${scene.scene_id}`;
  if (!heroineIds.has(scene.heroine)) err(`${where}: 女主不存在 ${scene.heroine}`);
  if (!exists(scene.background)) err(`${where}: 背景不存在 ${scene.background}`);
  if (!BGM_MOODS.includes(scene.bgm || "office")) err(`${where}: bgm 不合法 ${scene.bgm}`);
  checkScript(scene.intro_script || [], `${where}/intro`);
  Object.entries(scene.card_results || {}).forEach(([cardId, result]) => {
    if (!cardIds.has(cardId)) err(`${where}: 引用不存在卡片 ${cardId}`);
    checkCardResult(result, `${where}/${cardId}`);
  });
  if (!scene.fallback || !validNext(scene.fallback.next)) err(`${where}: fallback 缺失或 next 不合法`);
}

function validateSupplement(data, name) {
  for (const [sceneId, results] of Object.entries(data.scene_card_results || {})) {
    if (!sceneIds.has(sceneId)) err(`${name}: 場景不存在 ${sceneId}`);
    for (const [cardId, result] of Object.entries(results || {})) {
      if (!cardIds.has(cardId)) err(`${name}/${sceneId}: 卡片不存在 ${cardId}`);
      checkCardResult(result, `${name}/${sceneId}/${cardId}`);
    }
  }
}
validateSupplement(phase2, "phase2");
validateSupplement(confession, "v055_confession");

const profiles = profilesData.profiles || {};
for (const cardId of cardIds) {
  const profile = profiles[cardId];
  if (!profile) err(`reaction_profiles: ${cardId} 缺專屬女主反應`);
  else {
    if (!profile.heroine_text) err(`reaction_profiles/${cardId}: 缺 heroine_text`);
    if (!profile.note) err(`reaction_profiles/${cardId}: 缺 note`);
    checkEffects(profile.score_bias || {}, `reaction_profiles/${cardId}/score_bias`);
  }
}
for (const cardId of Object.keys(profiles)) if (!cardIds.has(cardId)) err(`reaction_profiles: 多出不存在卡片 ${cardId}`);

const choices = choicesData.choices || {};
for (const scene of scenes) {
  const choice = choices[scene.scene_id];
  if (!choice) {
    warn(`scene_choices: ${scene.scene_id} 沒有選擇題`);
    continue;
  }
  if (!choice.question) err(`scene_choices/${scene.scene_id}: 缺 question`);
  if (!Array.isArray(choice.options) || choice.options.length < 2) err(`scene_choices/${scene.scene_id}: 至少需要 2 個 options`);
  const optionIds = new Set();
  for (const option of choice.options || []) {
    if (!option.id || optionIds.has(option.id)) err(`scene_choices/${scene.scene_id}: option id 缺失或重複 ${option.id}`);
    optionIds.add(option.id);
    if (!option.label || !option.player_line || !option.heroine_reply) err(`scene_choices/${scene.scene_id}/${option.id}: 缺 label/player_line/heroine_reply`);
    checkEffects(option.effects || {}, `scene_choices/${scene.scene_id}/${option.id}/effects`);
    for (const key of ["set_flags", "remove_flags", "requires_flags", "blocks_flags"]) {
      if (option[key] !== undefined && !Array.isArray(option[key])) err(`scene_choices/${scene.scene_id}/${option.id}: ${key} 必須是陣列`);
    }
  }
  for (const line of choice.memory_lines || []) {
    if (!line.text || !line.speaker) err(`scene_choices/${scene.scene_id}/memory_lines: 缺 speaker/text`);
    if (!Array.isArray(line.requires_flags || [])) err(`scene_choices/${scene.scene_id}/memory_lines: requires_flags 必須是陣列`);
  }
}
for (const sceneId of Object.keys(choices)) if (!sceneIds.has(sceneId)) err(`scene_choices: 多出不存在場景 ${sceneId}`);

for (const ending of endings) {
  if (!ending.ending_id || endingIds.has(ending.ending_id)) err(`endings: id 缺失或重複 ${ending.ending_id}`);
  endingIds.add(ending.ending_id);
  if (!["good", "normal", "bad"].includes(ending.mood)) err(`endings/${ending.ending_id}: mood 不合法`);
  checkEffects(Object.fromEntries(Object.keys(ending.conditions?.stats || {}).map((key) => [key, 0])), `endings/${ending.ending_id}/conditions`);
  for (const cardId of Object.keys(ending.conditions?.cards || {})) if (!cardIds.has(cardId)) err(`endings/${ending.ending_id}: 卡片不存在 ${cardId}`);
}
const normalEndings = endingsData.endings || [];
const fallbackEnding = normalEndings[normalEndings.length - 1];
if (!fallbackEnding || Object.keys(fallbackEnding.conditions?.stats || {}).length || Object.keys(fallbackEnding.conditions?.cards || {}).length) {
  err("endings: 主結局最後一項必須是無條件保底");
}

// 合併主場景、補充檔與反應人格後，每個場景都必須可覆蓋所有卡。
for (const scene of scenes) {
  const explicit = new Set([
    ...Object.keys(scene.card_results || {}),
    ...Object.keys(phase2.scene_card_results?.[scene.scene_id] || {}),
    ...Object.keys(confession.scene_card_results?.[scene.scene_id] || {}),
  ]);
  for (const cardId of cardIds) {
    if (!explicit.has(cardId) && !profiles[cardId]) err(`矩陣缺漏：${scene.scene_id} × ${cardId}`);
  }
}

warns.forEach((message) => console.log(`⚠️  ${message}`));
if (errors.length) {
  errors.forEach((message) => console.error(`❌ ${message}`));
  console.error(`\n驗證失敗：${errors.length} 個錯誤`);
  process.exit(1);
}
console.log(`✅ v0.6 資料驗證通過：卡片 ${cards.length}、場景 ${scenes.length}、結局 ${endings.length}、女主角 ${heroines.length}${warns.length ? `（${warns.length} 個警告）` : ""}`);
