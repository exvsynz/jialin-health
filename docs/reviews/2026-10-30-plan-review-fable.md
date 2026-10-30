# 「家琳健康追蹤」擴充規劃：獨立審查

審查日期：2026-10-30。審查對象：將既有「定期檢查追蹤」artifact 擴充為六分頁（今天／體重體脂／用藥／運動／飲食／檢查追蹤）的四階段規劃。審查立場是產品設計與健康資訊系統，臨床陳述附文獻出處；查不到的地方會直說。

## 0. 先指出規劃裡一個沒被講明的矛盾

背景寫「資料由使用者本人輸入（家琳不需要自己操作）」，目標卻是「融入家琳的日常」。這兩句話同時成立的唯一方式，是先生每天早晚替太太記體重、服藥、運動、飲食照片。換句話說，這套系統的採用率不取決於家琳，而取決於先生能否連續數月、每天兩次，向太太詢問並轉錄資料。這比太太自己按一個鍵的摩擦更高，而且把「監測」的社會關係放進了夫妻之間（見第 5 節）。整份規劃的每日項目（體重、服藥、運動、飲食）都應以這個前提重新估算成本；只有「檢查追蹤」與「回診摘要」是先生輸入天然合理的部分。

若家琳有 claude.ai 帳號，artifact 的存取規則允許編輯者讀寫，最省摩擦的做法是把她加為編輯者，讓她自己按「已吃藥」；先生只負責檢查資料與回診整理。這是我對整體架構的第一個建議，後面的評估都假設至少朝這個方向調整。

## 1. 整體架構：單一 artifact 多分頁 vs. 其他方案

單一 artifact 的優點是真實的：資料在自己手上、無廣告與訂閱、結構完全依需求（BI-RADS、Lung-RADS、ATA 型態、USMSTF 這些分類在任何現成 App 裡都找不到）、可以呼叫 Claude 做摘要。這些優點全部集中在「檢查追蹤／回診摘要」這一類低頻、高資訊密度的資料上。

缺點也很具體：沒有推播、不能讀體重計或 Apple 健康、照片要手動上傳、每次開啟是一個網頁而不是桌面圖示。這些缺點全部集中在「每日紀錄」這一類高頻、低資訊密度的資料上。體重、服藥、運動恰好是現成工具已經做到近乎零摩擦的領域：有藍牙的體重體脂計踩上去就同步到廠商 App 與 Apple 健康；iOS 的「用藥」功能有推播、可記漏服、有服藥率；運動由瑜珈教室的預約或手錶自動帶入。

我的判斷是混合架構：artifact 作為「病歷層」（檢查追蹤、TSH 與劑量歷史、回診摘要、週／月回顧），每日「行為層」盡量交給手機原生工具或體重計 App，再以低頻方式（例如每週一次貼上或匯入 CSV）進入 artifact。若堅持自建每日紀錄，也應把它壓縮成一個畫面、一到兩個按鍵，而不是四個分頁。多分頁本身不是問題，問題是每個分頁都代表一組要每天餵養的欄位。

## 2. 採用率與每日摩擦

飲食自我監測的衰退曲線在文獻裡非常一致。Turner-McGrievy et al. (2019) 在兩個 24 週減重試驗中發現，不論用 App、穿戴裝置或照片，第 10 週後就不到一半的人還在記錄；照片組在前四週平均記 40 次進食，到第 13–16 週只剩 10 次。一篇 2026 年收錄 68 篇研究的 JMIR mHealth 回顧指出，MyFitnessPal 使用者的自我監測從第 4 週的每週 5.4 天掉到第 12 週的 1.4 天。更值得注意的是 Silverman et al. (2022) 的田野研究：人們「預期」拍照記錄比打字輕鬆，所以更願意採用，但實際上拍照更難、記得更少、更早放棄。這直接對應規劃第三階段：飲食照片是整套規劃裡最可能「撐不過一個月」的部分，而且它的失敗會拖垮其他分頁（打開頁面看到一整排空白的飲食格子，是放棄的經典觸發）。

早晚量兩次體重體脂，我認為是負擔而非價值。晚間數值受當天進食、飲水、排汗支配，而不是脂肪變化；Dittmar et al. (2002) 的多頻 BIA 研究明確建議以早晨值作為代表值。BIA 體脂在一天內的漂移更大：Slinde & Rossander-Hulthén (2001) 讓受試者吃三餐相同的餐點，女性的計算體脂在同一天內最高與最低相差 2.3 個百分點，單一受試者可相差 13%，隔夜空腹後才回到基線。晚上那條線會是一條比早上更吵的線，7 日平均也救不回來，因為噪音來源是系統性的（吃了多少、喝了多少），不是隨機的。早晨一次、排尿後、早餐前、相同衣著，就是最接近研究條件的量法。

還有兩個噪音來源規劃沒有處理。第一是月經週期：Kanellakis et al. (2023) 每週兩次量測 42 位女性，月經期體重比週期第一週高約 0.45 kg，幾乎全來自細胞外水分；Tomazo-Ravnik & Jakopič (2006) 則觀察到黃體期最高。沒有週期標記的體重曲線，會讓人把水分波動讀成體脂變化。第二是消費級體脂計的絕對準確度：Frija-Masson et al. (2021) 以 DXA 為標準比較三款智慧體重計，體重誤差中位數 0–0.3 kg，但脂肪量低估 2.2–4.4 kg；他們的結論是智慧體重計不應用於身體組成評估。體脂數字只適合看「同一台、同一時段、同一條件下的趨勢」，不適合看絕對值，頁面應把體脂圖的 y 軸設計成相對變化而非絕對百分比，避免每天為 0.3% 的差異焦慮。

減少每日摩擦的具體做法：把「今天」做成唯一的每日畫面，上面只有兩件事，早晨體重（預填昨天數值，滑一下微調）與「已服藥」一鍵；兩者綁成一個習慣堆疊，因為 levothyroxine 本來就要空腹吃，量完體重接著吃藥，一次操作。運動改成三個大按鈕（瑜珈 60 分／皮拉提斯 60 分／其他），按下即存，不問強度，備註可選。週與月的回顧放在同一頁下方，不另開分頁。缺記錄的日子以「空白」而非紅色警示呈現，補記允許但不催促。

## 3. 資料模型與技術風險

每天一份文件本身沒有問題：一年 365 份，離 25,000 份上限很遠。風險在兩個地方。

第一是併發覆寫。若先生在電腦、太太在手機同時操作同一天的文件，而寫入是整份替換，後寫者會蓋掉先寫者；這在「早上太太按已服藥、先生稍後補登體重」的情境下幾乎必然發生。寫入應使用合併語意（只更新變動欄位），或把高頻子項目（每筆飲食、每筆運動）拆成以時間戳為鍵的獨立文件，日文件只保存當日彙總。

第二是縮圖內嵌。160 px JPEG 約 5–10 KB，base64 後 7–14 KB，一天五張約 50–70 KB，單份 256 KiB 的上限看起來夠，但只要某天聚餐拍了十五張就會逼近上限，而且每次讀「今天」都要下載整天的縮圖。縮圖應另存文件或直接存為小型 asset，日文件只放參照。

照片容量策略的問題在於它建立在兩個未知數上：asset 的總容量與檔案數上限都「數值未知」。規劃選擇「八成時提示清理」，但不知道分母就無法算八成；執行期可讀 usage 的話，第一步應該是上傳幾張測試照、讀出 usage 的欄位與單位，再決定策略。更根本的問題是：既然熱量、描述、縮圖都保留了，原圖 90 天後幾乎沒有再被看的價值，那為什麼要存原圖？我建議預設不保存原圖：前端壓縮後送 Claude 估算，只留縮圖與結果；原圖保存改為每張可勾選的例外。這樣容量問題、清理按鈕、以及「不可自動刪除 asset」的規範衝突一次消失。

資料遺失風險被低估了。所有資料只存在一個 artifact 的資料庫裡，沒有版本、沒有異地備份；一次錯誤的批次寫入、一次誤刪、或平台端任何問題，就是全部。CSV 匯出排在第四階段，等於前三個月的資料裸奔。一鍵「匯出全部 JSON」應放在第一階段，而且既有的檢查追蹤資料現在就該先匯出一份。

排程任務依賴則是第四階段的前提而非細節。「能否在排程中讀取 artifact 資料庫尚待實測」意味著整個提醒設計可能不成立。這應該是一個半小時的 spike：建一個排程任務，讀一份測試文件，看它能否成功、是否需要核准、推播長什麼樣。在這個結果出來前，不應設計任何依賴它的流程。

## 4. 提醒設計

每天兩個排程任務，一年 730 次全新工作階段，每次耗額度，只為了回答「今天有沒有記」。這個問題手機鬧鐘可以免費、準時、不需核准地回答。更重要的是，推播會送到先生的 Claude App，而要被提醒的人是家琳；先生收到「家琳還沒記晚上體重」再轉告太太，這是通知疲勞的最壞形式，因為疲勞的是兩個人。

誤報風險也需要正視：排程任務若讀取資料庫失敗，「讀不到」與「沒有紀錄」必須被區分，否則每次網路或權限問題都會變成一則「你今天沒量體重」。而且每天兩次的催促訊息在行為科學上是雙面刃；Tailored prompting 的研究顯示配合個人習慣時間的提示比固定時間有效（Richards et al., 2024），但那是研究期間幾天的事，長期每日催促沒有證據支持。

建議：每日提醒全部交給手機（iOS 用藥提醒或鬧鐘），排程任務只留一個，每週日一次的週報，內容是 7 日平均體重變化、服藥率、運動分鐘、下一個到期的檢查。這是排程任務真正有價值的地方：它能讀資料、能算、能用自然語言摘要，而這些手機鬧鐘做不到。若之後真的想要缺漏提醒，改為「連續兩天沒有任何紀錄才通知」，一天一次最多，而且只在傍晚。

## 5. 臨床與心理面

### 5.1 體重、體脂與照片熱量的心理風險

規律自我量體重在多數人身上沒有心理傷害，這點有相當一致的證據：Zheng et al. (2015) 的系統性回顧與 Benn et al. (2016) 的統合分析都未發現自我量體重與情緒、身體態度或失調飲食的關聯，後者只在心理功能（自尊、壓力）上看到很小的負向關聯（r = −0.08）。但這些研究的對象幾乎都是尋求減重治療的過重或肥胖成人；VanWormer et al. (2008) 已指出，觀察到負面心理效應的研究多發生在非過重樣本，而 Pacanowski et al. (2023) 的回顧發現自我量體重者的體重相關壓力較高、身體滿意度較低。家琳做瑜珈、皮拉提斯、在意體重與體脂，描述上更接近後一類族群而非前一類。對這樣的人，每天兩次體重、體脂、再加上每餐拍照估熱量，是三層疊加的監測，而且由配偶執行。我不會說這一定有害，但規劃裡沒有任何一處問「這是家琳要的，還是先生要的」。這應該是第一階段試用結束時要明確問的問題，而且應該由家琳回答。

照片熱量估算的另一個問題是數字本身不可靠，卻看起來很可靠。Fridolfsson et al. (2025) 評估三個大型語言模型估算食物照片，ChatGPT 與 Claude 的熱量平均絕對百分誤差約 36%，而且所有模型都系統性低估，份量越大低估越多。O'Hara et al. (2025) 用 114 張國家飲食調查的餐點照片測試，食物辨識精確度 93%，但中大份量的重量估計與實際差異顯著，16 種營養素中 11 種被低估。Rodríguez-Jiménez et al. (2025) 顯示加入文字描述與食材資訊可以明顯改善，但那正是使用者不想做的事。這些研究的共同結論是：模型擅長辨識食物與「排序」餐點熱量高低（Spearman 相關約 0.65–0.81），不擅長給出準確的絕對值。每日總熱量會是一個偏低且偏差幅度不定的數字，在沒有熱量目標的情況下，它既不能指導行為，又會製造「我今天吃了 1,400 大卡」的虛假精確感。若保留飲食功能，輸出應改為區間或「輕／中／重」的分級，而非一個整數。

### 5.2 Levothyroxine 服藥紀錄：哪些欄位對回診真正有用

「已吃 50 mcg」一鍵記錄能產生服藥率，但服藥率在這個藥物上是比較弱的資訊，因為 levothyroxine 半衰期約七天，偶爾漏服一兩次對 TSH 影響有限；ATA 2014 指引指出穩態約需六週（Jonklaas et al., 2014）。對回診真正有決策價值的，是能解釋「TSH 為什麼變了」的欄位：

- **服藥與進食的關係**。ATA 2014 的建議是固定在早餐前 60 分鐘或睡前（晚餐後三小時以上）服用，弱建議、中等品質證據；指引整理的吸收由好到差依序為早餐前 60 分、睡前、早餐前 30 分、隨餐（Jonklaas et al., 2014）。Bolk et al. (2010) 的雙盲交叉試驗顯示睡前服用比早晨 TSH 低 1.25 mIU/L。因此紀錄不需要精確時間，只需要一個選項：「空腹早晨／睡前／隨餐或不確定」，以及這個模式是否在兩次回診之間改變過。
- **咖啡、鈣、鐵、制酸劑、大豆、高纖**。Benvenga et al. (2008) 顯示與濃縮咖啡同服使 T4 吸收曲線下面積下降 27–36%，間隔 60 分鐘後喝則無影響；ATA 2014 建議與碳酸鈣、硫酸亞鐵等間隔四小時（傳統做法，未經試驗驗證）。對一位可能補充鈣或鐵的女性，這一欄比服藥率重要。
- **劑量變更日期與理由、品牌或劑型變更**。這是規劃已有的，應保留。半顆 50 mcg 的切藥方式也值得記一次。
- **抽血前的生物素**。Li et al. (2017) 在健康成人每日服用 10 mg 生物素七天後，23 個使用生物素－鏈黴親和素技術的免疫分析中有 9 個出現干擾；競爭型分析（如 FT4）偏高、夾心型分析（如 TSH）偏低，兩者疊加會模仿甲狀腺亢進。FDA 在 2017 與 2019 年發布安全通訊；AACC 2020 指引指出 FDA 未給統一停用時間，需依檢驗廠商而定（Li et al., 2020）。美髮美甲類保健品常含高劑量生物素，抽血前應有一個勾選欄「近一週是否服用生物素／綜合維他命」。
- **抽血當天是否已服藥**。ATA 2014 引用資料指出服藥後約四小時血清 T4 與 FT4 會有約 15% 的暫時高峰（Jonklaas et al., 2014）；若抽血前剛吃藥，FT4 會偏高而 TSH 不受影響。這一欄讓 FT4 的解讀不被誤導。
- **TSH 複檢時機**。FDA 藥品標示建議劑量調整後 6–8 週測 TSH，穩定後每 6–12 個月；ATA 2014 寫 4–6 週。這可以直接接到既有的「下次檢查日期」邏輯：劑量變更觸發一個 6 週後的抽血提醒。
- **懷孕計畫**。若有懷孕可能，levothyroxine 需求會在早期明顯上升；這一題超出本審查範圍，但紀錄欄位應預留。

最後一個臨床提醒與體重分頁的敘事有關：Feller et al. (2018) 收錄 21 篇隨機試驗的統合分析顯示，亞臨床甲狀腺功能低下者使用甲狀腺素治療，BMI 差異為 0.2（95% CI −0.4 至 0.8），與安慰劑無差別，生活品質與甲狀腺相關症狀也無改善。規劃把 TSH 放在服藥時間軸旁是合理的，但若未來把體重曲線與 TSH 疊在同一張圖上，會暗示一個證據不支持的因果關係，應避免。

## 6. 建議刪除、延後、新增，與修訂後的分階段

**刪除**：晚間體重與體脂；每日兩次排程任務；原圖長期保存與「清理 90 天前原圖」按鈕；運動強度欄位；每日總熱量整數。

**延後**：飲食照片整體延後到體重與服藥已穩定運作兩個月之後，而且先以「照片＋一個字的標籤」試兩週，不估熱量；估熱量只在家琳自己說想要時加入，且以區間呈現。

**新增**：第一階段就有的一鍵匯出全部 JSON；排程任務讀資料庫的 spike；月經週期標記（一個按鈕，可選）；體脂圖改為相對變化；用藥分頁的「服藥模式」「干擾物」「生物素」「抽血前是否已服藥」欄位；劑量變更自動排 6 週後 TSH；家琳加為編輯者；第一階段結束的「家琳自己的回饋」作為繼續的門檻。

**修訂後的順序**：

- **第 0 階段（半天）**：匯出既有檢查追蹤資料；spike 排程任務讀取資料庫；上傳測試照讀出 asset usage 的實際數值；若家琳有帳號，加為編輯者。這三件事的結果決定後面所有設計。
- **第 1 階段**：單一「今天」畫面：早晨體重（預填昨日）、可選體脂、「已服藥」一鍵、三個運動大按鈕；下方 7 日平均曲線與 30/90 天切換；月經標記；JSON 匯出。暫停兩到三週，問家琳而非先生：這對你有用嗎、會不會讓你更在意數字。
- **第 2 階段**：用藥與回診摘要：劑量變更紀錄、服藥模式與干擾物、TSH／FT4 歷史與劑量時間軸並列、抽血前檢查清單（生物素、是否已服藥）、劑量變更自動排 6 週抽血；回診摘要頁一鍵產生可列印的一頁。這是 artifact 相對於任何 App 最有價值的部分，應該比飲食早做。
- **第 3 階段**：每週日一個排程任務產生週報（前提是第 0 階段 spike 成功），每日提醒交給手機；CSV 匯出與回診摘要的 Claude 口語摘要。
- **第 4 階段（可選）**：飲食照片，無熱量估算，試兩週；只保存縮圖與標籤，不存原圖；若家琳想要再加入區間式估算。

這個順序的邏輯是：先確定平台能做什麼（第 0），再做最輕、最可能活下來的每日習慣（第 1），接著做 artifact 獨有且對回診有實際價值的部分（第 2），把需要額度與平台能力的東西放在驗證之後（第 3），最後才是文獻上最容易失敗、心理風險最高的部分（第 4），而且只在當事人要求時做。

## 參考文獻

- Benn Y, Webb TL, Chang BPI, Harkin B. What is the psychological impact of self-weighing? A meta-analysis. Health Psychol Rev. 2016;10(2):187-203.
- Benvenga S, Bartolone L, Pappalardo MA, et al. Altered intestinal absorption of L-thyroxine caused by coffee. Thyroid. 2008;18(3):293-301.
- Bolk N, Visser TJ, Nijman J, Jongste IJ, Tijssen JGP, Berghout A. Effects of evening vs morning levothyroxine intake: a randomized double-blind crossover trial. Arch Intern Med. 2010;170(22):1996-2003.
- Dittmar M, Raschka CJ, Koch HJ. Effect of diurnal variation on body composition under consideration of selected chronobiological marker systems. Anthropol Rev. 2002;65:17-26.
- Feller M, Snel M, Moutzouri E, et al. Association of thyroid hormone therapy with quality of life and thyroid-related symptoms in patients with subclinical hypothyroidism: a systematic review and meta-analysis. JAMA. 2018;320(13):1349-1359.
- Fridolfsson J, Sjöberg E, Thiwång M, Pettersson S. Performance evaluation of 3 large language models for nutritional content estimation from food images. 2025. PMC12513282.
- Frija-Masson J, Mullaert J, Vidal-Petiot E, Pons-Kerjean N, Flamant M. Accuracy of smart scales on weight and body composition: observational study. JMIR Mhealth Uhealth. 2021;9(4):e22487.
- Jonklaas J, Bianco AC, Bauer AJ, et al. Guidelines for the treatment of hypothyroidism: prepared by the American Thyroid Association Task Force on Thyroid Hormone Replacement. Thyroid. 2014;24(12):1670-1751.
- Kanellakis S, Skoufas E, Simitsopoulou E, et al. Changes in body weight and body composition during the menstrual cycle. Am J Hum Biol. 2023;35(11):e23951.
- Li D, Radulescu A, Shrestha RT, et al. Association of biotin ingestion with performance of hormone and nonhormone assays in healthy adults. JAMA. 2017;318(12):1150-1160.
- Li D, Ferguson A, Cervinski MA, Lynch KL, Kyle PB. AACC guidance document on biotin interference in laboratory tests. J Appl Lab Med. 2020;5(3):575-587.
- O'Hara C, Kent G, Flynn AC, Gibney ER, Timon CM. An evaluation of ChatGPT for nutrient content estimation from meal photographs. Nutrients. 2025. PMC11858203.
- Pacanowski CR, et al. 2023 review of psychological impact of self-weighing, as summarized in Hallock R, Ufholz K, Patel N. Self-monitoring of weight as a weight loss strategy: a systematic review. Curr Cardiovasc Risk Rep. 2024.（原文未直接取得，引用自該回顧的轉述）
- Richards R, et al. Tailored prompting to improve adherence to image-based dietary assessment: mixed methods study. JMIR Mhealth Uhealth. 2024;12:e52074.
- Rodríguez-Jiménez M, Martín-del-Campo-Becerra GD, Sumalla-Cano S, Crespo-Álvarez J, Elio I. Image-based dietary energy and macronutrients estimation with ChatGPT-5. 2025. PMC12655113.
- Silverman J, Barasch A, Diehl K, Zauberman G. Harder than you think: misconceptions about logging food with photos versus text. J Assoc Consum Res. 2022;7(3).
- Slinde F, Rossander-Hulthén L. Bioelectrical impedance: effect of 3 identical meals on diurnal impedance variation and calculation of body composition. Am J Clin Nutr. 2001;74(4):474-478.
- Tomazo-Ravnik T, Jakopič V. Changes in total body water and body fat in young women in the course of menstrual cycle. Int J Anthropol. 2006;21:55-60.
- Turner-McGrievy GM, Dunn CG, Wilcox S, et al. Defining adherence to mobile dietary self-monitoring and assessing tracking over time. J Acad Nutr Diet. 2019;119(9):1516-1524.
- U.S. FDA. Testing for biotin interference in in vitro diagnostic devices; guidance for industry. 2020（引用 2017-11-28 與 2019-11-05 安全通訊）.
- U.S. FDA / DailyMed. Levothyroxine sodium tablets prescribing information, section 2.1 and dosage monitoring.
- VanWormer JJ, French SA, Pereira MA, Welsh EM. The impact of regular self-weighing on weight management: a systematic literature review. Int J Behav Nutr Phys Act. 2008;5:54.
- Zheng Y, Klem ML, Sereika SM, Danford CA, Ewing LJ, Burke LE. Self-weighing in weight management: a systematic literature review. Obesity. 2015;23(2):256-265.
- JMIR mHealth and uHealth. Calorie-counting apps for monitoring and managing weight: systematic review of 68 studies. 2026;14:e64139.
