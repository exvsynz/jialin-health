# 已建立的排程任務

2026-10-30 由 claude.ai 依 `docs/specs/phase-A.md` 第 7 節建立。

| 名稱 | ID | 時間（台北） | 提示詞 |
|---|---|---|---|
| 家琳提醒・早上 | `trig_01DHxi7ut795tPb7BetTEr7m` | 每天 07:23 | `morning.md` 分隔線以下 |
| 家琳提醒・晚上 | `trig_011SzzP2uhnQnYLbTdYB6J9Q` | 每天 22:21 | `evening.md` 分隔線以下 |
| 家琳週報 | `trig_01ETPCvt3kkAseLL6QRF6qwu` | 週日 20:14 | `weekly.md` 分隔線以下 |

- 通知管道：`tool`（規格第 7 節選項 A）。三個任務的完成通知都關閉。
- 每次執行都開新的工作階段，核准設定為自動核准。

## 驗證紀錄

- 2026-10-30 23:25 一次性測試：
  - 排程工作階段裡有 `PushNotification`，回傳「Mobile push requested.」。
  - 使用者手機收到推播。
  - ArtifactData 寫入不需人工核准。
- 規格第 5 步的情境實測（無缺、暫停、關閉、時段外、重複）還沒做：「立即執行」被權限擋下。改由第一週的實際執行，從 `system/heartbeat` 驗證。

## 改提示詞時

`ops/scheduled/*.md` 改了以後，排程任務不會自動更新。要回到 claude.ai，用 update_trigger 換掉對應任務的提示詞，並更新這份文件。
