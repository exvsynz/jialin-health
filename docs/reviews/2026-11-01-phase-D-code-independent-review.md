# D 階段「從截圖填入檢查紀錄」獨立程式審查

審查完成日：2026-11-02（檔名依委託保留 2026-11-01）。

**結論：建議先修正下列高嚴重度問題，再發布 D 階段。** 目前有可重現的「未確認分類仍能存」、存檔競爭、修正值被原始 OCR 值取代，以及整份報告被誤去重問題。既有測試全過，並未排除這些問題。

## 1. 範圍、方法與驗證結果

- Repo：`exvsynz/jialin-health`，分支 `ccr-9364f60a-xq6vfj`。
- 審查標的：`218577e2d0a0f299ea35ac1dbe98501896ea0ba9`；包含 `a2d41a4` 起的 D 階段工作，實際差異使用 `git diff 9f602b9..218577e`。
- 已讀 `CLAUDE.md`、`README.md`、`phase-D.md` 全文（尤其第 10 節）、`phase-C.md` 第 4 節及本 repo 的 `docs/contract/0.2.94/sample.d.ts`。runtime 行為以這份型別與註解為準，沒有拿其他版本代替。
- 檢查純函式、表單與草稿狀態、非同步寫入、toast 搬移、mock 和測試；以合成資料在 Node、DOM 模擬及真正 Chromium 中重現。沒有使用真實健康資料，也沒有呼叫真正的 Claude OCR。
- 本次僅新增本報告，未修改 `src/`、`dev/`、規格或資料庫權限，未發布 Artifact。

| 驗證 | 結果 |
|---|---|
| `bash dev/check.sh` | 語法與發布檔檢查通過 |
| `node dev/shot-test.js` | 預設時區及 `America/New_York` 都顯示 `all ok` |
| `node dev/shot-page-test.js` | **120/120** |
| `node dev/sample-mock-test.js` | **34/34** |
| `node dev/med-page-test.js --no-shots` | **120/120** |
| `node dev/e2e.js --no-shots` | **34/34** |
| 額外 Chromium 操作 | 重現 D-01、D-02、D-03、D-08、D-09；另測實際選檔→讀取中關閉→編輯舊紀錄→toast 繼續 |
| 額外備份操作 | 清空 TSH 後其 meta 移除；未變更 Free T4、未知 labs/meta/drawCtx key 與 shot 保留；實際 JSON 匯出及匯入後相等 |

執行環境使用 Playwright 1.62.1、另行取得的 Chromium 153。預設 Playwright 瀏覽器下載失敗，改由暫存目錄提供執行檔；Google Fonts 在此環境不能正常載入，改由測試程序攔截字型請求，供應同名 Noto Sans TC 與 IBM Plex Sans 字型。上述替換都在 repo 外，不改測試與斷言。最初缺字型的一次執行為 101/120，包含網路 console 錯誤與中文字形缺失造成的觸控寬度失敗；載入字型後重跑才得到上表結果，不將環境失敗列為產品缺陷。

已檢視 380px 寬、820／667px 高的深淺色截圖，標準情境未見水平溢出；觸控目標與對比檢查通過。這不等於 iOS／Android 真機相簿、螢幕鍵盤、平台同意視窗或真實 OCR 已驗證。未執行完整 `dev/test.sh`，也未宣稱這些真機項目已通過。

下文行號均以 `218577e` 為準。「高」指可繞過分類確認、造成錯值／整筆資料遺失或非預期重複寫入；「中」指資訊保留、隱私防線或重要操作有缺口；「低」指不直接改變已存數值的說明問題。

## 2. 發現總表

| 編號 | 嚴重度 | 問題 | 主要位置 |
|---|---|---|---|
| D-01 | 高 | 舊面板的延後 close 事件清掉新草稿，繞過分類確認並遺失來源 | `shotResume`、`dlg close` |
| D-02 | 高 | 存檔沒有獨立的進行中狀態，能重複送出；成功後草稿也可能仍留在佇列 | submit、`renderShotCls` |
| D-03 | 高 | 修正只存在 DOM，關閉／略過撤銷／換項目後可回復為原始 OCR 值 | `loadDraft`、`shotNext`、`shotAway` |
| D-04 | 高 | ATA 比對把 DATA、復發風險與否定語句當成超音波分類 | `classPreset` |
| D-05 | 高 | 報告去重不含醫院與標題，整份不同來源報告被丟掉 | `groupShot` |
| D-06 | 中 | 衝突檢驗轉成文字時遺失單位／參考範圍／獨立旗標 | `groupShot` |
| D-07 | 中 | 報告的 title、class 原文可能完全不進可編輯內容或儲存資料 | `groupShot`、`loadDraft` |
| D-08 | 中 | 按鈕式手動輸入未標 dirty，讀取完成仍會覆蓋 | `recDirty`、`ctxWrap` |
| D-09 | 中 | 準備圖片期間未上鎖，第二次選檔可使一組圖片無聲消失 | `shotPick` |
| D-10 | 中 | 多個 JSON code fence 只取第一個，後續結果無警告丟失 | `parseShot` |
| D-11 | 中 | 小寫／全形 ID 繞過頁面去個資，能進 report、labMeta 與備份 | `redact`、`parseShot` |
| D-12 | 中 | 多個原始分類只要對到相同 preset 就仍建議，偏離已確認規格 | `classPreset`、`shot-test.js` |
| D-13 | 中 | 成功讀取立即丟掉圖片，無法針對成功但錯誤的 OCR 強制重讀 | `shotRun`、`renderShotBox` |
| D-14 | 低 | 規格對 microsomal antibody、Lung-RADS 4X 的來源描述不正確 | `phase-D.md` §3.4、§7 |
| D-15 | 中 | 測試未覆蓋上述狀態轉移，部分斷言不足以支持測試名稱的承諾 | `dev/shot-*.js`、mock、a11y |

## 3. 各項問題與重現

### D-01｜高：繼續草稿時，舊 close 事件清掉新表單的保護狀態

**位置：** `src/index.html:1959`（`shotResume`）、`:1987`（`loadDraft`／`openRecord`）、`:2019`（close listener）、`:1892`（儲存關卡）。

**重現：** 選一張會讀出 BI-RADS 3 的合成截圖；讀取中關閉新增面板，打開既有甲狀腺抽血的編輯面板；讀完後按 toast 的「繼續」。`shotResume` 在同一個動作中 `dlg.close()`，再 `loadDraft()` 重開。原本 close 事件稍後才觸發，將新草稿的 `shotCur`、`shotCls` 清空。

真正 Chromium 實測結果為 `dlg.open=true`、`fPreset=b3`、`shotCur=null`、`shotCls=null`、儲存鈕啟用。**不按確認分類就能存成 `preset=b3`，而且沒有 `shot`／`labMeta`。** 佇列原稿還在，後續又可能重複存。

**建議：** 同一個 dialog 已開啟時直接切換內容，避免 close→立即 showModal；或讓 close cleanup 綁定開啟代次，不能清理後來的新表單。儲存端也須核對目前草稿的確認狀態，不以可能被清空的全域變數作唯一依據。新增從舊紀錄編輯面板按 toast 繼續的瀏覽器回歸測試。

### D-02｜高：儲存等待期間可再次送出，或讓成功紀錄仍留在待存佇列

**位置：** `src/index.html:1890–1915`（submit）、`:2002`（`renderShotCls`）、`:2006–2009`（`shotNext`）。

**重現 A：** mock 設 `latency:1000`，確認乳房草稿分類後按儲存；等待中改選另一個分類。`renderShotCls()` 只看 `shotCls.pending`，把原本因存檔而停用的儲存鈕重新啟用。再次按儲存會建立第二個 autoId。Chromium 實測一份草稿產生 **2 筆紀錄**，兩筆還可能帶不同分類。

**重現 B：** 同樣慢存檔，按儲存後關閉面板。close listener 清掉 `shotCur`，完成時 `shotCur===fromShot` 不成立，因此不呼叫 `shotNext`。實測原本 2 筆佇列仍為 2 筆，但資料庫已成功多 1 筆。重開繼續會再次顯示已存過的那筆。等待期間略過／切換草稿也有相同生命週期問題。

**建議：** 用獨立 `saving` 狀態防止重入；按鈕 disabled 應同時取決於 saving 與分類確認。將草稿身分、文件 ref 與寫入結果綁在一起；寫入成功應依草稿 id 更新佇列，不依當下仍顯示哪筆。等待中關閉可允許，但不能因此忘記成功結果；失敗保留同一筆與修正值。測試慢成功、慢失敗、關閉、略過、改分類及重複 submit。

### D-03｜高：草稿修正未回存，會重新採用已被醫師改掉的讀值

**位置：** `src/index.html:1867–1869`、`:1977–1986`（`shotFillLabs`／`shotAway`）、`:1987–1997`（`loadDraft`）、`:2006–2019`。

**重現：** 使用 `multi`：把 TSH `2.30` 改成合成值 `9.9`，加備註。

1. 關閉→新增→繼續：TSH 回 `2.30`，備註空白。
2. 略過→撤銷：也回 `2.30`，備註空白。
3. 改檢查項目為 `gyn_horm` 後存：`shotAway()` 寫進報告的是原始 `TSH 2.30`，不是剛修正的 `9.9`；切回 `thy_lab` 也會用原始值重新填入。

以上均在 Chromium 重現。日期、醫院、分類確認及其他表單修正同樣沒有儲存至 draft。這與「關閉後仍有草稿、略過可以撤銷」形成容易誤信的操作：醫師已經核對過的錯值可能再次出現，甚至失去修正後的唯一版本。

**建議：** 原始抄錄資料與可修改的草稿表單狀態分開；離開、略過、換項目前保存目前表單值，恢復時讀修正後草稿。換項目搬入報告的數值應取最後修正值；只有最後值仍與原始值相同才保留對應 `labMeta`。不需要重寫整個表單，先補一個集中保存／恢復草稿的入口即可。

### D-04｜高：ATA 分類解析超出「照抄已寫出的分類」範圍

**位置：** `src/index.html:1032–1034`（`classPreset`）。

**重現：** 以下三個呼叫都回 `preset:'high'`：

```js
classPreset('thy_us', null, 'DATA: high resolution ultrasound')
classPreset('thy_us', null, 'ATA high risk of recurrence')
classPreset('thy_us', null, 'ATA: no high suspicion pattern')
```

第一個根本沒有獨立的 ATA 字樣；`/ATA/i` 會命中 DATA，`/high/` 會命中 high resolution。第二個是癌症復發風險，不能拿來代替超音波結節 pattern；第三個是否定語句。這些都不是 OCR 憑空生成內容才會發生，頁面的固定規則本身就會誤對應。

ATA 原文分開定義超音波 pattern（Table 6）、依該 pattern 的追蹤（Recommendations 23／24）及癌症復發風險系統 [S3]。保留使用者確認可減少誤存，但不能把錯誤建議視為正確抄錄。

**建議：** 獨立字界的 ATA，加上明確的 `high/intermediate/low suspicion` 或相應中文分類片語；不能只看到同段的 high／low 就建議。含否定、歷史或不同風險系統時保守留空，讓使用者選；不要為解決這個問題再加入模型臨床判斷。

### D-05｜高：同日不同院的相似報告被當成截圖重疊

**位置：** `src/index.html:1062`（`groupShot` 的 `seenRep`）。

**重現：** 兩筆 `type:'report'` 都是 `breast_us`、同一天、`text:'Benign cyst.'`、`class:'BI-RADS 2'`，但 `place` 分別為合成甲院與合成乙院。`groupShot` 只產生甲院一筆，沒有略過計數與警告。相同鍵也沒有 title，內視鏡與病理等不同標題的同日報告在文字相同時也可能消失。

**原因：** 去重鍵只有 `[exam,date,text,class]`。規格 §3.7 說每一份報告一筆；現在拿內容相同推定同一份報告，會跨來源合併。

**建議：** 至少把醫院、標題等來源識別納入去重，資料不足時保留兩筆並提示可能重複。確定只是同一份報告的重疊截圖時才移除；不要因為都讀到短句就丟掉整份資料。

### D-06｜中：衝突檢驗保留了數字，卻丟掉解讀數字必需的資訊

**位置：** `src/index.html:1074–1080`。

**重現：** 同日同院的 TSH 兩列，分別為 `2 μIU/mL` 與 `0.002 IU/L`，各帶參考範圍與獨立 flag。衝突後 labs 及 labMeta 都不存這兩列，報告僅剩：

```text
截圖裡 TSH 有不同的值：2、0.002
```

單位、ref、獨立 flag 已丟失。這裡的兩個數字甚至代表相同濃度，但頁面既不換算，也沒有保留來源以供核對。同值去重也只比較 value／flag，可能丟掉另一列才有的 ref 或原始單位。

**建議：** 衝突列表保存完整原始 cell／item，寫報告時使用和 `labLine` 相同的完整描述；繼續遵守不換算、不自行選可信值的決定。相同數值但補充 metadata 不同時，保留或合併可追溯資訊。

### D-07｜中：報告標題與分類原文讀到了，卻沒有完整保留路徑

**位置：** `src/index.html:1054`、`:1063–1064`、`:1989`、`:1995–1996`、`:1897–1906`。

**重現：** 回覆有 `title:'Breast US'`、`class:'BI-RADS 4A'`、`text:null`。`parseShot` 視為合法；group 的 report 是空字串。確認分類後儲存，只剩既有 `b45`，標題與「4A」原文均不在紀錄。若 exam 無法辨識、使用者再選項目，或 class 是不建議的 TI-RADS，原文更可能連一次有效提示都沒有。text 本來就沒包含 class 時也有同樣問題。

**建議：** 將抄到的 title、class 原文補入可編輯的報告內容（避免重複即可），不只放在暫存的 `cls.text` 或丟掉的 draft 屬性。使用者選定原本未知的 exam 後，可重算分類建議，但須重新走確認關卡。沒有讀到全文時仍要明示，不要把空報告當成完整報告。

### D-08｜中：只按抽血情境按鈕，也會被當作「表單沒動過」

**位置：** `src/index.html:1851–1852`（抽血情境按鈕）、`:1955`（自動載入）、`:2010`（dirty listener）。

**重現：** 從 `thy_lab` 開始讀圖；讀取中按「近一週吃過生物素：是」。按鈕只產生 click，不會產生表單 input。實測完成前 `formCtx.biotin7d='yes'` 而 `recDirty=false`；讀取完成後自動 `loadDraft`，情境變成 `{}`，手動選擇消失。

**建議：** 所有實際更改表單狀態的入口都走同一個 mark-dirty 函式，包括按鈕群、複查選擇和選單。dirty 時只顯示「開始確認」，不得自動覆蓋。這不要求多一層 confirm。

### D-09｜中：選圖到呼叫 sample 之間有未保護的空窗

**位置：** `src/index.html:1938–1944`、`:1954`。

**重現：** 在獨立 Chromium 測試將 `prepShot(A)` 延遲 50ms、`prepShot(B)` 延遲 10ms，先後觸發兩次選檔。準備期間 phase 仍為 idle，所以兩次都進入。B 先開始讀取；A 稍後把全域 `shotLast` 換成 A，但 `shotRun` 因 reading 而直接返回。B 成功後又把 `shotLast=null`。實測只送 B，佇列只有 B 的結果，A 無錯誤提示地消失。

這個測試刻意控制解碼耗時，不代表每台手機都會出現同樣時序；問題是實作允許這條時序。

**建議：** 選檔立即進 preparing 狀態，直到 sample 結束才解鎖；或用操作 id 將本次 blobs 與本次呼叫綁定。停止與錯誤 cleanup 也應只處理自己的操作。不能先改共享 `shotLast`，再靠另一個函式的 guard 默默拒絕。

### D-10｜中：多個 code fence 被當成成功讀完一份

**位置：** `src/index.html:1046`（`parseShot`）；對照 `sample.d.ts` 的 `json()` 說明及 D §4.4。

**重現：** 一個回覆含兩個 JSON code fence，第一個 `items` 有 TSH，第二個有 Free T4。parser 只匹配第一個 fence，回 `ok:true, skipped:0`，沒有提示 Free T4 被丟掉。

`sample.json()` 的參考讀法限定唯一一個 code fence，並不支持從兩份答案中任意挑第一份。D 宣稱與它同樣的寬鬆讀法，此處並不相同。

**建議：** fence 不只一個時視為 invalid，提供手動重新讀取；不要偷偷選一個。只有在明確定義多份合併規則後才能合併。增加兩個合法 fence、合法加不合法 fence 的測試。

### D-11｜中：去個資有明確的大小寫／全形漏網

**位置：** `src/index.html:1042`（`redact`）、`:1049–1054`（所有字串的入口）。

**重現：** 合成字串 `A123456789` 會被移除；`a123456789`、`Ａ１２３４５６７８９` 都不會。把後兩者放在 report、place 或 lab 的 raw／ref，會原樣進入表單，確認儲存後進資料庫，之後整份匯出。

**建議：** 匹配時處理大小寫與全形，必要時加入常見 OCR 分隔寫法；只取代被匹配片段，避免為了遮罩而改寫整篇報告。測試每個實際持久化文字欄位，不只測 `report`。

這是規格所稱「頁面再擋一層」的缺口，**不是宣稱頁面已能完全去識別化**。未裁切的圖本來就會送 Claude；姓名、生日、病歷號、電話、地址目前主要靠提示詞與醫師確認，模型若漏抄排除規則，這些字串仍可被存下。這項限制已有規格告知，不另算新的程式缺陷。沒有發現把既有其他健康紀錄加進這個 prompt，或把截圖 Blob 寫進 records／備份的程式路徑。

### D-12｜中：原始分類不只一個，但因為 preset 相同仍會建議

**位置：** `src/index.html:1036–1037`；`dev/shot-test.js:51`。

**重現：** `R: BI-RADS 4A; L: BI-RADS 4C` 回 `b45`、只顯示第一個 `BI-RADS 4A`、沒有多分類提示。1／2、4／5、ATA intermediate／low 也因共用 preset 而通過。

原因是檢查 `ps.length`，不是原始分類 `cats.length`。D §3.6 規定兩個以上不同分類時不建議，第 10 節沒有授權「相同 preset 就例外」。測試反而明寫 1／2 可以建議，把偏離規格的行為固定下來。ACR 仍將 4A／4B／4C 定義為不同分級 [S2]；既有 b45 共用處置選項，不代表原文只有一個分類。

**建議：** 照既定規格判斷原始分類數，保留全部分類並提示自己選。若要變更這個產品決定，需明確修改規格，不能只靠測試新增例外。此處不主張自動選較嚴重的一側。

### D-13｜中：成功但讀錯，沒有真正的「再讀一次」路徑

**位置：** `src/index.html:1954`（成功即 `shotLast=null`）、`:1960–1966`（有目前草稿就隱藏讀取區）、`:1945`（選檔第一次仍用預設 cache）。

**重現：** 合規 JSON 成功，但某些值讀錯。現在只剩手動更改／略過，沒有再讀一次按鈕，圖片也已釋放。使用者關閉、再選同一張圖，走的仍是第一次選檔路徑；5 分鐘內可能命中同一份錯誤但成功的快取，而不是再問 Claude。規格 §4.2 說圖片為重讀留至草稿存完、略過或丟棄才釋放，§4.3 說讀錯要確實重新問，實作提早釋放。

**建議：** 未處理完的這批草稿保留對應 blobs，提供明確由使用者觸發、帶 `cache:false` 的重讀。重讀不能覆蓋已確認儲存的紀錄，也不要默默把同一批待確認草稿再追加一次。全部處理完才釋放；丟棄後的短暫撤銷保留可明確限於撤銷期間。

### D-14｜低：兩處規格來源解釋應更正

**位置：** `docs/specs/phase-D.md:187`、`:538`。

**可核對的情境與結果：**

- 規格把 Anti-microsomal antibody 一概稱為「和 Anti-TPO 是不同的檢驗方法」。Mayo 的 TPO 檢驗別名包含 Microsomal Antibodies／Thyroid Microsomal Antibodies；SickKids 也解釋這個歷史名稱與 TPO 的關係 [S5]。不能只由名稱判定方法不同。**這不代表現在就應自動合併歷史滴度與現代定量結果**；保守留在報告的做法可維持，只需將理由改成院所方法／結果格式尚未確認。
- 規格稱 ACR 摘要把 4X 當修飾。ACR v2022 note 14 明確說 4X 是獨立 category、X 不應當 modifier；note 15 的 modifier 是 S [S1]。程式目前把 4X 對到既有 l4b，沒有因此產生新的程式錯誤。

**建議：** 修正上述兩句與來源定位，避免後續開發者依錯誤理由擴充映射。沒有必要因此修改現有追蹤間隔。

### D-15｜中：綠燈測試仍漏掉資料與生命週期不變式

**位置：** `dev/shot-test.js`、`dev/shot-page-test.js`、`dev/shot-fixtures.js`、`dev/mock-claude.js:138–175`、`dev/a11y.js`。

**重現：** 在未改動 src／dev 的標的上，既有 shot 頁面測試 120/120，同時獨立 Chromium 可以存下 D-01 的未確認 b3 及 D-02 的兩筆紀錄。因此不是需要把測試再跑幾次，而是缺少會失敗的情境與斷言。

| 缺口 | 現有斷言為何不夠 | 建議新增的失敗條件 |
|---|---|---|
| 草稿及非同步 | 多測立即成功；關閉測試主要是讀取中，存檔失敗也沒有穿插其他動作 | 慢存檔＋關閉／略過／改分類；成功只出現一筆、草稿只消費一次，失敗恢復修正值 |
| 分類 | 只測目前新增面板上的確認，未測 toast 從其他編輯面板接回 | 未按確認不得寫入；來源欄位不可因 close 事件失蹤 |
| 修正及撤銷 | 略過撤銷只看原始資料回來，不先修改 | 改日期／labs／note／分類後，關閉續填及略過撤銷仍完全相同 |
| 不丟內容 | 衝突 fixture 使用同單位、沒有 ref；報告去重只測完全同源例子 | 跨院同文字不能少一筆；衝突與去重後單位、ref、flag、title、class 仍可追溯 |
| 名稱與分類表 | alias 測試從被測的 `SHOT_LABS` 本身產生預期值；同 preset 多分類被測成成功 | 外部固定的預期名稱表；DATA／否定／復發風險反例；兩個原始分類反例 |
| 備份 | `shot-page-test.js:131` 只呼叫 importLoses，未實際匯出再匯入 | metadata、shot、未知 key 的完整 round trip；清空值後只刪自己的 meta。本次獨立操作正常，但要留成回歸測試 |
| sample 圖片 | mock 解碼失敗只留下 w/h=null，沒有按照 contract 拒絕；也未檢查 >10,000px／64MP | 合法 bytes、非法影像、尺寸限制；並與「只超過 maxInputBytes 才轉碼」分開測，避免把 mock 接受誤認為平台接受 |
| 錯誤及快取 | 錯誤迴圈把 errors 當 detail，沒有把 `!errors.length` 納入 ok；大多只測空佇列錯誤 | 有舊草稿再讀失敗仍完整；檢查 pageerror；解析失敗／成功但讀錯後的手動重讀確實 upstream 且 cache=false |
| 版面與觸控 | scan 有量到覆蓋 label 的 file input 尺寸，但不驗證點擊能否命中；667 高略過入口／讀取／錯誤畫面 | 補 file input 與 toast hit-testing、捲動後底部按鈕、螢幕鍵盤；短螢幕也跑全部狀態 |

另外，`single` 的點擊數是測試手動累加變數，相簿點擊沒有被量測；可支持頁面內的三個動作，不能當作已證明真機總共 5 次。來源程式碼／測試替身無法驗證 OCR 準確率與真實平台同意視窗，需維持規格第 11 節的真機試用。

## 4. 臨床對應、提示詞及 runtime 的核對結論

### 4.1 檢驗名稱與單位

名稱採 exact match，不讓模型決定 labs 欄位，方向合理。已驗證 `labField('FT3','甲狀腺刺激素')` 不會退而使用 order；Free testosterone 不會對到總 Testosterone；Anti-Tg 和 Thyroglobulin 分開。主要檢驗名稱可由提供檢驗的醫院／實驗室目錄確認 [S4–S8]。

| 欄位組 | 核對結果及界線 |
|---|---|
| TSH、Free T4、T3 | TSH／thyrotropin、FT4／free thyroxine 的對應合理；總 T3 與 FT3 必須分開，Mayo 分別列出檢驗。院所 FT4 文件也支持 hTSH 的用字 [S4] |
| Anti-TPO、Anti-Tg、Thyroglobulin | 抗體與蛋白本體的區分合理；microsomal 名稱的說明須依 D-14 修正 [S5] |
| E2、P4、FSH、LH、AMH、PRL、Testosterone | 核心英文檢驗對應合理；P4 是 progesterone，AMH 的 Müllerian 拼字變體合理，free／total testosterone 不可混用 [S6–S8] |
| 健康存摺實際欄位 | **本次沒有取得可核對每個 alias 的官方健康存摺欄位字典或真實裁切畫面**；因此未證明 54 個 alias 都是該 app 實際使用的標籤。這是未驗證，不是說官方文件不存在 |

五組等值關係均可由 BIPM 的十進位前綴直接推導 [S9]，程式的五組表沒有發現倍數錯誤：

| 相同分析物的寫法 | 推導 |
|---|---|
| μIU/mL ＝ mIU/L | 10⁻⁶ IU／10⁻³ L ＝ 10⁻³ IU/L |
| mIU/mL ＝ IU/L | 10⁻³ IU／10⁻³ L ＝ IU/L |
| ng/mL ＝ μg/L | 10⁻⁹ g／10⁻³ L ＝ 10⁻⁶ g/L |
| pg/mL ＝ ng/L | 10⁻¹² g／10⁻³ L ＝ 10⁻⁹ g/L |
| IU/mL ＝ kIU/L | IU／10⁻³ L ＝ 10³ IU/L |

這只是相同數值的單位寫法；不表示不同分析物、測量方法或 assay calibration 可互換。`pmol/L` 不當成 `ng/dL`、`ng/mL` 不當成 `ng/dL`，以及不同單位直接加在文字值後、不做換算，均符合 D2。大小寫一律忽略是現有規格的決定，不應把它擴張為通用 SI 單位 parser（例如 M 與 m 的意義不同）。

### 4.2 分類

- BI-RADS 0／1／2／3／4A–4C／5／6 的名稱及區分有 ACR 原始參考 [S2]。對到既有 b12、b3、b0、b45，以及 6 無現有 preset 時不硬套，均符合此階段範圍；不代表 1 和 2、4A 和 5 在臨床上等同。
- Lung-RADS 的 0、1、2、3、4A、4B、4X 及 S 可由 ACR v2022 表和 notes 14–15 核對 [S1]。S 不改變基礎類別的這種欄位對應合理，4X 進既有 l4b 也符合使用者決定；不能因此丟掉 S 所代表的原文發現。
- ATA high／intermediate／low suspicion 用於結節超音波 pattern；very low／pure cyst 的追蹤還有大小與既往 FNA 等脈絡 [S3]。不把 TI-RADS 自動轉 ATA、不由息肉敘述推大腸鏡分類，符合 D1。實際解析仍有 D-04、D-12 缺陷。
- 正常入口的分類確認關卡存在、submit 也檢查 pending；**D-01 證明這個保證不能涵蓋所有操作路徑**。

本次沒有重訂既有追蹤間隔、癌症處置或抽血時機；它們不是這批差異新增的內容。

### 4.3 提示詞、個資與儲存邊界

`shotPrompt` 明確要求照原文抄寫、不翻譯／換算／補字、不做判讀、只抄報告明寫的 class、不抄個資，**沒有要求診斷或治療建議**。選 report 的七個 exam 代號是辨認報告種類，符合規格。

但「同一個檢驗在兩張截圖重複出現時，只列一次」（`:979`）沒有明講需同日、同院、同值、同單位。建議刪除這項模型端去重，或限縮為確定相同的一列，讓固定規則處理去重與衝突；否則可能在 `groupShot` 看見之前就少資料。這是提示詞風險，**本次未測量真實模型是否／多久會發生**，不將推測寫成已重現的程式缺陷。

模型只能看到這個靜態 prompt 與所選圖片，沒有給工具或附帶資料庫中的體重、用藥、診斷。頁面不儲存原圖、不將草稿寫入 DB；圖上的個資在裁切前仍會送平台，回傳文字也不等於已去識別化（D-11）。runtime 的回覆快取是平台行為，不能把「本頁不寫圖」解釋成平台完全不保留任何資料的保證。

### 4.4 sample 0.2.94

| 項目 | 核對結果 |
|---|---|
| 呼叫形狀 | prompt 為第一參數；images 是 Blob 陣列；default tier、不指定 model；合法 |
| 能力與限制 | 沿用 C：images、JPEG、maxCount≥1 才顯示；取 min(maxCount,6)；沒有擅自假定 runtime 一定收 6 張 |
| 圖片處理 | 可接受且大小符合的原檔直接送；其餘轉 JPEG；長圖警語存在。contract 另有 10,000px／64MP 等拒絕條件，mock 不完整，不能把其成功當平台保證 |
| 快取 | 首次省略 cache；錯誤畫面的「再讀一次」傳 false 正確。sample 成功但頁面解析失敗仍可被平台快取，程式的 retry=false-cache 有處理；成功但讀錯的缺口見 D-13 |
| cancel／同意 | 每次新建 controller、傳 signal、停止 abort、不自設 timeout；未接 sample 的載入不詢問同意。讀取中關面板不中止，符合 D 規格。未在本次實測真正平台同意視窗 |
| 錯誤碼 | 覆蓋 contract 的 19 碼；unknown→upstream_error；BUG／HIDE 分組、invalid_json→invalid、無自動重試，符合 C／D 特例；images_unavailable 共用 sampleOff 隱藏照片功能符合本 app 的範圍 |
| 部分回覆 | 不採用 truncated；失敗不產生新草稿或寫 DB；不顯示 e.text，因此 refused 無部分文字殘留。一般 upstream 的部分內容不保留，是此完整 JSON 表單的合理取捨 |
| 自訂 JSON parser | 呼叫 sample 再自己解析是合法的；但不能據此聲稱與 json() 相同行為，D-10 的多 fence 情境不同 |

BUG 類錯誤的文字雖說「手動填寫」，`renderShotBox` 仍讓人重新選圖；這與 D §4.5「只能手動填」的文字略有落差，但沒有自動重試，也沒有造成寫入，優先度低於本報告的資料與狀態問題。

## 5. 建議修正順序

先處理 D-01／D-02 的表單生命週期與存檔身分，再做 D-03／D-08 的可修改草稿保存；這幾項修好後，分類確認與 labMeta 保留才有穩定基礎。同時收緊 D-04，修掉 D-05 的整筆誤去重。之後補 D-06–D-13 的資訊保留、parser、去個資與重讀，並把 D-15 的反例留成回歸測試。D-14 可單獨修正文句。

現有 records 整份匯出／按 id 覆蓋匯入的方式會保留新增欄位，本次實際 round trip 正常；`importLoses` 也按規格偵測頂層 labMeta／shot 消失。它不偵測「備份仍有 labMeta 物件、但少了部分 key」等部分回退，這是目前提示範圍的限制，不能宣稱已防住所有 metadata 遺失。

## 6. 原始來源

以下均於 2026-11-02 查核；臨床主張依學會原始分類／指引及提供檢驗的機構目錄，沒有用搜尋摘要代替分類規則。這些來源支持名稱與規則，不證明本 app 的 OCR 準確率。

- **[S1] ACR Lung-RADS v2022 原表**，尤其 notes 14（4X）、15（S）：<https://www.acr.org/-/media/ACR/Files/RADS/Lung-RADS/Lung-RADS-2022.pdf>。
- **[S2] ACR BI-RADS 原始 quick reference 的 assessment categories**：<https://cs.acr.org/-/media/ACR/Files/RADS/BI-RADS/BIRADS-Reference-Card.pdf>；ACR 乳房超音波報告要求：<https://accreditationsupport.acr.org/support/solutions/articles/11000067043-reporting-breast-ultrasound>。引用於此的是 category 定義，不將乳房 CT 自行當成 ACR 標準影像模態。
- **[S3] Haugen et al. 2015 ATA thyroid nodule／DTC guidelines**，Table 6、Recommendations 23／24 與 recurrence risk 章節，doi:10.1089/thy.2015.0020：<https://pmc.ncbi.nlm.nih.gov/articles/PMC4739132/>。
- **[S4] Mayo T3 total 與 free 分開的原始檢驗目錄**：<https://www.mayocliniclabs.com/test-catalog/Overview/800093>、<https://www.mayocliniclabs.com/test-catalog/overview/621321>；屏東基督教醫院 FT4 檢驗文件（含 hTSH 用語）：<https://www.pch.org.tw/upload/depart/43/files/pdf/ft4.pdf>。
- **[S5] Mayo TPO／TgAb／Tg 目錄**：<https://www.mayocliniclabs.com/test-catalog/overview/81765>、<https://www.mayocliniclabs.com/test-catalog/Overview/84382>、<https://www.mayocliniclabs.com/test-catalog/Overview/801726>；SickKids Anti-TPO 檢驗的 microsomal 名稱解釋：<https://www.sickkids.ca/en/care-services/for-health-care-providers/lab-tests/608-Anti-TPO-Antibody-plasma-or-serum/>。
- **[S6] Mayo E2、LH、AMH、PRL 目錄**：<https://www.mayocliniclabs.com/test-catalog/Overview/81816>、<https://www.mayocliniclabs.com/test-catalog/Overview/602752>、<https://www.mayocliniclabs.com/test-catalog/Overview/608824>、<https://www.mayocliniclabs.com/test-catalog/Overview/800091>。FSH 與 LH 的不同命名亦見 LH 目錄；這裡沒有據它推導任何參考範圍。
- **[S7] Oxford University Hospitals 的 progesterone 檢驗目錄**，別名 P4：<https://www.ouh.nhs.uk/biochemistry/tests/tests-catalogue/progesterone/>。
- **[S8] Mayo total testosterone 原始檢驗目錄**：<https://www.mayocliniclabs.com/test-catalog/overview/8533>。
- **[S9] BIPM SI prefixes**：<https://www.bipm.org/en/measurement-units/si-prefixes>。五組等值關係是本審查使用其前綴定義所做的量綱推導，不冒稱 BIPM 有逐項列出這五組臨床檢驗單位。
- **[S10] repo 內的 runtime 原始型別**：`docs/contract/0.2.94/sample.d.ts`，重點為 `sample.json` 說明、`SampleOptions.images`／`signal`／`cache`、`SampleLimits`、`SampleErrorCode`。本文只主張與這份 contract 的符合程度，沒有查到或假定正式 Artifact 此刻實際回報的 runtime 版本與 limits。
