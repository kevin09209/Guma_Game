/* ============================================================
   storage.js — 玩家持久資料（唯一允許碰 localStorage 的模組）
   ------------------------------------------------------------
   所有讀寫都包 try/catch：Safari 無痕模式等環境的 localStorage
   會直接 throw，遊戲必須能在「存不了檔」的情況下照常進行。
   ============================================================ */

import { STORAGE_KEYS, TUTORIAL_HAND } from "./config.js";

// ---------- 底層安全存取 ----------
function rawGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function rawSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* 無痕模式等情況：靜默降級，遊戲照常 */ }
}

export function readJson(key, fallback) {
  try { return JSON.parse(rawGet(key)) ?? fallback; } catch { return fallback; }
}
export function writeJson(key, value) { rawSet(key, JSON.stringify(value)); }
export function readNumber(key, fallback = 0) {
  const value = Number(rawGet(key));
  return Number.isFinite(value) ? value : fallback;
}
export function writeNumber(key, value) { rawSet(key, String(value)); }
export function readFlag(key) { return rawGet(key) !== null; }
export function setFlag(key) { rawSet(key, "1"); }

// ---------- 玩家收藏與經濟 ----------
export const getOwnedIds = () => readJson(STORAGE_KEYS.owned, []);
export const setOwnedIds = (ids) => writeJson(STORAGE_KEYS.owned, Array.from(new Set(ids)).filter(Boolean));
export const getUnlockedEndingIds = () => readJson(STORAGE_KEYS.endings, []);
export const setUnlockedEndingIds = (ids) => writeJson(STORAGE_KEYS.endings, Array.from(new Set(ids)));
export const getShards = () => readNumber(STORAGE_KEYS.shards, 0);
export const addShards = (amount) => writeNumber(STORAGE_KEYS.shards, getShards() + amount);
export const getTickets = () => readNumber(STORAGE_KEYS.tickets, 0);
export const addTickets = (amount) => writeNumber(STORAGE_KEYS.tickets, Math.max(0, getTickets() + amount));
export const getGachaCount = () => readNumber(STORAGE_KEYS.gachaCount, 0);
export const addGachaCount = (amount) => writeNumber(STORAGE_KEYS.gachaCount, getGachaCount() + amount);

export const hasPlayed = () => readFlag(STORAGE_KEYS.played);
export const markPlayed = () => setFlag(STORAGE_KEYS.played);
export const isFirstTenDone = () => readFlag(STORAGE_KEYS.firstTen);
export const markFirstTenDone = () => setFlag(STORAGE_KEYS.firstTen);

export const isBgmMuted = () => rawGet(STORAGE_KEYS.bgmMuted) === "1";
export const setBgmMuted = (muted) => rawSet(STORAGE_KEYS.bgmMuted, muted ? "1" : "0");

// 首次啟動的初始化：保底教學手牌進收藏、票券欄位建檔
export function bootstrapPlayerData() {
  if (getOwnedIds().length === 0) setOwnedIds(TUTORIAL_HAND);
  if (rawGet(STORAGE_KEYS.tickets) === null) writeNumber(STORAGE_KEYS.tickets, 0);
}
