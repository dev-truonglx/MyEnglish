# So sánh với các app học khác + đề xuất bổ sung (2026-10-17)

Mục tiêu: xem các app khác giữ chân người học bằng cách nào, MyEnglish đã có gì, còn thiếu gì, và nên bổ sung gì
để người học **quay lại đều** và **tập trung khi học**.

Danh sách tính năng của MyEnglish lấy từ code hiện tại (gồm cả phần chưa commit), không lấy từ tài liệu kế hoạch.
Phiên tập trung trong `focus-session-2026-10-17.md` **chưa có trong code**. Starter decks nhắc trong
`engagement-features-2026-10-07.md` cũng không còn trong code nữa.

---

## 1. Các app khác giữ chân người học bằng gì

| App | Cách giữ chân chính |
|---|---|
| **Duolingo** | Chuỗi ngày + đóng băng/sửa chuỗi, giải đấu tuần có lên/xuống hạng, 3 nhiệm vụ hằng ngày + rương thưởng, Friends Quest (làm nhiệm vụ cùng bạn, có ghép cặp với người lạ nếu chưa có bạn), linh vật nhắc nhở "cảm xúc", âm thanh và hoạt ảnh khi đúng, bài học rất ngắn (3–5 phút), Stories/Adventures, Video Call/Roleplay với AI (gói Max), tổng kết năm để chia sẻ. |
| **Anki** | FSRS, heatmap, bộ thẻ cộng đồng, add-on. Không gamification. Giữ chân nhờ hiệu quả trí nhớ, không nhờ động lực. |
| **Memrise** | Video người bản xứ nói câu thật, MemBot (chat AI có giọng nói, miễn phí), học theo tình huống. |
| **ELSA Speak** | Chấm phát âm đến từng âm vị, AI hội thoại theo tình huống (phỏng vấn, thuyết trình), luyện thi IELTS/TOEIC. |
| **Busuu / Babbel** | Lộ trình học có mục tiêu ngày thi/ngày hoàn thành, AI Study Plan, người bản xứ sửa bài viết (Busuu), chứng chỉ theo cấp, Babbel Speak (luyện nói bằng giọng, chấm phát âm). |
| **LingQ / eJOY / Language Reactor** | Học từ nội dung thật: đọc/xem video, tra từ ngay khi gặp, lưu từ kèm câu gốc, tô màu từ đã biết/chưa biết. eJOY có tiện ích trình duyệt và phím tắt tra từ ở bất kỳ đâu. |
| **Forest / Pomodoro apps** | Phiên tập trung có đồng hồ, "trồng cây" khi hoàn thành, mất cây khi bỏ dở, thống kê phút tập trung. |

Nhóm cơ chế lặp lại ở hầu hết app thành công:
1. **Bài học rất ngắn, có điểm kết thúc rõ ràng.** Người học biết "làm xong cái này là xong hôm nay".
2. **Phản hồi tức thì có âm thanh và hoạt ảnh** sau mỗi câu.
3. **Mục tiêu nhỏ mỗi ngày đổi liên tục** (nhiệm vụ ngày), không chỉ một mục tiêu cố định.
4. **Mất mát nếu bỏ** (chuỗi ngày, hạng giải đấu, cây chết). Sợ mất mạnh hơn muốn được.
5. **Áp lực xã hội nhẹ**: bạn bè cùng làm nhiệm vụ, bảng xếp hạng nhóm nhỏ (~30 người) thay vì toàn bộ.
6. **Nói thật thành tiếng** và được chấm, vì "nói được" là cảm giác tiến bộ rõ nhất.
7. **Nội dung mới mỗi ngày** (truyện, video, hội thoại) để có lý do mở app ngoài việc ôn thẻ.

---

## 2. Bảng so sánh tính năng

✅ có · 🟡 có một phần · ❌ chưa có

### Phương pháp học

| Tính năng | Duolingo | Anki | ELSA | Busuu/Babbel | LingQ/eJOY | **MyEnglish** |
|---|---|---|---|---|---|---|
| Lặp lại ngắt quãng (SRS) | 🟡 | ✅ FSRS | ❌ | 🟡 | 🟡 | ✅ FSRS + tối ưu tham số |
| Nhiều dạng bài tập | ✅ | ❌ | 🟡 | ✅ | 🟡 | ✅ 11 dạng + thang nhớ lại |
| Kiểm tra xếp trình độ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ thích ứng A0–C1 |
| Đoán trước khi học (pretest) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sổ lỗi sai có ôn lại | 🟡 | ❌ | 🟡 | 🟡 | ❌ | ✅ gắn với bài ngữ pháp |
| Ngữ pháp có giải thích | 🟡 | ❌ | ❌ | ✅ | ❌ | ✅ sách ngữ pháp người dùng nhập |
| Kế hoạch quay lại sau khi nghỉ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ comeback |

### Nội dung và kỹ năng

| Tính năng | Duolingo | Anki | ELSA | Busuu/Babbel | LingQ/eJOY | **MyEnglish** |
|---|---|---|---|---|---|---|
| Thư viện bài đọc/truyện có sẵn | ✅ Stories | ❌ | ❌ | ✅ | ✅ | ❌ chỉ dán văn bản |
| Đọc văn bản, tô màu từ đã biết, bấm để lưu từ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Tra/lưu từ ở bất kỳ app nào (phím tắt, clipboard) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Video/podcast người bản xứ | 🟡 | ❌ | ❌ | ✅ | ✅ | ❌ |
| Nghe chép chính tả | ✅ | ❌ | ❌ | ✅ | 🟡 | ✅ |
| Ghi âm giọng người học | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ chỉ tự chấm "nói to" |
| Chấm phát âm tự động | 🟡 | ❌ | ✅ theo âm vị | ✅ | ❌ | ❌ |
| Hội thoại/đóng vai với AI | ✅ Max | ❌ | ✅ | 🟡 | ❌ | ❌ |
| AI sửa bài viết | 🟡 | ❌ | ❌ | ✅ (+ người thật) | ❌ | ✅ |
| Bài phát âm riêng cho người Việt | ❌ | ❌ | 🟡 | ❌ | ❌ | ✅ âm cuối, cặp tối thiểu |

### Động lực và giữ chân

| Tính năng | Duolingo | Anki | ELSA | Busuu/Babbel | LingQ/eJOY | **MyEnglish** |
|---|---|---|---|---|---|---|
| Chuỗi ngày + đóng băng | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ (7 ngày được 1, tối đa 2) |
| Sửa chuỗi sau khi lỡ (streak repair) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Mốc chuỗi ngày được ăn mừng | ✅ | ❌ | 🟡 | 🟡 | ❌ | 🟡 chỉ huy hiệu 3/7/30 |
| XP + lên cấp | ✅ | ❌ | 🟡 | 🟡 | ✅ | ✅ |
| Huy hiệu/thành tích | ✅ | ❌ | ✅ | ✅ | 🟡 | ✅ 15 huy hiệu |
| **Nhiệm vụ hằng ngày đổi mỗi ngày + phần thưởng** | ✅ | ❌ | 🟡 | ❌ | ❌ | ❌ chỉ có thử thách tuần |
| Bảng xếp hạng | ✅ | ❌ | ❌ | ❌ | 🟡 | ✅ tuần/tháng/mọi lúc/chuỗi |
| **Giải đấu có lên/xuống hạng** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Nhóm/bạn bè | ✅ | ❌ | ❌ | 🟡 cộng đồng | ❌ | 🟡 nhóm bằng mã mời |
| **Nhiệm vụ chung với bạn (Friends Quest)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Linh vật nhắc nhở có cảm xúc | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ trong ReviewNudge |
| **Âm thanh đúng/sai, combo** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ chỉ có TTS |
| Hoạt ảnh/confetti | ✅ | ❌ | ✅ | ✅ | ❌ | 🟡 chỉ khi lên cấp |
| Tổng kết tuần/tháng/năm để chia sẻ | ✅ | ❌ | ❌ | 🟡 | ❌ | 🟡 tổng kết tuần, không chia sẻ được |
| Chứng chỉ theo cấp | ❌ | ❌ | 🟡 | ✅ | ❌ | ❌ |

### Nhắc nhở và tập trung

| Tính năng | Duolingo | Anki | ELSA | Forest | **MyEnglish** |
|---|---|---|---|---|---|
| Nhắc học | ✅ push điện thoại | ❌ | ✅ | ✅ | ✅ popup + nudge + thông báo |
| Nhắc đúng lúc (tránh lúc họp, chia sẻ màn hình, toàn màn hình) | ❌ | ❌ | ❌ | ❌ | ✅ **điểm mạnh riêng** |
| Học tranh thủ vài câu trong popup | 🟡 widget | ❌ | ❌ | ❌ | ✅ |
| Số thẻ đến hạn trên tray/menu bar | 🟡 widget | ❌ | ❌ | ❌ | ✅ |
| **Phiên tập trung có đồng hồ, ẩn mọi thứ khác** | ❌ | ❌ | ❌ | ✅ | ❌ (đã có kế hoạch) |
| Thống kê phút tập trung, tỉ lệ hoàn thành | ❌ | ❌ | ❌ | ✅ | ❌ |
| Không cho bỏ qua bài tập | ✅ | ✅ | — | — | ✅ |
| App trên điện thoại | ✅ | ✅ | ✅ | ✅ | ❌ |

**Tóm lại:** về **phương pháp ghi nhớ** và **nhắc đúng lúc trên máy tính**, MyEnglish đã ngang hoặc hơn các app
khác. Phần còn thiếu nằm ở 3 nhóm:
1. **Cảm giác vui và phần thưởng tức thì** (âm thanh, nhiệm vụ ngày, rương thưởng).
2. **Kỹ năng nói** (ghi âm, chấm phát âm, hội thoại AI).
3. **Nội dung mới mỗi ngày** và **lý do xã hội** để quay lại (giải đấu, nhiệm vụ với bạn).

---

## 3. Đề xuất bổ sung (xếp theo hiệu quả / công sức)

### Ưu tiên 1: ít công, tác động lớn

**1.1 Hoàn thành phiên tập trung** (theo `focus-session-2026-10-17.md`).
Đây là tính năng trực tiếp nhất cho "tập trung học". Bổ sung so với kế hoạch:
- Thẻ đầu tiên của phiên chọn từ dễ (retrievability cao) để vào guồng nhanh.
- Nếu tỉ lệ đúng tụt mạnh (ví dụ < 50% trong 8 câu gần nhất) thì gợi ý nghỉ hoặc chuyển sang ôn lỗi sai,
  thay vì để người học chán và bỏ dở.
- Sau 25 phút liên tục thì gợi ý nghỉ 5 phút (kiểu Pomodoro), không bắt buộc.

**1.2 Âm thanh phản hồi + combo.**
Âm ngắn khi đúng/sai, âm khác khi đúng 5 câu liên tiếp, âm "xong phiên". Có nút tắt trong Cài đặt.
Dùng Web Audio tự tạo âm (không cần file) hoặc vài file `.mp3` nhỏ. Duolingo coi đây là một trong những yếu tố
giữ chân quan trọng nhất vì nó tạo phần thưởng ngay sau mỗi câu.
File: `src/components/review/GradingBar.tsx`, `FlashcardReview.tsx`, `DisplaySettings.tsx`.

**1.3 Nhiệm vụ hằng ngày (3 nhiệm vụ, đổi mỗi ngày).**
Ví dụ: "Đúng ngay lần đầu 15 câu", "Học 5 từ mới", "Hoàn thành 1 phiên tập trung 10 phút", "Ôn 3 lỗi sai",
"Làm 1 bài ngữ pháp", "Đọc 1 đoạn văn". Hoàn thành cả 3 thì mở **rương** (+XP hoặc +1 đóng băng chuỗi, giới hạn).
Nhiệm vụ chọn theo những phần người học đang bỏ quên (ví dụ lâu không làm ngữ pháp thì ra nhiệm vụ ngữ pháp),
nên vừa vui vừa kéo người học sang kỹ năng yếu.
Đã có sẵn nền: `TodayChecklist`, `WeeklyProgressCard`, `learning_events`.
Lưu ý XP: thưởng nhiệm vụ cần giới hạn để bảng xếp hạng vẫn công bằng.

**1.4 Chuỗi ngày chặt hơn.**
- **Sửa chuỗi trong 24 giờ**: lỡ 1 ngày thì hôm sau làm gấp đôi mục tiêu để giữ chuỗi.
- **Mốc chuỗi** (7, 14, 30, 50, 100, 365 ngày) có màn ăn mừng riêng + confetti, không chỉ huy hiệu.
- **Nhắc giữ chuỗi buổi tối** (khoảng 20h–21h nếu hôm nay chưa học), dùng mốc nhắc `anchors` đã có,
  giọng "chuỗi 23 ngày sắp mất" (sợ mất mạnh hơn muốn được).

**1.5 Màn kết thúc phiên rõ ràng hơn.**
Hiện có `DayCloseCard`. Bổ sung: "Hôm nay xong ✓" thật nổi bật khi đạt mục tiêu, kèm lượt ôn tiếp theo
("Lượt ôn tới: 14:30, khoảng 6 thẻ"). Người học cần biết chắc khi nào được dừng, nếu không họ sẽ thấy học mãi không xong.

### Ưu tiên 2: công vừa, tạo khác biệt

**2.1 Tra và lưu từ ở bất kỳ app nào (lợi thế riêng của app desktop).**
Phím tắt toàn cục (ví dụ `⌘⇧E`): bôi đen một từ trong trình duyệt, IDE, Slack… rồi bấm phím tắt, một cửa sổ nhỏ
hiện nghĩa, IPA, nút nghe và nút "Thêm vào ôn tập" kèm câu gốc làm ngữ cảnh.
Người học IT đọc tài liệu tiếng Anh cả ngày, nên đây là nguồn từ mới tự nhiên nhất. eJOY và Language Reactor
giữ chân người dùng chủ yếu nhờ tính năng này.
Kỹ thuật: `tauri-plugin-global-shortcut` + đọc clipboard (người dùng tự bấm `⌘C` trước, tránh xin quyền
Accessibility). Tra trong `vocabCatalog` trước, ngoài Oxford 5000 thì ghi rõ "ngoài bộ từ" (theo quy tắc chỉ dùng
nguồn từ chính thức).

**2.2 Ghi âm và nghe lại giọng mình (shadowing), chưa cần chấm điểm.**
Nghe TTS → ghi âm câu → phát lại giọng mình ngay sau câu mẫu để tự so sánh. Đây là bước đầu cho kỹ năng nói,
làm được bằng `MediaRecorder` trong webview. Trên macOS cần thêm `NSMicrophoneUsageDescription` vào Info.plist.
Gắn vào `SayAloudPrompt` và tab Phát âm.

**2.3 Bài đọc ngắn tạo từ chính các từ đang học.**
Mỗi ngày tạo 1 đoạn đọc 80–150 từ (chủ đề IT: standup, code review, email, tài liệu API) dùng 5–8 từ đang đến hạn
và chỉ dùng từ ở cấp độ người học đã đạt. Đọc xong có 2–3 câu hỏi hiểu bài. Đây là phiên bản "Stories" của Duolingo,
và cho người học **lý do mở app mỗi ngày ngoài việc ôn thẻ**. AI chỉ viết đoạn văn, danh sách từ lấy từ bộ Oxford.
Dùng lại `ReadingTab` (đã có tô màu từ và lưu từ).

**2.4 Đóng vai hội thoại bằng chữ với AI theo tình huống công việc.**
Tình huống: daily standup, báo lỗi, review PR, phỏng vấn, hỏi đường khi đi công tác. AI đóng vai đồng nghiệp,
cuối buổi trả về danh sách lỗi và đưa vào **sổ lỗi sai** đã có. Dùng Gemini CLI như `correct_writing_ai`.
Bắt đầu bằng chữ, sau này thêm giọng nói khi đã có 2.2.

**2.5 Giải đấu tuần có lên/xuống hạng.**
Đồng, Bạc, Vàng, Kim cương… Mỗi tuần chia người học thành nhóm ~20–30 người cùng hạng. Top 5 lên hạng, cuối bảng
xuống hạng. Bảng xếp hạng nhóm nhỏ tạo động lực mạnh hơn bảng toàn bộ người dùng (người mới không bao giờ thấy mình
gần top). Cần thêm bảng và hàm phía Supabase để chia nhóm mỗi tuần.

**2.6 Nhiệm vụ nhóm.**
Nhóm bằng mã mời đã có. Thêm mục tiêu chung tuần ("Cả nhóm 500 câu đúng"), thanh tiến độ chung, thưởng chung.
Người học ngại làm cả nhóm thất vọng, nên đây là động lực xã hội nhẹ nhàng.

### Ưu tiên 3: công lớn hoặc cần cân nhắc

- **Chấm phát âm tự động**: Whisper chạy trên máy (whisper.cpp) để so chữ nói ra với chữ mẫu, hoặc dịch vụ chấm theo
  âm vị (Azure Pronunciation Assessment, mất phí, gửi giọng nói lên mạng). Làm sau 2.2.
- **Ứng dụng điện thoại đi kèm** (chỉ ôn thẻ + nhận nhắc nhở), dùng chung dữ liệu qua Supabase sync đã có.
  Duolingo/Anki giữ chân phần lớn nhờ điện thoại. Tauri 2 build được iOS/Android, nhưng phần nhắc nhở thông minh
  hiện tại (phát hiện toàn màn hình, chia sẻ màn hình) phải làm lại cho điện thoại.
- **Kiểm tra cuối cấp + chứng chỉ** (A1 → A2…): mốc tiến bộ rõ ràng, tạo cảm giác đạt được (Busuu).
- **Tổng kết tháng/năm dạng ảnh để chia sẻ**: số từ, số phút, chuỗi dài nhất, từ khó nhất đã chinh phục.
- **Đăng nhập Google**: giảm ma sát khi tạo tài khoản để dùng bảng xếp hạng.

### Không nên học theo

- **Tim/năng lượng giới hạn số lần sai** (Duolingo): phạt người sai làm họ né từ khó. App không bán gói trả phí
  nên không cần cơ chế này.
- **Thông báo quá dày, giọng gây tội lỗi**: app đã có giới hạn 8 lần/ngày và giờ yên tĩnh. Giữ nguyên giới hạn đó,
  chỉ thêm nhắc giữ chuỗi buổi tối.
- **XP cho việc dễ** (ví dụ ôn lại bài cũ lấy XP gấp đôi): làm người học "cày" XP thay vì học. XP nên tiếp tục
  tính theo câu trả lời thật.

---

## 4. Thứ tự đề xuất

| # | Việc | Ước lượng | Lý do |
|---|---|---|---|
| 1 | Phiên tập trung (GĐ0 + GĐ1 kế hoạch có sẵn) | 2–3 ngày | Trực tiếp giải bài toán tập trung, có số đo D1/D7 |
| 2 | Âm thanh phản hồi + combo | 0,5 ngày | Rẻ nhất, tạo phần thưởng sau mỗi câu |
| 3 | Nhiệm vụ hằng ngày + rương | 1–2 ngày | Lý do mới để mở app mỗi ngày, kéo sang kỹ năng yếu |
| 4 | Sửa chuỗi, mốc chuỗi, nhắc giữ chuỗi buổi tối | 1 ngày | Tận dụng cơ chế sợ mất |
| 5 | Phím tắt tra/lưu từ toàn cục | 2 ngày | Lợi thế riêng của desktop, hợp với người học IT |
| 6 | Ghi âm + nghe lại (shadowing) | 1–2 ngày | Mở đầu cho kỹ năng nói |
| 7 | Bài đọc ngắn từ các từ đang học | 2 ngày | Nội dung mới mỗi ngày |
| 8 | Đóng vai hội thoại bằng chữ | 2–3 ngày | Dùng từ vào tình huống thật |
| 9 | Giải đấu lên/xuống hạng, nhiệm vụ nhóm | 3–4 ngày | Cần làm thêm phía Supabase |

Sau khi có số đo D1/D7 (việc #1), mỗi tính năng tiếp theo nên ghi sự kiện riêng vào `learning_events` để so sánh
D1/D7 của ngày có dùng tính năng đó với ngày không dùng, giống cách làm cho phiên tập trung.

---

## Nguồn tham khảo

- [Duolingo product highlights](https://blog.duolingo.com/product-highlights/)
- [Duolingo Max](https://blog.duolingo.com/duolingo-max)
- [Duolingo AI features (Croma)](https://croma.com/unboxed/duolingo-new-ai-features-introduced)
- [Best AI English speaking apps 2026 (TalkDrill)](https://www.talkdrill.com/blog/compare/best-ai-english-speaking-apps-2026/)
- [ELSA Speak alternatives 2026 (SpeakShark)](https://speakshark.com/blog/elsa-speak-alternatives)
- [ELSA Speak review 2026 (Tooliverse)](https://tooliverse.ai/tools/elsa-speak)
- [Babbel speech-based features](https://www.babbel.com/press/en-us/releases/learn-with-your-own-voice-babbel-launches-two-new-speech-based-features-us)
- [Best AI tools for language learning 2026 (Rework)](https://resources.rework.com/tools/ai-tools/best-ai-tools-for-language-learning-2026)

Phần lớn nguồn về ELSA, Memrise, Busuu là trang so sánh của bên thứ ba, nên chi tiết tính năng và giá có thể đã khác.
Các cơ chế cốt lõi (chuỗi ngày, giải đấu, nhiệm vụ ngày, Stories, chấm phát âm) đã ổn định nhiều năm.
