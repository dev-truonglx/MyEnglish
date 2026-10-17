# Nhiệm vụ hằng ngày (daily quests), 2026-10-17

Mục 1.3 trong `competitor-comparison-2026-10-17.md`. Mỗi ngày 3 nhiệm vụ, xong cả 3 thì mở rương.

**Trạng thái:** đã làm 2026-10-17, chưa commit. Đã kiểm tra trong verify harness (`?quests`, `&done`, `&claimed`, `?today&book`),
chưa chạy thử trong app thật (Tauri) và chưa thử đồng bộ hai máy.

## Kho nhiệm vụ

Tiến độ chỉ lấy từ dữ liệu app đã ghi, tính cho ngày hôm nay (giờ máy):

| id | Nhiệm vụ | Đích | Nguồn tiến độ | Có trong kho khi |
|---|---|---|---|---|
| `first_try` | Đúng ngay lần đầu N câu | clamp(mục tiêu ngày + 5, 8, 20) | `review_logs` hôm nay, `is_scheduled` và `rating > 1` | luôn có |
| `new_words` | Học N từ mới | min(5, số từ mới còn được học hôm nay) | `review_logs` loại `intro` hôm nay, `state_before` = New, đếm từ khác nhau | còn ≥ 3 từ mới được học |
| `focus` | Hoàn thành 1 phiên tập trung | 1 | sự kiện `focus_completed` hôm nay | đã từng học |
| `forgotten` | Ôn N từ hay quên | min(3, số từ hay quên) | câu trả lời đúng hôm nay trên từ thuộc nhóm "đang quên" hoặc "đã nhớ lại" của `loadForgottenWords` | có ≥ 1 từ hay quên |
| `grammar` | Làm 1 bài ngữ pháp | 1 | bài có `lastAttemptDate` hôm nay | đã nhập sách ngữ pháp |
| `pronunciation` | Làm 1 bài phát âm | 1 | sự kiện `pronunciation_quiz` hôm nay | có bài phát âm |

## Cách chọn (hàm thuần, seed theo ngày)

- RNG seed từ chuỗi ngày (`mulberry32(hash("2026-10-17"))`), nên cùng dữ liệu thì cùng một bộ nhiệm vụ.
- Luôn có 1 nhiệm vụ từ vựng (`first_try` hoặc `new_words`).
- 2 chỗ còn lại chọn có trọng số theo độ bỏ quên: trọng số = 1 + số ngày chưa làm kỹ năng đó (tối đa 14).
  Kỹ năng bỏ quên lâu nhất (≥ 3 ngày) chắc chắn có một chỗ.
  Ngày làm gần nhất lấy từ `learning_events` 30 ngày (`focus_completed`, `pronunciation_quiz`) và `lastAttemptDate` của ngữ pháp.
- Bộ nhiệm vụ chọn **một lần** lúc mở Today lần đầu trong ngày rồi lưu lại, nên không đổi giữa ngày khi dữ liệu đổi.

## Rương

- Mở bằng tay ("Mở rương") khi xong cả 3, kèm hiệu ứng confetti (`src/utils/confetti.ts`). Mỗi ngày đúng một lần.
- XP: 20, 25 hoặc 30 (theo seed ngày), qua `awardXP`. Trần 30 XP/ngày để bảng xếp hạng công bằng.
- Khoảng 1/4 số ngày (theo seed) rương có thêm +1 đóng băng chuỗi, chỉ khi đang dưới `MAX_FREEZES`.
  Đóng băng hiện được tính từ số ngày học, nên phần thưởng lưu riêng: danh sách ngày được thưởng
  (`myenglish_bonus_freezes_v1`). `computeStreak` nhận thêm danh sách này: vào ngày đó kho đóng băng +1 (vẫn tối đa `MAX_FREEZES`).
  Giống đóng băng thường, phần thưởng thuộc chuỗi hiện tại: chuỗi đứt thì mất.

## Lưu và đồng bộ

- `myenglish_daily_quests_v1` = `{ day, quests: [{ id, target }], claimed, reward? }`, đồng bộ `lww`:
  máy kia nhận cùng bộ nhiệm vụ và cờ "đã mở rương", tránh mở hai lần.
  (Nếu hai máy cùng mở rương trước khi đồng bộ thì vẫn có thể nhận hai lần, tối đa 60 XP. Chấp nhận được.)
- `myenglish_bonus_freezes_v1` = mảng ngày, đồng bộ `arrayUnion`.

## Giao diện

Thẻ "Nhiệm vụ hôm nay" trên tab Hôm nay, dưới checklist và thẻ tập trung: 3 dòng, mỗi dòng có thanh tiến độ và nút đi tới
phần học tương ứng; cuối thẻ là rương (khóa / sẵn sàng mở / đã mở kèm phần thưởng). Tiến độ cập nhật khi có sự kiện
`myenglish-activity-updated`, `myenglish-grammar-updated`, `myenglish-pronunciation-updated`, `myenglish-xp-updated`.

## File

- Mới: `src/services/dailyQuests.ts` (hàm thuần + bộ nạp dữ liệu), `src/components/dashboard/DailyQuestsCard.tsx`,
  `test/dailyQuests.test.ts`.
- Sửa: `src/services/streak.ts` (đóng băng thưởng), `src/services/sync/keys.ts` (2 khóa),
  `src/components/dashboard/TodayTab.tsx` (chèn thẻ), `.claude/verify/main.tsx` (view `?quests`).

## Kiểm tra

`npx tsc --noEmit`, `npx vitest run`, và xem `?quests` trong verify harness (chưa xong / xong 3 / đã mở rương).


> 2026-10-17: bỏ nhiệm vụ "Đọc 1 đoạn văn" theo yêu cầu. Nhiệm vụ đọc đã được chọn trước đó trong ngày sẽ được thay bằng nhiệm vụ khác, hai nhiệm vụ còn lại giữ nguyên.
