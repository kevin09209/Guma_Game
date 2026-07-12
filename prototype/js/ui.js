/* ============================================================
   ui.js — 共用 UI 工具
   ------------------------------------------------------------
   v0.6.2：正式 25 張卡片改由單一 5×5 atlas 顯示。
   ============================================================ */

import { STAGE_W, STAGE_H } from "./config.js";
import { getCard } from "./data.js";

const CARD_ATLAS_URL = "../assets/cards/cards_atlas.webp";
const CARD_ATLAS_COLUMNS = 5;
const CARD_ATLAS_ROWS = 5;

export const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  $("stage").style.transform = `translate(-50%, -50%) scale(${scale})`;
}

export const rarityBadge = (card, extraClass = "") =>
  `<span class="card-rarity rarity-${esc(card.rarity)} ${extraClass}">${esc(card.rarity)}</span>`;

function cardAtlasIndex(card) {
  const match = String(card?.id || "").match(/(\d+)/);
  const numericId = match ? Number(match[1]) : 1;
  return Math.max(0, Math.min(24, numericId - 1));
}

export function applyCardAtlas(element, card) {
  if (!element || !card) return;
  const index = cardAtlasIndex(card);
  const column = index % CARD_ATLAS_COLUMNS;
  const row = Math.floor(index / CARD_ATLAS_COLUMNS);
  const x = CARD_ATLAS_COLUMNS > 1 ? (column / (CARD_ATLAS_COLUMNS - 1)) * 100 : 0;
  const y = CARD_ATLAS_ROWS > 1 ? (row / (CARD_ATLAS_ROWS - 1)) * 100 : 0;

  element.classList.add("card-atlas-crop");
  element.style.backgroundImage = `url("${CARD_ATLAS_URL}")`;
  element.style.backgroundSize = `${CARD_ATLAS_COLUMNS * 100}% ${CARD_ATLAS_ROWS * 100}%`;
  element.style.backgroundPosition = `${x}% ${y}%`;
  element.style.backgroundRepeat = "no-repeat";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", `${card.rarity} 卡片：${card.name}`);
}

export function createCardAtlasElement(card, className = "") {
  const element = document.createElement("div");
  element.className = `formal-card-art ${className}`.trim();
  applyCardAtlas(element, card);
  return element;
}

function pulseStage(className, duration = 220) {
  const stage = $("stage");
  if (!stage) return;
  stage.classList.remove(className);
  void stage.offsetWidth;
  stage.classList.add(className);
  window.setTimeout(() => stage.classList.remove(className), duration);
}

function playCardPickFeedback(btn, cardId, onClick) {
  const group = btn.closest(".hand") || btn.parentElement;
  const cards = group ? Array.from(group.querySelectorAll(".card")) : [btn];

  pulseStage("card-pick-flash", 220);
  cards.forEach((cardButton) => {
    cardButton.disabled = true;
    cardButton.classList.toggle("selected-card", cardButton === btn);
    cardButton.classList.toggle("dim-card", cardButton !== btn);
  });

  const overlay = btn.closest(".hand-overlay, .rescue-overlay, .swap-overlay, .emergency-overlay");
  overlay?.classList.add("card-pick-freeze");
  window.setTimeout(() => {
    overlay?.classList.remove("card-pick-freeze");
    onClick(cardId);
  }, 110);
}

export function buildCardButton(cardId, onClick) {
  const card = getCard(cardId);
  const btn = document.createElement("button");
  btn.className = "card formal-card-button";
  btn.title = `${card.rarity}｜${card.name}｜${card.description}`;
  btn.innerHTML = `
    <div class="formal-card-art"></div>
    <span class="card-name card-accessible-text">${esc(card.name)}</span>
    <span class="placeholder-line card-accessible-text">「${esc(card.line)}」</span>`;
  applyCardAtlas(btn.querySelector(".formal-card-art"), card);
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (btn.disabled) return;
    playCardPickFeedback(btn, cardId, onClick);
  });
  return btn;
}

// Cut-in 等非按鈕卡面也統一使用正式卡圖。
export function tryLoadCardArt(artBox, card) {
  if (!artBox || !card) return;
  artBox.innerHTML = "";
  applyCardAtlas(artBox, card);
}
