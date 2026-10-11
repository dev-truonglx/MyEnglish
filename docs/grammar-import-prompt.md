# Prompt chuyển sách ngữ pháp sang JSON

Dùng cho dữ liệu cá nhân: bạn tự chạy prompt này với một AI đọc được PDF trên file sách của mình, rồi nhập các file JSON trong app (**Ngữ pháp → Nhập dữ liệu sách**).

- Dữ liệu chỉ lưu trong cơ sở dữ liệu trên máy bạn.
- Không commit thư mục `json-data/`. Thư mục này đã nằm trong `.gitignore`.

## Cách làm

1. Mở **một chat mới cho mỗi chương**. Đính kèm file PDF, dán toàn bộ khối prompt bên dưới, rồi ghi ở cuối: `Làm chương ch03, part 1`.
2. Part 1 chỉ có lý thuyết. AI in thêm **DANH SÁCH BÀI** (mỗi dòng `ch03-l01: tên bài`). Hãy chép lại danh sách này, bạn sẽ cần nó nếu phải mở chat mới.
3. Lưu mỗi khối JSON thành một file, ví dụ `ch03-p1.json`. Gõ `tiếp` để AI làm part sau. Mỗi part tối đa khoảng 35 câu bài tập.
4. Nhập file vào app. Nhập từng part một cũng được: app tự gộp với các part đã nhập trước, không xoá gì.

Khi gặp sự cố:

- **File bị cắt giữa chừng** (app báo như vậy): trong chat gõ `tiếp`, rồi dán phần AI viết thêm vào cuối file. Hoặc nhờ AI xuất lại part đó.
- **Chat quá dài hoặc phải mở chat mới giữa chương**: dán lại prompt, dán DANH SÁCH BÀI đã chép, rồi ghi `Làm chương ch03, part 4, bắt đầu từ nhóm bài tập ch03-s05 câu 12`.
- **Một vài câu bị lỗi**: app chỉ bỏ những câu đó và báo rõ câu nào; phần còn lại vẫn được nhập. Sửa xong thì nhập lại part đó.
- File làm theo prompt cũ (có `practiceGroups`) vẫn nhập được bình thường.

````text
Bạn là trợ lý số hoá tài liệu học tập. File PDF đính kèm là tài liệu ngữ pháp tiếng Anh của tôi (222 trang), chỉ dùng để học cá nhân. Hãy chuyển nội dung sang JSON đúng định dạng dưới đây để tôi nhập vào app học của tôi.

# 1. NGUYÊN TẮC
1. Chép ĐÚNG NGUYÊN VĂN lý thuyết, ví dụ, đề bài và đáp án. Không tóm tắt, không bỏ câu, không tự viết thêm câu bài tập.
2. Chỉ sửa lỗi nhận dạng ký tự hiển nhiên (chữ dính nhau, sai một ký tự, lỗi dấu tiếng Việt). Ghi mỗi chỗ sửa vào "fixes".
3. Thứ KHÔNG có trong tài liệu (bản dịch, phương án sai, giải thích) chỉ được đặt trong "ai" của từng câu. Phần "ai" là tuỳ chọn (mục 6).
4. Mỗi lượt chỉ làm MỘT part của MỘT chương. Xuất đúng MỘT khối ```json chứa JSON hợp lệ: nháy kép, không chú thích, không dấu phẩy thừa, escape dấu " trong chuỗi.
5. Ngoài khối JSON chỉ ghi: ở part 1 là DANH SÁCH BÀI (mỗi dòng "chNN-lMM: title"); tên file gợi ý (ví dụ ch03-p2.json); và "Gõ tiếp để làm part K" nếu còn part.
6. Hết mỗi lượt thì dừng, chờ tôi gõ "tiếp".
7. Bảng và khung công thức có thể bị vỡ khi đọc PDF. Hãy dựng lại đúng nội dung và thứ tự như trong tài liệu.

# 2. CHIA PART
- Part 1: CHỈ lý thuyết ("chapter", "lessons", "chapterNotes"). Không có bài tập.
- Part 2 trở đi: CHỈ bài tập ("exerciseSets"), mỗi part tối đa khoảng 35 câu hoặc 5.000 từ. Không cắt đôi một câu.
- Nhóm bài tập dài thì chia sang part sau; ở part sau ghi lại thông tin nhóm (id, roman, instruction, type…) và tiếp tục số câu "n".
- "parts" = tổng số part dự kiến của chương, ghi giống nhau ở mọi part. Ước lượng sai cũng không sao.
- Từ part 2, dùng đúng các id trong DANH SÁCH BÀI cho "lessonIds". Không tự đặt id bài mới. Nếu tôi mở chat mới, tôi sẽ dán lại danh sách này.

# 3. DANH SÁCH CHƯƠNG
Dùng đúng chapterId dưới đây. Số trang là số trang của file PDF. Nếu ranh giới thực tế lệch, hãy theo tiêu đề trong tài liệu và ghi chú vào "fixes".
| chapterId | Chương | Lý thuyết + bài tập | Đáp án |
|---|---|---|---|
| ch01 | TENSES | 1–13 | 13–15 |
| ch02 | SEQUENCE OF TENSES | 16–22 | 22–24 |
| ch03 | CLAUSES OF CONDITION | 24–27 | 54–55 |
| ch04 | CLAUSES AFTER WISH, IF ONLY | 27–28 | 56 |
| ch05 | PHRASES AND CLAUSES OF PURPOSE | 29–32 | 56–58 |
| ch06 | PHRASES AND CLAUSES OF RESULT | 32–36 | 58–60 |
| ch07 | PHRASES AND CLAUSES OF REASON | 37–38 | 60–61 |
| ch08 | PHRASES AND CLAUSES OF CONCESSION | 39–40 | 61–62 |
| ch09 | CLAUSES AFTER AS IF, AS THOUGH, IT'S HIGH TIME, IT'S TIME, WOULD RATHER | 41–43 | 62–63 |
| ch10 | NOUN CLAUSES | 44–45 | 63 |
| ch11 | RELATIVE CLAUSES | 46–54 | 63–68 |
| ch12 | EXPRESSION OF QUANTITY | 68–73 | 73–74 |
| ch13 | STYLES | 74–80 | 80–81 |
| ch14 | EMPHASIS | 81–83 | ngay sau bài tập (83–85) |
| ch15 | NOUNS (gồm đoạn mở đầu THE PARTS OF SPEECH) | 85–92 | 166–167 |
| ch16 | PRONOUNS | 93–99 | 167–168 |
| ch17 | ADJECTIVES | 100–106 | 168–169 |
| ch18 | ADVERBS | 106–110 | 169–170 |
| ch19 | DEGREES OF COMPARISON OF ADJECTIVES AND ADVERBS | 110–115 | 170–171 |
| ch20 | VERBS (gồm MỘT SỐ ĐỘNG TỪ ĐÁNG CHÚ Ý) | 115–125 | 171–172 |
| ch21 | NUMBERS | 126–127 | 172 |
| ch22 | PREPOSITIONS | 127–141 | 172–173 |
| ch23 | CONJUNCTIONS | 142–143 | 173–174 |
| ch24 | ARTICLES | 143–146 | 174 |
| ch25 | WORD FORMATIONS + WORD FORMS | 147–162 | 174–176 |
| ch26 | ACRONYMS | 162–163 | không có bài tập |
| ch27 | IDIOMATIC EXPRESSIONS | 163–165 | 176 |
| ch28 | REPORTED SPEECH | 177–181 | 181–182 |
| ch29 | THE PASSIVE AND ACTIVE SENTENCES | 183–189 | 189–192 |
| ch30 | SENTENCES | 192–199 | 199–200 |
| ch31 | PRACTICE TEST | 201–215 | 215–222 |

# 4. CẤU TRÚC FILE
Part 1:
{
  "format": "myenglish-grammar-book",
  "version": 2,
  "chapterId": "chNN",
  "part": 1,
  "parts": 4,
  "chapter": { "title": "...", "titleVn": "...", "pages": [đầu, cuối] },
  "lessons": [ ...BÀI... ],
  "chapterNotes": [ ...BLOCK... ],
  "fixes": []
}
Part 2 trở đi:
{
  "format": "myenglish-grammar-book",
  "version": 2,
  "chapterId": "chNN",
  "part": 2,
  "parts": 4,
  "exerciseSets": [ ...NHÓM BÀI TẬP, mỗi nhóm chứa các câu... ],
  "fixes": []
}

# 5. BÀI (LESSON)
- Mỗi mục lớn được đánh số trong phần lý thuyết (1., 2., 3.… hoặc I., II.…) là một bài. Chương không chia mục thì cả chương là một bài.
- Phần "GHI NHỚ" hoặc lưu ý chung ở cuối chương đưa vào "chapterNotes".
- { "id": "chNN-lMM", "order": 1, "title": "...", "titleVn": "...", "page": 0, "blocks": [...] }. Id đánh số theo thứ tự trong tài liệu và PHẢI bắt đầu bằng "chNN-".
- Các loại block, giữ đúng thứ tự xuất hiện:
  { "type": "heading", "text": "..." }
  { "type": "text", "text": "..." }
  { "type": "bullet", "text": "..." }
  { "type": "formula", "label": "Khẳng định | Phủ định | Nghi vấn | ...", "text": "..." }
  { "type": "example", "en": "...", "vi": "" }
  { "type": "note", "text": "..." }
  { "type": "table", "headers": ["..."], "rows": [["...", "..."]] }
  { "type": "wordlist", "items": [ { "en": "...", "vi": "..." } ] }

# 6. NHÓM BÀI TẬP VÀ CÂU
Mỗi nhóm bài tập trong sách (I, II, III…) là một phần tử của "exerciseSets", chứa luôn các câu của nó:
{
  "id": "chNN-sMM",        đánh số theo thứ tự nhóm trong chương, bắt đầu bằng "chNN-"
  "roman": "I",            số La Mã như tài liệu ("" nếu không đánh số)
  "instruction": "...",    đề bài của nhóm, nguyên văn
  "type": "verb_form",     một trong các loại dưới đây
  "page": 0, "keyPage": 0,
  "wordBank": [],          các từ cho sẵn trong khung (nếu có)
  "example": null,         câu mẫu "Ex:" chép nguyên văn thành MỘT chuỗi, ví dụ "Ex: She (be) ... → She is ..."; không có thì null
  "passage": null,         đoạn văn nếu đề dựa trên một đoạn văn
  "itemCount": 0,          tổng số câu của nhóm trong tài liệu (cả những câu nằm ở part khác)
  "items": [ ...CÂU... ]   chỉ các câu thuộc part này
}
Loại nhóm: verb_form (chia động từ) | choose (chọn đáp án) | fill_blank (điền từ) | word_form (dạng đúng của từ) | rewrite (viết lại câu) | combine (nối câu) | question (đặt câu hỏi) | tag (câu hỏi đuôi) | complete (hoàn thành câu, đáp án mở) | correct (tìm và sửa lỗi) | identify (phân tích câu, phân loại từ) | translate (tìm nghĩa tiếng Việt) | write (viết bằng chữ).

CÂU — trường bắt buộc:
{
  "n": 1,                          số thứ tự câu trong nhóm, là số nguyên
  "lessonIds": ["chNN-l01"],       các bài mà câu kiểm tra (xem dưới)
  "prompt": "My sister ___ (work) for a bank.",
  "answers": [["works"]],
  "answerSentence": "My sister works for a bank.",
  "keyRaw": "works"
}
Trường thêm, CHỈ ghi khi có: "options", "given", "underline", "keyPartial": true, "noKey": true, "parts", "ai". Không ghi trường rỗng.

Quy tắc:
- "lessonIds": các bài mà ĐÁP ÁN ĐẦU TIÊN dùng tới (tính trên mọi chỗ trống). Chương Các thì: theo thì của động từ trong đáp án ("be going to" là Tương lai gần). Chương khác: theo điểm ngữ pháp mà câu kiểm tra. Chương chỉ có một bài thì mọi câu thuộc bài đó. Không chắc thì chọn bài gần nhất với điểm ngữ pháp chính.
- "prompt": đề nguyên văn, mỗi chỗ cần điền ghi thành ___ (đúng 3 dấu gạch dưới).
  - Chia động từ: đặt ___ ngay trước động từ trong ngoặc, giữ nguyên ngoặc: "... ___ (work) ...".
  - Chọn trong ngoặc: thay cả cụm lựa chọn bằng ___ và đưa các lựa chọn vào "options" (giữ thứ tự).
  - Chỗ trống bị mất khi đọc PDF: đặt ___ đúng vị trí, dựa vào đáp án.
- "answers": LUÔN là mảng các mảng, mỗi chỗ ___ một mảng chứa các đáp án được chấp nhận.
  - "will/ shall give" → [["will give", "shall give"]]. Phần tuỳ chọn như "(that)": ghi cả dạng có và không có.
  - Hai chỗ trống "a - b" → [["a"], ["b"]]. Chỗ không cần điền gì → [""].
  - Loại rewrite, combine, question, complete, correct, identify, translate, write: [["<đáp án đầy đủ>", "<cách viết khác nếu sách cho>"]].
- "answerSentence": câu hoàn chỉnh (điền đáp án đầu tiên vào đề, bỏ phần gợi ý trong ngoặc), hoặc câu viết lại đầy đủ.
- "keyRaw": đáp án nguyên văn trong sách.
- "given": phần mở đầu cho sẵn của câu viết lại (ví dụ "It has ..."). "underline": phần được gạch dưới trong đề.
- "keyPartial": true nếu sách chỉ cho một phần đáp án (có "..."); khi đó ghép với đề để "answers" và "answerSentence" đầy đủ.
- "noKey": true nếu sách không có đáp án; khi đó "answers": [].
- "parts": chỉ cho loại identify phân tích câu: [{ "text": "...", "role": "S|V|O|C|A|Pre" }].

PHẦN "ai" (TUỲ CHỌN). Nếu tôi ghi "không cần ai" thì bỏ hẳn. Nếu có, ưu tiên "distractors" vì nó giúp app tạo câu trắc nghiệm cho người mới:
"ai": {
  "distractors": [["is working", "worked", "work"]],   mỗi chỗ ___ 3 phương án SAI nhưng hợp lý; không trùng đáp án đúng; loại choose bỏ qua
  "vi": "...",                                         bản dịch tự nhiên của answerSentence
  "explainVn": "...",                                  vì sao đúng, tối đa 30 từ
  "wrongSentences": ["...", "..."]                     với rewrite/combine/question/tag: 2 câu sai thường gặp
}

# 7. VÍ DỤ (câu minh hoạ, KHÔNG phải nội dung tài liệu)
```json
{
  "format": "myenglish-grammar-book",
  "version": 2,
  "chapterId": "ch01",
  "part": 2,
  "parts": 5,
  "exerciseSets": [
    {
      "id": "ch01-s01", "roman": "I", "instruction": "<đề nhóm I như tài liệu>", "type": "verb_form",
      "page": 8, "keyPage": 13, "wordBank": [], "example": null, "passage": null, "itemCount": 2,
      "items": [
        {
          "n": 1, "lessonIds": ["ch01-l01"],
          "prompt": "My sister ___ (work) for a bank in Hanoi.",
          "answers": [["works"]],
          "answerSentence": "My sister works for a bank in Hanoi.",
          "keyRaw": "works",
          "ai": { "distractors": [["is working", "worked", "work"]], "vi": "Chị tôi làm việc cho một ngân hàng ở Hà Nội." }
        },
        {
          "n": 2, "lessonIds": ["ch01-l05", "ch01-l06"],
          "prompt": "While we ___ (watch) TV, the power ___ (go) out.",
          "answers": [["were watching"], ["went"]],
          "answerSentence": "While we were watching TV, the power went out.",
          "keyRaw": "were watching - went"
        }
      ]
    }
  ],
  "fixes": []
}
```

# 8. TỰ KIỂM TRA TRƯỚC KHI XUẤT
- JSON hợp lệ, đúng tên trường. Mọi id bắt đầu bằng "chNN-".
- Mỗi câu có "n" là số nguyên; mỗi cặp (nhóm, n) chỉ xuất hiện MỘT lần trong cả chương.
- Số ___ trong "prompt" bằng số phần tử của "answers" (trừ khi "noKey": true).
- Điền đáp án đầu tiên vào "prompt" (bỏ gợi ý trong ngoặc) ra đúng "answerSentence".
- Loại choose: đáp án nằm trong "options".
- Part này không quá khoảng 35 câu.

# 9. BẮT ĐẦU
Tôi sẽ ghi chương và part cần làm (ví dụ "Làm chương ch03, part 1"). Từ part 2, tôi dán kèm DANH SÁCH BÀI nếu đây là chat mới.
````
