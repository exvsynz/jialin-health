# Phase C 文獻查核：照片估算熱量的六篇研究

查核日期：2026-10-31。來源取自 PubMed／PMC（PubMed MCP `get_full_text_article`、`get_article_metadata`）。另以 Exa 讀取 MDPI 出版社頁面，補回 PMC 抽取時遺失的條列內容（只用於第 4 篇）。下文引文一律為原文英文短句，以「」標示，其餘為轉述。

讀取狀況一覽：

| # | 文獻 | 讀到什麼 |
|---|---|---|
| 1 | Fridolfsson 2025 | PMC 全文（圖表本身未隨文字抽出，但結果段已列出數值） |
| 2 | Chen 2025 | **只讀摘要**。PMC 全文工具只回傳摘要；pmc.ncbi.nlm.nih.gov、europepmc、ebi.ac.uk 都被本環境的網路設定擋下；Exa 只拿到書目與參考文獻，期刊頁面逾時 |
| 3 | O'Hara 2025 | PMC 全文（表 2 數值未隨文字抽出） |
| 4 | Rodríguez-Jiménez 2025 | PMC 全文（含表 2–5 數值）＋ MDPI 頁面（補回 2.1、2.6、2.7 節條列與附錄 C） |
| 5 | Nakagawa & Yamamoto 2026a | PMC 全文（表與補充資料未隨文字抽出） |
| 6 | Nakagawa & Yamamoto 2026b | PMC 全文（表與補充資料未隨文字抽出） |
| 附 | Isobe 2026（醫院餐） | PMC 全文（PMID 41901141，PMC13029357） |

---

## 1. Fridolfsson 2025（全文）

Fridolfsson J, Sjöberg E, Thiwång M, Pettersson S. Performance Evaluation of 3 Large Language Models for Nutritional Content Estimation from Food Images. Curr Dev Nutr 2025;9(10):107556. PMID 41081011；PMC12513282；doi:10.1016/j.cdnut.2025.107556

**設計（Methods）。** 比較 ChatGPT-4o、Claude 3.5 Sonnet、Gemini 1.5 Pro，三者用同一段提示，每張照片開新對話，2024 年 9 月執行。參考值的算法是：拍照前用校正過的電子秤秤重（熟食取煮後重量），再用 Dietist NET（引用 USDA 營養資料庫）換算熱量與營養素；三份市售冷凍餐則採用廠商標示，作者也承認標示可能不準。

**52 張的組成。** 方法段「Food items and reference values」寫的是：只有澱粉主食 9 張、蛋白質 9 張、蔬菜 4 張、完整餐 30 張。只有澱粉類與市售餐拍了小、中、大三種份量（小、大分別為中份的 50%、150%），蛋白質與蔬菜只拍中份。摘要的寫法是「individual food components (n = 16) and complete meals (n = 36)」，跟方法段的分法（22 + 30）對不上，原文自己不一致。

**A：36% 是什麼指標、指哪兩個模型。** 36% 是 MAPE（平均絕對百分比誤差）。結果段原文：ChatGPT 與 Claude 的「weight (36.3% and 37.3%, respectively) and energy (both 35.8%)」。所以「表現較好的兩個」是 ChatGPT-4o 與 Claude 3.5 Sonnet；熱量兩者都是 35.8%，重量是 36.3% 與 37.3%，兩項都約 36%，不是只有熱量。Gemini 的熱量 MAPE 是 64.2%。

**A：份量越大越容易低估。** 原文支持這個結論，摘要結果段寫「All models exhibited systematic underestimation that increased with portion size」，斜率在 −0.23 到 −0.50 之間。結果段也寫大份量出現「more extreme underestimation」。有兩點限定：
- 份量只在澱粉類上變化。
- 作者在討論段把部分原因歸給拍攝擺法：蔬菜一律放在最靠近鏡頭的位置，份量變大後，後方的澱粉與蛋白質被遮得更多（「became increasingly obscured with larger portions」）。

另外，ChatGPT 與 Claude 的整體平均偏差小，而且不顯著（重量 +7.5 g、+6.1 g）。

**C。** 全文沒有提到油、醬汁或湯。

**其他。** 結論寫這些模型「not yet suitable for precise dietary assessment in clinical or athletic populations」。討論段也建議多跑幾次推論，回報範圍而不是單一點估計。

## 2. Chen 2025（只讀摘要）

Chen YJ, Chang CC, Hoang YN, et al. Customized multimodal Diabot-GPT-4o enhances accuracy of image-based dietary assessments in dietetic trainees in Taiwan: validation against weighed food records. Am J Clin Nutr 2025;122(6):1836–1849. PMID 41138916；PMC12799367；doi:10.1016/j.ajcnut.2025.10.013

**樣本與參考標準。** 714 張照片，來自 57 名年輕成人（標題寫的是營養系實習生）的 3 天秤重飲食紀錄（WFR），共 171 天，在自由生活情境下收集。參考標準就是 WFR。摘要沒有說明 WFR 用哪一套食物成分資料庫換算營養素。

**四種設定。** DB、DBFN 是客製化的 GPT-4o，4o、4oFN 是未客製化的版本。FN 的定義是「inclusion of the food name input」，也就是多輸入食物名稱。

**B：FN 與「使用者補一句份量說明」是不是同一種介入。** 不是。摘要能確認的介入只有「加入食物名稱」，沒有提到測試份量描述。結論建議把輸入標準化，項目是「FN, cooking state, prompt structure, and configuration」，也沒有份量描述。全文有沒有測份量描述，目前無法確認。

**B：「加上食物名稱等資訊的設定較準」。** 原文的比較是：只用照片時，DB 辨識出 74% 的食物，4o 是 59%；客製化的 DBFN 優於 4oFN，在 ±10% 的等效範圍內就涵蓋了重量、熱量、脂肪等項目，並且「achieved the highest agreement with WFRs」。所以較準的是「客製化＋食物名稱」這組設定，草稿的「等資訊」說得比原文寬。

**B：誤差來源清單。** 原文是「Common errors at the human–AI interface included inaccurate portion-size estimates, obscured food visibility in images, poorly constructed prompts, omission or intrusion errors, and system-specific limitations」。草稿列的三項（份量估計、食物被遮住、提示不清楚）都在清單裡，但原文另有兩項：漏報或多報食物，以及系統本身的限制。結論還提到要專家把關 AI 幻覺，例如「fabricated items, units, or quantities」。

**C。** 摘要沒有提到油、醬汁或湯。脂肪估計的一致性較差（CV 24%）。

## 3. O'Hara 2025（全文）

O'Hara C, Kent G, Flynn AC, Gibney ER, Timon CM. An Evaluation of ChatGPT for Nutrient Content Estimation from Meal Photographs. Nutrients 2025;17(4):607. PMID 40004936；PMC11858203；doi:10.3390/nu17040607

**設計（2.2–2.3 節）。** 38 種餐點各拍 3 種份量，共 114 張，代表愛爾蘭全國成人營養調查實際吃下的份量。參考值是逐項秤重後，用 McCance and Widdowson 成分表（透過 Nutritics）換算。使用的是 ChatGPT-4 的一般帳號聊天介面，不是 API；同一份量的照片放在同一個對話裡。2.2 節也寫到，部分食物被其他食物遮住，例如湯、三明治、沙拉。

**D：食物辨識。** 3.1 節：精確度（precision）93.0%，召回率 84.6%，F1 88.6%，草稿說法正確。補充一點：漏認 84 項，比誤認多出的 35 項多。

**D：份量。** 3.2 節：小份量的估計重量與實際沒有顯著差異（p = 0.221）；中、大份量明顯低估（p < 0.001），大份量的平均值是 798 g 對 530 g。114 張裡有 87 張（76.3%）重量被低估。草稿的「中大份量重量估計差」正確。

**D：營養素低估。** 16 種營養素有 11 種被低估。但熱量本身的百分比差只有 0.1%，在 ±10% 以內。所以「多數營養素低估」正確，但不能延伸成「熱量也被低估」。表 2 的數值沒有隨文字抽出，熱量差異是用哪一種集中趨勢計算的，原文段落沒有寫清楚。

**C：部分相關。** 3.6 節記錄了 ChatGPT 自己的提醒，例如「assumes the butter is spread thinly; if more butter is used, the fat and calorie content could be higher」。營養師也表示需要「types of spread/milk」、烹調方式等資訊。這些只是質性描述，原文沒有量化油或醬料造成的低估。

## 4. Rodríguez-Jiménez 2025（全文＋出版社頁面）

Rodríguez-Jiménez M, Martín-Del-Campo-Becerra GD, Sumalla-Cano S, Crespo-Álvarez J, Elio I. Image-Based Dietary Energy and Macronutrients Estimation with ChatGPT-5: Cross-Source Evaluation Across Escalating Context Scenarios. Nutrients 2025;17(22):3613. PMID 41305663；PMC12655113；doi:10.3390/nu17223613

**資料（2.1 節）。** 共 195 道菜，來源有三：
- Allrecipes.com 96 道：參考值是食譜宣稱的數值。
- SNAPMe 74 道：參與者自己的紀錄。
- 自製 25 道：營養師實際量測後，以 Nutrix、SMAE 與 USDA 成分表換算，照片中放了尺。

來源明顯不一致的紀錄有用成分表修正過。

**模型與介面（2.7 節）。** ChatGPT-5 Plus 的網頁介面，「rather than the API」，每道菜開新對話，並加上一組要求保守作答的行為指示。

**四種情境（2.6 節）。** Case 2 加入的非視覺資訊，原文是「type and amount of fat, type and amount of sweetener, fat content of dairy products, and type of meat」。Case 3 是照片加上附份量的食材清單；Case 4 跟 Case 3 一樣，只是拿掉照片。

**D：誤差逐步下降。** 原文支持。全部來源合併的熱量結果（表 2–4；討論 4.1 節）：

| 情境 | MAE（kcal） | MAPE |
|---|---|---|
| Case 1 照片 | 123.03 | 30.51% |
| Case 2 照片＋非視覺資訊 | 92.04 | 24.35% |
| Case 3 照片＋食材清單 | 53.33 | 13.92% |

**D：拿掉照片只給食材清單時變差。** 部分支持。Case 4 的 MAE 是 66.51 kcal、MAPE 18.05%，只比 Case 3 差；原文也說 Case 4「showed markedly lower errors」，比 Case 1、2 好。分來源看也不完全一致：SNAPMe 子集的熱量 MAE，Case 4 是 43.01，反而比 Case 3 的 46.48 低（表 4、表 5）。

**C：間接相關。** 研究設計本身把脂肪的種類與用量列為「difficult to capture visually」。作者的客製 GPT（附錄 C.2）也把「type and amount of fats」列為最優先向使用者詢問的資訊。此外，4.1 與 4.4 節寫到裝在碗裡的菜誤差較大，作者推測是深度難判斷。這些都說明脂肪不容易從照片看出，但沒有說明誤差的方向。

**Nakagawa 2026a 對本篇的引述有誤。** Nakagawa 2026a 的引言與 3.3 節把本篇寫成「195 dishes from the SNAPMe dataset」，並拿 123.0 kcal 跟自己在 SNAPMe 的 116.9 kcal 比較。但 123.03 是三個來源合併的數字；本篇 SNAPMe 子集的 Case 1 MAE 是 133.00 kcal（表 2）。規格若引用這組比較，應改正。

## 5. Nakagawa & Yamamoto 2026a（全文）

Nakagawa S, Yamamoto A. Prompt Engineering and Model Selection for LLM-Based Nutritional Estimation from Food Images: A Multi-Dataset Investigation. Nutrients 2026;18(12):2017. PMID 42356404；PMC13306177；doi:10.3390/nu18122017

**模型與介面（2.2 節）。** 版本是 `claude-haiku-4-5-20251001`、`claude-sonnet-4-6`、`claude-opus-4-6`。原文寫「All estimations were performed via the Anthropic Messages API (v2023-06-01)」，照片以 JPEG base64 上傳；SNAPMe 中超過 3 MB 的照片先縮小。主實驗以 Sonnet 為主。

**資料集（2.1 節）。**
- NutriImage 691 張：日本學生餐廳的餐點。照片上原本印有菜名文字，先用 OCR 遮蓋；遮蓋後仍看得到文字的 21.2% 直接排除。
- SNAPMe 1463 張。
- JBFD 989–1000 張：網路爬取的包裝食品正面照，營養值以每 100 g 計。

**D：Haiku 明顯較差，Sonnet 與 Opus 差距小。** 原文支持。4.1 節說 Haiku「produced near-random estimates」；3.2 與 4.2 節說 Sonnet 與 Opus 的 MedAPE 差距一致落在 1–3 個百分點，「no clinically meaningful advantage」。

**D：「不要讀圖中文字」的提示用在哪裡、為什麼有效。**
- **發展背景（2.3.2 節）。** 這段提示是在 JBFD 的 300 張預試中發展出來的。預試用「讀標示」的提示時，Sonnet 有 298/300 回傳 null，因為 JBFD 照片「predominantly show front-of-package designs without visible nutrition facts panels」。改用「只看外觀、不讀任何文字或數字」的提示，是為了讓模型依照食物外觀推估，而不是去找不存在的標示。
- **適用範圍。** 之後主比較的三個資料集都用這段提示（3.2 節）。
- **效果的解讀。** 「有效」的證據是能源 R² 從 Haiku 預設提示的 0.235，升到 Sonnet 視覺提示的 0.844。但原文自己承認這個比較混合了換模型與換提示的效果（「reflects the combined effect of prompt change and model upgrade」），因為 Sonnet 的預設提示大多回傳 null，無法評估。Haiku 換成視覺提示後沒有改善（0.235 → 0.170）。限制段第三點也寫這段提示「optimized on JBFD images and may not be optimally calibrated for all meal photograph types」。

**D：拍到營養標示的便當是否適用。** 原文沒有測試。JBFD 照片大多看不到營養標示；NutriImage 的文字遮蓋過，殘留文字的照片也排除了。沒有任何資料集測過「照片上有清楚可讀的營養標示」這種情況。以下是我的推論，不是原文結論：對這種便當下「不要讀文字」的指示，等於丟掉最準的資訊，不宜沿用。

**D：能不能推論到平台的 default tier。** 不能直接推論。研究透過 API 呼叫指定版本的模型，沒有平台的系統提示，影像處理方式也由研究者自己控制。平台預設使用哪個模型、版本、系統提示與圖片前處理都可能不同。限制段第五點也寫「model versions change rapidly; results may differ with future Claude releases」。

**C：部分相關，只講難估、沒講方向。**
- 4.1 與 4.3 節說鹽分由「invisible condiments」決定。
- 4.3 節說日式料理有來自「dashi stock, fermented seasonings」等看不見食材的熱量，很難從外觀判斷，並以揚出豆腐的褐色湯汁為例。

**其他。** 4.6 節：MedAPE 落在 14–62%，作者認為在需要精確數值的臨床情境，不應把照片估算當作唯一依據，並建議向使用者清楚說明估算的不確定性。

## 6. Nakagawa & Yamamoto 2026b（全文）

Nakagawa S, Yamamoto A. A Japanese-Dietitian Prompt Systematically Shifts Portion Estimates in LLM-Based Nutrient Estimation from Food Images: A Multi-Dataset, Multi-Model Study. Nutrients 2026;18(17):2892. PMID 42739063；PMC13567310；doi:10.3390/nu18172892

**模型與介面（2.2、2.5 節）。** 六個模型：Claude Haiku 4.5、Sonnet 4.6、GPT-4o、GPT-4o-mini、Gemini 2.5 Flash、Gemini 2.5 Pro，全部透過 API，取樣參數用各家預設。

**資料集（2.1 節）。**
- NutriImage 887 張：裁切到盤子範圍。參考值由營養師依食譜，用日本食品成分表第五版換算，再配合供應總重。
- SNAPMe 1272 張：只取照片中沒有可讀文字的餐。

**基線偏差的方向。** 2.1 節寫到，沒有加角色時，各模型在 NutriImage 的熱量相關營養素平均高估，在 SNAPMe 平均低估，而且低估集中在份量大的餐。

**D：營養師角色讓六個模型的熱量估計都變低。** 原文支持。3.1 節：「Across all six models and both datasets, the JP persona shifted predicted energy downward」。GPT-4o 的平均變化小，單獨看不顯著，但變動方向一致。美國營養師角色的變化很小，方向也不一致。

**需要補充的關鍵：起作用的是國籍，不是營養師身分。** 3.2 節的分解實驗顯示：
- 沒有國籍的「營養師」角色只產生小而方向不一的變化，整合分析中沒有任何穩健效果（3.7 節）。
- 沒有營養訓練的「日本主婦」角色，就重現了大部分的下修效果。

所以草稿的「營養師角色提示」容易誤讀：會讓熱量下修的是「日本」這個身分，不是「營養師」。研究也沒有測試台灣的角色。

**D：準確度影響依資料集而不同。** 原文支持。3.4 節：在 NutriImage（份量小），六個模型的熱量 MedAPE 都下降（−2.9 到 −19.9 個百分點）；在 SNAPMe（份量大），準確度沒有改善，摘要寫 12 格中有 11 格達統計等效。

**D：作者是否要求在目標情境驗證。** 是。4 節原文：「best regarded as a candidate domain-specific calibration intervention, to be adopted only after validation on a representative labeled sample of the target domain—never as a default」。作者也明說不建議拿國籍標籤當校正工具。

**C：部分相關，只講難估、沒講方向。** 3.5 節與限制段第一點：「fat is largely contributed by seasoning, dressing, and cooking oil absorbed into the dish, and is therefore not readily legible from a single image」。這支持「油、調味、醬料難從照片看出」，但沒有說是多算還是少算。結果段與限制段也寫到，鹽在所有條件下都被系統性低估。

**E 相關。** 3.3 節：Sonnet 在預設設定下，重複呼叫幾乎得到一樣的輸出；Gemini Flash 的同圖標準差中位數是 40.4 kcal，GPT-4o 是 28.9 kcal。同一張照片重問一次會不會給出不同數字，依模型而異。

## 附：Isobe 2026 醫院餐研究（全文）

Isobe T, Zhang LW, Murakami H, et al. Accuracy of AI-Based Nutrient Estimation from Standardized Hospital Meal Images: A Comparison with Registered Dietitians. Nutrients 2026;18(6):966. PMID 41901141；PMC13029357；doi:10.3390/nu18060966

**設計。** 15 份標準化醫院餐（約 600 kcal／餐），由上往下垂直拍攝，光線固定。參考值是煮後逐項秤重再換算；換算所依據的成分表名稱在全文抽取時缺漏。比較 10 名營養師與 10 種 AI 模型或 App，三個通用模型只用照片、不加任何文字資訊。

**結果。** 先依熱量表現篩出前三名：ChatGPT-4o、Gemini 1.5 Pro、Foodita。這三者的熱量平均偏差只有 −1.0% 到 −2.9%，但脂質平均偏差是 +23.6% 到 +30.4%，屬於高估（3.2 節），脂質落在 ±10% 內的比例都低於 20%（3.4 節）。

**摘要與內文不一致。** 摘要寫「all AI models exhibited a substantial systematic overestimation of lipids」，但內文的詳細偏差分析只做了前三名，摘要的「all」說得比內文寬。

**作者的解釋（4.1 節）。** 作者推測，模型可能沒辦法分辨畫面上看得到的油與實際吸收的油量，或是預設套用一般食譜的油量，而一般食譜比醫院餐更油（「default to standard recipe values that assume higher fat content than those used in standardized hospital meals」）。

**跟草稿 3 的衝突。** 這篇的方向是高估脂質，跟「少算油」相反。加上 2026b 的 NutriImage 基線是高估、SNAPMe 基線是低估，目前的證據顯示誤差方向取決於餐點本身是否偏油、份量大小與料理文化，不能一概說是少算。這篇只有 15 份餐，而且是低脂、標準化的醫院餐，代表性有限。

---

## E. 對驗收設計的含意

**參考值怎麼來。** 六篇加上 Isobe，參考值幾乎都是「秤重（或食譜量）× 食物成分資料庫」換算出來的，沒有一篇直接測量熱量：
- Dietist NET／USDA（第 1 篇）
- McCance and Widdowson（第 3 篇）
- Nutrix、SMAE、USDA 與食譜宣稱值（第 4 篇）
- 日本食品成分表舊版（第 5、6 篇）
- 廠商標示（第 1 篇的市售餐、第 5 篇的 JBFD）

Chen 篇在摘要中沒有寫明用哪一套資料庫。幾位作者也都承認參考值本身有誤差：第 1 篇提到標示可能不準，也提到沒有逐項秤到的成分會留下誤差；第 4 篇提到外部來源的參考值有錯，必須修正或剔除；第 6 篇提到成分表版本不同，熱量換算也會不同。

**建議的稱呼。** 規格不要叫「真值」，改叫「秤重參考值」（秤重後依食物成分表或包裝標示換算的熱量）。畫面上可以寫成「秤重估算」。這個數字本身就受到用了哪一套成分表、油與湯汁有沒有秤進去的影響。

**10 餐能說明的：**
- 在這個家常見的餐點上，模型給的範圍有沒有明顯偏離。
- 落在範圍外的那幾餐是偏高還是偏低。誤差方向在各研究之間不一致，所以這一點值得記下來。
- 這也正是第 6 篇作者要求的「在目標情境驗證」最小可行的做法。

**10 餐不能說明的：**
- 不能證明命中率達到 70%。7/10 的 95% 精確信賴區間約是 35%–93%，即使 10/10，下限也只有約 69%。
- 不能推論到沒測過的餐型，例如湯麵、油炸、拍到營養標示的便當。
- 不能推論到換了模型、版本或提示之後。第 5 篇的限制段與第 6 篇的重複呼叫分析都顯示，結果會隨這些條件改變。

**驗收時該一併記錄的：**
- 範圍寬度。範圍給得夠寬，命中率自然會高，所以命中率要和範圍寬度一起看。
- 測試期間模型、版本與提示要固定。
- 10 餐要涵蓋油多、有湯、份量大的餐。

---

## 逐句結論

| 句子 | 結論 | 建議改寫（繁中） | 出處 |
|---|---|---|---|
| A. 「一項研究用 52 張標準化餐點照片比較三個通用模型，表現較好的兩個，熱量的平均誤差約 36%，而且份量越大越容易低估。」 | 部分支持。數字與方向正確，但「平均誤差」指的是 MAPE（平均絕對百分比誤差）；兩個模型是 ChatGPT-4o 與 Claude 3.5 Sonnet（2024 年版）；份量只在澱粉類上變化；作者把部分原因歸給前方食物遮擋 | 「一項研究用 52 張標準化照片比較 2024 年的三個通用模型；表現較好的兩個，熱量平均差約 36%（以百分比計），份量越大越容易估少。」 | Fridolfsson 2025，摘要結果段；Results 第 2、5 段；Discussion 第 5 段 |
| B. 「台灣一項研究以秤重紀錄對照 714 張餐點照片，加上食物名稱等資訊的設定較準；常見的誤差來自份量估計、食物被遮住與提示不清楚。」 | 部分支持（只讀摘要）。714 張與秤重紀錄正確；較準的是「客製化＋食物名稱」；原文沒有測份量描述；誤差清單另有漏報或多報、系統限制兩項 | 「台灣一項研究用 714 張日常餐點照片對照秤重紀錄；客製化並加上食物名稱的設定最接近秤重結果。常見誤差包括份量估錯、食物被遮住、提示寫得不清楚，以及漏掉或多算食物。」 | Chen 2025，摘要 Methods／Results／Conclusions |
| C. 「估算可能少算油、醬汁與湯，不適合用來精確計算。」 | 前半不支持方向，後半支持。沒有任何一篇顯示油、醬汁或湯被「少算」。有研究說脂肪、油、調味與湯底很難從照片看出；醫院餐研究反而是脂質高估 23.6%–30.4%。「不適合精確計算」有直接依據 | 「照片看不出用了多少油、醬料或湯底，這部分可能多算也可能少算；估算只能當參考，不適合用來精確計算。」 | Nakagawa 2026b，3.5 節與 Limitations；Nakagawa 2026a，4.1、4.3、4.6 節；Rodríguez-Jiménez 2025，2.6 節；Isobe 2026，3.2、4.1 節；Fridolfsson 2025，結論 |
| D1. O'Hara：114 張、食物辨識精確度、中大份量重量估計差、多數營養素低估 | 支持，但要補一句：熱量本身的差異只有 0.1%，不能說熱量也被低估 | 「114 張照片；食物辨識精確度 93%；中、大份量的重量明顯估少；16 種營養素有 11 種估少，但熱量整體差異在 10% 內。」 | O'Hara 2025，2.2、3.1、3.2、3.3 節 |
| D2. Rodríguez-Jiménez：加上非視覺描述或食材清單誤差逐步下降；拿掉照片只給食材清單時變差 | 前半支持；後半部分支持，只比「照片＋清單」差，仍比只給照片好，SNAPMe 子集甚至沒有變差 | 「加上看不出來的資訊（油的種類與用量、甜味劑、乳品脂肪、肉類）後誤差下降，再加上食材份量清單時誤差最低；拿掉照片只給清單，比照片加清單差，但仍比只給照片好。」 | Rodríguez-Jiménez 2025，2.6 節、表 2–5、4.1 節 |
| D3a. Nakagawa 2026a：Haiku 明顯較差、Sonnet 與 Opus 差距小 | 支持 | 「同一系列中最小的模型明顯較差；中、大兩級的差距只有 1–3 個百分點。」 | Nakagawa 2026a，3.2、4.1、4.2 節 |
| D3b. Nakagawa 2026a：「不要讀圖中文字」提示的用途與效果 | 部分支持。提示是在包裝食品正面照上發展的，用意是讓模型依外觀推估，不要因為找不到標示而拒答；後來三個資料集都用。改善的幅度混合了換模型的效果；原文沒有測過照片上有可讀營養標示的情況 | 規格不要把這段提示套用到拍到營養標示的便當；這類照片應改為優先讀標示（屬推論，原文未測） | Nakagawa 2026a，2.1、2.3.2、3.1 節；Limitations 第三點 |
| D3c. Nakagawa 2026a：模型版本與介面 | 版本為 claude-haiku-4-5-20251001、claude-sonnet-4-6、claude-opus-4-6，透過 Anthropic Messages API。不能直接推論到平台的預設等級 | 「研究透過 API 測試指定版本的模型，平台預設的模型與設定可能不同。」 | Nakagawa 2026a，2.2 節；Limitations 第五點 |
| D4. Nakagawa 2026b：營養師角色讓六個模型的熱量估計都變低；準確度影響依資料集而不同；作者要求在目標情境驗證 | 支持，但要改正「營養師」這個說法：起作用的是「日本」身分，沒有國籍的營養師角色沒有穩健效果；也沒有測過台灣角色 | 「『日本營養師』角色會讓六個模型的估計都變低；份量小的日式餐點因此變準，份量大的美式餐點則沒有改善。單用『營養師』身分沒有穩定效果。作者要求先在目標情境驗證，不可當作預設。」 | Nakagawa 2026b，3.1、3.2、3.4、3.7、4 節 |
| E. 用 10 餐秤重驗收、命中率目標 ≥70% | 方向合理，符合第 6 篇作者「先在目標情境驗證」的要求；但 10 餐的統計力不足以確認 70% | 參考值改稱「秤重參考值」；規格寫明「10 餐只用來檢查有沒有明顯偏差與偏差方向，不能證明命中率」，並同時記錄範圍寬度與偏高或偏低 | 各篇的 Methods（參考值算法）；Nakagawa 2026b，3.3 節與第 4 節末 |
