# 架構與開發守則（v0.6）

> 給後續開發者與 AI 協作模型。修改專案前先讀完。

## 1. 架構總覽

```text
/data        遊戲內容：卡片、場景、選擇題、女主、結局
/prototype   遊戲引擎：純 HTML/CSS/ES modules
/tests       資料驗證、平衡模擬、Playwright E2E
/docs        企劃與規格
```

### 引擎模組

```text
main.js          單局流程協調器，不放大量內容資料
js/config.js     常數與平衡參數
js/storage.js    唯一允許讀寫 localStorage 的模組
js/data.js       載入、合併與查詢 /data
js/ui.js         共用 DOM 與卡片 UI
js/gacha.js      抽卡、收藏、結局圖鑑
js/audio.js      BGM 與音效
js/tolerance.js  女主忍受條公式與顯示
js/choices.js    場景選擇、flags 與記憶條件
js/swap.js       汰換候選、翻面補牌
js/emergency.js  緊急任務、骰子與救援計算
```

## 2. 核心原則

### 內容與引擎分離

台詞、選項、分數、記憶條件與結局文案應放在 `/data`：

```text
cards.json
heroines.json
scenes.json
scene_choices.json
card_reaction_profiles.json
scene_card_results_phase2.json
scene_card_results_v055_confession.json
endings.json
emergency_endings.json
```

`main.js` 不應再次硬寫整批場景選項、結局文案或卡片特例。

### 禁止補丁疊層

- 不新增 `hotfix.js`、`fixes.js` 或全域 monkey patch
- 修正應進入對應模組
- classic script 不得覆寫 ES module 內部函式
- 新系統優先依職責建立模組，而不是持續擴大 `main.js`

### 安全規則

1. 資料字串進 `innerHTML` 必須先經過 `esc()`。
2. localStorage 只能透過 `storage.js`。
3. `/data` 載入後，流程程式不應任意修改原始內容物件。
4. 所有 overlay 必須有明確關閉路徑。
5. 平衡公式修改後必須同步測試與模擬。

## 3. v0.6 狀態機

```text
start
→ opening-draw
→ scene-intro
→ scene-memory-lines
→ scene-choice
→ player-reply
→ heroine-reply
→ hand
→ card-cutin
→ card-result
→ tolerance-check
   ├─ emergency
   │   ├─ dice 1~3 → rescue-success → swap
   │   └─ dice 4~6 / no-card → forced-ending
   ├─ normal-rescue
   └─ swap
       ├─ no-swap
       └─ select → reselect → confirm → flip
→ next-scene / ending
```

任何新 mode 都必須有離開路徑，避免 overlay 卡死。

## 4. 場景選擇與行為記憶

`data/scene_choices.json` 的選項格式：

```json
{
  "id": "hold_hands",
  "label": "是，伸手",
  "player_line": "好，那我牽著妳。",
  "heroine_emotion": "soft",
  "heroine_reply": "這次你倒是沒有搞砸。",
  "effects": { "favorability": 4, "sincerity": 2 },
  "set_flags": ["held_hands"],
  "remove_flags": [],
  "requires_flags": [],
  "blocks_flags": []
}
```

場景可加入記憶台詞：

```json
{
  "requires_flags": ["held_hands"],
  "speaker": "heroine",
  "emotion": "soft",
  "text": "你剛剛都敢牽手了，現在反而不敢開口？"
}
```

flags 目前只存在單局內：

```text
state.flags
state.choiceHistory
```

## 5. 卡片反應矩陣

優先序：

```text
scenes.json 手寫 card_results
→ scene_card_results_phase2.json
→ scene_card_results_v055_confession.json
→ card_reaction_profiles.json
→ data.js 自動補齊
```

每張卡必須有 reaction profile。新增卡片時至少要補：

```text
cards.json
card_reaction_profiles.json
```

## 6. 忍受條與緊急任務

忍受條由 `tolerance.js` 管理：

```text
初始 100
尷尬、社死、負好感、負真誠 → 扣除
好感、真誠、少量搞笑與自信 → 回復
0% → 緊急任務
```

緊急任務由 `emergency.js` 管理：

```text
SSR / UR 救援
1~3：當前場景效果 × 點數
4：Four!
5：水床沒玩到
6：完全法克
```

緊急壞結局存放在 `data/emergency_endings.json`，並加入結局圖鑑。

## 7. 汰換規則

汰換由 `swap.js` 處理：

```text
選擇卡片
→ 可反覆改選
→ 確認汰換
→ 補牌池排除目前手牌與被棄牌
→ 原地翻面顯示新牌
```

只有按下「確認汰換」後才能更動手牌。

## 8. 測試守則

```bash
node tests/validate.js
node tests/simulate.js
node tests/e2e.js
```

### validate 必須涵蓋

- 卡片、場景、女主與結局 ID
- supplemental card results
- 每張卡 reaction profile
- scene choices 必填欄位與 flags 格式
- emergency endings
- 全卡 × 全場景矩陣保底

### E2E 必須涵蓋

- 場景選項後先顯示男主，再顯示女主
- 出牌不重複觸發
- 汰換可改選、確認後才換牌
- 補牌不與目前手牌重複
- 忍受歸零先出現「等等！！！」
- 緊急骰 1～3 成功、4～6 壞結局
- 緊急壞結局加入圖鑑
- BGM 靜音切換

### 可重現測試參數

```text
?hand=card_001,card_002,...
?scene=ev_confession
?tolerance=0
?dice=4
```

## 9. 新增內容對照表

| 需求 | 修改位置 |
|---|---|
| 新卡片 | `cards.json` + `card_reaction_profiles.json` |
| 場景卡片專屬反應 | `scenes.json` 或 supplemental result |
| 場景選擇題 | `scene_choices.json` |
| 行為記憶 | 選項 `set_flags` + 場景 `memory_lines` |
| 一般結局 | `endings.json` |
| 緊急結局 | `emergency_endings.json` |
| 忍受條公式 | `tolerance.js` |
| 緊急骰規則 | `emergency.js` |
| 汰換演出 | `swap.js` + 對應 CSS |

## 10. 目前後續債務

- CSS 仍按歷史版本分檔，後續可整理成 `base/cards/story/emergency/animations`
- `simulate.js` 尚未模擬場景選項、忍受條與緊急任務；目前只負責一般結局可達性
- 立繪與卡圖仍多為暫代素材
- 迷因碎片目前缺少消耗用途
- flags 目前只保存單局，尚未支援中途存檔
