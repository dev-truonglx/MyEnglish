# Lộ trình cải tiến MyEnglish

> Tạo ngày 2026-10-01, sau đợt rà soát toàn bộ app trên branch `fix/learning-algorithm`.
> Kích thước: **S** = vài giờ · **M** = 1–2 ngày · **L** = ≥ 3 ngày.
> Nên làm trước: **#11 → #1 → #6** (xem lý do ở cuối).
>
> **Cập nhật 2026-10-05:** ✅ #11, ✅ #1, ✅ #6 xong trên branch `fix/learning-algorithm` (PR #1); ✅ #4, ✅ #12, ✅ #13 xong trên
> branch `feat/grammar-fsrs-refactor-bundle` (tách ra từ PR #1). Ghi chú triển khai ở từng mục.
>
> **Cập nhật 2026-10-10:** rà soát cho người "mất gốc" (dân IT) ở [`review-2026-10-10.md`](./review-2026-10-10.md). Cả 4 giai đoạn
> đã làm: chấm đáp án, prompt AI, lời nhắc có điểm dừng; nền móng A0 (IT Core 300, phát âm, ngữ pháp nền); màn hình "Hôm nay",
> chế độ đơn giản, giờ học cố định; bậc thang nhớ lại (xếp chữ), xếp trình độ thích ứng, mẹo nhớ bằng AI.
>
> **Cập nhật 2026-10-07 (tối):** các tính năng lôi kéo / giữ chân / học tốt hơn (quay lại nhẹ nhàng, bộ từ có sẵn +
> onboarding, đoán nghĩa trước khi học, chế độ đọc, sổ lỗi, nhắc lúc chuyển việc) ở
> [`engagement-features-2026-10-07.md`](./engagement-features-2026-10-07.md). Mục #2 (ngữ cảnh gốc) được mở rộng qua chế độ đọc.
>
> **Cập nhật 2026-10-07:** rà soát mới ở [`review-2026-10-07.md`](./review-2026-10-07.md), có kế hoạch 5 giai đoạn thay cho bảng
> "Thứ tự đề xuất" bên dưới. Giới hạn retry placeholder (mục tồn đọng thứ 3) đã làm (`MAX_AUTO_REQUEUE_ATTEMPTS = 3`).

---

## A. Hiệu quả học

### 1. Lịch ôn tách 2 chiều: nhận diện và tự nhớ ra — M ✅

> **Đã làm (khác với hướng ban đầu):** không đổi khóa của `srs_reviews` (bảng này giữ vai trò thẻ nhận diện), mà thêm bảng
> `srs_production` (migration v4). Thẻ nhớ lại được tạo khi thẻ nhận diện lên Review, và đến hạn vào ngày hôm sau.
> Migration tạo sẵn thẻ nhớ lại cho các từ đã thuộc, với stability bằng một nửa. Code chính nằm trong `src/services/cards.ts`
> (`ReviewCard`, `directionForExercise`, `getDueCards`, `isWordDue`). `recordReview(wordId, rating, direction)` tự quay về thẻ nhận diện
> khi từ chưa có thẻ nhớ lại. `review_logs.direction` đã được ghi lại. Test: `test/cards.test.ts`.

- **Vấn đề:** mỗi từ chỉ có một trạng thái FSRS (`srs_reviews`, khóa theo `word_id`). Trắc nghiệm EN→VN đúng (chỉ cần nhận ra) được tính giống gõ đúng từ tiếng Anh (phải tự nhớ ra), nên lịch ôn chiều gõ từ bị kéo dài quá mức.
- **Hướng làm:**
  - Thêm cột `direction` vào `srs_reviews` (`recognition` | `production`), đổi khóa chính thành `(word_id, direction)`. Viết migration tạo thẻ `production` từ dữ liệu cũ, bắt đầu với stability thấp hơn.
  - `selectExerciseType` chọn bài theo chiều: recognition gồm flip, multiple_choice EN→VN, context_match; production gồm spelling, cloze, listening, reverse_cloze, multiple_choice VN→EN.
  - `buildReviewSession` xếp lịch từng thẻ. Không đưa 2 chiều của cùng một từ vào cùng phiên trong một ngày (giống "bury siblings" của Anki).
  - Ghi thêm `direction` vào `review_logs`, để optimizer (#10) huấn luyện riêng cho từng chiều.
- **File liên quan:** `src/services/db.ts`, `srs.ts`, `smartReview.ts`, `FlashcardReview.tsx`, `FocusReviewModal.tsx`.

### 2. Lưu ngữ cảnh gốc khi thêm từ — S–M
- Quick Input đã đọc clipboard. Nếu clipboard là một câu hoặc đoạn văn, lưu câu chứa từ đó vào `examples` với cột nguồn mới, ví dụ `source = 'user_context'`.
- Bài cloze, context match và sentence builder ưu tiên dùng câu của chính user trước câu do AI tạo.
- Có thể gửi kèm câu gốc cho AI để giải thích đúng nghĩa trong ngữ cảnh đó.

### 3. Bài tập tự viết câu có AI chấm — M
- Kiểu bài tập mới `free_writing`. Ví dụ: "Viết 1 câu comment PR dùng từ `idempotent`".
- AI trả JSON `{ correct, score, corrections[], better_version, explanation_vn }`. Điểm này được đổi sang grade FSRS bằng `deriveRating`.
- Chỉ dùng cho thẻ đang ở state Review, tối đa N lần mỗi ngày để giới hạn số lần gọi AI.
- Cần thêm command Rust mới, dùng lại `run_ai_cli` và các hàm kiểm tra đầu vào hiện có.

### 4. Dùng FSRS cho ngữ pháp — M ✅

> **Đã làm:** `GrammarProgress` có thêm `stability`, `difficulty`, `fsrsState`, `lastReview` (các cột SQLite được thêm bằng ALTER). Ngữ pháp dùng scheduler riêng
> `getGrammarScheduler()` với `enable_short_term: false`, nên khoảng ôn luôn tính theo ngày. Điểm được đổi sang grade bằng `gradeFromScore`. Một bài chỉ
> được tính lượt ôn khi đã đến hạn, hoặc khi trả lời sai (tối đa 1 lần mỗi phiên 12 giờ). Tiến độ theo lịch cố định cũ được tự quy đổi: khoảng ôn
> cũ trở thành stability. Test nằm trong `test/grammar.test.ts`.

- `grammarService.calculateNextReview` đang dùng khoảng cách cố định `[1, 3, 7, 14, 30, 60, 120]` ngày.
- Chuyển `grammar_progress` sang các trường FSRS (stability, difficulty, state, learning_steps) và dùng chung `getFSRSScheduler()`.
- Đổi kết quả sang grade: điểm < 60% → Again, 60–80% → Hard, > 80% → Good.
- Giữ `mastery` để hiển thị trên UI, nhưng lịch ôn chỉ dựa theo FSRS.

### 5. Xử lý leech chủ động — S
- Khi một từ thành leech: tự động tạo lại ví dụ và mẹo nhớ mới (`aiMnemonic.ts` hiện chỉ điền template, chưa gọi AI).
- Gợi ý tách nghĩa nếu từ có nhiều nghĩa.
- **Cần kiểm tra trước:** `LeechSettings.action` có `suspend` / `relearn`, nhưng chưa rõ hai giá trị này đã có code xử lý chưa. Nếu chưa thì thêm cột `suspended` và loại thẻ bị suspend khỏi `getDueWordsFromDb` / `buildReviewSession`.

---

## B. Thói quen học và trải nghiệm

### 6. Popup không làm phiền vào lúc không phù hợp — M ✅

> **Đã làm:** command Rust `get_popup_blockers` (module `macos_focus`, FFI tới CoreGraphics/AppKit, không cần xin thêm quyền). Phát hiện được:
> app toàn màn hình đang ở phía trước, Zoom đang chia sẻ màn hình (process `CptHost`), user không thao tác từ 5 phút, và Focus nếu macOS cho
> đọc `~/Library/DoNotDisturb/DB/Assertions.json` (đọc không được thì bỏ qua). `SRSBackgroundWorker.tick` hoãn popup và thử lại ở tick sau.
> Có cài đặt `respectFocus` (mặc định bật). Test: `test/popup.test.ts`, và smoke test `cargo test popup_blockers_smoke -- --ignored`.
> **Chưa làm:** Windows (chưa phát hiện được gì), share màn hình bằng Teams/Meet/trình duyệt, Focus theo lịch.

- Popup đang phủ kín màn hình, rất bất tiện khi user đang share màn hình, họp hay thuyết trình.
- Nên hoãn popup (thử lại sau vài phút) khi:
  - một app khác đang toàn màn hình (macOS: `CGWindowListCopyWindowInfo` / `NSApplicationPresentationOptions`)
  - đang share màn hình hoặc quay màn hình (nếu phát hiện được)
  - macOS đang bật Focus / Do Not Disturb
  - user không thao tác lâu (máy đang để không)
- Thêm phần này vào `SRSBackgroundWorker.tick` (`srs.ts`), cùng một command Rust kiểm tra trạng thái hệ thống, đặt cạnh code macOS hiện có trong `lib.rs`.
- Thêm cài đặt: "Không hiện popup khi đang toàn màn hình hoặc họp" (mặc định bật).

### 7. Dự báo khối lượng ôn 7 và 30 ngày — S
- Biểu đồ số thẻ đến hạn mỗi ngày, lấy từ `srs_reviews.next_review_date` (`GROUP BY` theo ngày local).
- Cảnh báo khi số thẻ đến hạn trung bình vượt `maxSessionSize`, và gợi ý giảm `newCardsPerDay`.
- Đặt trong `AnalyticsView.tsx`.

### 8. Hiện số từ đến hạn trên menu bar / tray — S
- Cập nhật tooltip hoặc title của tray icon, ví dụ `MyEnglish · 12`, mỗi lần worker tick (dùng `countDueWords()`).
- Cần một command Rust `set_tray_due_count(n)`. Tray được tạo trong `setup` ở `lib.rs`.

---

## C. Dữ liệu

### 9. Export/Import và sao lưu ra file — M
- Export ra JSON (đầy đủ: words, examples, srs, review_logs, app_kv) và CSV (đọc được bằng Excel).
- Import từ JSON và CSV. Anki `.apkg` để sau, vì cần đọc file SQLite bên trong zip.
- Tùy chọn tự động sao lưu hằng ngày vào một thư mục user chọn (iCloud Drive / Dropbox).
- Import hàng loạt nên dùng transaction thật, xem Phần B của `fsrs-optimizer-and-backlog.md`.

### 10. Tối ưu tham số FSRS theo người dùng — L
- Đã có plan chi tiết: [`fsrs-optimizer-and-backlog.md`](./fsrs-optimizer-and-backlog.md), Phần A.
- Điều kiện bắt đầu: có đủ log `is_scheduled = 1` (khoảng 1–2 tháng dùng đều).
- Nếu làm #1 trước, nên huấn luyện riêng cho từng chiều.

---

## D. Kỹ thuật

### 11. Unit test và CI — S–M ✅

> **Đã làm:** Vitest với `@tauri-apps/plugin-sql` được giả lập bằng SQLite thật trong bộ nhớ (`node:sqlite`, cần Node ≥ 22.13), xem
> `test/stubs/`. Có 55 test JS (`npm test`) và 8 test Rust. CI ở `.github/workflows/ci.yml`: typecheck, test và build frontend trên
> Ubuntu, `cargo test` trên macOS.

- Thêm `vitest`. Chuyển các script kiểm tra đã dùng trong đợt sửa lỗi thành test:
  - `srs.ts`: thẻ mới bấm Good ra khỏi Learning; R tại ngày đến hạn ≈ `requestRetention`; giữ `learning_steps` khi lưu rồi đọc lại.
  - `smartReview.ts`: `deriveRating`, `matchTypedAnswer`, `buildReviewSession` (hạn mức từ mới, giới hạn phiên, loại từ đang chờ phân tích), `smartSortReviewQueue` (xen kẽ chủ đề).
  - `grammarService.ts`: `recordPracticeResult` / `recordDiagnosticResult` (trả lời sai thì đặt lại lịch, nhiều câu cùng phiên không đẩy lịch xa).
  - Hàm escape regex, `normalizeTypedText`, dữ liệu `grammarData` (id không trùng, đáp án đúng nằm trong options).
- Mock các module `@tauri-apps/*` bằng alias, giống stub đã dùng khi kiểm tra bằng esbuild.
- GitHub Actions chạy `npm run check`, `vitest run` và `cargo check` (cùng `cargo test` cho các test Rust có sẵn) trên mỗi PR.

### 12. Tách các component quá lớn — M ✅

> **Đã làm:** `MainDashboard` giảm từ 3.257 xuống 673 dòng. Các tab và panel được tách vào `src/components/dashboard/`. `FlashcardReview` giảm từ 1.835
> xuống khoảng 300 dòng: logic phiên học chuyển vào `src/hooks/useReviewSession.ts`, các thẻ chuyển vào `src/components/review/`. Store zustand
> `src/stores/wordsStore.ts` giữ words/loading/selectedWord, có `refreshWords` (bỏ qua response cũ nếu có lượt refresh mới hơn). Đây là
> refactor chỉ di chuyển code, không đổi giao diện. Đã kiểm tra bằng script rằng mọi dòng JSX cũ đều còn trong các file mới.

- `MainDashboard.tsx` (~3.100 dòng): tách theo tab (Library, Review, Analytics, Settings) và các panel (Inspector, Sidebar).
- `FlashcardReview.tsx` (~1.700 dòng): tách hàng đợi phiên học thành hook `useReviewSession`, mỗi kiểu bài thành một component riêng.
- Chuyển state dùng chung (words, selectedWord, isReviewing) sang store `zustand` (đã có trong dependencies), để bỏ các lỗi closure cũ (stale closure).
- Làm sau #11, để có test bảo vệ khi refactor.

### 13. Giảm bundle size — S ✅

> **Đã làm:** dùng `React.lazy` cho từng cửa sổ trong `App.tsx` và cho các tab Review/Analytics/Guide/Grammar cùng popup trong `MainDashboard`.
> Trước đây là một file JS 777 KB. Giờ phần dùng chung còn 241 KB, MainDashboard 156 KB, FlashcardReview 93 KB, QuickInput 8 KB, popup 32 KB
> (cộng grammarService 82 KB). Cảnh báo chunk > 500 KB đã hết. `grammarData` vẫn nằm trong chunk grammarService, vì popup cần dùng ngay và các
> hàm sync dùng tới nó.

- Bundle hiện 747 KB (cảnh báo > 500 KB).
- Dùng `import()` động cho `grammarData`, `AnalyticsView`, `CliGuideView`, `GrammarHub`.
- Popup và Quick Input chỉ tải phần mình cần, nên mở nhanh hơn. `App.tsx` đã rẽ nhánh theo `windowLabel`; dùng `React.lazy` cho từng nhánh.

---

## E. Đợt rà soát 2026-10-05: popup, ghi nhớ và động lực học

Đã làm, có test (`test/popupSession.test.ts`, `test/progress.test.ts`) và kiểm tra trên giao diện:

- ✅ **Giới thiệu từ mới trước khi hỏi:** popup hiện thẻ giới thiệu (từ, nghĩa, ví dụ, phát âm) trước câu hỏi đầu tiên của từ mới.
  Flashcard ở chế độ trộn luôn dùng thẻ lật cho từ mới. Xem `needsIntro` (`src/services/popupSession.ts`) và `selectExerciseType`.
- ✅ **Đáp án nhiễu hợp lý:** popup dùng `generateMultipleChoiceQuestion`, ưu tiên cùng chủ đề rồi cùng từ loại.
- ✅ **Chấm điểm popup giống flashcard:** `popupAnswerRating` dùng `deriveRating` (chậm hoặc gõ gần đúng → Hard).
- ✅ **Thẻ nhắc bị bỏ qua thì hoãn lũy tiến** 10 → 20 → 40 phút, tối đa bằng chu kỳ nhắc. Bấm bất kỳ nút nào thì reset.
  Xem `snoozeIgnoredNudge` trong `reminderSettings.ts`.
- ✅ **Phản hồi khi sai:** hiện từ đã chọn nhầm và nghĩa của nó, câu ví dụ có tô đậm kèm bản dịch, mẹo nhớ nếu đã có.
- ✅ **Chuỗi ngày học có "đóng băng":** cứ 7 ngày học được 1 lượt, giữ tối đa 2 (`computeStreak`). Mục tiêu ngày cũng đạt khi đã
  ôn hết từ đến hạn. Chỉ câu trả lời đầu tiên của mỗi thẻ được tính vào mục tiêu.
- ✅ **Tóm tắt cuối phiên popup** (số câu đúng ngay lần đầu, mỗi từ gặp lại sau bao lâu) và thẻ **"Tuần này"** (lượt trả lời, số từ,
  số ngày học, tỉ lệ nhớ thực tế so với mục tiêu, số từ nhớ chắc). Thẻ này nằm ở tab Review và Analytics.
- ✅ **Thử thách chủ đề hằng tuần:** trả lời đúng N câu của chủ đề còn nhiều từ chưa thuộc nhất, hoàn thành được +50 XP
  (`getTopicChallenge`).
- ✅ Sửa lỗi: bấm Enter hai lần nhanh trong popup từng nhảy qua mất một câu.

## Còn tồn đọng từ đợt rà soát

- **CSP cho webview** (`tauri.conf.json` → `security.csp` đang là `null`): cần chạy app thật để kiểm tra, vì `index.html` có inline script. Gợi ý: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' ipc: http://ipc.localhost`.
- **CLI AI không còn `--dangerously-skip-permissions`:** cần thử thêm từ bằng AI. Nếu CLI không chạy, thử `--mode plan` hoặc chặn tool. **Không** bật lại cờ cũ.
- **Từ còn placeholder khi chưa cài CLI:** mỗi lần mở app sẽ thử phân tích lại rồi lỗi tiếp. Nên thêm giới hạn số lần thử (ví dụ tối đa 3 lần, rồi đánh dấu "cần phân tích thủ công").

---

## Thứ tự đề xuất

| Thứ tự | Mục | Lý do |
|---|---|---|
| 1 | #11 Test + CI | Bảo vệ các thay đổi thuật toán phía sau |
| 2 | #1 Lịch ôn 2 chiều | Cải tiến thuật toán lớn nhất còn lại |
| 3 | #6 Popup không làm phiền | Tránh việc user tắt hẳn tính năng nhắc |
| 4 | #7, #8 Dự báo + tray | Việc nhỏ, giúp user tự điều chỉnh khối lượng |
| 5 | #2, #5 Ngữ cảnh gốc, leech | Tăng chất lượng ghi nhớ |
| 6 | #4 FSRS ngữ pháp | Một chuẩn lên lịch cho cả app |
| 7 | #9 Export/backup | An toàn dữ liệu, bước đệm cho sync |
| 8 | #12, #13 Refactor, bundle | Làm khi đã có test |
| 9 | #3 Tự viết câu có AI chấm | Cần AI ổn định (sau khi kiểm tra CLI) |
| 10 | #10 Optimizer | Khi đủ dữ liệu |
