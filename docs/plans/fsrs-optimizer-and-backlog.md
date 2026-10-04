# Kế hoạch: Tối ưu tham số FSRS theo người dùng & các việc còn tồn đọng

> Tạo ngày 2026-10-01, trên branch `fix/learning-algorithm`.
> Bối cảnh: đã sửa xong lõi thuật toán học (learning steps, cách chấm điểm, chế độ luyện thêm, lịch ôn ngữ pháp…).
> File này ghi lại những việc **chưa làm** và cách làm chi tiết.

---

## Phần A — Tối ưu tham số FSRS (FSRS Optimizer)

### A0. Mục tiêu

FSRS lên lịch dựa trên 21 tham số `w` (FSRS-6, đúng với `ts-fsrs` 5.x). App đang dùng bộ `default_w`, được huấn luyện trên dữ liệu của rất nhiều người.
Optimizer huấn luyện lại `w` từ lịch sử ôn của chính user, để khoảng ôn khớp với tốc độ quên thật của họ:
ít lượt ôn thừa hơn mà vẫn giữ đúng mục tiêu ghi nhớ (`requestRetention`).

**Tiêu chí hoàn thành**
- User có đủ dữ liệu thì bấm được "Tối ưu theo trí nhớ của bạn", thấy chỉ số trước/sau và chọn áp dụng hoặc bỏ qua.
- Bộ `w` đã áp dụng được lưu bền (SQLite) và dùng ở mọi chỗ gọi `getFSRSScheduler()`.
- Có nút quay về tham số mặc định.

### A1. Thu thập dữ liệu sạch — ✅ ĐÃ LÀM (migration v3)

- Bảng `review_logs` có thêm cột `is_scheduled`:
  - `1`: lượt ôn đúng lịch, có gọi `recordReview` → **dữ liệu huấn luyện hợp lệ**
  - `0`: luyện thêm (Practice All, popup ôn từ chưa đến hạn), không đổi lịch
  - `NULL`: log ghi trước migration v3 → **loại khỏi huấn luyện**, vì lúc đó cách chấm điểm còn lệch (Easy quá dễ, trắc nghiệm không bao giờ ra Again)
- Nơi ghi: `FlashcardReview.handleGrade` (`isScheduled: !practiceMode`), `FocusReviewModal.gradeWord` (`isScheduled: isScheduledReview`).

> ⚠️ Từ giờ đến lúc làm A2, **không đổi ý nghĩa của cột `rating`** trong `review_logs`. Rating phải luôn là grade FSRS (1–4) đúng như đã truyền vào `recordReview`.

### A2. Chọn engine huấn luyện

| Phương án | Ưu | Nhược |
|---|---|---|
| **(Khuyến nghị) Crate Rust `fsrs` (fsrs-rs)**, gọi qua Tauri command | Cùng engine Anki đang dùng, chạy native nhanh, không phụ thuộc WebView | Kéo theo `burn` (framework ML) nên build lâu hơn và binary to hơn; cần kiểm tra cross-build Windows (`scripts/build-win-docker.sh`) |
| Bản WASM của fsrs-rs (vd. `fsrs-browser`) chạy trong WebView | Không đụng tới Rust build | Cần kiểm tra package còn được bảo trì không và có hỗ trợ FSRS-6 không; tải WASM lớn; chạy trên main thread phải dùng Web Worker |
| `@open-spaced-repetition/binding` (napi) | — | ❌ Native module của Node, **không chạy được trong WebView** → loại |

**Việc cần kiểm tra trước khi code (spike khoảng nửa ngày):**
1. Phiên bản mới nhất của crate `fsrs`: có xuất ra **21 tham số FSRS-6** không, để dùng thẳng cho `generatorParameters({ w })` của `ts-fsrs` 5.4. Nếu crate còn ở FSRS-5 (19 tham số) thì dùng `migrateParameters` của ts-fsrs, hoặc chọn phiên bản crate khớp.
2. Đo thời gian build và dung lượng binary tăng thêm trên macOS và trong Docker cross-build Windows.
3. Kiểm tra API: `FSRS::new(None)` → `compute_parameters(ComputeParametersInput { train_set, .. })`, và hàm `evaluate` để tính log loss / RMSE.

### A3. Thiết kế luồng dữ liệu

Không cho Rust đọc trực tiếp SQLite, vì sẽ tranh khóa file với `tauri-plugin-sql`. JS đọc log rồi gửi mảng gọn sang Rust.

```
[JS] fsrsOptimizer.ts
  1. SELECT word_id, rating, timestamp FROM review_logs
     WHERE is_scheduled = 1 ORDER BY word_id, timestamp
  2. Nhóm theo word_id → mỗi thẻ là một chuỗi { rating, delta_days }
     (delta_days = số ngày giữa 2 lượt ôn, làm tròn theo ngày local; lượt đầu = 0)
  3. invoke("compute_fsrs_parameters", { items, currentW })
        │
[Rust] #[tauri::command] compute_fsrs_parameters
  4. Dựng FSRSItem / FSRSReview cho fsrs-rs
  5. compute_parameters(...) → w_new
  6. evaluate(w_default / w_current) và evaluate(w_new) → { logLoss, rmse }
  7. Trả về { w: w_new, before: metrics, after: metrics, reviewCount, cardCount }
        │
[JS]
  8. UI hiển thị so sánh; user bấm "Áp dụng" thì lưu w_new
```

**Quy tắc lọc dữ liệu (ở bước 2):**
- Bỏ thẻ có ít hơn 2 lượt ôn hợp lệ (không có khoảng cách để học).
- Nhiều lượt trong cùng ngày local: fsrs-rs có xử lý short-term (delta = 0). Kiểm tra lại tài liệu crate xem có nên giữ hay chỉ lấy lượt đầu tiên trong ngày.
- Bỏ log của từ đã xóa (`deleteWord` đã xóa log kèm theo; vẫn nên JOIN với `words` cho chắc).

### A4. Ngưỡng dữ liệu tối thiểu

- Chỉ bật nút khi `reviewCount (is_scheduled=1) ≥ MIN_REVIEWS` và `cardCount ≥ MIN_CARDS`.
- Giá trị khởi điểm đề xuất: `MIN_REVIEWS = 400`, `MIN_CARDS = 50`. **Cần đối chiếu lại với khuyến nghị hiện tại của fsrs-rs/Anki** trước khi chốt, vì con số này mình nhớ chưa chắc.
- Khi chưa đủ: hiện thanh tiến độ "Còn X lượt ôn nữa để tối ưu".

### A5. Lưu & áp dụng tham số

- Lưu `w` trong `app_kv` (SQLite) với key `myenglish_fsrs_weights_v1`, giá trị JSON `{ w: number[], computedAt, reviewCount, metrics }`.
  `storageBackup.ts` đã mirror các key `myenglish_*` nên có thể giữ API đồng bộ qua `localStorage` như các setting khác.
- Sửa `getFSRSScheduler()` trong `src/services/srs.ts`:
  - đọc `w` đã lưu (nếu có và hợp lệ: đúng số phần tử, toàn số hữu hạn) rồi truyền vào `generatorParameters({ w, ... })`
  - đưa `w` vào cache key của scheduler (hiện key là `retention|maxInterval`)
- Nút "Khôi phục tham số mặc định": xóa key, cache tự làm mới.
- **Không** tự động tối ưu ngầm. Luôn để user xác nhận.

### A6. UI (trong `CliGuideView.tsx`, khối cài đặt FSRS)

- Thẻ "Tối ưu theo trí nhớ của bạn":
  - Trạng thái: số lượt ôn hợp lệ / ngưỡng; ngày tối ưu lần cuối
  - Nút "Tối ưu ngay" → spinner (chạy có thể mất vài giây đến vài chục giây)
  - Kết quả: log loss / RMSE trước và sau. Nếu `after` không tốt hơn `before` thì khuyên **không áp dụng**
  - Nút "Áp dụng" / "Bỏ qua" / "Khôi phục mặc định"
- Gợi ý tối ưu lại sau mỗi khoảng +500 lượt ôn mới, hoặc mỗi 1–3 tháng.

### A7. Kiểm thử

- Rust: unit test `compute_fsrs_parameters` với dữ liệu giả lập (vài trăm thẻ có tốc độ quên khác nhau). Kiểm tra trả về 21 số hữu hạn và metrics `after ≤ before` trên tập train.
- JS: test hàm nhóm log → chuỗi `{rating, delta_days}` (nhiều thẻ, nhiều lượt cùng ngày, log `is_scheduled = 0/NULL` bị loại).
- Thủ công: áp dụng `w` mới rồi xem preview khoảng ôn (`getNextIntervalPreviews`) thay đổi hợp lý; khôi phục mặc định rồi xem preview quay lại như cũ.

### A8. Ước lượng công sức

| Việc | Ước lượng |
|---|---|
| A2 spike (chọn crate, build Windows) | 0.5 ngày |
| A3 Rust command + JS chuẩn bị dữ liệu | 1 ngày |
| A5 lưu/áp dụng + sửa `getFSRSScheduler` | 0.5 ngày |
| A6 UI | 0.5 ngày |
| A7 test | 0.5 ngày |
| **Tổng** | **khoảng 3 ngày** |

**Thời điểm nên làm:** khi có ít nhất vài trăm lượt `is_scheduled = 1`, tính từ ngày release bản sửa thuật toán. Sau khoảng 1–2 tháng dùng đều đặn thì truy vấn để kiểm tra:
```sql
SELECT COUNT(*) AS reviews, COUNT(DISTINCT word_id) AS cards
FROM review_logs WHERE is_scheduled = 1;
```

---

## Phần B — Transaction thật cho các thao tác ghi nhiều bước

### B0. Vấn đề

`tauri-plugin-sql` dùng pool nhiều kết nối. Mỗi `db.execute()` từ JS là một lần gọi IPC và có thể chạy trên kết nối khác nhau.
Vì vậy gửi `BEGIN` / `COMMIT` riêng lẻ từ JS **không tạo ra transaction thật**, có khi còn gây `database is locked`.

### B1. Đã giảm thiểu (không mất dữ liệu học)

| Thao tác | Nếu lỗi giữa chừng | Cách xử lý hiện tại |
|---|---|---|
| `insertEnrichedWord`: có từ nhưng thiếu `srs_reviews` | từ không bao giờ đến hạn | Lúc khởi động tự tạo lại bản ghi SRS còn thiếu; `getDueWordsFromDb`/`countDueWords` coi từ thiếu SRS là từ mới đến hạn |
| `insertEnrichedWord`: ghi examples lỗi | — | Ghi examples mới **trước**, xóa cái cũ **sau**; insert nhiều dòng trong 1 câu lệnh |
| `deleteWord` | còn log hoặc example mồ côi | Xóa `words` trước; dữ liệu mồ côi vô hại |
| `recordReview` | — | 1 câu lệnh UPSERT nên tự atomic |

### B2. Khi nào cần làm tiếp

Chỉ cần làm khi có một trong các yêu cầu sau:
- Đồng bộ nhiều thiết bị / cloud sync
- Import / export hàng loạt (vd. nhập file Anki, CSV hàng nghìn từ)
- Thao tác hàng loạt cần "tất cả hoặc không gì cả" (xóa theo chủ đề, reset tiến độ)

### B3. Cách làm

1. Thêm `rusqlite` (feature `bundled`) hoặc dùng `sqlx` (đã có gián tiếp qua plugin) trong `src-tauri/Cargo.toml`.
2. Viết command Rust, ví dụ `save_word_atomic(input)`, `delete_words_atomic(ids)`, `import_words_atomic(items)`:
   - mở **một** kết nối tới đúng file DB mà plugin dùng (`app_config_dir/myenglish.db`; xác minh đường dẫn thực tế của `sqlite:myenglish.db`)
   - bật `PRAGMA busy_timeout = 5000` để chờ khi plugin đang ghi
   - chạy toàn bộ trong `BEGIN IMMEDIATE … COMMIT`, lỗi thì `ROLLBACK`
3. Cân nhắc bật `PRAGMA journal_mode = WAL` cho DB, để đọc từ plugin không bị chặn khi Rust ghi.
4. Chuyển `insertEnrichedWord` / `deleteWord` trong `src/services/db.ts` sang gọi command mới. Giữ đường cũ làm fallback ngoài Tauri.
5. Test: giả lập lỗi giữa transaction (vd. vi phạm constraint ở bước cuối) rồi kiểm tra không còn dòng nào được ghi.

**Ước lượng:** 1–1.5 ngày.

---

## Phần C — Kiểm tra sau khi merge `fix/learning-algorithm` (thủ công trong app)

- [ ] DB cũ mở lên không lỗi; `PRAGMA user_version` = 3; có cột `srs_reviews.learning_steps` và `review_logs.is_scheduled`
- [ ] Thẻ mới: bấm Good 2 lần → chuyển sang Review (khoảng 2 ngày), không lặp 10 phút
- [ ] Trắc nghiệm sai 1 lần → thẻ quay lại sau khoảng 3 thẻ trong cùng phiên
- [ ] "Practice All" hiện nhãn "Luyện thêm"; `next_review_date` không đổi sau phiên; log có `is_scheduled = 0`
- [ ] Popup ôn từ chưa đến hạn không đổi lịch; từ đến hạn thì có đổi
- [ ] Giới hạn từ mới/ngày và kích thước phiên thay đổi được trong cài đặt FSRS và có hiệu lực
- [ ] Gõ sai 1 ký tự (từ ≥ 5 chữ) → báo "Gần đúng", tính là Hard
- [ ] Ngữ pháp: trả lời sai → bài đến hạn lại vào ngày mai; nhiều câu cùng bài trong một popup không đẩy lịch xa
- [ ] Auto-replenish không chạy khi còn hơn 20 từ đến hạn; streak không tăng chỉ nhờ AI thêm từ
- [ ] Xóa dữ liệu WebView (localStorage) → mở lại app thì XP / streak / cài đặt được khôi phục từ SQLite
