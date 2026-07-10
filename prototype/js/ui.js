/* ============================================================
   ui.js — 共用 UI 工具
   ------------------------------------------------------------
   守則：任何「資料字串 → innerHTML」都必須經過 esc()。
   card.name / line / description 等目前來自第一方 JSON，
   但引擎不假設內容可信（未來可能接玩家自訂卡片）。
   ============================================================ */

import { STAGE_W, STAGE_H } from "./config.js";
import { getCard, assetPath } from "./data.js";

export const $ = (id) => document.getElementById(id);

// HTML 逸出：插入 innerHTML 的資料字串一律先過這裡
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 舞台縮放：把 1280x720 縮放到剛好塞進視窗（維持 16:9）
export function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  $("stage").style.transform = `translate(-50%, -50%) scale(${scale})`;
}

// 稀有度小徽章的 markup（rarity 只會是 N/R/SR/SSR/UR，仍照樣逸出）
export const rarityBadge = (card, extraClass = "") =>
  `<span class="card-rarity rarity-${esc(card.rarity)} ${extraClass}">${esc(card.rarity)}</span>`;

function pulseStage(className, duration = 320) {
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

  pulseStage("card-pick-flash", 320);

  cards.forEach((cardButton) => {
    cardButton.disabled = true;
    cardButton.classList.toggle("selected-card", cardButton === btn);
    cardButton.classList.toggle("dim-card", cardButton !== btn);
  });

  const overlay = btn.closest(".hand-overlay, .rescue-overlay, .swap-overlay");
  overlay?.classList.add("card-pick-freeze");

  window.setTimeout(() => {
    overlay?.classList.remove("card-pick-freeze");
    onClick(cardId);
  }, 260);
}

// 建立一張可點擊的卡片按鈕（手牌、補救、汰換共用）
export function buildCardButton(cardId, onClick) {
  const card = getCard(cardId);
  const btn = document.createElement("button");
  btn.className = "card";
  btn.innerHTML = `
    <div class="card-art">${rarityBadge(card)}<span class="placeholder-line">「${esc(card.line)}」</span></div>
    <div class="card-meta"><div class="card-name">${esc(card.name)}</div><div class="card-desc">${esc(card.description)}</div></div>`;
  tryLoadCardArt(btn.querySelector(".card-art"), card);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    playCardPickFeedback(btn, cardId, onClick);
  });
  return btn;
}

// 卡片圖存在就蓋掉占位文字，不存在就保留占位卡面
export function tryLoadCardArt(artBox, card) {
  if (!card.image || !artBox) return;
  const img = new Image();
  img.onload = () => { artBox.querySelector(".placeholder-line")?.remove(); artBox.appendChild(img); };
  img.src = assetPath(card.image);
}
