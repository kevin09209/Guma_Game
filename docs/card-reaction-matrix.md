# 卡片反應矩陣規格

## 目標

每張卡在每個場景都必須有不同反應，並且根據不同情境得到不同分數。

遊戲不應再出現「所有未定義卡片都走同一句 fallback」的狀況。

---

## 優先序

卡片結果來源依照以下優先序：

1. `data/scenes.json` 的手寫 `card_results`
2. `data/scene_card_results_phase2.json` 的補充劇情
3. `data/card_reaction_profiles.json` 的每卡女主反應人格
4. `prototype/js/data.js` 自動產生的情境反應

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
- 每張卡的專屬 `heroine_text`
- 每張卡的專屬 `note`
- 每張卡的專屬 `score_bias`

---

## 每卡專屬女主反應人格

`data/card_reaction_profiles.json` 負責定義每一張卡的女主回覆風格。

格式：

```json
{
  "profiles": {
    "card_001": {
      "emotion": "tsukkomi",
      "heroine_text": "你又進入問號模式了。在{place}用這招，我會把它解讀成……",
      "note": "她一邊吐槽，一邊真的把情況重新講了一次。",
      "score_bias": { "comedy": 1, "awkwardness": -1 }
    }
  }
}
```

支援變數：

```text
{card_id}
{card_name}
{card_line}
{scene_title}
{place}
{prompt}
{heroine_name}
```

---

## 分數計算方向

自動產生結果會先參考卡片基礎效果，再依情境修正。

### 加分情境

- 卡片 tags 命中場景 `preferred_tags`
- 卡片 tags 命中女主 `likes`
- 食物卡用在晚餐店 / 夜市
- 沉默卡用在告白或柔和場景
- 裝可愛 / 布偶卡用在輕鬆場景
- 每卡專屬 `score_bias` 加分項

### 扣分或風險情境

- 卡片 tags 命中場景 `danger_tags`
- 卡片 tags 命中女主 `dislikes`
- 霸總 / 挑釁卡用在邀約、便利商店、八卦危機等低壓情境
- 社死卡用在公司、會議、八卦場景
- 每卡專屬 `score_bias` 扣分項

---

## 自動反應分類

系統仍會依卡片 tags 判定卡片人格，用於補充分數與男主表情：

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

但女主台詞優先使用 `card_reaction_profiles.json`，所以每張卡會有自己的吐槽方向。

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

建議同時補：

```json
{
  "profiles": {
    "card_026": {
      "emotion": "smile",
      "heroine_text": "女主對這張卡的專屬吐槽。",
      "note": "旁白補充。",
      "score_bias": { "favorability": 1 }
    }
  }
}
```

只要 tags、effects 與 reaction profile 完整，系統就會自動讓新卡在所有場景都有獨立反應。

---

## 目前狀態

v0.5.4 起，遊戲已具備全卡全場景保底矩陣與每卡專屬女主反應人格。

這代表：

- 25 張卡 × 8 個場景都會有反應
- 手寫結果仍然優先
- 缺漏結果會自動補齊
- 每張卡都有不同女主回覆風格
- 不同場景會產生不同分數
- 新卡與新場景比較不容易破壞流程
