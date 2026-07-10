# Gumayuwei 搞笑戀愛模擬器

一款以搞笑戀愛為主軸的選擇型戀愛模擬器。玩家使用迷因道具卡操控 **Gumayuwei** 的台詞與行動，在台北公司日常中推進戀愛、製造社死，並想辦法不要讓女主的忍受條歸零。

完整企劃書請見 [docs/GDD.md](docs/GDD.md)。開發前請先閱讀 [docs/architecture-guidelines.md](docs/architecture-guidelines.md)。

## 目前進度：v0.6.0（穩定化 × 行為記憶）

- 25 張道具卡、5 張起手牌、每次出牌後可確認汰換 1 張
- 8 個場景，每個場景包含劇情、簡單選擇題與道具卡互動
- 選項會被記錄成 flags，後面的女主台詞可以引用前面行為
- 每張卡在每個場景都有女主反應與情境分數
- 女主忍受條從 100% 開始，尷尬、社死、雷點會扣除
- 忍受條歸零時，Gumayuwei 會先大喊「等等！！！」
- 緊急任務只能使用 SSR / UR 卡，骰子 1～3 救援、4～6 進壞結局
- 4 個緊急壞結局已加入結局圖鑑，目前總計 17 個結局
- Web Audio 程序生成 BGM，支援靜音與場景曲風
- 純 HTML / CSS / ES modules，無框架、無建置步驟

## 遊戲流程

```text
首頁
→ 開局抽 1 張
→ 場景 intro
→ 場景選擇題
→ Gumayuwei 回覆
→ 女主回覆
→ 選擇道具卡
→ 卡片 cut-in
→ 女主專屬反應
→ 忍受條判定
   ├─ 忍受歸零：等等！！！→ 緊急任務 → 成功／壞結局
   ├─ 危險節點：一般補救
   └─ 正常流程
→ 汰換手牌
   ├─ 反覆選擇要換的牌
   ├─ 確認汰換 → 翻面補牌
   └─ 不汰換
→ 下一場景／結局
```

## 怎麼玩

### GitHub Pages

手機或電腦開啟：

> https://kevin09209.github.io/Guma_Game/

手機建議橫向使用。

### 本機

在專案根目錄執行：

```bash
python3 -m http.server 8000
```

再開啟：

```text
http://localhost:8000/prototype/
```

## 專案結構

```text
/data
  cards.json                              卡片資料
  heroines.json                           女主資料與喜好
  scenes.json                             場景與主要卡片結果
  scene_choices.json                      場景選擇題、flags、記憶台詞
  card_reaction_profiles.json             每張卡的女主反應人格
  scene_card_results_phase2.json          補充卡片反應
  scene_card_results_v055_confession.json 告白場景精修
  endings.json                            一般結局
  emergency_endings.json                  緊急任務結局

/prototype
  index.html                              遊戲畫面結構
  main.js                                 單局流程協調器
  /js
    config.js                             常數與平衡參數
    storage.js                            localStorage
    data.js                               載入與合併內容資料
    ui.js                                 共用 UI
    gacha.js                              抽卡、收藏、結局圖鑑
    audio.js                              BGM 與音效
    tolerance.js                          忍受條系統
    choices.js                            場景選擇與 flags
    swap.js                               汰換與翻面補牌
    emergency.js                          緊急任務與骰子

/tests
  validate.js                             JSON 契約、矩陣與引用驗證
  simulate.js                             一般結局平衡模擬
  e2e.js                                  Playwright 全流程測試
```

## 開發與測試

```bash
node tests/validate.js
node tests/simulate.js
node tests/e2e.js
```

E2E 需要 Playwright，並先啟動本機伺服器：

```bash
npm i playwright
python3 -m http.server 8000
node tests/e2e.js
```

### 測試網址參數

```text
?hand=card_001,card_002,card_003,card_004,card_005
?scene=ev_confession
?tolerance=0
?dice=4
```

可組合使用，例如：

```text
/prototype/?hand=card_017,card_018,card_019,card_020,card_021&tolerance=0&dice=4
```

## 如何擴充內容

- 新增卡片：修改 `data/cards.json`，並補上 `data/card_reaction_profiles.json`
- 新增場景選擇題：修改 `data/scene_choices.json`
- 新增卡片場景專屬反應：修改 supplemental scene result 或 `scenes.json`
- 新增一般結局：修改 `data/endings.json`
- 新增緊急任務結局：修改 `data/emergency_endings.json`
- 新增女主：修改 `data/heroines.json`，再設定其 likes / dislikes 與專屬場景

所有資料修改後都應先執行：

```bash
node tests/validate.js
```
