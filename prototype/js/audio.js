/* ============================================================
   audio.js — BGM 與音效（Web Audio 程序生成，零音檔）
   ------------------------------------------------------------
   設計決策：
   - 不用音檔：GitHub Pages 零資產、零載入時間、無版權問題，
     之後想換成真 BGM，只要改 setMood() 成播放 <audio> 即可。
   - 瀏覽器自動播放限制：AudioContext 必須在使用者手勢後建立，
     main.js 會在第一次 pointerdown 呼叫 unlock()。
   - 曲風由場景資料的 bgm 欄位決定（office/chill/festive/romance），
     內容編輯者只改 JSON 就能換配樂。
   ============================================================ */

import { isBgmMuted, setBgmMuted } from "./storage.js";

let ctx = null;          // AudioContext（手勢後才建立）
let master = null;       // 總音量
let loopTimer = null;    // 下一輪 loop 的排程
let currentMood = null;  // 正在播的曲風
let desiredMood = null;  // 想播的曲風（未解鎖/靜音時先記著）

// 每種曲風：速度、波形、8 拍旋律與低音（[拍, MIDI 音高, 長度(拍)]）
const MOODS = {
  // 公司日常：輕快帶點滑稽
  office: {
    bpm: 118, leadWave: "square", bassWave: "triangle", vol: 0.04, beats: 8,
    melody: [[0, 72, 0.45], [0.5, 76, 0.45], [1, 79, 0.45], [1.5, 76, 0.45], [2, 74, 0.45], [2.5, 77, 0.45], [3, 81, 0.45], [3.5, 77, 0.45], [4, 79, 0.9], [5, 76, 0.9], [6, 72, 0.45], [6.5, 74, 0.45], [7, 76, 0.9]],
    bassline: [[0, 48, 0.9], [1, 55, 0.9], [2, 50, 0.9], [3, 55, 0.9], [4, 52, 0.9], [5, 55, 0.9], [6, 48, 0.9], [7, 55, 0.9]],
  },
  // 傍晚放鬆：慢速五聲音階
  chill: {
    bpm: 88, leadWave: "triangle", bassWave: "sine", vol: 0.05, beats: 8,
    melody: [[0, 69, 1.8], [2, 67, 1.8], [4, 64, 1.8], [6, 62, 0.9], [7, 60, 0.9]],
    bassline: [[0, 45, 3.6], [4, 41, 3.6]],
  },
  // 夜市熱鬧：快速跳動、反拍低音
  festive: {
    bpm: 132, leadWave: "square", bassWave: "triangle", vol: 0.038, beats: 8,
    melody: [[0, 76, 0.4], [0.5, 76, 0.4], [1, 79, 0.4], [1.5, 76, 0.4], [2, 81, 0.4], [2.5, 79, 0.4], [3, 76, 0.4], [3.5, 74, 0.4], [4, 72, 0.4], [4.5, 74, 0.4], [5, 76, 0.4], [5.5, 79, 0.4], [6, 81, 0.8], [7, 84, 0.8]],
    bassline: [[0.5, 48, 0.4], [1.5, 48, 0.4], [2.5, 53, 0.4], [3.5, 53, 0.4], [4.5, 55, 0.4], [5.5, 55, 0.4], [6.5, 48, 0.4], [7.5, 48, 0.4]],
  },
  // 告白時刻：慢速柔和（Am → F → C → G）
  romance: {
    bpm: 74, leadWave: "triangle", bassWave: "sine", vol: 0.055, beats: 8,
    melody: [[0, 76, 0.95], [1, 72, 0.95], [2, 72, 0.95], [3, 69, 0.95], [4, 72, 0.95], [5, 76, 0.95], [6, 74, 1.9]],
    bassline: [[0, 45, 1.9], [2, 41, 1.9], [4, 48, 1.9], [6, 43, 1.9]],
  },
};

const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// 使用者第一次點擊時呼叫：建立 AudioContext 並補播欠著的曲子
export function unlock() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // 極舊瀏覽器：無聲降級
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  if (desiredMood && !isBgmMuted()) startLoop(desiredMood);
  updateButton();
}

function scheduleNote(wave, midi, time, duration, peak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = midiToFreq(midi);
  // 短促的音量包絡，避免爆音
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(duration, 0.08));
  osc.connect(gain);
  gain.connect(master);
  osc.start(time);
  osc.stop(time + duration + 0.1);
}

function scheduleLoop(moodName, startTime) {
  const mood = MOODS[moodName];
  const beat = 60 / mood.bpm;
  mood.melody.forEach(([b, m, d]) => scheduleNote(mood.leadWave, m, startTime + b * beat, d * beat, mood.vol));
  mood.bassline.forEach(([b, m, d]) => scheduleNote(mood.bassWave, m, startTime + b * beat, d * beat, mood.vol * 1.25));
  const loopDur = mood.beats * beat;
  // 在這一輪快結束前，排下一輪（提前 150ms 排程避免縫隙）
  loopTimer = setTimeout(() => {
    if (currentMood === moodName) scheduleLoop(moodName, startTime + loopDur);
  }, (startTime + loopDur - ctx.currentTime - 0.15) * 1000);
}

function startLoop(moodName) {
  stopLoop();
  if (!MOODS[moodName]) return;
  currentMood = moodName;
  scheduleLoop(moodName, ctx.currentTime + 0.05);
}
function stopLoop() {
  clearTimeout(loopTimer);
  loopTimer = null;
  currentMood = null;
}

// 對外 API：切換曲風（場景載入、結局畫面呼叫）
export function setMood(moodName) {
  desiredMood = moodName;
  if (!ctx || isBgmMuted()) return;
  if (currentMood === moodName) return; // 同曲不重啟
  startLoop(moodName);
}

export function stopMusic() {
  desiredMood = null;
  stopLoop();
}

// 出牌特寫的音效：短促上行三連音
export function playSting() {
  if (!ctx || isBgmMuted()) return;
  const t = ctx.currentTime;
  [72, 76, 79].forEach((midi, i) => scheduleNote("square", midi, t + i * 0.07, 0.12, 0.06));
}

// 靜音切換（狀態持久化；解除靜音時接續播放）
export function toggleMute() {
  const muted = !isBgmMuted();
  setBgmMuted(muted);
  if (muted) stopLoop();
  else if (ctx && desiredMood) startLoop(desiredMood);
  updateButton();
  return muted;
}

export function updateButton() {
  const btn = document.getElementById("btn-bgm");
  if (btn) btn.textContent = isBgmMuted() ? "🔇" : "🔊";
}
