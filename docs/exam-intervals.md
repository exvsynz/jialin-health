# 定期檢查間隔依據（2026-10-30 查證）

工具預設值：指引給區間時一律取下限。適用一般族群；有個人病史、家族史或醫師另有安排時以醫師為準。

| 檢查 | 分類 | 預設 | 依據 |
|---|---|---|---|
| 乳房X光 | BI-RADS 1–2 | 24 個月 | 國健署：40–74 歲女性每 2 年一次（114 年起擴大） |
| 乳房超音波／CT | BI-RADS 1–2 | 12 個月 | 臨床常規，非指引值 |
| 乳房（任一影像） | BI-RADS 3 | 6 個月 | ACR BI-RADS；Berg et al., Radiology 2020 |
| 甲狀腺超音波 | ATA 高度懷疑（未達穿刺） | 6 個月 | ATA 2015：6–12 個月 |
| 甲狀腺超音波 | ATA 低–中度懷疑 | 12 個月 | ATA 2015：12–24 個月 |
| 甲狀腺超音波 | ATA 極低懷疑／純囊腫 >1 cm | 24 個月 | ATA 2015 Rec 24C：若要追蹤，≥24 個月（無建議，證據不足） |
| 甲狀腺超音波 | ATA 極低懷疑／純囊腫 ≤1 cm | 不排 | ATA 2015 Rec 24D：不需例行超音波追蹤 |
| LDCT | Lung-RADS 1–2 | 12 個月 | ACR Lung-RADS v2022（國健署補助每 2 年） |
| LDCT | Lung-RADS 3 | 6 個月 | ACR Lung-RADS v2022 |
| LDCT | Lung-RADS 4A | 3 個月 | ACR Lung-RADS v2022 |
| 大腸鏡 | 正常 | 10 年 | USMSTF 2020（Gupta et al.） |
| 大腸鏡 | 1–2 顆管狀腺瘤 <10 mm | 7 年 | USMSTF 2020：7–10 年 |
| 大腸鏡 | 3–4 顆管狀腺瘤 <10 mm | 3 年 | USMSTF 2020：3–5 年 |
| 大腸鏡 | 5–10 顆、≥10 mm、絨毛、高度分化不良 | 3 年 | USMSTF 2020 |
| 大腸鏡 | >10 顆腺瘤 | 1 年 | USMSTF 2020，並考慮遺傳諮詢 |
| 大腸鏡 | 分片切除 ≥20 mm | 6 個月 | USMSTF 2020 |
| 胃鏡 | — | 24 個月 | 暫定值，未找到一般族群指引，需依醫囑修改 |
| 甲狀腺抽血、生殖軸激素 | — | 6 個月 | 依醫囑 |

以下各列在頁面中早已存在，2026-10-30 才補進這份文件，讓兩邊內容一致。數值與依據文字都照抄頁面（`src/index.html` 的 `EXAMS`），這次沒有重新查證原文。

| 檢查 | 分類 | 預設 | 頁面標示的依據 |
|---|---|---|---|
| 乳房（任一影像） | BI-RADS 0 | 盡快 | 盡快補做檢查 |
| 乳房（任一影像） | BI-RADS 4–5 | 盡快 | 切片或轉介，不屬定期追蹤 |
| 乳房電腦斷層 | BI-RADS 1–2 | 12 個月 | 依醫囑 |
| 甲狀腺超音波 | 無結節 | 不排 | ATA 2015 未建議例行追蹤；醫師有安排再填間隔或日期 |
| 甲狀腺超音波 | 穿刺良性＋高度懷疑 | 12 個月 | ATA 2015 Rec 23A：12 個月內重做超音波，並再做一次超音波導引穿刺 |
| 甲狀腺超音波 | 穿刺良性＋低–中度懷疑 | 12 個月 | ATA 2015：12–24 個月，取下限 |
| LDCT | Lung-RADS 4B／4X | 盡快 | 進一步檢查或切片 |
| LDCT | Lung-RADS 0 | 盡快 | 依報告指定時間補做 |
| 大腸鏡 | 直乙結腸增生性息肉 <10 mm | 10 年 | USMSTF 2020：10 年 |
| 大腸鏡 | 1–2 顆無蒂鋸齒狀息肉 <10 mm | 5 年 | USMSTF 2020：5–10 年，取下限 |
| 大腸鏡 | 鋸齒狀息肉 ≥10 mm 或分化不良、TSA | 3 年 | USMSTF 2020：3 年 |

2026-10-30 依使用者決定，甲狀腺超音波各分類改為依 ATA 2015 Rec 23–24 原文：
- 無結節、≤1 cm 極低懷疑或純囊腫：不自動排日期，紀錄的間隔存為空值。
- >1 cm 極低懷疑：依據改為「≥24 個月」。
- 穿刺良性＋高度懷疑：依據註明要再做穿刺。
- 間隔數值都沒有改。

原文抽查自 Cancer Care Ontario 2023 的 ATA 指引採用文件，以及 GuidelineCentral 快速參考（PMC 原站在工作環境被網路政策擋住）；細節見 `docs/reviews/2026-10-30-code-review.md` 第九節。
以前用「無結節」存下、間隔已經自動帶成 12 的舊紀錄，仍維持 12 個月。若要改，在紀錄裡清空間隔即可。

## 骨密度 DXA（2026-11-12 查證）

| 檢查 | 分類 | 預設 | 依據 |
|---|---|---|---|
| 骨密度 DXA | 骨量較低（T −1.0 ～ −2.5） | 12 個月 | ESHRE 2024 POI：骨密度低或骨質疏鬆，依風險每 1–3 年，取下限 |
| 骨密度 DXA | 骨質疏鬆（T ≤ −2.5） | 12 個月 | 同上 |
| 骨密度 DXA | 正常，且規律使用荷爾蒙治療 | 60 個月 | ESHRE 2024 POI：骨密度正常且規律荷爾蒙治療，5 年內重測價值低 |
| 骨密度 DXA | 正常（未使用荷爾蒙治療） | 不給預設值 | ISCD 2023：無固定間隔，依年齡、基準值與風險個別決定，請依醫囑填寫 |
| 骨密度 DXA | 未分類 | 12 個月 | 固定間隔。ESHRE 2024 POI：骨密度低每 1–3 年，取下限；其他情況依醫囑 |

「正常（未使用荷爾蒙治療）」不是「不排」：選了以後間隔欄會清空，要自己填間隔或指定日期才能儲存。

出處：

- ESHRE 2024 POI guideline：Panay N, Anderson RA, Bennie A, et al. Evidence-based guideline: premature ovarian insufficiency. Hum Reprod Open 2024;2024(4):hoae065. doi:10.1093/hropen/hoae065（PMID 39660328，PMC11631070）。這是早發性卵巢功能不全（POI）的指引，不是一般族群的建議。
- ISCD 2023 Adult Official Positions（International Society for Clinical Densitometry，`2023-ISCD-Adult-Positions.pdf`）。

判讀與比較：

- 停經前女性以 Z 值判讀，不用 T 值。ISCD 2023 在「Females Prior to Menopause」一節寫「Z-scores, not T-scores, are preferred」；Z 值 ≤ −2.0 是「below the expected range for age」。
- WHO 分類只適用停經後與更年期過渡期。ISCD 2023 把 WHO 分類放在停經後女性（與 50 歲以上男性）的報告方式裡，另寫 WHO 診斷標準「may be applied to women in the menopausal transition」。
- 追蹤比較時，看同一台機器的 BMD (g/cm²) 變化。ISCD 2023：受檢者應回到上次檢查的同一台 DXA；追蹤報告以 g/cm² 與百分比寫出有意義的變化；沒有交叉校正的兩台機器不能比較。

原文對照（2026-11-12）：

- ESHRE 2024 建議 68（STRONG）：骨密度正常、開始並持續足量的全身性荷爾蒙治療時，「the value of a repeated DXA scan within 5 years is low」。原文沒有說滿 5 年要重測；60 個月是這個工具把「5 年內不必重測」換成提醒日期的做法。
- ESHRE 2024 建議 69（STRONG）：有骨質疏鬆或骨密度低的 POI 女性，DXA「should be reassessed every 1–3 years, based on individual risk factors」。
- ISCD 2023「Follow-up BMD Measurements」：重測間隔「must be individualized」，考量年齡、基準 BMD、藥物治療的種類，以及和骨流失有關的臨床因素。原文沒有給固定間隔。

查證方式：ESHRE 的建議讀自 PMC 全文（PMC11631070，經 PubMed 取得）與 eshre.eu 的完整指引 PDF；ISCD 讀自 iscd.org 的 2023 PDF。後兩份 PDF 是透過搜尋服務的頁面擷取讀到的，工作環境不能直接連 iscd.org。

待使用者確認：ESHRE 2024 完整指引把「low bone mass」定義為 Z 值 ≤ −2（引用 ISCD），把骨質疏鬆定義為 T 值 ≤ −2.5（WHO）。頁面上「骨量較低」的標籤照使用者指定寫成 T −1.0 ～ −2.5（WHO 的 osteopenia 範圍），和指引用的定義不同。兩個分類的間隔都是 12 個月，不影響到期日；影響的是停經前該選哪一個分類。
