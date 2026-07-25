# ohero — 多遊戲部署作業模式

本文件定義「一個站台、多個遊戲」的部署架構與新增遊戲的標準流程。
`ohero` 是**唯一的公開發布站**(GitHub Pages),存放 ohero 官網與所有遊戲的
**已編譯靜態檔**。各遊戲的**原始碼各自獨立 repo**,自己 build 後把成品發布到 ohero。

---

## 1. 網址架構

| 路徑 | 內容 |
|------|------|
| `https://herolin.github.io/ohero/` | **ohero 官網**(根目錄保留) |
| `https://herolin.github.io/ohero/games/` | 遊戲選單首頁 |
| `https://herolin.github.io/ohero/games/<slug>/` | 各遊戲(如 `game1-bomb`) |
| `https://herolin.github.io/ohero/games/<slug>-dev/` | 該遊戲的開發版(選用) |

`<slug>` 是每個遊戲的短代號,對應網址子路徑。

---

## 2. 核心原則

- **每個遊戲一個獨立 repo**(私有或公開皆可)——各自的相依套件、CI、版本歷史互不干擾。
- **ohero 只放「成品」**:官網 + 各遊戲編譯後的靜態檔;ohero 本身不 build 遊戲。
- 各遊戲 repo 自己 build,再把 `dist/` **發布到 `ohero/games/<slug>/`**。
- 遊戲專案的 `vite.config` `base` 必須設為相對路徑 `'./'`,才能在子路徑正常載入資源。

---

## 3. ohero repo 結構(目標)

```
ohero/
├── index.html                    # 官網(先放 placeholder)
├── games/
│   ├── index.html                # 遊戲選單(列出所有遊戲連結)
│   ├── game1-bomb/               # 編譯後靜態檔(由 game1-bomb repo 發布)
│   └── <next-game>/              # 之後每個遊戲一個資料夾
├── .github/workflows/pages.yml   # 把整站上傳到 Pages(不 build,直接發布)
├── templates/deploy-game.yml     # 新遊戲用的部署範本(複製到遊戲 repo)
└── DEPLOY.md                     # 本文件
```

> ohero 的 Pages「Source」設為 **GitHub Actions**;`pages.yml` 只負責把 repo 內的
> 靜態內容上傳發布,不編譯任何遊戲。

---

## 4. 一次性設定

1. **ohero → Settings → Pages → Source = GitHub Actions**(已完成)。
2. 建立一個 **fine-grained PAT**,權限:對 `herolin/ohero` 的 **Contents: Read and write**。
3. 把這個 PAT 存進**每個遊戲 repo**的 secret,名稱固定為 **`OHERO_DEPLOY_TOKEN`**。
   (`遊戲 repo → Settings → Secrets and variables → Actions → New repository secret`)

---

## 5. 新增一個遊戲的標準流程

1. **開新 repo**(建議 Vite + TypeScript;`vite.config` 的 `base: './'`,build 輸出到 `dist/`)。
2. 複製 `templates/deploy-game.yml` 到新 repo 的 `.github/workflows/`。
3. 修改該檔頂端的 `GAME_SLUG`(例如 `snake` → 網址 `/ohero/games/snake/`)。
4. 在該 repo 設定 `OHERO_DEPLOY_TOKEN` secret(見上)。
5. `git push` 到 `main` → 自動 build 並發布到 `ohero/games/<slug>/`。
6. 到 `ohero/games/index.html` 選單頁加一個連結(或用自動列表)。

完成後,`https://herolin.github.io/ohero/games/<slug>/` 就能玩。

---

## 6. 兩種發布機制

- **A. 自動(建議)**:遊戲 repo 的 CI 用 `OHERO_DEPLOY_TOKEN` 把 `dist/` 推進
  `ohero/games/<slug>/`。範本 `deploy-game.yml` 即此模式,含並發推送的 rebase 重試。
- **B. 手動 / 協助**:本機或工作階段內 build 後,把 `dist/` 複製進
  `ohero/games/<slug>/` 再 push。適合尚未設定 PAT 或臨時發布。

---

## 7. 目前狀態(過渡做法)

已套用 `/games/` 架構,目前的兩個遊戲對應:

| 網址 | 內容 | 來源 |
|------|------|------|
| `/ohero/` | 官網 placeholder | `ohero-site/index.html` |
| `/ohero/games/` | 遊戲選單 | `ohero-site/games-index.html` |
| `/ohero/games/g001-bomb/` | 踩地雷(單機) | ohero `stable` 分支 build |
| `/ohero/games/g002-bomb-mp/` | 踩地雷(對戰) | ohero `main` 分支 build |

**過渡說明**:目前這兩個遊戲都源自同一個 `game1-bomb` repo 的兩個分支,由 ohero 的
`pages.yml` **直接 build** 進 `site/games/<slug>/`(非第 6 節的 PAT 推送模式)。
之後**新的獨立遊戲**請走第 5 節標準流程(自有 repo + `deploy-game.yml` 推送),
兩種模式可並存:ohero 的 `pages.yml` 負責這兩個既有版本 + 官網/選單,新遊戲各自推入
`games/<slug>/`。
