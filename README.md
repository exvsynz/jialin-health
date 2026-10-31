# 家琳健康追蹤

家琳的每日紀錄（體重、體脂、服藥、運動、月經）與五大類定期檢查追蹤。以 claude.ai Artifact 執行，資料存在 Artifact 自己的資料庫，不在這個 repo 裡。

- 線上版本：https://claude.ai/artifact/LJViyfLqXv2VdD5krdJahh（私人，只有擁有者與編輯者可讀寫）
- 原始碼：`src/index.html`（單一 HTML 檔，沒有建置步驟）

## 目前功能

| 頁面 | 內容 |
|---|---|
| 今天 | 早／晚體重（刻度尺輸入，不叫鍵盤）、一鍵服藥（記完再點可補服藥方式與自行標記）、運動快捷鍵、月經標記、近 7 天圓點補登、60 天內到期的檢查卡（含劑量變更後的 TSH 複查）；排程檢查超過 26 小時沒有執行時，最下方顯示「提醒可能停了」 |
| 體重與體脂 | 早上 7 日平均、單日早晚點、月經色帶；30／90／365 天 |
| 運動紀錄 | 近 12 週每週分鐘數、月曆、最近紀錄 |
| 定期檢查 | 乳房、甲狀腺、肺 LDCT、生殖軸激素、腸胃鏡；依報告分類自動算下次日期；甲狀腺抽血可記抽血情境與「變更後複查」 |
| 用藥 | 目前劑量、近 30／90 天已記錄服藥、TSH 複查（週數由使用者設定）、劑量與製劑變更和抽血的時間軸、依據 |
| 回診摘要 | 選期間，複製文字或存成 .md／.html |
| 設定與備份 | 提醒開關與上次檢查狀態、藥名劑量（有劑量紀錄後改在用藥頁變更）、運動預設時間、暫停模式、檢查固定間隔、JSON 匯出與匯入 |

## 資料模型（Artifact db）

存取規則：根路徑 `read: admin, write: admin`（只有擁有者與編輯者）。

```
days/{YYYY-MM-DD}      { date, am:{w,bf,at}, pm:{w,bf,at}, med:{taken,at,dose,doseSrc,mode,interfere:{…}}, period, updatedAt }
exercise/{autoId}      { date, type:"yoga"|"pilates"|"other", label, min, note, at, createdAt, deleted }
records/{autoId}       { exam, cat, date, preset, interval, nextDue, report, place, doctor, note, labs:{}, drawCtx:{medBeforeDraw,biotin7d,recheckOf}, createdAt, updatedAt }
meddose/{autoId}       { kind:"dose"|"product", date, dose, tablet, brand, reason, note, recheckDue, noRecheck, createdAt, updatedAt, deleted }
settings/profile       { medName, medDose, medNote, yogaMin, pilatesMin, pauseFrom, pauseTo, pauseNote, lastExport, remind, tshRecheckWeeks, lastVisit }
settings/intervals     { <examId>: months }
system/heartbeat       { run, at, kind, date, missing, paused, ok, skipped, shouldPush, delivery, msg, recent:[…最多 21 筆], sent:{…7 天內可能已送出的通知} }
```

- 服藥成立的條件是 `med.taken === true`；只有細節、沒有 `taken` 的物件不算服藥。`interfere` 每項 `true`／`false`，不存在就是未填。`drawCtx` 的情境用 `"yes"`／`"no"`／`"unsure"`，不存在就是未填。格式與規則見 `docs/specs/phase-B.md`。
- `meddose`：劑量或製劑變更，軟刪除。沒有任何有效紀錄時，劑量依 `settings/profile.medDose` 推定。
- `remind`：`{ morning, evening, weekly, food }`。欄位不存在時，前三個視為開啟，`food` 視為關閉。頁面只寫改動的那個 key。
- `system/heartbeat`：只由排程任務寫入，頁面只讀。格式與規則見 `docs/specs/phase-A.md`；排程提示詞在 `ops/scheduled/`，開頭的「通知管道」要在建立排程任務前設定。匯出與匯入不包含它。

- 日期以台北時間計算，凌晨 4 點前算前一天。
- `days` 的寫入用 `update` 合併欄位，避免多裝置互相覆蓋。
- 運動刪除是軟刪除（`deleted: true`）。

## 發布

`src/index.html` 改好後，要由有 Artifact 工具的 Claude 工作階段發布到同一個網址（publish 時帶 `url`），才會保留資料庫與網址。宣告的 capabilities：

```json
{ "db": { "rules": [{ "path": "", "read": "admin", "write": "admin" }] }, "user": {}, "downloads": true }
```

## 本機檢查

`dev/` 只放測試用的東西，不屬於發布內容。發布的仍然只有 `src/index.html`。

- `dev/test.sh`：一次跑完全部檢查。加 `--no-shots` 可以略過截圖。
- `dev/check.sh`：抽出 `<script>` 跑 `node --check`；確認發布檔裡沒有 mock、`print`、`alert`、`confirm`；確認外部資源只來自允許的來源。
- `dev/date-test.js`：直接從 `src/index.html` 的 `date helpers` 區塊抽出函式，測試台北時區、凌晨 4 點換日、月底加月份。
- `dev/data-test.js`、`dev/render-test.js`、`dev/weight-test.js`：資料寫入情境、重繪不打斷輸入、體重面板。
- `dev/heartbeat-test.js`：從 `src/index.html` 抽出 `heartbeat helpers` 區塊，測試「上次檢查」的文字與 26 小時警示的邊界。
- `dev/remind-test.js`：設定頁提醒區塊（開關寫入、撤銷、多裝置、停用狀態、寫入失敗）、心跳即時更新、今天頁的「提醒可能停了」、版面與截圖。
- `dev/remind-ref.js`、`dev/fake-artifact-data.js`、`dev/remind-ref-test.js`：照排程提示詞的步驟，對 ArtifactData 測試替身（參數照工具 schema 檢查、版本條件、分頁、失敗注入、推播工具）實際執行的參考實作與情境測試，並和頁面的 `dueOf` 比對。
- `dev/prompt-test.js`：檢查 `ops/scheduled/*.md` 寫到規格要求的每一項，檢查名稱表和頁面一致，範例推播句和參考實作的輸出一字不差（情境在 `dev/prompt-cases.js`）。
- `dev/med-test.js`：從 `src/index.html` 抽出 `med helpers` 區塊，測試劑量、可計日、TSH 複查狀態、到期算法、回診摘要與三種輸出的跳脫。
- `dev/meal-test.js`：從 `src/index.html` 抽出 `meal helpers` 區塊，測試餐別、邏輯日加時間（`atOf`）、估算回覆的解析、目前採用的值、當日合計、試用對照；也在非台北時區再跑一次。
- `dev/meal-page-test.js`：飲食照片的頁面行為（能力檢查、拍一餐的寫入順序、縮圖預算、送出的估算、存檔失敗與「再存一次」）。照片都是測試裡用 canvas 畫的合成圖。
- `dev/meal-page2-test.js`：飲食頁與單餐畫面（每一種估算錯誤的文字與按鈕、再估一次、快取、停止、很久沒有更新、跨裝置競爭、手動值、5 次上限、截斷、刪除與撤銷、跳脫、凌晨的時間、相簿、試用對照）、版面與截圖。
- `dev/med-page-test.js`：服藥細節、用藥頁、TSH 複查與到期卡、抽血表單、回診摘要、匯出匯入、設定頁劑量、版面與截圖。
- `dev/e2e.js`：跑主要流程，並在 380／1280 寬 × 淺色／深色下截圖到 `dev/screenshots/`（不進版控），同時檢查水平捲動、觸控目標與文字對比。
- `dev/merge-test.js`：建立當天文件的租約：取得租約失敗時不會沒有租約就建立、沒有租約支援時照舊、租約快到期時不寫。
- `dev/sample-mock-test.js`：mock 的 `sample` 是否照 0.2.94 的型別定義（參數檢查、錯誤碼、快取、同意、中止）。
- `dev/mock-claude.js`：記憶體版的 `window.claude`，可切換寫入延遲、「自寫立即可見」、首筆快照延遲、監聽失敗、租約錯誤、容量已滿等情境，以及依 `docs/contract/0.2.94/sample.d.ts` 的 `sample`。只用合成資料。
- 用 `SRC=舊檔路徑 node dev/xxx-test.js` 可以對舊版本跑同一組測試，確認測試抓得到問題。

需要 Node 與 Playwright（Chromium）。

## 路線圖

1. ~~主架構、體重體脂、服藥、運動、月經、補登、暫停、匯出匯入~~（已完成）
2. 用藥細節與回診摘要：頁面已完成（`docs/specs/phase-B.md`），待 GPT 審查與發布
3. 飲食照片：上傳前壓縮、只存縮圖、Claude 估熱量以範圍呈現、不設熱量目標
4. 提醒：每天兩次排程檢查（07:2x、22:2x，台北時間），有缺才推播；每週日 20:1x 週報。頁面與提示詞已完成（`docs/specs/phase-A.md`、`ops/scheduled/`），排程任務待在 claude.ai 建立

設計與臨床依據見 `docs/`。
