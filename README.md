# 香港 2030 考察世界 (HK2030 Exploration)

第一身三維考察網頁（Unity WebGL），介紹十五五規劃（2026–2030）。

- 網上版（GitHub Pages）：https://pakho2433.github.io/hk2030-exploration/
- 原本部署：https://hk2030-exploration.vercel.app/

## 內容

這個 repo 由 Vercel 上的已部署網站匯入（首個 commit 為原樣匯入），屬建置輸出：
`index.html`、`app.js` 等網頁外殼是原始碼，但 `unity/` 內的是 Unity 編譯結果，
Unity 專案原始檔不在此 repo。

## GitHub Pages 的調整

- 所有路徑改為相對路徑（網站位於 `/hk2030-exploration/` 子路徑）。
- GitHub Pages 不能設定 `Content-Encoding`，亦不接受超過 100 MB 的檔案：
  - `game.framework.js`、`game.wasm` 以未壓縮形式存放；
  - 場景資料 `game.data.gz` / `game.astc.data.gz` 分拆為 4 份（`.part0`–`.part3`），
    `app.js` 會逐份下載，用瀏覽器內建 `DecompressionStream` 解壓後交給 Unity。
- 「保存離線備用」（Service Worker）需要網站根目錄路徑，在 Pages 上停用（按鈕不會顯示）。
- `.nojekyll` 讓 Pages 原樣提供檔案。

## 本機預覽

```sh
cd ..   # repo 的上一層
python3 -m http.server 8090
# 開啟 http://localhost:8090/hk2030-exploration/
```

修改外殼檔案（HTML/JS/CSS/content）後，執行 `node scripts/update-manifest.mjs`
更新 `unity-manifest.json` 內的檔案雜湊。
