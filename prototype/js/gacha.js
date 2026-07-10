/* ============================================================
   gacha.js — 抽卡經濟、卡片收藏、結局圖鑑
   ------------------------------------------------------------
   這個模組管「跨局持久」的收集系統；單局的手牌與數值在 main.js。
   機率與獎勵常數在 config.js，持久化在 storage.js。
   ============================================================ */

import { GACHA_RATES, SHARD_REWARD, RARITY_ORDER, STORAGE_KEYS } from "./config.js";
import * as store from "./storage.js";
import { DATA, getCard } from "./data.js";
import { $, esc, rarityBadge } from "./ui.js";

// ---------- 抽卡核心 ----------
export function pickRarity(forceMinRarity = null) {
  const rates = forceMinRarity
    ? GACHA_RATES.filter((r) => RARITY_ORDER[r.rarity] >= RARITY_ORDER[forceMinRarity])
    : GACHA_RATES;
  const total = rates.reduce((sum, r) => sum + r.rate, 0);
  let roll = Math.random() * total;
  for (const item of rates) { roll -= item.rate; if (roll <= 0) return item.rarity; }
  return rates[rates.length - 1].rarity;
}

export function pickCardByRarity(rarity) {
  const pool = DATA.cards.filter((card) => card.rarity === rarity);
  const fallback = DATA.cards.filter((card) => RARITY_ORDER[card.rarity] >= RARITY_ORDER[rarity]);
  const finalPool = pool.length ? pool : fallback.length ? fallback : DATA.cards;
  return finalPool[Math.floor(Math.random() * finalPool.length)].id;
}

// 把一張卡發給玩家：新卡進收藏、重複卡換迷因碎片
export function grantCard(cardId) {
  const owned = store.getOwnedIds();
  const card = getCard(cardId);
  const isNew = !owned.includes(cardId);
  if (isNew) {
    owned.push(cardId);
    store.setOwnedIds(owned);
  } else {
    store.addShards(SHARD_REWARD[card.rarity] || 1);
  }
  return { card, isNew, shardGain: isNew ? 0 : (SHARD_REWARD[card.rarity] || 1) };
}

export function drawOneGachaCard(forceMinRarity = null) {
  return grantCard(pickCardByRarity(pickRarity(forceMinRarity)));
}

// 首頁抽卡機（吃抽卡券）
export function drawGacha(count) {
  if (store.getTickets() < count) {
    renderGachaMessage(`抽卡券不足：需要 ${count} 張，目前只有 ${store.getTickets()} 張。請透過遊玩、汰換與達成結局慢慢累積。`, true);
    return [];
  }
  store.addTickets(-count);
  const firstTen = !store.isFirstTenDone() && count >= 10;
  const results = [];
  for (let i = 0; i < count; i += 1) {
    results.push(drawOneGachaCard(firstTen && i === count - 1 ? "SR" : null)); // 首十連保底 SR
  }
  if (firstTen) store.markFirstTenDone();
  store.addGachaCount(count);
  renderGachaResults(results, $("gacha-results"));
  renderHomeProgress();
  renderGachaSummary();
  return results;
}

// ---------- 抽卡 UI ----------
export function openGacha() { renderGachaSummary(); $("gacha-results").innerHTML = ""; $("screen-gacha").classList.remove("hidden"); }
export function closeGacha() { $("screen-gacha").classList.add("hidden"); }

export function renderGachaSummary() {
  $("gacha-summary").textContent =
    `抽卡券 ${store.getTickets()}｜收藏 ${store.getOwnedIds().length}/${DATA.cards.length}｜迷因碎片 ${store.getShards()}｜累計抽卡 ${store.getGachaCount()} 次`;
}
export function renderGachaMessage(message, warn = false) {
  $("gacha-results").innerHTML = `<p class="panel-note ${warn ? "warn" : ""}">${esc(message)}</p>`;
}
export function renderGachaResults(results, box) {
  box.innerHTML = "";
  results.forEach((result, index) => {
    const el = document.createElement("div");
    el.className = `gacha-card ${result.isNew ? "new" : ""}`;
    el.style.animationDelay = `${index * 0.035}s`;
    el.innerHTML = `
      ${rarityBadge(result.card, "rarity-label")}
      <h3>${esc(result.card.name)}</h3>
      <p>「${esc(result.card.line)}」</p>
      <p>${esc(result.card.description)}</p>
      <div class="new-label">${result.isNew ? "NEW！加入收藏" : `重複卡 → 迷因碎片 +${result.shardGain}`}</div>`;
    box.appendChild(el);
  });
}

// ---------- 卡片收藏 ----------
export function openCollection() { renderCollection(); $("screen-collection").classList.remove("hidden"); }
export function closeCollection() { $("screen-collection").classList.add("hidden"); }
export function renderCollection() {
  const owned = store.getOwnedIds();
  const percent = Math.round((owned.length / DATA.cards.length) * 100);
  $("collection-summary").textContent = `已收藏 ${owned.length}/${DATA.cards.length}｜完成度 ${percent}%｜迷因碎片 ${store.getShards()}`;
  const box = $("collection-grid");
  box.innerHTML = "";
  DATA.cards.forEach((card) => {
    const unlocked = owned.includes(card.id);
    const el = document.createElement("div");
    el.className = `collection-card ${unlocked ? "" : "locked"}`;
    el.innerHTML = unlocked
      ? `${rarityBadge(card)}<h3>${esc(card.name)}</h3><p>「${esc(card.line)}」</p><p>${esc(card.description)}</p>
         <div class="collection-tags">${(card.tags || []).slice(0, 4).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>`
      : `${rarityBadge(card)}<h3>？？？？？</h3><p>尚未抽到這張卡。</p><p>提示：${esc(card.rarity)}｜${esc((card.type || ["未知"])[0])}</p>`;
    box.appendChild(el);
  });
}

// ---------- 結局圖鑑 ----------
export function openEndings() { renderEndingGallery(); $("screen-endings").classList.remove("hidden"); }
export function closeEndings() { $("screen-endings").classList.add("hidden"); }

function endingHint(ending) {
  const conditions = ending.conditions || {};
  if (conditions.cards) return "提示：和特定卡片使用次數有關。";
  const stats = conditions.stats || {};
  if (stats.social_death) return "提示：有人在公司或公共場合社死了。";
  if (stats.appetite) return "提示：和食物、續攤、吃太多有關。";
  if (stats.sincerity) return "提示：真誠值是關鍵。";
  if (ending.mood === "good") return "提示：提高好感，並避免場面失控。";
  if (ending.mood === "bad") return "提示：錯誤的卡連續使用。";
  return "提示：嘗試不同場景和卡片組合。";
}

export function renderEndingGallery() {
  const unlocked = store.getUnlockedEndingIds();
  const total = DATA.endings.length;
  const percent = total ? Math.round((unlocked.length / total) * 100) : 0;
  $("ending-summary").textContent = `已解鎖 ${unlocked.length}/${total}｜還有 ${Math.max(0, total - unlocked.length)} 個結局等待探索｜完成度 ${percent}%`;
  $("ending-progress-bar").querySelector("span").style.width = `${percent}%`;
  const box = $("ending-gallery");
  box.innerHTML = "";
  DATA.endings.forEach((ending, index) => {
    const isUnlocked = unlocked.includes(ending.ending_id);
    const el = document.createElement("div");
    el.className = `ending-card ${isUnlocked ? "unlocked" : "locked"}`;
    el.innerHTML = isUnlocked
      ? `<span class="mood-${esc(ending.mood)}">已解鎖｜${esc(ending.mood.toUpperCase())}</span><h3>${esc(ending.title)}</h3><p>${esc(ending.text.split("\n")[0])}</p>`
      : `<span>未解鎖｜No.${String(index + 1).padStart(2, "0")}</span><h3>？？？？？</h3><p>這個結局尚未被 Gumayuwei 走到。</p><p class="hint">${esc(endingHint(ending))}</p>`;
    box.appendChild(el);
  });
}

export function unlockEnding(endingId) {
  const unlocked = store.getUnlockedEndingIds();
  const wasNew = !unlocked.includes(endingId);
  if (wasNew) { unlocked.push(endingId); store.setUnlockedEndingIds(unlocked); }
  return wasNew;
}

// ---------- 首頁進度 ----------
export function renderHomeProgress() {
  if (!DATA.cards.length) return;
  const owned = store.getOwnedIds().length;
  const endings = store.getUnlockedEndingIds().length;
  const endingTotal = DATA.endings.length;
  $("home-progress").innerHTML = `
    <span class="home-chip">卡片 <b>${owned}/${DATA.cards.length}</b></span>
    <span class="home-chip">結局 <b>${endings}/${endingTotal}</b></span>
    <span class="home-chip">未解鎖 <b>${Math.max(0, endingTotal - endings)}</b></span>
    <span class="home-chip">抽卡券 <b>${store.getTickets()}</b></span>
    <span class="home-chip">碎片 <b>${store.getShards()}</b></span>`;
}
