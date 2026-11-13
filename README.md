# 家琳健康追蹤

家琳的每日紀錄（體重、體脂、服藥、運動、月經）、六大類定期檢查追蹤，以及其他抽血的紀錄。以 claude.ai Artifact 執行，資料存在 Artifact 自己的資料庫，不在這個 repo 裡。

- 線上版本：https://claude.ai/artifact/LJViyfLqXv2VdD5krdJahh（私人，只有擁有者與編輯者可讀寫）
- 原始碼：`src/index.html`（單一 HTML 檔，沒有建置步驟）

## 目前功能

| 頁面 | 內容 |
|---|---|
| 今天 | 早／晚體重（刻度尺輸入，不叫鍵盤）、一鍵服藥（記完再點可補服藥方式與自行標記）、運動快捷鍵、月經標記、飲食列（今天幾餐、拍一餐）、近 7 天圓點補登、60 天內到期的檢查卡（含劑量變更後的 TSH 複查）；排程檢查超過 26 小時沒有執行時，最下方顯示「提醒可能停了」 |
| 體重與體脂 | 早上 7 日平均、單日早晚點、月經色帶；30／90／365 天 |
| 運動紀錄 | 近 12 週每週分鐘數、月曆、最近紀錄 |
| 飲食 | 每餐縮圖、餐別、時間、熱量範圍與當日合計；單餐可補充份量重新估算、手動改熱量、填秤重參考值；從相簿加入 |
| 定期檢查 | 乳房、甲狀腺、肺 LDCT、生殖軸激素、腸胃鏡、骨密度 DXA；依報告分類自動算下次日期（骨密度沒有固定間隔：只有 POI 確診的兩個分類帶入 12／60 個月；其他分類與未分類是「還沒有追蹤計畫」，列為待安排、不算逾期，可以再填醫師指定的間隔或日期；醫師表示不需例行追蹤時可以手選不追蹤）；間隔只收 0–120 的整數月，0 是依報告盡快處理；甲狀腺抽血可記抽血情境與「變更後複查」；新增時可「從截圖填入」（健康存摺等截圖由 Claude 抄錄，拆成多筆逐筆確認後才存，截圖不存）。檢驗數值下方可以填報告的參考值，超出時標出偏高或偏低，也可以手動標；歷史表格、歷次紀錄與卡片上的異常項目寫成「數值 ↑ H」「數值 ↓ L」「數值 *」。高低只依報告的參考值或報告上的標記，頁面不內建任何參考值。另有「其他檢驗」分類的「其他抽血」：自己加列（名稱、數值、單位、參考值、標記），同名的檢驗跨次排在同一欄，預設不排追蹤 |
| 用藥 | 目前劑量、近 30／90 天已記錄服藥、TSH 複查（週數由使用者設定）、劑量與製劑變更和抽血的時間軸、依據 |
| 回診摘要 | 選期間，複製文字或存成 .md／.html |
| 設定與備份 | 提醒開關與上次檢查狀態、藥名劑量（有劑量紀錄後改在用藥頁變更）、運動預設時間、暫停模式、檢查固定間隔（1–120 的整數月）、JSON 匯出與匯入 |

導覽：底部固定的分頁列有今天、體重、檢查、用藥、更多五個分頁，目前所在的頁會標示出來。「更多」打開面板，裡面是運動紀錄、飲食、回診摘要、設定與備份，以及「選擇日期補登」。對話框都用 `showModal()` 開在最上層，不會被分頁列蓋住。按「今天」（分頁列或頁面上方的「‹ 今天」）一次就回到今天的日期；瀏覽器的返回不重設補登的日期。換頁後焦點移到新頁的標題；hash 改變時「更多」面板會關閉，其他對話框不關。

## 資料模型（Artifact db）

存取規則：根路徑 `read: admin, write: admin`（只有擁有者與編輯者）。

```
days/{YYYY-MM-DD}      { date, am:{w,bf,at}, pm:{w,bf,at}, med:{taken,at,dose,doseSrc,mode,interfere:{…}}, period, meals:{<mealId>:{…}}, updatedAt }
exercise/{autoId}      { date, type:"yoga"|"pilates"|"other", label, min, note, at, createdAt, deleted }
records/{autoId}       { exam, cat, date, preset, interval, nextDue, report, place, doctor, note, labs:{}, labMeta:{}, shot:{at,n,promptVer,tier}, drawCtx:{medBeforeDraw,biotin7d,recheckOf}, createdAt, updatedAt }
meddose/{autoId}       { kind:"dose"|"product", date, dose, tablet, brand, reason, note, recheckDue, noRecheck, createdAt, updatedAt, deleted }
mealthumbs/{mealId}    { date, at, thumb:"data:image/jpeg;base64,…", w, h, createdAt }
settings/profile       { medName, medDose, medNote, yogaMin, pilatesMin, pauseFrom, pauseTo, pauseNote, lastExport, remind, tshRecheckWeeks, lastVisit }
settings/intervals     { <examId>: months }   months 是 1–120 的整數；其他值當作沒有設定
system/heartbeat       { run, at, kind, date, missing, paused, ok, skipped, shouldPush, delivery, msg, recent:[…最多 21 筆], sent:{…7 天內可能已送出的通知} }
```

- 服藥成立的條件是 `med.taken === true`；只有細節、沒有 `taken` 的物件不算服藥。`interfere` 每項 `true`／`false`，不存在就是未填。`drawCtx` 的情境用 `"yes"`／`"no"`／`"unsure"`，不存在就是未填。格式與規則見 `docs/specs/phase-B.md`。
- `labMeta`（選填）：`labMeta[檢驗名] = { raw, unit, ref, flag, flagSrc }`，放在 `labs` 的值旁邊；`labs` 照舊存文字（旗標拆掉，單位和表單不同時值後面加單位、不換算）。沒有 `labMeta` 的紀錄照常顯示。
  - `raw`、`unit`：截圖上的數值原文與單位，只在儲存時數值沒改過才保留（規則見 `docs/specs/phase-D.md`）。「其他抽血」的 `unit` 是那一列填的單位。
  - `ref`：報告的參考值，照填的或照截圖讀到的文字存。能解析的寫法是「50–200」「50-200」「50~200」這類範圍，和「<5」「≤5」「>40」「≥40」這類單邊；外面可以有一層括號，數字可以有千分位與負號。其他寫法（文字、後面帶單位、兩段範圍）照存，但不拿來算。
  - `flag`：`"H"`、`"L"`、`"A"`（其他異常）或 `null`。報告上印的 `"HH"`、`"LL"`、`"*"` 照原樣存，顯示時分別當成 H、L、A（`flagKind`）。
  - `flagSrc`：`"report"`（報告上標的，含從截圖讀到的）、`"ref"`（由數值與參考值算出）、`"manual"`（手動設定；這時 `flag` 是 `null` 代表使用者設成「沒有標記」，同樣不會被重算）。沒有 `flagSrc` 的舊紀錄當作 `"report"`。
  - 算法（`lab helpers` 的 `refFlag`）：數值低於下限是 L、高於上限是 H；剛好等於上下限不算異常，「<5」的 5 也不算。數值帶比較符號（`<0.01`）時，只有確定落在範圍外才標。表單在數值或參考值改動時重算，手動設定的不動；算不出來時，由參考值算出的標記清掉，報告上的標記保留。
  - 顯示（`labFlagOf`）：有存標記就照存的；沒有存標記、也不是手動設定，而數值與 `ref` 都能解析時，顯示時才算，所以這個功能之前存的紀錄也看得到。骨密度的欄位沒有參考值與標記（`noRef`）。
- `shot`（選填）：從截圖填入的紀錄才有。格式見 `docs/specs/phase-D.md`。
- `records` 的 `interval` 是 0–120 的整數月，`null` 或不存在是沒有填。每筆紀錄的追蹤計畫是四種之一，規則在 `med helpers` 的 `planOf`，回診摘要、`dev/remind-ref.js` 與排程提示詞是同一套：
  - **有到期日**：合法的 `nextDue`（`YYYY-MM-DD`）優先；否則 `date` 加 `interval`（1–120）個月；沒有填 `interval` 時加固定間隔。
  - **依報告盡快處理**：`interval` 是 `0`。列表寫「待安排」，算逾期、排最前。已存的 `interval` 是數字但不是 0–120 的整數、或算不出合法日期時也歸在這裡，不拿去算日期，也不改資料。
  - **還沒有追蹤計畫**：沒有固定間隔的檢查（骨密度）沒有 `interval`。列表同樣寫「待安排」，但不算逾期，排在有日期的項目之後；今天頁、定期檢查頁、回診摘要、晚上提醒、週報都仍然列出。
  - **不追蹤**：沒有 `interval`，而且 `preset` 是不追蹤的分類（甲狀腺超音波的 `none`、`vlowSmall`，骨密度的 `nofollow`）。不列入到期與提醒。
- 每種檢查只看最新一筆：合法 `date` 最大的那筆，同一天取 `createdAt` 最大的。`date` 不合法的紀錄不能蓋過有合法 `date` 的紀錄，只有在這種檢查沒有任何一筆合法 `date` 的紀錄時才算；`createdAt` 不是有限的數字就當成 0，再相同就取文件 id 比較大的（`latestOf`；頁面讀紀錄時一律用文件 id，資料裡的 `id` 欄位不算）。同順位的項目照 `EXAMS` 的順序排，TSH 複查排在同一天的檢查之後。
- 固定間隔：`settings/intervals` 裡這個檢查的值是 1–120 的整數就用它，否則用預設值。設定頁存檔時用同一個檢查，不合格的值顯示在欄位上、不寫入；已存的不合格值讀取時當作沒有設定，不改資料。
- `records` 的 `exam` 是檢查代號（`src/index.html` 的 `EXAMS`）。新增代號不需要遷移資料；頁面不認得的代號會略過。`bone_dxa`（骨密度 DXA，`cat: "bone"`）的 `preset` 是 `none`、`zlow`、`zok`、`poiLow`、`poiNormHT`、`tnorm`、`tlow`、`top`、`nofollow`（定義與依據見 `docs/exam-intervals.md`；分類一律手選，不從數值推；`nofollow` 是醫師表示目前不需例行追蹤，不會是預設值，也不會從截圖帶入；表單不讓它和間隔或指定日期一起存）。選單找不到已存的 `preset` 時，編輯後原樣存回；`labs` 和抽血一樣存文字，key 是 `L1–L4 BMD`、`L1–L4 T`、`L1–L4 Z`，以及 `左股骨頸`、`右股骨頸`、`左全髖`、`右全髖` 各自的 `BMD` 與 `T`（例如 `左股骨頸 BMD`）。
- `lab_other`（其他抽血，`cat: "lab"`）：沒有固定欄位，`labs` 的 key 是使用者填的檢驗名稱（照填的寫法），單位、參考值、標記在 `labMeta`。表單上的列就是這筆紀錄的全部檢驗；同一筆裡名稱不能重複。歷史表格用 `labNameKey` 比對名稱（忽略大小寫、全形半形與多餘空白），同名的排在同一欄，欄名與單位用最新一筆的寫法，單位不同的值帶著自己的單位。
  - 預設不排追蹤（`EXAMS` 的 `noPlan`）：沒有 `interval` 也沒有 `nextDue` 的紀錄不列入到期，卡片寫「未排追蹤」，也不算進「已追蹤 n/10 項」。使用者填了間隔或指定日期，頁面（定期檢查頁、今天頁的到期卡、回診摘要）就照一般規則列出。
  - **排程提醒不看 `lab_other`**：`ops/scheduled/evening.md` 與 `weekly.md` 的檢查表沒有這個代號，提示詞本來就寫「`exam` 不在下表的紀錄不看」，`dev/remind-ref.js` 也一樣，所以提示詞不用改。就算填了間隔，晚上提醒與週報也不會提到它；要讓排程提醒，得另外把它加進提示詞的檢查表。
  - 從截圖填入時，沒有對應欄位的檢驗預設照舊寫進報告內容；報告欄下方有一個開關「其他 N 項檢驗另存成一筆「其他抽血」」。打開後那幾行不進報告，存檔後多一筆「其他抽血」的草稿（日期與醫院照剛存的那筆），在表單確認後才存，讀到的 `ref` 與 `flag` 都保留（`flagSrc: "report"`）。項目待選的草稿直接選「其他抽血」也會變成列。
- `meddose`：劑量或製劑變更，軟刪除。沒有任何有效紀錄時，劑量依 `settings/profile.medDose` 推定。
- `meals`：每餐 `{ at, meal, src, thumb, thumbBytes, thumbCleared, note, attempts:{<attemptId>:{…}}, manual, ref, deleted, createdAt }`。每次估算只寫自己的 `attempts` key，手動熱量另存 `manual`，畫面取手動值，否則取最新開始的成功估算。格式與規則見 `docs/specs/phase-C.md`。
- `mealthumbs`：縮圖（長邊 320、≤32 KiB），頁面只依 id 讀，不監聽也不查詢。設定頁可以清除舊縮圖。
- `remind`：`{ morning, evening, weekly, food }`。欄位不存在時，前三個視為開啟，`food` 視為關閉。頁面只寫改動的那個 key。
- `system/heartbeat`：只由排程任務寫入，頁面只讀。格式與規則見 `docs/specs/phase-A.md`；排程提示詞在 `ops/scheduled/`，開頭的「通知管道」要在建立排程任務前設定。匯出與匯入不包含它。

- 日期以台北時間計算，凌晨 4 點前算前一天。
- `days` 的寫入用 `update` 合併欄位，避免多裝置互相覆蓋。
- 運動刪除是軟刪除（`deleted: true`）。

## 發布

`src/index.html` 改好後，要由有 Artifact 工具的 Claude 工作階段發布到同一個網址（publish 時帶 `url`），才會保留資料庫與網址。宣告的 capabilities：

```json
{ "db": { "rules": [{ "path": "", "read": "admin", "write": "admin" }] }, "user": {}, "downloads": true, "sample": { "images": true } }
```

執行環境版本（contract）：2026-11-13 發布 f6e0b09 時升級到 0.2.96。之後發布不帶 `contract` 就會維持這個版本。

## 本機檢查

`dev/` 只放測試用的東西，不屬於發布內容。發布的仍然只有 `src/index.html`。

- `dev/test.sh`：一次跑完全部檢查。加 `--no-shots` 可以略過截圖。
- `dev/check.sh`：抽出 `<script>` 跑 `node --check`；確認發布檔裡沒有 mock、`print`、`alert`、`confirm`；確認外部資源只來自允許的來源。
- `dev/date-test.js`：直接從 `src/index.html` 的 `date helpers` 區塊抽出函式，測試台北時區、凌晨 4 點換日、月底加月份。
- `dev/data-test.js`、`dev/render-test.js`、`dev/weight-test.js`：資料寫入情境、重繪不打斷輸入、體重面板。
- `dev/bf-test.js`：體重與體脂在同一個面板（兩把刻度尺各自捲動、體脂未記／已記與「不記」、儲存鈕、鍵盤兩欄）、一位小數、體脂圖、最近紀錄三欄，以及 380×820、380×667 深淺色的版面與截圖。
- `dev/heartbeat-test.js`：從 `src/index.html` 抽出 `heartbeat helpers` 區塊，測試「上次檢查」的文字與 26 小時警示的邊界。
- `dev/remind-test.js`：設定頁提醒區塊（開關寫入、撤銷、多裝置、停用狀態、寫入失敗）、心跳即時更新、今天頁的「提醒可能停了」、版面與截圖。
- `dev/remind-ref.js`、`dev/fake-artifact-data.js`、`dev/remind-ref-test.js`：照排程提示詞的步驟，對 ArtifactData 測試替身（參數照工具 schema 檢查、版本條件、分頁、失敗注入、推播工具）實際執行的參考實作與情境測試（含晚上與週報的兩種待安排、不追蹤、不合格的固定間隔），並和頁面的 `planOf` 逐筆比對。
- `dev/prompt-test.js`：檢查 `ops/scheduled/*.md` 寫到規格要求的每一項，檢查名稱表和頁面一致，範例推播句和參考實作的輸出一字不差（情境在 `dev/prompt-cases.js`）。
- `dev/med-test.js`：從 `src/index.html` 抽出 `med helpers` 區塊，測試劑量、可計日、TSH 複查狀態、到期算法（`planOf` 的四種結果：盡快處理、有到期日、還沒有追蹤計畫、不追蹤；無效的間隔、不合格的固定間隔、不合法的檢查日期）、間隔欄位的解析、回診摘要與三種輸出的跳脫。`planOf` 的測試用的是從 `src/index.html` 取出的 `EXAMS` 與 `EXINFO`，不另外抄一份檢查表。
- `dev/meal-test.js`：從 `src/index.html` 抽出 `meal helpers` 區塊，測試餐別、邏輯日加時間（`atOf`）、估算回覆的解析、目前採用的值、當日合計、試用對照；也在非台北時區再跑一次。
- `dev/meal-page-test.js`：飲食照片的頁面行為（能力檢查、拍一餐的寫入順序、縮圖預算、送出的估算、存檔失敗與「再存一次」）。照片都是測試裡用 canvas 畫的合成圖。
- `dev/meal-page2-test.js`：飲食頁與單餐畫面（每一種估算錯誤的文字與按鈕、再估一次、快取、停止、很久沒有更新、跨裝置競爭、手動值、5 次上限、截斷、刪除與撤銷、跳脫、凌晨的時間、相簿、試用對照）、版面與截圖。
- `dev/shot-test.js`：從 `src/index.html` 抽出 `shot helpers` 區塊，測試截圖讀取的規則（民國／西元日期、數值與旗標、單位寫法、檢驗名稱對應、報告分類對應、分組、去個資、解析、重複）；也在非台北時區再跑一次。
- `dev/lab-test.js`：從 `src/index.html` 抽出 `shot helpers` 與 `lab helpers` 區塊，測試參考值的各種寫法、邊界值（剛好等於上下限不算異常）、帶比較符號的數值、標記的種類與寫法、存的標記與由參考值算出的標記哪個優先、卡片摘要最多 3 項加「另 N 項」、名稱比對，以及截圖裡沒有對應欄位的檢驗保留 `ref` 與 `flag`。
- `dev/lab-page-test.js`：檢驗值高低與「其他抽血」的頁面行為。表單的參考值與標記（自動計算、點一下切換、手動的不被蓋掉、骨密度沒有這一行）；歷史表格、歷次紀錄與卡片的顯示、aria-label、`--lab-ab` 與 `--c-lab` 在兩種主題的定義；沒有 `labMeta` 或沒有 `flagSrc` 的舊紀錄；「其他抽血」的新增、驗證、刪除與撤銷、編輯、同名檢驗同一欄、不列入到期（填了間隔才列）、排程的參考實作不看它；從截圖另存成「其他抽血」；380 寬深淺色的版面與截圖。
- `dev/shot-page-test.js`：從截圖填入檢查紀錄的頁面行為（能力檢查、送出的圖片、張數上限、停止、讀取中關掉面板、每個截圖情境、分類確認、重複提示、略過與丟棄、存檔失敗、編輯時 `labMeta` 的保留、每一種錯誤碼）、版面與截圖。截圖是 canvas 畫的合成圖。
- `dev/review-d-test.js`：D 階段程式審查 D-01–D-13 的重現（草稿的生命週期與存檔、修正保留、分類與去重規則、去個資、重讀），加上匯出匯入往返與點擊命中。
- `dev/review-d2-test.js`：D 階段複核 R1–R7、C1、C2 的回歸測試（複製自 GPT 的 `docs/reviews/2026-11-02-phase-D-code-fix-recheck.test.js`，檔頭註明改了哪三處）。
- `dev/bone-test.js`：骨密度 DXA、檢查表單與設定頁的間隔驗證。九個分類的標籤、間隔與依據；T／Z 的邊界不重疊；只填 T 值不會被自動分類；兩種待安排的排序（盡快處理最前、還沒有追蹤計畫排在有日期的項目之後、不算逾期）在定期檢查頁、「接下來」、今天頁、回診摘要都看得到；不追蹤只能手選，選了不列入；間隔 −1、1.5、121、1e12 等無效值顯示在欄位上、寫入 0 次；設定頁的固定間隔只收 1–120，舊的不合格值改用預設值；已存的無效間隔讀成待安排；360／380／412 寬時最長的分類標籤在選單下方看得到；改分類不洗掉使用者打的或已存的間隔（含 0），選不追蹤時連指定日期一起清空；`date` 不合法的紀錄不蓋過合法日期的紀錄、同順位照檢查表的順序；必填的錯誤不因離開欄位而消失，表單狀態不帶到下一張表單；`date` 不是文字時頁面照樣畫得出來；選單沒有的分類代號原樣存回；指定日期不能早於檢查日；沒有 `cat`、舊的 preset 代號、表單沒有的 labs key、已存的醫師指定間隔、匯出匯入往返與舊備份；歷次表格在自己的容器內水平捲動；`--c-bone`；380 寬深淺色的版面與截圖。
- `dev/tabbar-test.js`：底部分頁列。五個分頁的圖示、文字、目前頁的標示與觸控目標；每個分頁到對應頁；「更多」面板；補登後從任何頁按「今天」一次回到今天；換頁後焦點在頁面標題（含真的用鍵盤 Tab、Enter）；瀏覽器返回時關閉「更多」、不關還沒存的檢查紀錄；指示線在分頁列內；380×667 深淺色下沒有水平捲動、內容與 toast 不被分頁列擋住、對話框的儲存鍵按得到；用 Chromium 的安全區模擬（底部 34px）量分頁列與底部預留；今天畫面的點擊次數；截圖。
- `dev/shot-fixtures.js`：mock 讀截圖時的假資料回覆（`cfg.sample.shot`）。
- `dev/review-c-test.js`：C 階段程式審查 C1、C3–C8 的重現（縮圖旗標與備份、估算中的備份、補充說明、時間推移、mock 的同意視窗、訊息、出處）。
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
3. 飲食照片：頁面與晚上提示詞的飲食檢查已完成（`docs/specs/phase-C.md`），待 GPT 審查與發布。發布時 capabilities 要加 `sample: { images: true }`（規格第 11 節）
4. 從截圖填入檢查紀錄：頁面已完成（`docs/specs/phase-D.md`），待 GPT 審查與發布。capabilities 和 C 相同
5. 提醒：每天兩次排程檢查（07:2x、22:2x，台北時間），有缺才推播；每週日 20:1x 週報。頁面與提示詞已完成（`docs/specs/phase-A.md`、`ops/scheduled/`），排程任務待在 claude.ai 建立

設計與臨床依據見 `docs/`。
