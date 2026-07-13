/* ============================================================
   swap.js — 手牌汰換與翻面補牌
   ------------------------------------------------------------
   v0.6.2：汰換與翻面補牌統一顯示正式卡面。
   ============================================================ */

import { $, esc, applyCardAtlas } from "./ui.js";

export function drawReplacementCard({ cards, ownedIds, currentHand, discardedId }) {
  const excluded = new Set([...currentHand, discardedId]);
  let pool = ownedIds.filter((id) => !excluded.has(id) && cards.some((card) => card.id === id));
  if (pool.length === 0) pool = cards.map((card) => card.id).filter((id) => !excluded.has(id));
  if (pool.length === 0) pool = cards.map((card) => card.id);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function buildSwapCardButton({ card, selected, onSelect }) {
  const button = document.createElement("button");
  button.className = `card formal-card-button swap-select-card${selected ? " selected-card" : ""}`;
  button.title = `${card.rarity}｜${card.name}｜${card.description}`;
  button.innerHTML = `
    <div class="formal-card-art"></div>
    <span class="card-name card-accessible-text">${esc(card.name)}</span>
    <span class="placeholder-line card-accessible-text">「${esc(card.line)}」</span>`;
  applyCardAtlas(button.querySelector(".formal-card-art"), card);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(card.id);
  });
  return button;
}

export function renderSwapHand({ hand, getCard, selectedId, onSelect }) {
  const box = $("swap-hand");
  box.innerHTML = "";
  hand.forEach((id) => {
    const card = getCard(id);
    if (card) box.appendChild(buildSwapCardButton({ card, selected: selectedId === id, onSelect }));
  });
}

export function renderReplacementFlip(card) {
  $("swap-result").innerHTML = `
    <div class="swap-flip-card">
      <div class="swap-flip-inner">
        <div class="swap-card-face swap-card-back">NEW CARD</div>
        <div class="swap-card-face swap-card-front">
          <div class="swap-replacement-art"></div>
          <span class="card-name card-accessible-text">${esc(card.name)}</span>
        </div>
      </div>
    </div>`;
  applyCardAtlas($("swap-result").querySelector(".swap-replacement-art"), card);
  $("swap-result").classList.remove("hidden");
}
