# 架構與開發守則（Architecture & Coding Guidelines）

> 給後續的開發者與 AI 協作模型。改動這個專案之前，先讀完本文件。
> 精簡版守則在專案根目錄的 `.cursorrules`。

---

## 1. 架構總覽

```text
/data        遊戲「內容」：卡片、場景劇本、女主角、結局（JSON，非工程師可改）
/prototype   遊戲「引擎」：純 HTML/CSS/JS，無框架、無建置步驟
  main.js       單局流程狀態機（劇本 → 出牌 → 補救 → 汰換 → 跳轉 → 結局）
  js/config.js  常數與平衡參數（機率、獎勵、教學手牌、BGM 對應）
  js/storage.js 玩家持久資料——唯一允許碰 localStorage 的模組
  js/data.js    /data JSON 的載入與查詢——載入後視為唯讀
  js/ui.js      共用 UI 工具（esc、卡片按鈕、舞台縮放）
  js/gacha.js   抽卡經濟、卡片收藏、結局圖鑑（跨局系統）
  js/audio.js   BGM 與音效（Web Audio 程序生成，零音檔）
/assets      素材（背景 SVG、立繪、卡圖）
/tests       驗證（validate 資料、simulate 平衡、e2e 全流程）
/docs        企劃書與規格文件
```

**核心原則：內容與引擎分離。** 台詞、數值、跳轉、機率的改動只進 JSON 或
`config.js`，不進邏輯程式碼。引擎不 hardcode 任何卡片或場景的特例。

### 單局流程狀態機（`state.mode`）

```text
start → run-draw（開局抽 1 張）→ story ⇄ hand → cutin → story
      → [rescue（危險結果且手上有補救卡才出現）]
      → [swap（下一站是結局時跳過）→ run-draw（汰換抽卡）]
      → 下一個場景 story… → ending → start
```

改動流程時必須維持這張圖的完整性：每個 mode 都要有離開的路徑，
任何 overlay 的開啟都要有對應關閉，否則玩家會卡死（v0.4.1 的卡死
bug 就是 `startGame` 漏關 `screen-start` 造成的）。

---

## 2. 鐵律（違反即退回）

1. **禁止補丁疊層。** 不允許新增 `*-hotfix.js`、`*-fixes.css` 之類的覆蓋檔，
   也不允許用全域覆寫函式修 bug。修正一律改主檔，改完跑測試。
   （歷史教訓：v0.4.1 曾同時存在 hotfix JS＋兩層 CSS 補丁，規則互相重複。）
2. **資料字串進 `innerHTML` 必須經過 `ui.js` 的 `esc()`。**
   卡片名稱、台詞、描述、劇本文字都算資料字串。用 `textContent` 則不需要。
3. **localStorage 只透過 `storage.js`。** 所有讀寫都有 try/catch 降級
   （Safari 無痕模式會 throw），遊戲必須在存不了檔時照常可玩。
4. **`DATA` 載入後唯讀。** 引擎不得修改 `/data` 載進來的物件。
5. **不引入框架、打包器、建置步驟。** 這是刻意決策（見 §6）。
   ES modules 直接跑在瀏覽器上，部署即複製檔案。
6. **註解用繁體中文**，解釋「為什麼」而非「做什麼」；程式風格跟隨現有檔案。
7. **改平衡（數值/機率/結局條件）必附模擬結果**：跑 `node tests/simulate.js`，
   確認 13 個結局全部可達，且分布合理（見 §5）。

---

## 3. 如何安全地加內容

| 想加什麼 | 改哪裡 | 注意 |
|---|---|---|
| 新卡片 | `data/cards.json` | 必填 `tags` 與 8 鍵 `effects`；不加場景專屬結果也能玩（走 fallback） |
| 卡片的場景專屬演出 | `data/scenes.json` 的 `card_results` | `next` 必須指向存在的場景或 `"ending"` |
| 新場景 | `data/scenes.json` | 必填 `fallback`（含 `next`）與 `bgm`；把某些卡的 `next` 指向它才會被走到 |
| 危險節點 | 場景結果加 `danger: true` + `rescue: { prompt, script, effects }` | 補救卡＝手牌中帶「補救」標籤的卡 |
| 新結局 | `data/endings.json` | **順序即優先序**；最後一項必須是無條件保底（validate 會擋） |
| 新 BGM 曲風 | `prototype/js/audio.js` 的 `MOODS` | 場景 `bgm` 欄位引用曲風名；validate 會檢查名稱合法 |
| 平衡調整 | 卡片 `effects`、場景 tags、結局 conditions | 改完跑 simulate 看分布 |
| 換素材 | `assets/`（同名覆蓋） | 規格見 `docs/scene_guide.md` 與 `assets/cards/README.md` |

**標籤經濟公式**（引擎與 `tests/simulate.js` 各有一份，改公式要同步兩處）：

```text
卡片 tag 命中 場景 preferred_tags → 好感 +1／每個
卡片 tag 命中 場景 danger_tags    → 社死 +2、尷尬 +2／每個
卡片 tag 命中 女主 likes          → 好感 +1／每個
卡片 tag 命中 女主 dislikes       → 好感 -2、尷尬 +2／每個
```

---

## 4. 測試守則

```bash
node tests/validate.js   # 改任何 /data JSON 之後【必跑】：引用完整性、契約檢查
node tests/simulate.js   # 改平衡之後【必跑】：13 結局全可達＋分布
node tests/e2e.js        # 改引擎/UI 之後【必跑】：Playwright 全流程
```

e2e 需要 `npm i playwright` 與本機伺服器（`python3 -m http.server 8000`）。
可用環境變數 `E2E_BASE`、`E2E_CHROMIUM` 覆寫。

**測試技巧**：網址加 `?hand=card_001,card_002,...` 可固定起手牌。
注意開局抽卡會頂掉手牌第 5 格，所以測試需要的卡一律放前 4 格。

---

## 5. 平衡基準（2026-07 快照）

25 張牌庫、8 場景圖、一輪 4~5 站。simulate 的健康分布長這樣：

- 保底「被吐槽但留下印象」＋主線「從吐槽到理解」合計約 75~85%
- 卡片路線結局（同卡 3 次）各 <1%（玩家刻意才觸發，正確）
- 特殊結局（社死線、食物線、純愛線）各 0.5%~16%
- **任何結局 0% ＝資料改壞了**，simulate 會以非零狀態碼失敗

---

## 6. 決策紀錄（為什麼是現在這樣）

| 決策 | 理由 |
|---|---|
| 純 vanilla JS、無建置 | 專案由非工程背景的企劃直接改內容；`git clone` 後起個靜態伺服器就能跑；GitHub Pages 直接部署 |
| ES modules 拆檔 | 687 行單檔已到可維護性極限；模組邊界＝職責邊界（見 §1） |
| BGM 用 Web Audio 程序生成 | 零音檔資產、零版權問題、零載入時間；之後要換真音樂，只需改 `audio.js` 的 `setMood()` 為播 `<audio>`，介面不變 |
| 部署走 gh-pages 分支 | Actions 權杖無法自動開啟 Pages（configure-pages 的 enablement 需管理權限）；推 gh-pages 分支可用 |
| 首局固定教學手牌 | 隨機起手可能讓新手第一局全拿高風險卡直接翻車 |
| 結局判定「由上而下第一個命中」 | 讓內容編輯者用「順序」表達優先級，不用寫互斥條件 |
| 卡片缺圖顯示占位卡面 | 內容先行、美術後補；圖放進 `assets/cards/` 即自動生效 |

---

## 7. 已知債務與下一步

- `tests/simulate.js` 的標籤公式與 `main.js` 重複實作（改公式要同步兩處）；
  牌庫超過 40 張後建議把公式抽成共用模組再由兩邊引用
- 熟練度（卡片 Lv1~3）、女主容忍度尚未實作（規格見 `docs/GDD.md` v0.2 §12–13）
- 立繪為剪影暫代圖；卡圖 25 張皆為占位卡面
- 迷因碎片目前只進不出：規劃中的用途是兌換指定卡（見 `docs/v0.4_gacha_gallery_spec.md`）
