/* ============================================================
   emergency.js — 緊急任務骰子與救援計算
   ============================================================ */

import { RARITY_ORDER } from "./config.js";

export const EMERGENCY_RARITY_MIN = RARITY_ORDER.SSR;

export const DICE_FACES = {
  1: { type: "success", key: "one", label: "1", multiplier: 1 },
  2: { type: "success", key: "two", label: "2", multiplier: 2 },
  3: { type: "success", key: "three", label: "3", multiplier: 3 },
  4: { type: "fail", key: "four", label: "Four!", endingId: "ending_emergency_four_self" },
  5: { type: "fail", key: "water", label: "水床沒玩到", endingId: "ending_emergency_waterbed" },
  6: { type: "fail", key: "law", label: "完全法克", endingId: "ending_emergency_law_fucked" },
};

export function rollDice(forcedValue = null) {
  const parsed = Number(forcedValue);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 6) return parsed;
  return Math.floor(Math.random() * 6) + 1;
}

export function scaleEffects(effects = {}, multiplier = 1) {
  const scaled = {};
  Object.entries(effects).forEach(([key, value]) => {
    scaled[key] = Math.round((Number(value) || 0) * multiplier);
  });
  return scaled;
}

export function rescuePower(effects = {}) {
  return Math.round(
    Math.max(0, effects.favorability || 0) * 4 +
    Math.max(0, effects.sincerity || 0) * 4 +
    Math.max(0, effects.confidence || 0) * 1.5 +
    Math.max(0, effects.comedy || 0) +
    Math.max(0, effects.battle || 0) * 0.5 +
    Math.max(0, effects.appetite || 0) * 0.3 -
    Math.max(0, effects.awkwardness || 0) * 4 -
    Math.max(0, effects.social_death || 0) * 6
  );
}

export function eligibleEmergencyCards(hand, getCard, lastUsedCard = null) {
  return hand.filter((id) => {
    if (id === lastUsedCard) return false;
    const card = getCard(id);
    return card && RARITY_ORDER[card.rarity] >= EMERGENCY_RARITY_MIN;
  });
}

export function findEmergencyEnding(endings, reason) {
  if (reason === "no_card") {
    return endings.find((ending) => ending.ending_id === "ending_emergency_no_card");
  }
  const face = Object.values(DICE_FACES).find((item) => item.key === reason);
  return endings.find((ending) => ending.ending_id === face?.endingId);
}
