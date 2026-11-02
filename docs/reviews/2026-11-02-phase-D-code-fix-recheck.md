# D 階段程式審查修正複核

> **最新複核（`fb0517d`）：仍有 1 項高嚴重度問題，R2-after「重讀完成後撤銷」會造成重複存檔。R1、R3–R7、C1／C2 的原重現均通過，R4-reskip 亦通過。詳見第 8 節。下列第 1–7 節保留為 `78c39b9` 的歷史審查，不是目前待修清單。**

日期：2026-11-02（Asia/Taipei）。標的：`main` 的 **`78c39b9fb5c602926e0cb5d52cc6644b0cd0e766`**；修正差異：`9b24306..78c39b9`。原審查標的：`218577e2d0a0f299ea35ac1dbe98501896ea0ba9`。

**結論：D-01–D-15 為 9 項已修、6 項部分修正、0 項未修。原始重現大多已被修掉，但尚不能把整個 D 階段判為通過。** 本輪確認 7 組新增或殘留問題（R1–R7：3 高、4 中），其中重讀誤刪未存報告、重讀與撤銷交錯造成重複存檔、遲到 close 導致修正與已確認分類遺失，應優先處理。另列兩項在舊版也存在的附帶問題 C1／C2，不算 `78c39b9` 引入。

已讀 `CLAUDE.md`、更新後的 `docs/specs/phase-D.md`（含審查後修改、§3.4／3.6／3.7／4.2／4.4／7）、`docs/contract/0.2.94/sample.d.ts`、原審查、Claude 處理說明、修正 diff、harness／mock 與相關測試。只提交本報告及同目錄的重現測試；不修改 `src/`、`dev/`、規格、資料庫或發布 Artifact。

## 1. 執行方式與證據強度

所有資料、圖片與備份均為合成。瀏覽器使用 repo 的 `dev/harness.js`、`dev/mock-claude.js`，沒有真正呼叫 Claude OCR。環境為 Node **24.14.0**、Playwright **1.64.1**、Chromium **156.0.8078.4**。依賴與下載的瀏覽器置於 repo 外；產品程式沒有插入測試 hook。

新增測試：[2026-11-02-phase-D-code-fix-recheck.test.js](2026-11-02-phase-D-code-fix-recheck.test.js)。斷言寫的是「正確行為」，所以在本次標的上 R1–R7、C1–C2 **應失敗**，不是把錯誤結果當成功。可逐項執行：

```sh
node docs/reviews/2026-11-02-phase-D-code-fix-recheck.test.js R1
# R1 可換成 R2 R3 R4 R5 R6 R7 C1 C2 controls original-D09
```

執行前須有 `dev/harness.js` 可找到的 Playwright 與已安裝的 Chromium；非預設瀏覽器目錄使用 `PLAYWRIGHT_BROWSERS_PATH`。本次沒有為跑測試改 repo 的依賴檔。

| 驗證 | 本次結果 |
|---|---|
| `bash dev/check.sh` | 語法、發布檔禁用項目、外部資源檢查通過 |
| `node dev/review-d-test.js`，`78c39b9` | **45/45** |
| 同一份測試，`SRC` 指向 `218577e` 的 HTML | **12/43 通過，31 失敗**；D-01–D-13 各有失敗 |
| `node dev/shot-test.js` | 預設時區及 `America/New_York` 均 `all ok` |
| `node dev/sample-mock-test.js` | **35/35** |
| `node dev/shot-page-test.js --no-shots` | **126/126**，含 380×820／667、深淺色版面檢查 |
| `node dev/med-page-test.js --no-shots` | **120/120** |
| `node dev/e2e.js --no-shots` | **34/34** |
| 新增 `controls` | **16/16**；含真正有合成用藥變更目標的複查開關 |
| 新增 `original-D09` | 新版通過；舊版失敗，僅送出 B（200px），A（300px）遺失 |

新測試 R1–R7 共 14 個斷言中有 11 個缺陷斷言失敗，3 個對照通過；C1 三種面板的「關閉後仍可撤銷」各失敗；C2 的筆數摘要失敗。初次 C1 的合成餐點錯把 `at` 設成字串，不能開面板；已依實際 `validAt` 改為 timestamp 並重新跑三種面板，**不把測試資料錯誤列成產品問題**。

尚未執行完整 `dev/test.sh`；不宣稱真機相簿、軟鍵盤、平台同意視窗、正式 runtime limits 或真實 OCR 已驗證。這是程式與合成事件時序複核，不是臨床分類器準確度評估。

## 2. D-01–D-15 逐項裁決

「已修」指原問題的重現與相應實作已修正；「部分」指原重現已改善，但同一承諾仍有本輪可重現缺口。位置均以 `78c39b9` 為準。

| 原項目 | 裁決 | 原步驟重跑與既有測試鑑別力 | 殘留／限制 |
|---|---|---|---|
| D-01 遲到 close 清掉草稿保護 | **已修** | 讀取中關閉→編輯舊紀錄→toast 繼續：新版仍有 `b3`、待確認、停用儲存；確認後帶 `shot`。舊版該測試確實失敗並可未確認寫入 | 同一 dialog 直接換內容已修；快速關閉重開造成「沒存下舊表單」另見 R3／D-03，不把它說成原確認繞過仍存在 |
| D-02 存檔重入／已存仍留隊 | **部分** | 慢存檔中改分類重送只寫 1 筆；關閉後成功，待存由 2 變 1；略過被鎖。舊版 A／B／C 均有失敗 | `recSaving` 本身有效；重讀＋撤銷能製造脫離佇列的舊草稿，之後仍重複寫入，R2 |
| D-03 草稿修正遺失 | **部分** | 關閉／略過撤銷／換項目再換回：9.9、備註、日期正常；換項目存檔使用修正值。舊版四項失敗。正常還原的間隔、指定日期、抽血情境、複查選擇也已額外驗證 | `shotStash` 依賴延後 close；先重開會跳過保存。已確認分類可能變未分類且仍可存，R3 |
| D-04 ATA 誤建議 | **部分** | DATA、復發風險、`no`／未見原反例新版均留空；正向例正常。舊版三項負向測試失敗 | 否定涵蓋不足；英文句點分句與大小寫退步，R7。規格明訂的同句否定／風險 veto 不另算 bug |
| D-05 報告誤去重 | **已修** | 跨院、不同標題共 4 筆；完全相同才合併。舊版前者失敗 | `groupShot` 去重已修；新增重讀的 `shotKey` 又造成另一種誤刪，歸 R1／D-13 |
| D-06 衝突值資訊遺失 | **部分** | 兩列衝突完整保留單位／ref／flag；同值補 ref；同值異單位不合併。舊版三項均失敗 | 第三列衝突時，先前合併進來的 metadata 又遺失，R6 |
| D-07 title／class 原文遺失 | **已修** | title＋class 沒全文時仍進 report 並標 noText；不建議的分類原文保留；待選項目選乳超後要求確認。舊版三項失敗 | 正常存檔沿用已驗證的 report 路徑 |
| D-08 按鈕輸入沒標 dirty | **已修** | 讀取中只按生物素按鈕，完成後不蓋表單；舊版失敗。複查 change 亦設 dirty | 按鈕與選單還原經 controls 補測 |
| D-09 圖片準備競爭 | **已修** | 新版送第一組 A，準備期間拒絕 B；舊版既有測試失敗 | 既有測試沒有固定 sample 延遲，本次舊版送出 B、A 兩組，單靠它不能證明「A 遺失」。補 `original-D09` 固定讀取 400ms 後，重現舊版僅送 B、新版僅送 A |
| D-10 多 fence 任取第一個 | **已修** | 兩份 JSON fence 回 invalid；單一 fence 正常。舊版前者失敗；另測合法 JSON fence＋text fence 也拒絕 | 不推導成與 `sample.json()` 所有寬鬆解析細節完全等價 |
| D-11 小寫／全形個資漏網 | **已修** | 小寫、全形、混合遮罩及 place/ref 均擋；舊版兩項失敗；補測持久化 OCR 字串入口 | 只確認原 ID 規則；沒有宣稱能完整去識別化姓名、地址等 |
| D-12 相同 preset 的多分類 | **已修** | 4A／4C、1／2 留空並提示；同一分類寫兩次仍建議。舊版前兩項失敗；錯誤舊斷言已改 | 沒有自動選最嚴重側或新增分類間隔 |
| D-13 成功 OCR 無法強制重讀 | **部分** | 重讀按鈕、`cache:false`、到上游及已存 thy_lab 不重加的簡單案例均通過；舊版無重讀鈕 | 既有測試只用「不同 exam」兩筆，抓不到 R1／R2；釋放也有 R4／R5 |
| D-14 來源敘述 | **已修** | 原兩處文字已改；本輪從 ACR 官方頁找到可讀 v2022 原表、重讀 notes 14／15；Mayo 原目錄確認 aliases | 是文件核對，沒有對應 JS 斷言；來源見 §5 |
| D-15 測試不足 | **部分** | 補的測試確實能對舊碼變紅，不是全數空測；名稱對照表不再全部從 implementation 生成；mock S17、備份往返、點擊命中有效 | 缺少重讀與撤銷交錯、多份同鍵報告、跨批 GC、快重開、三列合併後衝突。不能以 45/45 推論這些不變式成立 |

Claude 說明的舊版「11/43、32 失敗」與本次差 1 項：本次按照要求只將 **HTML** 換成舊版，仍使用修正後的 mock，因此「壞圖片 image_rejected」對照項仍通過。D-01 舊版流程中斷，以及 D-13 沒有按鈕而未進入內層斷言，解釋舊版 43、新版 45 的分母差異。

## 3. 新增與殘留缺陷

### R1｜高｜重讀把同日同院的另一份未存報告當成已存

**位置：** `src/index.html:1939` `shotKey`、`:1966–1968` `shotRun(job.batch)`、`:2038` `shotDoneOne`。**首次發現：Codex 主審。** 新增重讀路徑的缺陷。

**重現：** 同批讀入兩筆 `breast_us`，日期、醫院相同，但 title／text 分別是 LEFT／left report 與 RIGHT／right report。確認並儲存 LEFT；RIGHT 仍待確認時按重讀，mock 再回同樣兩份。`groupShot` 正確產生兩份，但 `shotKey` 只有 exam/date/place，兩份都命中 `b.saved`。實測 `shotQ=[]`、`shotBatches.size=0`，畫面說沒有讀到結果，RIGHT 未存即消失。

**建議：** 已存身分不能用「可能重複」的粗鍵。報告至少納入來源 title／原文等與分組一致的識別，並處理 OCR 改寫或來源不足的歧義；不確定是否同一份時保留待確認，不以粗鍵無聲排除。不要直接以可編輯表單日期當穩定身分。**重現測試：`R1`**。

### R2｜高｜重讀期間的略過撤銷，留下不在佇列的表單，能存兩次

**位置：** `:2041` `shotNext` 的 undo、`:2047–2048` `shotReread`、`:1967`／`:1973–1974` `shotRun`、`:2045` `shotSaved1`。**首次發現：Codex 主審。** 新增重讀與舊撤銷交錯的缺陷。

**重現：** 兩筆草稿 A=thy_lab、B=gyn_horm；略過 A→在 B 按重讀（sample 延遲 700ms）→點仍可見的「撤銷」→重讀完成→儲存 A。undo 只擋 `recSaving`，沒有處理 reading；因此先載入舊 A，成功重讀再把整批佇列換成新物件。實測 `shotQ.includes(shotCur)===false`；第一次存完隊內仍有 thy_lab，再按儲存便有 **2 筆 thy_lab 寫入**。不是重複 submit；鎖在每次存檔之間都正常解除。

**建議：** 重讀要有批次代次與穩定草稿身分；開始重讀時，使舊批次的 undo 失效、延後套用或有定義地合併。成功替換時同步處理目前表單；submit 也應拒絕已失效的草稿身分。**重現測試：`R2`**（三個失敗斷言含實際兩次寫入）。

### R3｜高｜快速關閉重開跳過 stash，已確認分類變空白

**位置：** `:2061` close listener、`:1881–1888` `openRecord`、`:2014–2024` `loadDraft`。**首次發現：GLM 5.3 草稿子代理；Codex 獨立縮小並重現。** 舊有修正遺失未完全封住，且新增 `d.clsOk` 還原分支帶入已確認分類變空白的退步。

**重現：** BI-RADS 3 草稿按確認，改日期為 2026-10-25、備註 corrected；控制 native close 延後送達的順序：同一個 browser task 做 `dlg.close(); openRecord();`，再按繼續。實測日期回 2026-10-20、備註空、preset 空，但 `d.clsOk===true`、儲存可用。`dlg.open` guard 跳過 `shotStash`；`openRecord` 已把舊 `shotCur` 清掉。`loadDraft` 沒有 `d.form` 且 clsOk 已 true，就不再填原本確認的 preset。

這是**受控事件排序**，不宣稱已量測真機頻率；native close 本來即非同步，正是此次修正應處理的生命週期。也不將它描述成「未確認的 b3 被存」：實際是**已確認 b3 被清成未分類，其他修正回退**。

**建議：** 在關閉／替換表單的同步入口保存 outgoing draft，而非只依賴 close cleanup；或隨表單改動保存 snapshot。確認狀態須與確認的 preset／exam 一起存還原。保留現有對遲到 close 的防護。**重現測試：`R3`**。

### R4｜中｜前一批的 GC timer 提早釋放後一批仍可撤銷的圖片

**位置：** `:1940` `shotGC`、`:2041` 略過、`:2056` 丟棄。**首次發現：Codex 主審。** 新增釋放邏輯缺陷。

**重現：** t=0 略過單筆批次 A，排定 7 秒 GC；t≈3 秒另讀一批 B 並略過；t≈7.1 秒，在 B 的 6 秒撤銷期限內按撤銷。A 的 timer 掃描**全部** batches，看 B 不在 `shotQ` 就刪掉。撤銷還原 B 的文字，但 `shotBatches.has(B.batch)===false`，重讀鈕消失。

**建議：** 每批分別記錄 undo 保留期限／持有者；清理只回收自己到期且無 pending job／undo 引用的批次，避免任何舊 timer 清整個 Map。**重現測試：`R4`**，用 Playwright clock 推進真實頁面 timer。

### R5｜中｜重讀失敗後丟棄，`shotLast` 沒有到期釋放圖片

**位置：** `:1958` `shotRun` 指派 `shotLast`、`:1964` 錯誤返回、`:1940` `shotGC`、`:2056` drop。**首次發現：Codex 主審。** 新增重讀 job 的引用生命週期缺陷。

**重現：** 一批成功→重讀回 upstream_error→丟棄原草稿→超過 7 秒。實測 Map 已空，但 `shotLast.blobs.length===1`，`shotLast.batch.blobs.length===1`；drop 沒清 job，GC 也只刪 Map。若不再選圖／重讀或關頁，兩條引用繼續保留同一 Blob。

**建議：** 將 retry job 與 batch 的保留生命週期統一；丟棄並過撤銷期限後，清掉相應 `shotLast` 及批次圖片引用。保留尚可撤銷或真正執行中的 job，不能直接全域清空。這是頁面記憶體與規格 §4.2 的落差，**沒有發現圖片被寫入資料庫或匯出**。**重現測試：`R5`**。

### R6｜中｜先合併 metadata、再遇第三列衝突，補進來的資訊消失

**位置：** `:1076–1086` `groupShot`，`cell.item`／`prev.item`。**首次發現：Codex 主審。** D-06 的三列殘留問題，不宣稱這組輸入在舊版沒有問題。

**重現：** 同組三列 TSH：①2、無單位/ref/flag；②2 mIU/L、ref=REF-X、flag=H；③3 mIU/L。第二列補進 `prev.ref/flag/unit`，但 `prev.item` 仍是第一列；第三列衝突改存 `[prev.item,it]`。報告實際只剩 `TSH 2` 與 `TSH 3 mIU/L`，REF-X／H 和第一值的補充單位都消失。

**建議：** 合併後同步維護可追溯原始列集合，或衝突展開時序列化已合併的完整資料；不能只用首次出現的 `item`。**重現測試：`R6`**。這是字串保留測試，不以合成數字推論臨床意義。

### R7｜中｜ATA 否定仍漏網；新規則又誤擋不同句與小寫寫法

**位置：** `:1031–1038` `classPreset`。**首次發現：Codex 主審。** 否定漏網是殘留；英文句點及小寫拒絕是新規則退步。

| 合成原文 | 實際 | 預期與理由 |
|---|---|---|
| `ATA: high suspicion pattern ruled out` | 建議 high | 明確排除，不應當成正向分類；否定表只有 no/not/without/negative 等，漏掉 ruled out |
| `No abnormal lymph nodes. ATA high suspicion.` | 留空、說分類句有否定 | 第一個句子不是分類句。分句只處理換行、中文句號、分號，未處理英文句點，超出規格「同一句」veto |
| `ata high suspicion` | 無建議也無提示 | 舊規則 case-insensitive，新獨立 ATA regex 漏了 `i` |

**建議：** ATA token 維持不分大小寫；以合理句界及分類附近的否定作用範圍處理原文，對 ruled out 等明確排除保守留空。不要改成根據影像特徵自動診斷。

更新規格明寫「同一句有 without 或風險就不建議」。因此 `ATA low suspicion without microcalcification` 或 `ATA high suspicion，惡性風險高` 被擋，是**規格選擇**，不是另列程式 bug；但不宜將它說成醫學上不是 ATA 正常敘述。ATA 原表 Table 6 本來就有 malignancy risk 欄，Intermediate／Low 的描述含 without 等排除特徵。此處只核對原文語意與 Table 6 名稱，沒有重新推算分類或追蹤間隔。[Haugen et al., 2016，Table 6](https://pmc.ncbi.nlm.nih.gov/articles/PMC4739132/#T6)

**重現測試：`R7`**。查得 ATA 分類原表；**未查得學會對中文／英文報告自由文字提供機器解析或否定詞字典**，不把本報告的字串解析建議冒稱指引要求。

## 4. 特別要求的其他頁面與既有問題

### C1｜中｜toast 所在面板關閉後，未到期的撤銷一起消失

**位置：** `:1100–1107` `toast`，以及 `wSheet`／`dlgMeal`／`dlgDose` close。**首次發現：Codex 主審。** 在 `218577e` 與 `78c39b9` 都重現，**不是本次 commit 引入**。

在體重、飲食單餐、用藥變更面板內收到帶動作的 toast，尚未到期就關面板；toast 還掛在已關的 dialog，`hidden=false` 卻沒有可見幾何範圍，撤銷不可點。檢查草稿的實際路徑「略過第一筆→第二筆面板中出現撤銷→關面板」也相同。正常「先關面板、再 toast」的存檔成功路徑沒有這個問題，不能籠統說三頁所有 toast 都壞。

**建議：** host close 時把仍有效 toast 搬回當時可互動的面板或 body，保留剩餘期限；選 host 應反映真正活動 modal，而非只依 DOM 最後位置。**測試：`C1`**。三種頁面均用實際 open 函式、合成資料與真正 close 按鈕；toast completion 為測試注入，不聲稱測過所有餐點／用藥背景工作。

### C2｜低｜丟棄再撤銷沒有還原已存筆數摘要

**位置：** `:2056` drop undo、`:2039` `shotEnd`。**首次發現：Mistral Large 4；Codex 另寫精簡測試驗證。** 舊版同樣存在，不列為新增缺陷。

兩筆中先存 A→關閉／重開→丟棄 B→撤銷→繼續並存 B。實際寫入 2 筆，但 toast 只說「已儲存」；drop 清 `shotSavedN`，undo 只還原 queue／pos。**建議：** 撤銷恢復相同批次的已存計數，或明確重定義摘要範圍。**測試：`C2`**；未造成資料少存。

## 5. 臨床與 contract 原始來源

以下於 2026-11-02 本輪取得原頁／全文。核對僅限原審查涉及的名稱、分類系統與文件勘誤，不是臨床處置建議；子代理沒有提供臨床證據。

- **ATA 2015 指引（2016 發表）**：Haugen et al., *Thyroid* 26:1–133，doi:10.1089/thy.2015.0020。Table 6 定義結節超音波 pattern，癌症 recurrence risk 在不同章節／Table 11；不能把後者的 high risk 當前者 high suspicion。[PMC 原文](https://pmc.ncbi.nlm.nih.gov/articles/PMC4739132/)
- **ACR Lung-RADS v2022 原表**：note 14 說 4X 為獨立 category、X 不應作 modifier；note 15 的 S 用於 0–4，標示與肺癌無關的重要發現。原 `www.acr.org/-/media/...` 在工具開啟時轉到空白 Sitecore 頁；改從 [ACR 官方 Lung-RADS 頁](https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/Reporting-and-Data-Systems/Lung-RADS) 的 Access Lung-RADS 取得 [官方託管原 PDF](https://edge.sitecorecloud.io/americancoldf5f-acrorgf92a-productioncb02-3650/media/ACR/Files/RADS/Lung-RADS/Lung-RADS-2022.pdf)，已核對第 2 頁 notes 14／15。
- **Mayo Clinic Laboratories TPO 原始目錄，test 81765**：Aliases 列有 Microsomal Antibodies 與 Thyroid Microsomal Antibodies。支持規格改為「別名歷史相關，但院所方法／結果格式未確認所以先不自動對應」，不支持由名稱推定所有院所方法相同。[Mayo 原頁](https://www.mayocliniclabs.com/test-catalog/overview/81765)
- **runtime contract**：repo `docs/contract/0.2.94/sample.d.ts` 的 `sample.json`、`SampleOptions.images/cache/signal` 與 error codes。首次選圖省略 cache、重讀 `cache:false`、以 Blob 傳 images 的呼叫形狀正確。頁面草稿／圖片清理是本頁責任，不能用 runtime cache 語意替 R4／R5 辯護。

## 6. CLI 子代理、驗收與排除

共 4 個冷啟動、prompt-only Vibe 工作，所有工具停用，僅傳指定程式片段、規格及合成 harness/mock/fixtures。兩個主要範圍各交給兩個不同模型；重讀／釋放與純函式由主審負責。模型名稱均經 dispatcher 對 Vibe session record 核實，不靠 alias 猜測。

| 範圍 | 實際模型 | 主審執行結果與處置 |
|---|---|---|
| 存檔鎖／佇列 | `zai-glm-5-3` | 38/38；未提出新的可重現缺陷，不將通過等同完備 |
| 存檔鎖／佇列 | `mistral-large-4` | 39/40；計數摘要失敗，主審另跑新版與舊版，列為既有 C2 |
| 修正保存／還原 | `zai-glm-5-3` | 37/38；確認分類在快速重開後為空，主審最小化為 R3 並親跑失敗 |
| 修正保存／還原 | `deepseek-v4-1-flash-1017` | 19/19；主審補正起始頁為 exams 後跑，未新增缺陷 |

所有子代理只輸出測試程式，沒有產品檔案寫入、commit、push。主審把其 stdout 存在 repo 外；交付檔只保留可精簡重現的測試。兩個草稿工作對複查開關原本只做「無目標時直接設 checked」的 plumbing 測試，不足以證明可操作流程，故另以合成 `meddose` 建立可用目標、實際點擊驗證 controls。沒有把不完整的子代理設置當成臨床或功能證據。

修正順序建議：先解 R1／R2 的批次與草稿身分，再封 R3 的同步保存缺口；接著用每批生命週期修 R4／R5，補 R6／R7 的反例。以上均可局部修補，無須重寫整份 HTML。

## 7. 同日追加的獨立重跑紀錄

**本節仍只審查 `78c39b9`，不代表已複核後續的 `fb0517d`。** 本輪取得 repo 時，main 是指定的 `78c39b9`；交付分支 `ccr-9364f60a-xq6vfj` 已有 `75c394b` 的上述報告，以及 `fb0517d` 的後續修正。因此保留前六節、既有測試及後續修正，在本報告追加本輪證據，沒有將分支退回 main，也沒有改動 `src/`、`dev/`。

### 7.1 逐項裁決與本輪實跑

重新閱讀指定規格、contract、原審查與修正差異後，在乾淨的 `78c39b9` checkout 重跑。結果維持 **9 項已修、6 項部分、0 項未修**：

| 裁決 | 項目 |
|---|---|
| 已修 | D-01、D-05、D-07、D-08、D-09、D-10、D-11、D-12、D-14 |
| 部分 | D-02、D-03、D-04、D-06、D-13、D-15 |
| 未修 | 無 |

各項理由、位置、嚴重度與建議仍見 §2–4；本輪沒有新增另一組獨立缺陷。R1–R7 均親自重現，C1／C2 也重新用舊版確認為既有問題。原報告記錄的首次發現模型不因本輪重跑而改寫。

| 本輪執行 | 結果 |
|---|---|
| `dev/review-d-test.js` 對 `78c39b9` | **45/45** |
| 同份測試以 `SRC` 指向 `218577e` HTML | **12/43**；31 個失敗，D-01–D-13 每項至少一個失敗；沿用新版 mock，所以壞圖片測試仍過 |
| §1 的既有複核測試全套對 `78c39b9` | **27 過、15 失敗**；15 個失敗全部對應已列缺陷，沒有情境例外；其中 `controls` 16/16、`original-D09` 通過 |
| `original-D09` 對 `218577e` | 失敗：實際只送 B（200px），預期 A（300px）；重現原本的準備時序遺失 |
| C1／C2 對 `218577e` | 三種面板關閉後撤銷不可見；兩筆確實寫入但摘要只顯示「已儲存」 |
| `bash dev/check.sh` | 通過 |
| `node dev/shot-test.js` | 預設與 America/New_York 均 all ok |
| `node dev/sample-mock-test.js` | **35/35** |
| `node dev/shot-page-test.js --no-shots` | **126/126** |
| `node dev/med-page-test.js --no-shots` | **120/120** |
| `node dev/e2e.js --no-shots` | **34/34** |

本輪環境同為 Node 24.14.0、Playwright 1.64.1、Chromium 156.0.8078.4；使用原 harness／mock、合成 PNG 及合成紀錄。沒有修改測試斷言來讓產品通過，沒有呼叫真實 OCR；未跑完整 `dev/test.sh` 或真機測試。上表的失敗是預期正確行為與實際缺陷的差異，不是把失敗當作驗收通過。

### 7.2 兩個額外時序：沿用 R2／R4，不重複計數

可直接執行的新附件：[2026-11-02-phase-D-code-fix-recheck.supplement.test.js](2026-11-02-phase-D-code-fix-recheck.supplement.test.js)。本輪在 `78c39b9` 跑出 **1/4 通過**：一個撤銷仍可見的前置對照通過，三個缺陷斷言失敗。

```sh
# 在 78c39b9 的 src/index.html 上執行；也可用 SRC 指向該版本的 HTML
node docs/reviews/2026-11-02-phase-D-code-fix-recheck.supplement.test.js R2-after
node docs/reviews/2026-11-02-phase-D-code-fix-recheck.supplement.test.js R4-reskip
```

- **R2-after｜高｜`shotNext` undo、`shotRun(job.batch)`**：略過甲狀腺草稿→在下一筆按重讀→**等重讀完成**→按仍可見的舊撤銷。實測 queue 為 `thy_lab, thy_lab, gyn_horm`；依序存前兩筆，真的寫出兩筆 thy_lab。這補充 §3 R2 的「重讀中撤銷」：只在 reading 時擋 undo 還不夠，舊撤銷在批次替換後也必須失效或重新對應。**候選來源：本輪要求 GLM 的存檔工作之部分輸出；實際模型未經 dispatcher 完成核實。確認者：Codex 主審。** 不把它算成新的模型首次發現，也不主張同日同項目一概不得人工新增；問題是同一來源草稿被過期撤銷重複加入。
- **R4-reskip｜中｜`shotGC`、`shotNext`**：同一筆單筆草稿，t=0 略過，t=4 秒撤銷並再次略過，t=7.3 秒在第二次撤銷有效期間撤銷。實測文字草稿回來，但 batch 與重讀鈕都沒有了。**首次觀察此變體：Codex 主審。** 不需跨批次也會觸發 §3 R4；修補應涵蓋同一批次的續期，不僅限制 timer 的 batch id。

### 7.3 本輪四個 CLI 工作的驗收與排除

以下是**本節這一輪**的新執行紀錄，與 §6 的前輪紀錄分開。全部為 Vibe prompt-only、所有工具停用；只送指定程式片段、規格及 repo 合成測試。子代理沒有修改 repo。主審逐一執行回傳測試；只將能重現且符合規格的結果納入上文。

| 窄範圍 | 要求／核實模型 | 主審執行與處置 |
|---|---|---|
| 存檔鎖與佇列 | 要求 `zai-glm-5-3`；dispatcher **partial／600 秒逾時**，沒有 resolved_model | 只取留下的 assistant 測試文字，親跑 **2/4**；兩個失敗為 R2-after 的佇列與實際重複寫入。不得宣稱完整成功或模型身分已核實 |
| 存檔鎖與佇列 | 核實 `mistral-large-4` | **8/13**；同鍵重讀與計數摘要重現既有 R1／C2。另兩個失敗為程式強制對隱藏按鈕重複 `.click()`，見下方排除 |
| 修正值保存／還原 | 核實 `zai-glm-5-3` | 原稿 **30/31**；唯一失敗是把 `days.med.dose` 的改變誤當成 `meddose` 紀錄，未產生複查目標。主審補正合成 seed 為合法 `meddose` 後 **33/33**，增加的兩項為可用複查開關斷言；不列產品缺陷 |
| 修正值保存／還原 | 核實 `deepseek-v4-1-flash-1017` | **26/26**；沒有新增可重現缺陷。其複查目標前置不完整，不能拿這個結果代替 §7.1 已以合法 meddose 目標驗證的 controls |

本輪排除兩類候選：

1. **重讀 `{"items":[]}` 清空未存草稿**：已實測，但 §4.5 明寫「讀到 0 項不是錯誤」，§4.2 又定義重讀取代該批未存草稿。不能把它誤報為「重讀失敗卻沒保留」；不列缺陷。相對地，上游錯誤、原有草稿修正與再次繼續的保留已通過對照。
2. **Mistral 的雙擊撤銷**：測試在同一段 JavaScript 內對按鈕呼叫兩次 `.click()`，第一下已把 toast 同步設為 hidden；第二下仍以程式強制觸發隱藏元素，尚未證明正常實體點擊可到達。雖能讓 queue 出現重複物件，也不列可重現使用者缺陷。

### 7.4 原始來源再核對與界線

本輪重新取得 [ATA Table 6 原表](https://pmc.ncbi.nlm.nih.gov/articles/PMC4739132/table/T6/)、[ACR 官方託管 v2022 PDF](https://edge.sitecorecloud.io/americancoldf5f-acrorgf92a-productioncb02-3650/media/ACR/Files/RADS/Lung-RADS/Lung-RADS-2022.pdf) 第 2 頁 notes 14／15，以及 [Mayo TPO 檢驗目錄](https://www.mayocliniclabs.com/test-catalog/overview/81765) 的 Aliases。分別支持 §3 R7 的 pattern 名稱與排除特徵文字、D-14 的 4X／S 勘誤、microsomal 別名勘誤。

PMC 整篇入口本輪遇驗證頁；PubMed fulltext 工具只回 metadata／abstract、sections 為空，**不將其當成已讀全文**。Table 6 的獨立原表可以讀取；本輪沒有另外取得 Table 11 全文，也沒有據子代理文字新增臨床主張。這次的分類處理建議限於字串語意與既定規格，不推算診斷、處置或追蹤間隔。

## 8. `fb0517d` 後續修正複核：目前僅列 R2 為待修

日期：2026-11-02。審查標的固定為 **`fb0517def5b82db042a562c674113aee47b20ff0`**，不是第 1–7 節的舊版。已讀這次修正差異、Claude 處理說明後半與規格「複核後的修改」。本輪由 Codex 主審直接執行既有測試，不新增子代理或臨床判讀。

開始時遠端 main 已是 `fb0517d`；交付分支為 `bd6c80c`（產品程式與 `fb0517d` 相同，只有審查檔案增加）。這是讀取到的既有遠端狀態，本輪沒有合併或更新 main，也沒有改動 `src/`、`dev/`。

### 8.1 實跑結果

使用 `git show fb0517d:src/index.html` 的原始內容，以 `SRC` 指向快照；blob SHA 驗證為 `1ba4a90f4446f4a352fa60a89539a049009e9de0`，與指定 commit 完全一致。harness、mock、fixtures 在兩版間無差異。`dev/review-d2-test.js` 取自 `fb0517d`，放在 repo 外執行時只改相對 require 路徑，不改斷言、產品函式或合成資料。Node／Playwright／Chromium 版本沿用 §7。

| 驗證 | 本輪結果 |
|---|---|
| `dev/review-d2-test.js` 全套（R1–R7、C1／C2、controls、original-D09） | **42/42**；含分類、修正值、真正複查開關、慢存檔與三種面板 toast 對照 |
| `dev/review-d-test.js` | **45/45** |
| 補充 `R2-after` | **0/2**：佇列去重與實際寫入筆數均失敗 |
| 補充 `R4-reskip` | **2/2**：第二次撤銷期限內圖片與重讀按鈕都保留 |
| 指定 HTML 的 script 抽出後 `node --check` | 通過 |

`dev/review-d2-test.js` 對原測試的 3000 ms 慢存檔延遲、C1 等待非同步 close 最多 1 秒，與處理說明一致；沒有放寬功能預期。其 R2 只測「重讀中按撤銷」，沒有測「重讀完成後才按舊撤銷」，因此 42/42 與下方殘留缺陷並不矛盾。

裁決：**R2 部分修正；R1、R3、R4、R5、R6、R7、C1、C2 的原重現均已修。** 本輪限定這批修正與指定時序，沒有將通過擴張為完整程式或真實 OCR 已驗證；未重跑整個 `dev/test.sh`、未做真機測試。

### 8.2 唯一仍可重現的問題：R2-after｜高｜已略過草稿漏掉作廢標記

**位置（`fb0517d`）：** `src/index.html:1975`，`shotRun(job.batch)` 只遍歷 `shotQ` 標記 `d.stale`；`:2046`／`:2048`，略過先將草稿移出 `shotQ`；`:2049`，`shotNext` 的撤銷閉包只以該草稿的 `stale` 及當下 busy 狀態判斷。

**重現：** mock `multi` 讀出 A=thy_lab、B=gyn_horm → 略過 A → 在 B 按重讀 → **等重讀成功完成** → 在原撤銷期限內按舊 toast 的「撤銷」→ 依序存前兩筆。

**實測：** 撤銷後 queue 為 `['thy_lab','thy_lab','gyn_horm']`；完成前兩次存檔後，mock 的成功寫入紀錄有 **2 筆 thy_lab**。測試使用真正可見的 toast 按鈕與正常 click，沒有對隱藏元素強制觸發事件，也沒有替換產品函式。

**原因：** A 在略過時已離開 `shotQ`，只被撤銷閉包持有；重讀完成的作廢迴圈看不到它，A 的 `stale` 仍為空。此時 `shotBusy()` 已是 false，撤銷重新插入 A；新讀出的 A 也在佇列，因此兩筆都能各自合法通過存檔鎖。這不是同一 submit 重入，也不是使用者主動新增另一份同日報告。

**局部修改建議：** 讓作廢依據綁定批次讀取代次，而非只標記當時在佇列的物件。草稿和撤銷閉包記住建立時的 batch generation；重讀成功替換後遞增 generation，撤銷與 submit 都檢查是否過期。或集中管理同批所有草稿（包括已略過、可撤銷者）並一併作廢。失敗重讀不要作廢原草稿。無須重寫表單。

**來源與驗收：** 這是 §7 的既有補充反例，不是本輪新增模型意見；候選來源與模型核實限制維持 §7.2。Codex 主審已在 `fb0517d` 親自執行並確認失敗。可直接執行：

```sh
# 使用 fb0517d 的 src/index.html；若目前 checkout 不同，先令 SRC 指向該版本快照
node docs/reviews/2026-11-02-phase-D-code-fix-recheck.supplement.test.js R2-after
```

在本次標的輸出：

```text
FAIL R2-after: obsolete undo must not add another thyroid draft → ["thy_lab","thy_lab","gyn_horm"]
FAIL R2-after: thyroid draft written once → 2
0/2 passed
```

下一步只需處理此過期撤銷缺口，再重跑 `R2-after` 與原 R2／controls；其餘已通過項目不需依歷史報告重新修改。本輪沒有新增臨床分類、檢驗名稱或追蹤間隔主張。
