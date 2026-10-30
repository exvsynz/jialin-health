# 家琳健康追蹤

家琳的每日紀錄（體重、體脂、服藥、運動、月經）與五大類定期檢查追蹤。以 claude.ai Artifact 執行，資料存在 Artifact 自己的資料庫，不在這個 repo 裡。

- 線上版本：https://claude.ai/artifact/LJViyfLqXv2VdD5krdJahh（私人，只有擁有者與編輯者可讀寫）
- 原始碼：`src/index.html`（單一 HTML 檔，沒有建置步驟）

## 目前功能

| 頁面 | 內容 |
|---|---|
| 今天 | 早／晚體重（刻度尺輸入，不叫鍵盤）、一鍵服藥、運動快捷鍵、月經標記、近 7 天圓點補登、60 天內到期的檢查卡 |
| 體重與體脂 | 早上 7 日平均、單日早晚點、月經色帶；30／90／365 天 |
| 運動紀錄 | 近 12 週每週分鐘數、月曆、最近紀錄 |
| 定期檢查 | 乳房、甲狀腺、肺 LDCT、生殖軸激素、腸胃鏡；依報告分類自動算下次日期 |
| 設定與備份 | 藥名劑量、運動預設時間、暫停模式、檢查固定間隔、JSON 匯出與匯入 |

## 資料模型（Artifact db）

存取規則：根路徑 `read: admin, write: admin`（只有擁有者與編輯者）。

```
days/{YYYY-MM-DD}      { date, am:{w,bf,at}, pm:{w,bf,at}, med:{taken,at,dose}, period, updatedAt }
exercise/{autoId}      { date, type:"yoga"|"pilates"|"other", label, min, note, at, createdAt, deleted }
records/{autoId}       { exam, cat, date, preset, interval, nextDue, report, place, doctor, note, labs:{}, createdAt, updatedAt }
settings/profile       { medName, medDose, medNote, yogaMin, pilatesMin, pauseFrom, pauseTo, pauseNote, lastExport }
settings/intervals     { <examId>: months }
system/heartbeat       排程任務寫入的測試／心跳紀錄
```

- 日期以台北時間計算，凌晨 4 點前算前一天。
- `days` 的寫入用 `update` 合併欄位，避免多裝置互相覆蓋。
- 運動刪除是軟刪除（`deleted: true`）。

## 發布

`src/index.html` 改好後，要由有 Artifact 工具的 Claude 工作階段發布到同一個網址（publish 時帶 `url`），才會保留資料庫與網址。宣告的 capabilities：

```json
{ "db": { "rules": [{ "path": "", "read": "admin", "write": "admin" }] }, "user": {}, "downloads": true }
```

## 路線圖

1. ~~主架構、體重體脂、服藥、運動、月經、補登、暫停、匯出匯入~~（已完成）
2. 用藥細節：服藥方式、干擾物、廠牌與片劑規格、抽血前生物素與當天是否已服藥、劑量變更後自動排 TSH 複查（預設值由使用者決定）、回診摘要頁
3. 飲食照片：上傳前壓縮、只存縮圖、Claude 估熱量以範圍呈現、不設熱量目標
4. 提醒：每天兩次排程檢查（07:2x、22:2x，台北時間），有缺才推播；每週日週報附心跳與檢查到期

設計與臨床依據見 `docs/`。
