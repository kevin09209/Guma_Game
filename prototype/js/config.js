/* ============================================================
   config.js — 全遊戲共用常數
   ------------------------------------------------------------
   規則：這裡只放「不會在執行期改變」的設定值。
   任何調整平衡、文案、機率，改這裡（或 /data JSON），不要散落在邏輯裡。
   ============================================================ */

// 八個數值的中文名稱（畫面顯示用）
export const STAT_LABELS = {
  favorability: "好感",
  awkwardness: "尷尬",
  comedy: "搞笑",
  sincerity: "真誠",
  confidence: "自信",
  social_death: "社死",
  appetite: "食慾",
  battle: "戰鬥",
};

// 越高越糟糕的數值（顯示成紅色）
export const DANGER_STATS = ["awkwardness", "social_death"];

// 有值才顯示的數值（避免 HUD 太擠）
export const OPTIONAL_STATS = ["appetite", "battle"];

// 情緒代號 → 泡泡符號 / 男主角狀態文字
export const EMOTION_SYMBOLS = { none: "", dots: "…", shock: "！？", tsukkomi: "💢", laugh: "哈哈", smile: "♪", soft: "❣", shout: "‼" };
export const EMOTION_TEXT = {
  none: "待機",
  dots: "無言",
  shock: "震驚",
  tsukkomi: "被吐槽中",
  laugh: "尷尬陪笑",
  smile: "裝鎮定",
  soft: "有點心動",
  shout: "崩潰大喊",
};

// 首次遊玩的固定教學手牌
export const TUTORIAL_HAND = ["card_001", "card_002", "card_003", "card_004", "card_005"];

export const HAND_SIZE = 5;   // 手牌上限
export const TYPE_SPEED = 28; // 打字機速度（毫秒/字）
export const STAGE_W = 1280;  // 舞台設計尺寸（16:9）
export const STAGE_H = 720;

// localStorage 的鍵名（只透過 storage.js 存取）
export const STORAGE_KEYS = {
  owned: "guma_owned_cards",
  shards: "guma_meme_shards",
  firstTen: "guma_first_ten_done",
  gachaCount: "guma_gacha_count",
  played: "guma_played",
  endings: "guma_unlocked_endings",
  tickets: "guma_gacha_tickets",
  bgmMuted: "guma_bgm_muted",
};

// 抽卡機率與經濟（合計 100）
export const GACHA_RATES = [
  { rarity: "N", rate: 50 },
  { rarity: "R", rate: 30 },
  { rarity: "SR", rate: 13 },
  { rarity: "SSR", rate: 5 },
  { rarity: "UR", rate: 2 },
];
export const SHARD_REWARD = { N: 1, R: 3, SR: 10, SSR: 30, UR: 80 };
export const RARITY_ORDER = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5 };

// 結局畫面 mood → BGM 曲風
export const ENDING_BGM = { good: "romance", normal: "chill", bad: "chill" };
