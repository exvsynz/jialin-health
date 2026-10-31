# 已建立的排程任務

2026-10-30 由 claude.ai 依 `docs/specs/phase-A.md` 第 7 節建立。2026-10-31 改成 `platform` 通知管道，三個任務重建（舊任務已由使用者在 app 刪除）。

| 名稱 | ID | 時間（台北） |
|---|---|---|
| 家琳提醒・早上 | `trig_014BPbk8eY8KqhG3CjrNkEJ8` | 每天 07:23 |
| 家琳提醒・晚上 | `trig_01UfU7TbMFWLbey57UPZLpyG` | 每天 22:21 |
| 家琳週報 | `trig_01LaeGtz1Ujrxyg32QSef6NK` | 週日 20:14 |

- 通知管道：`platform`。三個任務的完成通知（push）都開啟，email 關閉。
- 提示詞：main 上 `morning.md`、`evening.md`、`weekly.md` 分隔線以下的內容（B 版提示詞，第一行是 `platform`）。2026-10-31 01:24 UTC 建立。
- 每次執行都開新的工作階段，核准設定為自動核准。
- 已刪除的舊任務：`trig_01DHxi7ut795tPb7BetTEr7m`（早上）、`trig_011SzzP2uhnQnYLbTdYB6J9Q`（晚上）、`trig_01ETPCvt3kkAseLL6QRF6qwu`（週報），都是 `tool` 版；還有一個只存在幾分鐘的 `platform` 早上任務 `trig_01MdtFkvqKB14X3efw24nPqu`。

## 為什麼改成 `platform`

- 2026-10-31 07:24 早上任務的心跳是 `delivery: "tool_sent"`（工具回「Mobile push requested.」），但使用者手機沒收到。2026-10-30 23:25 的測試用同樣方式有收到。工具回報已送出，不代表手機收到。
- `platform` 用排程任務的完成通知送出最終回覆，和使用者其他每天、每月的排程任務相同。
- 排程任務的完成通知不能用 update_trigger 修改，只能重建。claude.ai 停用或刪除任務會被權限擋下，要由使用者在 app 操作。

## 驗證紀錄

- 2026-10-30 23:25 一次性測試（`tool`）：
  - 排程工作階段裡有 `PushNotification`，回傳「Mobile push requested.」。
  - 使用者手機收到推播。
  - ArtifactData 寫入不需人工核准。
- 2026-10-31 07:24 早上任務（`tool`）：心跳 `tool_sent`，手機沒收到。
- `platform` 待測：有缺時應推播；全部記完時（最後回覆是「（無需提醒）」）應不推播。
- 規格第 5 步的情境實測（無缺、暫停、關閉、時段外、重複）還沒做：「立即執行」被權限擋下。改由實際執行，從 `system/heartbeat` 驗證。

## 改提示詞時

`ops/scheduled/*.md` 改了以後，排程任務不會自動更新。要回到 claude.ai，用 update_trigger 換掉對應任務的提示詞，並更新這份文件。完成通知的開關不能用 update_trigger 改。
