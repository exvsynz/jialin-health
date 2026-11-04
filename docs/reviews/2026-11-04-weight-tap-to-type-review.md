# 體重「點數字直接輸入」獨立程式審查

審查日期：2026-11-04。

**結論：修正後合併。** 合法數字即時更新、同步聚焦及一般直接儲存路徑運作正常，但仍能重現非法輸入被中途合法值取代後寫入，以及刻度尺與待存值失去同步。另有「不失焦儲存 → 等待中換欄位 → 存檔失敗」的條件性錯值路徑。既有體重測試 **43/43**、體脂測試 **44/44** 通過，沒有涵蓋這些反例。iOS 真機上的鍵盤、全選與拖曳均**未驗證**；不能把 Chromium 通過當成 iPhone 已通過，也不能把 `setSelectionRange()` 不適用誤寫成 `select()` 必然失敗。

## 1. 範圍、方法與驗證結果

- Repo：`exvsynz/jialin-health`；受審分支：`feat/weight-tap-to-type`。
- 標的：`373dd5e986c456b805b69c6e414f48deeb12cede`，包含 `18de1c1`、`373dd5e`；差異為 `git diff fb0517d..373dd5e`，只有 `src/index.html`、`dev/weight-test.js`。
- 全文讀取 `CLAUDE.md`、`README.md`、`docs/specs/bf-fix.md`，並依委託指定的前次報告格式。這次需求優先：打字算確認，但只按儲存才寫入；沒有要求修改資料格式、撤銷或吸附。
- 逐項追蹤 `input/change/pointerdown/scroll/click`、`paintSheet`、錯誤旗標及存檔生命週期；使用 repo 的記憶體 mock、合成日期與數字在 Chromium 重現。額外腳本、日誌、截圖、瀏覽器與字型均在 repo 外。
- 僅新增本報告至新分支 `review/weight-tap-to-type-2026-11-04`。沒有修改 `src/`、`dev/`、規格、資料庫權限，沒有發布 Artifact，沒有讀取真實健康資料或呼叫真正的 Claude。

| 驗證 | 結果與限制 |
|---|---|
| `bash dev/check.sh` | 通過語法、禁用 API、外部來源檢查 |
| `node dev/weight-test.js` | **43/43** |
| `node dev/bf-test.js --no-shots` | **44/44** |
| `bash dev/test.sh --no-shots` | **完整通過，exit 0**；包含上述兩組及其餘既有回歸、頁面與 e2e 測試，沒有跳過失敗項目 |
| 額外 Chromium 狀態測試 | 重現 W-01、W-02、W-03、W-04；正常失敗恢復及修改後重試通過 |
| Chromium touch 輸入事件 | `locator.tap()` 直接存檔一筆、數字正確；CDP touch start/move/end 另重現 W-02，沒有直接指派 scrollLeft 或合成 scroll |
| 380×667、380×820，深／淺色 | 既有版面檢查通過；額外檢視展開兩輸入欄的四張截圖，水平溢出 0、面板垂直溢出 0；667 高儲存鈕底部 y=593、820 高 y=746 |
| iOS Safari、Android Chrome 真機；VoiceOver、TalkBack | **未驗證**。沒有 OS 螢幕鍵盤、真機安全區、輸入法或螢幕閱讀器可供實測 |

執行環境：Node 24.22.1、Playwright 1.62.1、Chromium 153.0.8010.0。第一次體重測試因缺少 Playwright 預設瀏覽器而無法啟動；之後在 repo 外解壓既有 `@sparticuz/chromium` 153.0.0，透過外部 Node preload 指定執行檔，並攔截 Google Fonts 請求供應同名字型 Noto Sans TC、IBM Plex Sans 的本機檔案。**沒有修改測試檔、mock 或任何斷言。** 上表為完成環境配置後的結果。無 OS 鍵盤的截圖不能證明鍵盤彈出後儲存鈕仍可見或 10 秒內可完成。

下文行號均以 **373dd5e** 為準。「高」依委託指可存錯值／重複存／未確認即寫入；「中」指操作、狀態或無障礙缺口；「低」指文字或樣式。條件性重現會明列前提，不將尚未驗證的真機行為包裝成已發生。

## 2. 發現總表

| 編號 | 嚴重度 | 問題 | 主要位置 |
|---|---|---|---|
| W-01 | 高 | 非法輸入切換欄位後被中途合法值取代，可存成 20.0 kg | `src/index.html:1584,1592–1593,1596–1597,1624–1632` |
| W-02 | 高 | 打字後碰尺啟動 180ms 捲動抑制，期間的使用者位移可丟失，尺與待存值不一致 | `src/index.html:1563,1613–1614,1629–1632` |
| W-03 | 高，條件性 | 無 blur 儲存、等待中換欄位、失敗後，舊尺範圍把輸入值改掉；重試存下錯值 | `src/index.html:1614,1629–1632,1639–1643` |
| W-04 | 低 | 非法輸入時只停用儲存鈕，仍顯示先前的「記下 …」數字 | `src/index.html:1588–1591` |
| W-05 | 中 | 新測試漏掉跨欄、抑制期間移動、失敗換焦點與寫入次數；不能支持真機與單次寫入保證 | `dev/weight-test.js:68–151` |

## 3. 各項問題與重現

### W-01｜高：非法輸入被中途合法值取代後仍可儲存

**位置：** `src/index.html:1584`、`:1592–1593`、`:1596–1597`、`:1624–1632`。

**重現（Chromium 實際點擊與鍵入，不改程式狀態）：**

1. 使用合成既有紀錄：體重 48.6、體脂 24.5。打開早上面板，點體重大數字。
2. 鍵入 `201`。鍵入過程的 `20` 合法，先成為 `ws.w=20`；最後的 `201` 超界，`ws.badW=true`、儲存鈕停用。
3. 點體脂大數字。失焦時出現「體重請填 20–200」，但隨後 `showKbd → paintSheet` 因體重欄已非 active element，將 `badW` 清掉，並把原輸入 `201` 改寫為 `20.0`。
4. 輸入體脂 `25`、按儲存。mock 實際資料為 `am:{w:20,bf:25,at:'08:00'}`。

此時不是原本 48.6，也不是使用者打完的 201，而是已被下一個字元取代的中途值。按儲存前大字與欄位確實已變成 20.0，因此不是聲稱「最後畫面仍是 201 卻存 20」；問題是系統擅自把錯誤草稿轉成另一個可存量測值，無須使用者修正該欄。`47.5 → 刪成 4`、體脂 `2e → 切回體重` 也有相同的「失焦後下一次 paint 抹除錯誤草稿」機制。

**原因：** `badW/badBf` 的生命週期取決於焦點，而不是草稿是否已修正；`ws` 又持續保留輸入過程中最後合法的數字。`change` 遇到非法值只 toast、沒有讓後續 paint 保留草稿。

**建議：** 將編輯字串與最後合法數字分開保留；離開欄位不能當成錯誤已消失。兩欄任一草稿無效時，儲存仍停用，直到該欄被修正，或使用者明確以尺／步進／取消輸入替換。儲存 handler 再檢查同一份有效性狀態，避免只依賴 DOM `disabled`。不需修改持久化格式。

### W-02｜高：短手勢落在抑制視窗，刻度尺與待存值分離

**位置：** `src/index.html:1563`、`:1613–1614`、`:1629–1632`。

**重現（Chromium 中控制時序的合成捲動）：**

1. 從 48.6 打開體重欄，輸入 `50.2`，保持焦點。此時 `ws.w=50.2`，尺仍在原範圍與位置。
2. 對 `#ruler` 送 `pointerdown`，觸發 `blur → change → rebuild`。
3. 等 35ms（第一個 rAF 已置中、仍在 180ms 抑制內），把 `scrollLeft` 加 120px（十格／1.0 kg），送 `scroll`；之後不再移動。
4. 再等 240ms。實測：`R.sup=false`，`scrollLeft=1320`，尺的值 `R.min+scrollLeft/120=51.2`；但大字、輸入欄、儲存鈕、`ws.w` 都仍是 **50.2**。按儲存寫下 50.2。

可用既有 harness 開啟面板、完成步驟 1 後重現核心時序：

```js
await page.dispatchEvent('#ruler', 'pointerdown');
await new Promise(r => setTimeout(r, 35));
await page.evaluate(() => {
  const r = document.querySelector('#ruler');
  r.scrollLeft += 120;
  r.dispatchEvent(new Event('scroll'));
});
await new Promise(r => setTimeout(r, 240));
// 比較 ws.w 與 r1(RL.w.min + ruler.scrollLeft / 120)，應相同。
```

**另外以瀏覽器觸控事件重現：** 在尺寬的 70%、高度中央送 CDP `Input.dispatchTouchEvent(touchStart)`，25ms 後向左移 39px，停留 300ms，再 touchEnd，等待 400ms。瀏覽器實際捲動 24px；唯一 scroll 在開始後約 81ms、`sup=true` 時發生。放手後尺為 **50.4**，ws／欄位／儲存鈕仍為 **50.2**。向左 27、51、63px 也各得到尺 50.3、50.5、50.6，而 ws 仍為 50.2。這組測試沒有指派 scrollLeft，也沒有 dispatch 人工 scroll；瀏覽器本身產生捲動。

**證據界線：** 這證明程式會丟掉抑制期間最後一次位移，且解除抑制時不做 reconciliation；不是宣稱真機每次拖曳都會錯。另一次快速放手的 CDP 手勢，以及位移 28px 後需要再吸附的手勢，因後續捲動事件而最終有同步。真機發生頻率及手指下的實際跳動**未驗證**。`pointerdown` 引起的重建與下一個 rAF 置中，確實可能在手勢已開始後執行；來源碼沒有等待 pointerup。

**建議：** 區分程式置中事件與使用者捲動，不能將固定 180ms 內的所有 scroll 都丟棄。完成重建後應核對最後位置，或在手勢結束／scrollend 做一致性收斂；同時避免 rAF 在進行中的拖曳覆寫位置。保留既有 0.1 格吸附規則，不需改吸附精度。至少將 0–200ms 的位移及抑制結束後的一致性加入回歸測試。

### W-03｜高，條件性：存檔失敗時，未重建的舊刻度尺可改掉草稿

**位置：** `src/index.html:1614`、`:1629–1632`、`:1639–1643`。

**重現（沿用新測試本身的「無 blur 儲存」模型）：**

1. 合成今天紀錄 48.6／24.5；mock 設 `latency:500`、`failNext:{code:'quota_exceeded',count:1}`。
2. 點體重，輸入合法 `150`。透過 `document.querySelector('#wsSave').click()` 儲存，保持體重焦點，因此尚未觸發 `change/rebuild`；尺還是以 48.6 建立的舊範圍。
3. 儲存等待中點體脂大數字。唯讀保護仍有效，但允許換焦點；體重的 `change` 因 `ws.saving` 直接 return，沒有補建尺。
4. 寫入失敗，`finally` 只 `rulerTo('w',150)`，沒有重建範圍也沒有抑制這次捲動。超出舊尺範圍的 scrollTo 被夾到邊緣，接著 scroll handler 將值寫回 `ws`。
5. 實測失敗後三者一致地變成 **57.2**（不是 150），錯誤提示只有「沒有存到，請再試一次」。按重試，實際 DB 為 `w:57.2`。57.2 是此 viewport／舊尺邊緣的結果，不是固定的業務常數。

**證據界線：** 合成的無 blur 儲存可重現；不是聲稱 Android 的一般觸控必然走這條路。一般 Chromium 滑鼠／tap 儲存會先 change，該路徑測到 readOnly 正確、失敗後仍為 50.2、解除唯讀後可改成 51.3 並成功重試。iOS 是否不先 blur，須真機確認；但既然這次特別支持且測試無 blur 儲存，這個分支的失敗恢復也應完整。

**建議：** 儲存前或失敗恢復時，確保 ruler 範圍包含目前草稿並以受保護的重建方式同步；不能直接把未重建的尺捲到新值，再讓 scroll 反向改草稿。保存失敗應保留原使用者輸入與有效性，不把尺當成較新的資料來源。保留 `my`／`mine()` 的面板身分檢查。

### W-04｜低：停用儲存鈕仍顯示已失效的待存文字

**位置：** `src/index.html:1588–1591`，尤其 `else if(ws.badW||ws.badBf){btn.disabled=true}`。

**重現：** 輸入 `47.5` 後連續退格至 `4`；最後合法中間值是 47.0，停用的按鈕仍寫「記下 47.0 kg…」。`201` 案例則顯示「記下 20.0 kg・24.5%」；體脂 `2e` 仍顯示先前的體脂數字。舊文字不代表真的已寫入，但會與正在編輯的內容衝突，尤其淡化後不容易看出原因。

**建議：** 沿用同一顆按鈕改為簡短狀態，例如「請修正體重」／「請修正體脂」，不要新增常駐說明段落；有效後再恢復確切待存值。可配合 `aria-invalid` 與錯誤關聯，避免只能從灰色推知原因。

### W-05｜中：測試通過尚未涵蓋新增的事件與狀態承諾

**位置：** `dev/weight-test.js:68–151`；相關共用 `dev/harness.js:44–45` 仍只使用 Chromium 行動 viewport。

**重現／證據：** 原檔 43/43 通過，同一標的同時可重現 W-01–W-04。新增測試並非全無效：逐字輸入 `4` 再 `8.6`、確認值恰為 `48.6` 的斷言，確實能在 Chromium 抓到沒有取代舊值；沒有必要把它改成直接 fill。

| 測試位置 | 現有缺口 | 建議補強 |
|---|---|---|
| 75–82 | `kbdShown && kbdFocused` 只證明 DOM 顯示與焦點，未證明 iOS OS 鍵盤已出現；只檢查體重按鈕名稱包含一段字 | 保留逐字替換測試；兩個按鈕都檢查角色、數值、未記狀態；另列真機鍵盤／全選驗收 |
| 106–112 | 非法輸入只在焦點不變時試存，沒有跨欄或收起再展開 | 加 `201 → bfBig → 儲存`、`47.5 → 4 → 另一欄`；確認原草稿保留、儲存仍停用、零寫入 |
| 115–121 | pointerdown 後等 300ms，已跳過 180ms 危險視窗；只有補送 scroll，沒有真正位移；僅檢查失焦與大字 | 在 rAF 前／後與抑制中移動，最後比對尺中心、輸入欄、大字、save label、實際 payload；需有一次真機短拖曳 |
| 123–127 | `2e` 只斷言停用，raw 只是 detail；沒有明確斷言 `badInput===true`，也未測換焦點後 | 分別斷言 `value===''`、`badInput===true`、零寫入；另測真正清空的 `badInput===false`、原有 bf 的保留 |
| 129–131 | 只看最後 DB 值；兩次寫入相同值也會通過；沒記錄事件順序 | 對既有 day 文件斷言恰一筆 update，並記錄真實 click/tap 事件；加入首筆、晚上估計值與邊界值 |
| 整段新增測試 | 沒有慢存、唯讀輸入、失敗＋換焦點、重試的斷言 | 加 W-03；同時保留正常先 blur 路徑的正向案例，檢查 failure 前後 raw／ws／按鈕及 payload |
| 版面／無障礙 | 自動 scan 測尺寸／顏色，不測 OS 鍵盤遮擋、朗讀次數、全選或拖曳；部分比較用 startsWith/includes | 不把這些當成真機已過；涉及完整數字與標籤的關鍵斷言改用精確預期值 |

「最多只寫一次」應以 mock 寫入紀錄驗證，不能由最終值相等推導；新開文件還有既有的租約／verifyCreate 行為，需區分建立與後續驗證，避免把它們一概算成重複記錄。

## 4. 指定問題的核對結論與未驗證範圍

### 4.1 直接儲存：Android 與 iOS 分開看

**Android Chrome：推論有利，真機未驗證。** Blink 的實際 Chromium touch 模擬記錄為：`pointerdown → pointerup → mousedown → change(kbdIn) → blur → focusout → mouseup → click(wsSave)`。這與題目假設的 `blur → change` 並不完全相同；重點是合法輸入在此前的 `input` 事件已同步更新 `ws` 並啟用按鈕，change 再寫同一個值、重建尺，click 擷取 payload。本次 tap 存到 50.2、只有一筆 day update；沒有重按。OS 鍵盤收合、hit target 位移及不同 Android 輸入法仍未測。

**iOS Safari：真機未驗證。** 原始碼的 `click → showKbd → focus → select` 全在同一同步呼叫堆疊，中間沒有 await、timer 或 rAF；符合保留使用者手勢的要求 [S5]。對儲存不能假定每個版本都先讓按鈕取得焦點。若先 change，合法值路徑與上述相同；若沒有 blur，input 已更新 ws，因此成功儲存仍不依賴 change。這也是 `saveNoBlur` 測試有價值的原因，但不代表它模擬了 iOS 鍵盤與觸控；無 blur 的失敗恢復有 W-03。

同一面板的 `my.saving` 與按鈕同步停用提供重入保護；這批差異沒有新增自動寫入，也沒有發現已重現的雙存。對非法草稿直接點原本 disabled 的按鈕，不應為了湊一次點擊而改成允許寫入；應修 W-01 的草稿生命週期。

### 4.2 `type="number"` 的 `select()` 不能直接判成 iOS 不支援

查證結果：WHATWG Number state **明列 `select()` 適用**；不適用的是 `selectionStart/End/Direction`、`setSelectionRange()`、`setRangeText()`。`select()` 的演算法在控制項具有可選文字時選取整段 [S1]。兩者不能混為一談。

本次另讀 WebKit 原始實作：`HTMLInputElement.idl` 暴露 `select()`；`NumberInputType` 繼承 `TextFieldInputType`；共用 `HTMLTextFormControlElement::select()` 聚焦後呼叫內部範圍選取。相較之下，JS 的 `setSelectionRangeForBindings()` 會先檢查 `supportsSelectionAPI()` 並可能拋例外 [S2]。這支持「number 並非必然無法 select 全選」，卻不能替代目標 iPhone／iOS／Artifact 容器的實測。

**判定：目前不能成立『iOS 必定接在舊值後面』的缺陷；也不能宣告真機已全選。** 應在目標機型以 48.6 起始，點大數字只鍵入 `4`，確認欄位恰為 `4` 且儲存停用，再補 `8.6` 應成 48.6。體脂已有值與未記時各測一次，包含首次喚起／再次開啟鍵盤。若全選失敗而變 48.64，現有一位小數 rounding 的確可能讓大字仍是 48.6；這是條件推論，不是本次觀察到的 iOS 結果。

**是否改 text：可以考慮，但不以錯誤的 API 前提要求必改。** `type="text" inputmode="decimal"` 能保留原始字串、使用標準 selection API，對 W-01 的草稿模型較直接。改用 text 時必須一起做整串十進位格式與範圍驗證；目前的 `num()` 用 `parseFloat`，不能原封不動接受 `48abc`／`24e` 的前綴，也不能繼續依賴 number 的 `badInput`。`inputmode` 只是鍵盤提示，不是驗證。無論採哪種 type，真機鍵盤與全選都要驗收。

### 4.3 `badInput`、清空與錯誤旗標

`ValidityState.badInput` 在現代 Safari iOS 與 Chrome Android 都有 API 支援；MDN 維護的相容性資料列 Safari、Chrome 支援並讓行動版 mirror，WebKit `NumberInputType::hasBadInput()` 也會從可見編輯字串判斷非空且不能解析的內容 [S3]。因此加這個判斷方向正確，不能說 iOS 不支援。

本次 Chromium 鍵入 `2e` 實測 `value==='' && validity.badInput===true`，儲存停用、離開欄位出現範圍警告。**API 支援不等於所有行動鍵盤都會讓人打出同樣的中間字串**；數字鍵盤、硬體鍵盤、貼上、地區小數點在真機仍未驗證。以 script 指派 `.value='2e'` 會走字串清理，不能代替實際鍵入來驗證 badInput。

合法輸入會清掉對應 bad flag，正常修正後可立即存，未發現永久卡死。真正問題是 W-01：失焦後下一次 paint 太早清掉旗標。空體脂回復 `bf0/bfSaved`，本次不新增體脂；若該筆已有 bf 仍保留，符合前版規格的保留語義，並非清空已存體脂。

### 4.4 無障礙、觸控目標與點擊數

兩大數字是 `type="button"`，有動態名稱及既有 focus-visible 樣式；同步 showKbd 保留「用鍵盤輸入」入口。量到 `#wsBig` 約 137×51.2 CSS px、`#bfBig` 約 82×44；全域 `button{min-height:44px}` 生效。380 寬深淺色檢查通過，沒有新增說明段落。

**朗讀噪音屬未驗證風險，不列成已證實重複朗讀。** 每次有效 input 的 `paintSheet` 都重新設定兩個 live region 的 innerHTML 與 aria-label，即使另一個數字沒變。MutationObserver 實測一次退格加一字會對兩個按鈕各產生兩次 childList 及 aria-label 更新。`aria-live="polite"` 是在適當時機通知更新，不保證只讀一次；實際合併、標籤朗讀與鍵盤回音由 AT 決定 [S4]。建議只更新確實改變的內容，打字時避免同時播報兩個大數字；可把必要的尺值通知放在單一狀態區，於手勢停止後更新。不要只因加了 aria-label 就移除全部有用回饋。VoiceOver／TalkBack 實際朗讀**未驗證**。

依產品一貫不計每個鍵帽的計法，正常體重路徑為：今天入口 1、點數字 2、儲存 3，符合 **≤3 次點擊**；首次沒有體重時自動顯示輸入欄，通常只需入口與儲存。體脂是前版明訂的額外選填動作。這是操作步驟核算，並不是量測使用者打字、OS 鍵盤遮擋後仍能 **≤10 秒**；後者未驗證。

## 5. 建議修正及驗收順序

先修 W-01，讓草稿、有效性與最後合法數字不再依焦點互相覆蓋；再修 W-02／W-03，建立尺與草稿的單一同步規則。一起補 W-04 的短狀態文字與 W-05 的反例，不需要擴大成資料模型或介面重做。

合併前至少在一支實際使用的 iPhone Safari 與 Android Chrome，分別驗證：既有值點數字後第一個字取代全文、合法值直接一次儲存、非法草稿跨欄不被接受、鍵盤開啟時短拖尺不中途跳值、網路失敗後原值可重試。紀錄 OS／瀏覽器版本與寫入次數；螢幕閱讀器另外驗證連續打字與拖尺的通知量。這些是本次未驗證項目的具體驗收方式，不是聲稱兩平台目前已失敗。

## 6. 原始來源

以下於 2026-11-04 查核。標準與引擎程式碼支持推論；不作為真機通過紀錄。

- **[S1] WHATWG HTML：Number state 與文字選取 API。** [Number state](https://html.spec.whatwg.org/multipage/input.html#number-state-(type=number))；[select 演算法](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#dom-textarea/input-select)。確認 select 與 setSelectionRange 適用性不同，以及 number 的 bad input 定義。
- **[S2] WebKit 原始實作（讀取當時 main）。** [HTMLInputElement.idl](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLInputElement.idl)、[HTMLInputElement.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLInputElement.cpp)、[HTMLTextFormControlElement.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLTextFormControlElement.cpp)、[NumberInputType.h](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/NumberInputType.h)。讀取的 HTMLInputElement.cpp blob 為 `47c3a4523a5b231bdcfb3835ff207df55b576a8d`，HTMLTextFormControlElement.cpp 為 `45a1be1ff0d82434f716c410f7a323d4493421fe`；main 不等於使用者安裝的 Safari 版本。
- **[S3] badInput 的原始相容性資料與引擎實作。** [MDN browser-compat-data / ValidityState.json](https://github.com/mdn/browser-compat-data/blob/main/api/ValidityState.json)；[WebKit NumberInputType.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/NumberInputType.cpp)，讀取 blob `503e0084f09af8b73b033850884c023789d7840c`，`hasBadInput()`；[API 說明](https://developer.mozilla.org/en-US/docs/Web/API/ValidityState/badInput)。
- **[S4] W3C WAI-ARIA 1.2。** [aria-live](https://www.w3.org/TR/wai-aria-1.2/#aria-live)、[aria-relevant](https://www.w3.org/TR/wai-aria-1.2/#aria-relevant)。標準不保證不同 AT 會以相同次數播報動態內容與名稱。
- **[S5] WebKit Bug 195884，Apple／WebKit 維護者說明。** [Autofocus on text input does not show keyboard](https://bugs.webkit.org/show_bug.cgi?id=195884)，尤其 comments 4、6：網頁使用者手勢與 embedding client 主動執行 JS 的例外須區分；不能拿 WKWebView embedding API 的例外推論任意非同步網頁 focus 都會叫出鍵盤。
