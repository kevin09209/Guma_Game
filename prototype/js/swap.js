/* ============================================================
   swap.js — 手牌汰換與翻面補牌
   ============================================================ */

import { $, esc, tryLoadCardArt } from "./ui.js";

export function drawReplacementCard({ cards, ownedIds, currentHand, discardedId }) {
  const excluded = new Set([...currentHand, discardedId]);
  let pool = ownedIds.filter((id) => !excluded.has(id) && cards.some((card) => card.id === id));
  if (pool.length === 0) pool = cards.map((card) => card.id).filter((id) => !excluded.has(id));
  if (pool.length === 0) pool = cards.map((card) => card.id);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function buildSwapCardButton({ card, selected, onSelect }) {
  const button = document.createElement("button");
  button.className = `card swap-select-card${selected ? " selected-card" : ""}`;
  button.innerHTML = `
    <div class="card-art">
      <span class="card-rarity rarity-${esc(card.rarity)}">${esc(card.rarity)}</span>
      <span class="placeholder-line">「${esc(card.line)}」</span>
    </div>
    <div class="card-meta">
      <div class="card-name">${esc(card.name)}</div>
      <div class="card-desc">${esc(card.description)}</div>
    </div>`;
  tryLoadCardArt(button.querySelector(".card-art"), card);
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
          <span class="card-rarity rarity-${esc(card.rarity)}">${esc(card.rarity)}</span>
          <div class="card-name">${esc(card.name)}</div>
          <div class="card-line">「${esc(card.line)}」</div>
        </div>
      </div>
    </div>`;
  $("swap-result").classList.remove("hidden");
}
