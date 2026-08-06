# 統一遊戲平台(名字、分數、排行榜)

這份文件說明 **ohero 各遊戲共用的玩家身分與分數層**:它現在能做什麼、
還缺什麼、以及怎麼推廣到其它遊戲。

g006-towerout 是**試作遊戲**。這裡的四個檔案設計成可以**原封不動複製**到
g003 / g004 / g005,只需要改一行遊戲代號。

---

## 1. 現在做到了什麼

| 需求 | 狀態 |
|------|------|
| 首頁看得到最近十次成績:分數、何時、何人 | ✅ 完成 |
| 自己的紀錄用特別顏色標示 | ✅ 完成(顏色 + 左側色條 + 「· 你」標籤) |
| 玩之前可以先輸入名字 | ✅ 完成(失焦或按 Enter 才存,不逐鍵存) |
| 未登入只記錄「來賓nnn」 | ✅ 完成 |
| Google 登入後跨遊戲串連分數 | ⚠️ **架構已備好,但需要後端才能啟用** |

排行榜有兩個分頁,因為「最近十次最高分」有兩種讀法,兩種都有用:

- **Best(最高分)**:歷來前十高,像大型電玩機台。
- **Recent(最近)**:最近十次,聚會時輪流玩比較好看。

---

## 2. 檔案結構

```
src/platform/
├── identity.ts   # 誰在玩:來賓 / 已登入帳號。可原封不動複製
├── scores.ts     # 分數存放介面 + localStorage 實作。可原封不動複製
├── auth.ts       # 登入。目前刻意「未設定」。可原封不動複製
└── game.ts       # 只有一行:本遊戲代號。★每個遊戲都不一樣★
src/ui/
└── leaderboard.ts # 排行榜畫面。可原封不動複製(用到 i18n 的 board* 字串)
```

**分層原則不變**:`platform/` 不碰遊戲邏輯,`game/` 也不知道 `platform/` 存在。
分數是在 `ui/gameView.ts` 一個地方送出的(`recordRun()`),遊戲結束轉場時才呼叫一次。

### 兩個關鍵設計

**(1) `ScoreStore` 每一個方法都是 async,即使本機版是同步的。**
這是整層唯一真正重要的決定。將來換成雲端後端時,**所有呼叫端一行都不用改**。
現在多寫幾個 `await`,晚點才改就要重寫每一個顯示分數的畫面。

**(2) `identity.ts` 的 localStorage key 故意不分遊戲。**
`ohero-player-id` / `-name` / `-kind` 全站共用,所以同一台裝置玩三個遊戲的來賓
是同一個「來賓042」。分數以 `id` 為準,不以名字為準——兩個人可能都叫來賓042,
一個人也可能中途改名,兩種情況都不該把紀錄合併或拆開。

---

## 3. 本機版做不到的事(說清楚,免得看起來像 bug)

`LocalScoreStore` 只知道**這台瀏覽器**玩過的紀錄。「何人」那一欄永遠都是你自己。
它是能用的、也是誠實的(畫面下方明寫「此排行榜僅來自本機」),但

- **跨裝置 / 跨玩家的排行榜需要後端。**
- **Google 登入沒有後端就沒有意義**——帳號的分數如果還是只存在這台裝置,那不過是
  比較費力的打名字方式。所以 `auth.ts` 誠實回報「尚未設定」,而不是放一顆看起來
  會動的按鈕。

---

## 4. 要接後端的話:待決定事項

**這一步需要你的 Google 帳號,我無法代為建立專案。** 建議 **Firebase**,理由:

- Google 登入本來就內建,不必另外接 OAuth。
- 純靜態網站可用(GitHub Pages 不需要改),web 設定值可以公開放進前端,
  真正的權限由 Firestore 安全規則把關。
- 免費額度對這種規模綽綽有餘。

### 接上去的順序

1. 建立 Firebase 專案,開啟 **Authentication → Google** 與 **Firestore**。
2. 取得 web 設定,填進 `src/platform/auth.ts` 的 `AUTH_CONFIG`。
3. 實作 `signInWithGoogle()`:呼叫 provider,把結果交給 `identity.ts` 的
   `signIn({ id, name })`。
4. 新增 `src/platform/cloudScores.ts` 實作 `ScoreStore`(`kind = 'cloud'`),
   在啟動時呼叫一次 `useScoreStore(new CloudScoreStore())`。
5. Firestore 安全規則:分數**只能新增、不能修改或刪除**,且 `playerId` 必須等於
   登入者的 uid。未登入的來賓分數只留在本機,不上傳。

第 4 步以外**沒有任何檔案要改**,`kind` 一變成 `'cloud'`,排行榜下方的說明文字
會自己改成「共用排行榜」。

### 已知取捨

這是**信任客戶端**的設計,和對戰模式一樣(見 CLAUDE.md)。分數是瀏覽器送上去的,
玩家有心就能偽造。休閒遊戲可以接受;若要防作弊就得把遊戲邏輯搬到伺服器,那是完全
不同的專案。

---

## 5. 推廣到其它遊戲的步驟

對 g003-snake / g004-tank / g005-pacman 各做一次:

1. 複製 `src/platform/` 四個檔案與 `src/ui/leaderboard.ts`。
2. **改 `src/platform/game.ts` 的 `GAME_SLUG`**,必須和發佈路徑一致
   (`https://herolin.github.io/ohero/games/<slug>/`)。這個字串是分數分屬哪個
   遊戲的唯一依據,打錯會讓兩個遊戲的分數混在一起。
3. 補上 i18n 字串:`playerName` / `guestNote` / `signInGoogle` / `signOut` /
   `you` / `boardTop` / `boardRecent` / `boardEmpty` / `boardLocalOnly` /
   `boardShared` / `justNow` / `minutesAgo` / `hoursAgo` / `daysAgo` /
   `yourBest` / `signInUnavailable`。三個語系(en / zh-TW / zh-CN)都要補齊。
4. 開始畫面掛上名字輸入欄、身分列與 `.board-host`,並複製對應的 CSS。
5. 遊戲結束時呼叫一次 `recordScore()`——**只在轉入結束狀態的那一次**,用一個
   `recorded` 旗標守住,否則每一幀都會存一筆。
6. 複製 `tests/platform.test.ts`,把 `GAME` 常數換成該遊戲的代號。

---

## 6. 測試

`tests/platform.test.ts`,29 個測試(全專案 197 個)。涵蓋身分持久化與改名規則、
排序、上限、跨遊戲隔離(**兩個方向都測**)、`localStorage` 塞垃圾資料的容錯、
名字當成純文字而非 HTML(共用排行榜上的名字是別人輸入的,屬於不可信輸入),
以及後端壞掉時 `recordScore()` 回傳 `null` 而不丟例外——存不了分數不該害玩家
輸掉剛剛玩完的那一局。
