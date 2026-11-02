# D 階段程式審查修正複核

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
