# 場景圖替換教學手冊

這份手冊教你怎麼把自己生成的場景圖（背景）放進遊戲，**全程不需要改程式碼**，最多只改一行 JSON。

---

## 1. 場景圖是怎麼被遊戲使用的

遊戲的每個「事件」都在 `data/events.json` 裡，其中 `background` 欄位指定這個事件用哪張背景圖：

```json
{
  "event_id": "event_001",
  "title": "茶水間巧遇",
  "location": "公司茶水間",
  "background": "assets/backgrounds/pantry.svg",   ← 就是這一行
  ...
}
```

目前的三張場景圖都放在 `assets/backgrounds/`：

| 檔案 | 場景 | 使用事件 |
|---|---|---|
| `pantry.svg` | 公司茶水間（午後） | 第 1 話 茶水間巧遇 |
| `elevator.svg` | 公司電梯口（傍晚） | 第 2 話 下班邀約 |
| `office.svg` | 辦公室（加班夜） | 第 3 話 臨時加班危機 |

---

## 2. 替換現有場景（最簡單的方式）

**情況 A：你的圖是 SVG**
直接用同檔名覆蓋，例如把你的茶水間圖存成 `pantry.svg` 蓋掉原檔，重新整理網頁就生效。JSON 完全不用改。

**情況 B：你的圖是 PNG 或 JPG（AI 生圖通常是這種）**

1. 把圖放進 `assets/backgrounds/`，例如 `pantry.png`
2. 打開 `data/events.json`，把對應事件的 `background` 改成新檔名：

```json
"background": "assets/backgrounds/pantry.png"
```

3. 重新整理網頁，完成。

---

## 3. 新增全新場景

1. 把新場景圖放進 `assets/backgrounds/`，例如 `night_market.png`（夜市）
2. 在 `data/events.json` 新增事件（或修改現有事件）時，把 `background` 指向它：

```json
{
  "event_id": "event_004",
  "title": "夜市約會",
  "location": "寧夏夜市",
  "background": "assets/backgrounds/night_market.png",
  "heroine": "heroine_001",
  "script": [ ... ],
  "choices": [ ... ]
}
```

事件會照 `events` 陣列的順序自動排進遊戲，不用另外註冊。

---

## 4. 場景圖規格與構圖建議

### 基本規格

| 項目 | 建議值 |
|---|---|
| 比例 | **16:9（一定要）**，其他比例會被裁切 |
| 尺寸 | 1920×1080 或 1600×900 |
| 格式 | PNG / JPG / SVG 都支援 |
| 檔案大小 | JPG 建議 500KB 以內（手機載入比較快） |

> 比例不是 16:9 也能用：遊戲用「填滿裁切」（`object-fit: cover`）顯示，多出來的部分會被裁掉，不會變形，但重要內容可能被切到。

### 構圖注意（很重要）

遊戲介面會固定遮住畫面的三個區域，生圖時把重要的視覺放在「安全區」：

```text
┌─────────────────────────────────────┐
│ ▓▓ 上方約 8%：HUD 數值列 ▓▓▓▓▓▓▓▓▓ │
│ ▓左側      ┌───────────┐      右側▓ │
│ ▓25%       │  安全區    │       25%▓ │
│ ▓立繪      │（畫面中上） │      立繪▓ │
│ ▓▓▓▓▓┌────┴───────────┴────┐▓▓▓▓ │
│ ▓▓▓▓▓│ 下方約 25%：對話框    │▓▓▓▓ │
│ ▓▓▓▓▓└─────────────────────┘▓▓▓▓ │
└─────────────────────────────────────┘
```

- **下方 25%**：會被對話框蓋住 → 不要把關鍵物件（桌上的食物、招牌）放在最下面
- **左右各 25%**：站著角色立繪 → 場景的「主視覺」放中間偏上最保險
- **上方 8%**：HUD 數值列 → 避免把文字類細節（時鐘、招牌字）貼著上緣

### AI 生圖 Prompt 範例

生成動漫風背景時，重點是**不要有人物**、指定 16:9、指定光線氣氛：

```text
anime background art, no people, empty scene,
taipei riverside park at sunset, city skyline, warm orange light,
visual novel background style, 16:9, high detail
```

中文描述型的生圖工具可以這樣下：

```text
動漫背景圖，無人物的空景，台北河濱公園傍晚，遠方城市天際線，
橘色夕陽光，視覺小說背景風格，16:9 橫式構圖
```

小技巧：同一個場景可以生「白天／傍晚／夜晚」三個版本（prompt 只改光線），
之後不同事件可以用同場景的不同時段，氣氛差很多。

---

## 5. 順便一提：立繪與卡圖的替換規則

| 素材 | 位置 | 替換方式 |
|---|---|---|
| 角色立繪 | `assets/characters/` | 同名覆蓋（`gumayuwei.svg`、`heroine_a.svg`）；建議直式去背 PNG，比例約 5:11 |
| 卡片圖 | `assets/cards/` | 依編號命名（`card_001.png`…），規則見該資料夾的 README |
| 場景背景 | `assets/backgrounds/` | 本手冊 |

立繪如果改用 PNG，記得把 `prototype/index.html` 裡兩個 `<img src=".../xxx.svg">` 的副檔名改掉（這是唯一需要動到 HTML 的情況）。

---

## 6. 常見問題

**Q：圖放了沒反應？**
重新整理時按 `Ctrl+Shift+R`（強制重新載入），瀏覽器可能快取了舊圖。

**Q：圖被切掉重要部分？**
確認原圖是 16:9。不是的話，先裁成 16:9 再放進來。

**Q：改了 events.json 之後遊戲整個開不起來？**
九成是 JSON 格式錯誤（少逗號、多逗號、引號沒關）。把檔案內容貼到 jsonlint.com 檢查，或注意瀏覽器按 F12 後 Console 的紅字錯誤。
