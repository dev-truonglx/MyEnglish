# Phiên tập trung + đo D1/D7 (2026-10-17)

Mục tiêu: giúp người học **ngồi học trọn một khoảng ngắn, không bị cắt ngang**, và **đo được** việc đó có làm họ
quay lại học hôm sau / tuần sau nhiều hơn không.

Làm theo thứ tự: **GĐ0 đo lường → GĐ1 phiên tập trung → GĐ2 hoàn thiện**. Đo trước vì log hoạt động theo ngày
(`myenglish_study_logs_v1`) đã có sẵn, nên có ngay số liệu "trước khi có tính năng" để so sánh.

---

## GĐ0. Đo D1/D7 và tỉ lệ hoàn thành phiên

### Định nghĩa (cho 1 người dùng, tính cuốn chiếu)

App chỉ có một người học, nên không dùng D1/D7 kiểu "nhóm người cài cùng ngày". Thay vào đó, xét từng **ngày học**
`d` (ngày có ≥ 1 câu trả lời, lấy từ `getActivityLogs()` — cùng nguồn với chuỗi ngày học):

| Chỉ số | Cách tính | Ngày `d` được tính khi |
|---|---|---|
| **D1** – quay lại hôm sau | % ngày học `d` mà `d+1` cũng có học | `d+1` ≤ hôm qua (hôm nay chưa xong thì chưa tính) |
| **D7** – quay lại sau 1 tuần | % ngày học `d` mà `d+7` cũng có học | `d+7` ≤ hôm qua |
| **Ngày học / 7 ngày sau** | Trung bình số ngày có học trong `d+1 … d+7` | `d+7` ≤ hôm qua |

Mặc định tính trên 30 ngày gần nhất, so với 30 ngày trước đó (mũi tên tăng/giảm).

**Tách theo phiên tập trung:** tính D1/D7 riêng cho ngày *có* ít nhất 1 phiên tập trung hoàn thành và ngày *không có*.
Đây là con số trả lời câu hỏi "tính năng có giúp quay lại không". Chỉ hiện so sánh khi mỗi nhóm có ≥ 5 ngày,
dưới mức đó ghi "Cần thêm dữ liệu".

### Sự kiện mới (`learning_events`, không cần migration, đã được sync)

| type | Khi nào | meta |
|---|---|---|
| `focus_started` | Bắt đầu phiên | `{ plannedMin, id }` |
| `focus_completed` | Hết giờ, hoặc hết thẻ, hoặc bấm "Xong" sau ≥ 80% thời gian | `{ id, plannedMin, activeSec, cards, firstTry, endedBy: "time" \| "queue" }` |
| `focus_abandoned` | Thoát sớm | `{ id, plannedMin, activeSec, cards }` |

Phiên có `focus_started` mà không có sự kiện kết thúc (tắt app giữa chừng) được tính là bỏ dở.

### Hiển thị

Thẻ **"Thói quen quay lại"** trong Analytics (cạnh `HabitInsightsCard`):
- D1, D7, ngày học / 7 ngày sau, có so sánh với 30 ngày trước.
- Ngày có phiên tập trung vs không có (khi đủ dữ liệu).
- Phiên tập trung: số phiên, % hoàn thành, số phút trung bình, % đúng ngay lần đầu.

### File

- `src/services/retention.ts` (mới): hàm thuần `computeReturnRates(activeDates, { today, windowDays, markedDates })`
  và `focusStats(events)`; `loadRetentionInsights()` đọc log + sự kiện.
- `src/services/learningEvents.ts`: thêm 3 type.
- `src/components/RetentionCard.tsx` (mới) + gắn vào `AnalyticsView`.
- `test/retention.test.ts`: biên ngày, hôm nay chưa học, đổi giờ/đổi tháng, nhóm < 5 ngày, phiên bỏ dở do tắt app.

---

## GĐ1. Phiên tập trung (bản chính)

### Luồng

1. **Vào phiên:** nút "Phiên tập trung" ở tab Hôm nay và tab Ôn tập; chọn **5 / 10 / 15 / 25 phút**
   (nhớ lựa chọn lần trước, mặc định 10). Phím tắt `F` ở tab Hôm nay.
2. **Hàng đợi:** dùng đúng `prepareAndStartReview(true, …)` như nút "Bắt đầu học" (thẻ đến hạn trước, từ mới theo
   hạn mức, kế hoạch comeback). Không có thẻ nào thì báo như hiện nay, không mở phiên rỗng.
3. **Trong phiên — giao diện gọn:**
   - Ẩn Sidebar và DashboardHeader, thẻ ôn nằm giữa màn hình.
   - Thanh mỏng trên cùng: thời gian còn lại (có thể ẩn đồng hồ, cho ai bị áp lực khi thấy đếm ngược),
     số thẻ đã làm, nút "Thoát" (Esc → hỏi xác nhận).
   - **Tắt nhắc nhở:** đặt cờ `focusUntil` (thời điểm kết thúc + 2 phút). Bộ nhắc trong `srs.ts` và `LevelUpModal`
     coi như đang có phiên học, nên không hiện popup hay thẻ nhắc. Cờ tự hết hạn nên nếu app bị tắt giữa chừng
     thì nhắc nhở không bị khóa mãi.
   - **Đồng hồ chỉ chạy khi đang học:** cửa sổ bị ẩn hoặc thu nhỏ (`document.hidden`) thì đồng hồ dừng.
     `activeSec` là thời gian thật sự nhìn vào thẻ.
4. **Hết giờ:** không cắt ngang câu đang làm. Trả lời xong câu hiện tại thì phiên kết thúc
   (`useReviewSession.advance` nhận cờ `stopAfterCurrent`). Thẻ chưa làm vẫn đến hạn như cũ, FSRS không bị ảnh hưởng.
5. **Hết thẻ trước giờ:** kết thúc luôn với `endedBy: "queue"`, tính là hoàn thành. Màn tóm tắt gợi ý
   "Còn X phút: ôn ngữ pháp đến hạn / ôn lỗi sai / dừng ở đây" (chỉ là nút, không tự chạy tiếp).
6. **Màn tóm tắt:** số phút, số thẻ, % đúng ngay lần đầu, số từ vừa được củng cố, mục tiêu ngày / chuỗi ngày,
   **lượt ôn tiếp theo** ("Lượt ôn tới: 14:30, khoảng 6 thẻ"), và nút "Thêm 5 phút".

### File

- `src/services/focusSession.ts` (mới): cài đặt (số phút, ẩn đồng hồ), `startFocus/endFocus`, hàm thuần
  `focusOutcome(...)` để quyết định completed hay abandoned, bộ đếm thời gian hoạt động.
- `src/services/activeSession.ts`: thêm `setFocusUntil` / `isFocusActive`; `isMainSessionActive()` trả `true`
  khi đang tập trung.
- `src/hooks/useReviewSession.ts`: option `stopAfterCurrent`; trong `advance()` kết thúc phiên như khi hết hàng đợi.
- `src/components/FlashcardReview.tsx`: truyền cờ xuống, báo số thẻ / đúng ngay lần đầu cho thanh tập trung.
- `src/components/review/FocusBar.tsx`, `FocusSummary.tsx` (mới).
- `src/components/MainDashboard.tsx`: state `focus`, ẩn sidebar/header khi đang tập trung, `handleStartFocus(min)`.
- `src/components/dashboard/TodayTab.tsx`, `ReviewTab.tsx`: nút vào phiên.
- `test/focusSession.test.ts`: kết quả hoàn thành/bỏ dở, cờ hết hạn, đồng hồ dừng khi ẩn cửa sổ,
  bộ nhắc không hiện khi đang tập trung, hết giờ thì dừng sau câu hiện tại.

---

## GĐ2. Hoàn thiện (sau khi GĐ1 chạy ổn trên app thật)

- Tray / menu bar hiện đồng hồ đếm ngược khi cửa sổ bị ẩn.
- Tùy chọn **toàn màn hình** khi tập trung (`getCurrentWindow().setFullscreen`), mặc định tắt.
- Gợi ý giờ học theo `answersByHour`: "Bạn hay học lúc 12h — đặt phiên tập trung lúc 12:15?" (dùng mốc nhắc
  `anchors` đã có).
- Chọn phiên theo loại: chỉ từ vựng / chỉ ngữ pháp / trộn.

---

## Cách đánh giá (sau 2–3 tuần dùng)

- **D1 của ngày có phiên tập trung cao hơn ngày không có** (mong đợi ≥ +10 điểm %).
- **≥ 70% phiên tập trung hoàn thành.** Thấp hơn thì thời lượng mặc định quá dài → giảm xuống 5 phút.
- Không có popup hay thẻ nhắc nào xuất hiện trong lúc tập trung (có test, và kiểm tra trên app thật).

## Đã chốt (2026-10-17)

1. **Có thưởng XP** cho mỗi phiên hoàn thành: 2 XP cho mỗi phút học thật (`activeSec`, tối đa bằng số phút đã chọn).
   Phiên phải có ít nhất 3 thẻ đã trả lời. Mỗi ngày tối đa 60 XP từ phiên tập trung, để bảng xếp hạng vẫn công bằng.
2. **Mặc định 10 phút.**
3. **Đồng hồ dừng khi chuyển sang app khác** (cửa sổ mất focus hoặc bị ẩn), quay lại thì chạy tiếp. Đồng hồ cũng
   dừng sau 90 giây không có thao tác nào, để phút được thưởng XP là phút học thật.
4. **Đẩy số liệu lên Supabase.** Sự kiện `focus_*` và log ngày học đã được sync sẵn (`sync_rows`). Migration
   `0007_focus_retention.sql` thêm 2 hàm báo cáo cho mọi người dùng, chỉ chạy được trong SQL editor
   (service role):
   - `focus_retention_report(p_days)`: D1/D7, tách theo ngày có và không có phiên tập trung.
   - `focus_session_report(p_days)`: số phiên, tỉ lệ hoàn thành, số phút trung bình.
   Chỉ có số liệu của người đã đăng nhập và bật sync.
