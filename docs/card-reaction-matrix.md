# 卡片反應矩陣規格

## 目標

每張卡在每個場景都必須有不同反應，並且根據不同情境得到不同分數。

遊戲不應再出現「所有未定義卡片都走同一句 fallback」的狀況。

---

## 優先序

卡片結果來源依照以下優先序：

1. `data/scenes.json` 的手寫 `card_results`
2. `data/scene_card_results_phase2.json` 的補充劇情
3. `prototype/js/data.js` 自動產生的情境反應

手寫內容永遠優先。自動產生只負責補齊缺漏。

---

## 自動補齊規則

載入資料時，`data.js` 會檢查：

```text
所有 scenes × 所有 cards
```

如果某個場景缺少某張卡的 `card_results`，就會依照下列資料自動產生：

- 卡片 `tags`
- 卡片 `effects`
- 場景 `preferred_tags`
- 場景 `danger_tags`
- 女主 `likes`
- 女主 `dislikes`
- 場景類型，例如：茶水間、電梯、便利商店、晚餐店、夜市、會議室、八卦危機、告白

---

## 分數計算方向

自動產生結果會先參考卡片基礎效果，再依情境修正。

### 加分情境

- 卡片 tags 命中場景 `preferred_tags`
- 卡片 tags 命中女主 `likes`
- 食物卡用在晚餐店 / 夜市
- 沉默卡用在告白或柔和場景
- 裝可愛 / 布偶卡用在輕鬆場景

### 扣分或風險情境

- 卡片 tags 命中場景 `danger_tags`
- 卡片 tags 命中女主 `dislikes`
- 霸總 / 挑釁卡用在邀約、便利商店、八卦危機等低壓情境
- 社死卡用在公司、會議、八卦場景

---

## 自動反應分類

系統會依卡片 tags 判定卡片人格：

```text
food    食物型
cute    裝可愛 / 布偶型
risky   霸總 / 挑釁 / 高風險型
silent  沉默 / 神秘 / 文青型
chaos   社死 / 大喊型
smart   自信 / 智力型
fool    裝傻 / 補救型
weird   其他怪卡
```

每種人格在不同場景會產生不同女主回覆。

---

## 建議後續內容製作方式

自動補齊可以保證完整性，但重要卡片仍建議手寫。

建議優先手寫：

1. UR 卡
2. SSR 卡
3. 玩家常用卡
4. 結局條件相關卡
5. 每個場景最適合與最不適合的卡

---

## 新增卡片時的規則

新增卡片至少要補：

```json
{
  "id": "card_026",
  "name": "新卡名",
  "rarity": "SR",
  "line": "台詞",
  "tags": ["搞笑", "自信"],
  "effects": {
    "favorability": 2,
    "awkwardness": 0,
    "comedy": 6,
    "sincerity": 0,
    "confidence": 4,
    "social_death": 0,
    "appetite": 0,
    "battle": 0
  }
}
```

只要 tags 與 effects 完整，系統就會自動讓新卡在所有場景都有反應。

---

## 目前狀態

v0.5.3 起，遊戲已具備全卡全場景保底矩陣。

這代表：

- 25 張卡 × 8 個場景都會有反應
- 手寫結果仍然優先
- 缺漏結果會自動補齊
- 不同場景會產生不同分數
- 新卡與新場景比較不容易破壞流程
