# Gumayuwei 搞笑戀愛模擬器

一款以搞笑戀愛為主軸的選擇型戀愛模擬器。玩家扮演 **Gumayuwei** —— 一位在台北上班、看起來厭世但意外有迷因魅力的普通男子，透過「道具卡」操控他的台詞與行動，用最荒謬的方式推進戀愛。

完整企劃書請見 [docs/GDD.md](docs/GDD.md)。  
v0.4 抽卡與圖鑑規格請見 [docs/v0.4_gacha_gallery_spec.md](docs/v0.4_gacha_gallery_spec.md)。  
**開發前必讀**：[docs/architecture-guidelines.md（架構與開發守則）](docs/architecture-guidelines.md)。

## 目前進度：v0.5（重構 × BGM 版）

- **BGM 與音效**：Web Audio 程序生成配樂（零音檔），曲風跟著場景走（公司／傍晚／夜市／告白），出牌有音效，右下角 🔊 可靜音（記憶設定）
- **引擎模組化**：main.js 拆為 6 個 ES modules（config／storage／data／ui／gacha／audio），補丁檔全數併回主檔
- **測試進 repo**：`tests/` 含資料驗證、平衡模擬、Playwright 端到端（見下方「開發與測試」）

### v0.4 功能（抽卡 × 收藏 × 結局圖鑑）

- 介面：橫式 16:9 AVG（視覺小說）介面——場景背景、角色立繪、下方對話框、打字機文字、點擊推進
- **牌庫制**：牌庫 25 張道具卡，開局發 5 張手牌
- **收藏手牌制**：手牌會從玩家已收藏卡片中抽；第一次遊玩保留教學手牌，避免新手體驗中斷
- **抽卡系統**：首頁新增抽卡入口，支援單抽與十抽；首次十抽保底 SR
- **卡片收藏**：抽到新卡會加入收藏，重複卡會轉換為迷因碎片
- **結局圖鑑**：每次抵達結局會自動登錄；首頁與圖鑑顯示已解鎖／未解鎖數量
- **場景跳轉**：出的卡決定下一個場景——用「還有嗎？」走食物路線、用「怎麼跟我鬥」走高風險路線
- **手牌汰換**：每次出牌後可淘汰 1 張手牌、從收藏中重抽 1 張
- **錯卡補救**：在危險場合出錯卡會觸發「場面即將死亡」，可用手牌中帶「補救」標籤的卡救場
- **標籤加成**：卡片標籤 × 場景屬性 × 女主喜好，同一張卡在不同場合效果不同
- **重複使用反應**：同一張卡一輪用到第 3 次，女主會有額外吐槽（也可能觸發卡片路線結局）
- 場景 8 個：茶水間 → 電梯／便利商店／晚餐店 → 夜市／八卦危機／會議室 → 告白時刻
- 數值 8 個：好感、尷尬、搞笑、真誠、自信、社死、食慾、戰鬥
- 結局 13 個：卡片路線 5＋社死線 2＋特殊好結局 3＋食物線 1＋主線 2（規劃見 [docs/endings_plan.md](docs/endings_plan.md)）
- 女主角：林知夏（理性吐槽系同事）※ 名字為暫代，改 `data/heroines.json` 一個欄位即可
- 立繪：剪影暫代圖（`assets/characters/`），同名覆蓋即可換正式立繪
- 卡片圖：放進 `assets/cards/`（命名規則見該資料夾 README），缺圖自動顯示占位卡面

## 怎麼玩

### 手機／任何裝置（GitHub Pages）

啟用 GitHub Pages 後（Settings → Pages → Source 選「GitHub Actions」），推送會自動部署，手機瀏覽器直接開：

> https://kevin09209.github.io/Guma_Game/

建議手機橫拿。支援觸控點擊推進劇情。

### 電腦本機

因為瀏覽器安全限制，請用本機伺服器開啟（不要直接雙擊 index.html）：

```bash
# 在專案根目錄執行（Python 3 內建，不用安裝任何東西）
python3 -m http.server 8000
```

然後用瀏覽器打開 <http://localhost:8000/prototype/> 即可開始遊戲。

手機跟電腦連同一個 Wi-Fi 的話，手機也可以開 `http://<電腦的區網IP>:8000/prototype/` 試玩。

### 玩法

1. 首頁可選擇開始遊戲、抽卡、查看卡片收藏或結局圖鑑
2. 點擊畫面（或按空白鍵／Enter）推進劇情，打字中點擊可直接顯示整句
3. 每個場景會彈出 5 張手牌，選一張道具卡操控 Gumayuwei 的反應
4. 出的卡會決定數值變化**和下一個場景**——每一輪的路線都不一樣
5. 出牌後可以淘汰 1 張手牌重抽；在危險場合出錯卡時，手上有「補救」卡可以救場
6. 走到告白時刻後，依數值與卡片使用紀錄判定 13 種結局之一，並自動登錄到結局圖鑑

## 專案結構

```text
/Guma_Game
  .cursorrules                  # AI 協作守則（精簡版）
  /docs
    GDD.md                      # 完整遊戲企劃書
    architecture-guidelines.md  # 架構與開發守則（開發前必讀）
    v0.4_gacha_gallery_spec.md  # v0.4 抽卡與圖鑑規格
  /data                         # 遊戲「內容」（改內容不用動程式碼）
    cards.json                  # 道具卡 25 張：台詞、稀有度、標籤、卡圖路徑、基礎效果
    heroines.json               # 女主角：性格、喜好標籤（likes/dislikes）、戀愛主題
    scenes.json                 # 場景圖：開場劇本、各卡結果與跳轉、fallback、危險節點、BGM 曲風
    endings.json                # 結局：判定條件（數值＋卡片使用次數）與結局文字
  /assets
    /backgrounds                # 場景背景圖（SVG）×8
    /characters                 # 角色立繪（目前為剪影暫代圖，同名覆蓋即可替換）
    /cards                      # 卡片圖（放圖規則見資料夾內 README）
  /prototype                    # 遊戲「引擎」（純 HTML/CSS/JS，無需安裝套件）
    index.html                  # 舞台結構（首頁/抽卡/收藏/圖鑑/對話框/手牌等圖層）
    style.css                   # 畫面樣式與演出動畫
    main.js                     # 單局流程狀態機
    /js
      config.js                 # 常數與平衡參數
      storage.js                # 玩家持久資料（唯一碰 localStorage 的模組）
      data.js                   # /data JSON 載入與查詢
      ui.js                     # 共用 UI 工具（esc、卡片按鈕、舞台縮放）
      gacha.js                  # 抽卡經濟、收藏、結局圖鑑
      audio.js                  # BGM 與音效（Web Audio 程序生成）
  /tests                        # 驗證（詳見「開發與測試」）
    validate.js                 # 資料完整性
    simulate.js                 # 結局可達性與平衡分布
    e2e.js                      # Playwright 端到端
```

## 開發與測試

```bash
node tests/validate.js   # 改任何 /data JSON 之後必跑：引用完整性、契約檢查
node tests/simulate.js   # 改平衡之後必跑：13 個結局全可達＋分布統計
node tests/e2e.js        # 改引擎/UI 之後必跑（需 npm i playwright ＋本機伺服器跑在 :8000）
```

開發守則、模組邊界、決策紀錄請見 [docs/architecture-guidelines.md](docs/architecture-guidelines.md)。

## 如何擴充內容

所有遊戲內容都在 `/data` 的 JSON 檔裡，改完重新整理網頁即可生效：

- **換場景圖**：見 [docs/scene_guide.md（場景替換教學手冊）](docs/scene_guide.md)
- **加新卡片**：在 `cards.json` 加一張卡（含 `tags` 與基礎 `effects`）。不用改場景也能用——沒寫專屬結果的場景會走 fallback；想要專屬演出再到 `scenes.json` 的 `card_results` 加
- **加新場景**：在 `scenes.json` 的 `scenes` 陣列照格式加一個場景，然後把某些卡的 `next` 指向它，就接進了場景網
- **調整結局條件**：改 `endings.json` 各結局的 `conditions`（由上而下判定，第一個符合的生效；`stats` 是數值條件、`cards` 是卡片使用次數條件）
- **換 BGM 曲風**：改 `scenes.json` 各場景的 `bgm` 欄位（office／chill／festive／romance）；新增曲風到 `prototype/js/audio.js` 的 `MOODS`
- **調整抽卡與圖鑑規格**：見 [docs/v0.4_gacha_gallery_spec.md](docs/v0.4_gacha_gallery_spec.md)
- **結局擴充規劃**：見 [docs/endings_plan.md（結局篩選與實裝規劃）](docs/endings_plan.md)
- **加新女主角**：在 `heroines.json` 加人（含 `likes`/`dislikes` 標籤），並在新場景的 `heroine` 欄位引用她的 `id`
- **開發測試小工具**：網址加 `?hand=card_001,card_003,...` 可以指定起手牌

後續擴充方向（第二位女主角、更多場景、成就、碎片兌換、更多結局、CG 收集、社死排行榜⋯⋯）請見企劃書第 17 節。
