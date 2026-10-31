# 已建立的排程任務

2026-10-30 由 claude.ai 依 `docs/specs/phase-A.md` 第 7 節建立。2026-10-31 先改成 `platform`（任務重建），同一天再改成 `calendar`（用 update_trigger 換提示詞）。

| 名稱 | ID | 時間（台北） |
|---|---|---|
| 家琳提醒・早上 | `trig_014BPbk8eY8KqhG3CjrNkEJ8` | 每天 07:23 |
| 家琳提醒・晚上 | `trig_01UfU7TbMFWLbey57UPZLpyG` | 每天 22:21 |
| 家琳週報 | `trig_01LaeGtz1Ujrxyg32QSef6NK` | 週日 20:14 |

- 通知管道：`calendar`。有缺才在 Google 日曆 primary 建活動：送出前那次取的時間捨去秒數加 5 分鐘開始、長 5 分鐘、開始時 popup 提醒、標成有空、不寄通知信，說明欄放頁面網址。
- 日曆連接器登入的是家琳的帳號（chialin0721@gmail.com，primary 的擁有者），所以提醒會出現在家琳的手機。她的日曆預設提醒是 30 分鐘前；活動用自己的提醒，不用預設。
- 提示詞：main 上 `morning.md`、`evening.md`、`weekly.md` 分隔線以下的內容。2026-10-31 02:06–02:08 UTC 以 update_trigger 同步，對應 commit ef96ba9。
- 2026-10-31 08:52 UTC：C 版晚上提示詞已同步（飲食檢查），對應 commit f68b2c8。只更新晚上任務；早上與週報的提示詞沒有改。飲食只在 `remind.food` 是 `true` 時檢查（預設關閉）。
- 完成通知：三個任務建立時開了 push（`platform` 時期），update_trigger 不能關。實測這個通知送不到手機，所以留著也不會吵。要關的話在 app 的任務設定裡關。
- 每次執行都開新的工作階段，核准設定為自動核准。
- 已刪除的舊任務（使用者在 app 刪除）：`trig_01DHxi7ut795tPb7BetTEr7m`、`trig_011SzzP2uhnQnYLbTdYB6J9Q`、`trig_01ETPCvt3kkAseLL6QRF6qwu`（`tool` 版），`trig_01MdtFkvqKB14X3efw24nPqu`（`platform` 版早上）。claude.ai 停用或刪除任務會被權限擋下。

## 為什麼改成 `calendar`

| 時間 | 管道 | 心跳 | 手機 |
|---|---|---|---|
| 2026-10-30 23:25 | `tool`（一次性測試） | 「Mobile push requested.」 | 收到 |
| 2026-10-31 07:24 | `tool`（正式排程） | `tool_sent` | 沒收到 |
| 2026-10-31 09:29 | `platform`（一次性測試，完成通知開啟） | `platform` | 沒收到 |
| 2026-10-31 09:53 | Google 日曆活動（手動建立，開始時 popup） | — | 家琳的手機有響 |

推播工具和排程完成通知都不可靠；日曆提醒由 Google 日曆 app 送出，而且直接送到家琳本人。

## 驗證紀錄

- 2026-10-31 09:29／09:34（`platform` 一次性測試）：有缺時 `delivery: platform`；第二次 `skipped: duplicate`、`delivery: none`。邏輯正確，但手機都沒收到。
- 2026-10-31 10:12（`calendar` 一次性測試，先清掉當天的早上 `sent`）：排程工作階段能用日曆連接器建活動，不需要人工核准。心跳 `delivery: calendar`、`missing: ["早上體重"]`；家琳的日曆出現「家琳今天還沒記：早上體重」，10:17–10:22，popup 0 分鐘、有空、說明有網址，和參考實作的參數一致。
- 規格第 5 步的情境實測（無缺、暫停、關閉、時段外）還沒做：「立即執行」被權限擋下。改由實際執行，從 `system/heartbeat` 驗證。

## 改提示詞時

`ops/scheduled/*.md` 改了以後，排程任務不會自動更新。要回到 claude.ai，用 update_trigger 換掉對應任務的提示詞，並更新這份文件。完成通知的開關不能用 update_trigger 改。
