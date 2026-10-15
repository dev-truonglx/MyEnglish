# Đăng nhập Supabase, đồng bộ tiến trình, bảng xếp hạng XP — 2026-10-15

Thêm tài khoản (Supabase) để giữ tiến trình học giữa các máy và đua XP. App vẫn chạy đầy đủ ngoại tuyến khi không có khóa Supabase.

**Trạng thái:** đã làm, chưa commit. Chưa chạy với project Supabase thật.
- Kiểm tra: `tsc` sạch, `vitest` 626/626 (thêm `cloudSync.test.ts`), `vite build` OK.
- SQL (`supabase/migrations/0001_init.sql`) đã chạy thử trên Postgres nhúng (pglite) với `auth.uid()` giả: push LWW, sổ cái XP, BXH tuần/tổng/streak, nhóm, `sync_clear`, chặn người chưa đăng nhập. RLS chưa thử (pglite chạy bằng superuser).
- Giao diện đã xem trong `verify-harness` (`?account`, `?account&signedin`, `?leaderboard`) với Supabase giả; supabase-js chạy thật, chỉ `fetch` bị chặn lại.

## Quyết định

| Hạng mục | Chọn |
|---|---|
| Đăng nhập | Email + mật khẩu (Tauri chưa có deep-link nên chưa làm OAuth) |
| Đồng bộ | Toàn bộ tiến trình; không bao giờ upload sách ngữ pháp |
| XP | "Casual": app báo XP theo ngày, DB chỉ chặn trần 5000/máy/ngày và không cho giảm |
| BXH | Tuần, tháng, tổng, chuỗi ngày; nhóm bạn bè bằng mã mời |

## Kiến trúc

- **Server** (`supabase/`): `profiles`, `sync_rows` (một bảng chung: `card`, `word`, `log`, `event`, `mistake`, `grammar`, `kv`; `ts` thắng bằng last-write-wins, `log`/`event` chỉ thêm), `xp_daily` (XP theo máy và ngày), `groups`/`group_members`. Mọi ghi và mọi đọc chéo người dùng đi qua hàm `security definer` (`sync_push`, `xp_push`, `leaderboard`, `create_group`, `join_group`, `leave_group`, `my_groups`, `sync_clear`); RLS chỉ cho đọc hàng của mình. Cài đặt: `supabase/README.md`.
- **Khóa đồng bộ** của từ: `catalog_id` (từ Oxford) hoặc `w:<chữ thường>` (từ tự thêm), vì `words.id` là UUID riêng từng máy. Từ Oxford máy kia chưa có được tạo từ bộ Oxford sẵn trong máy đó.
- **Engine** (`src/services/sync/`): `collect.ts` (hàng đổi từ lần đẩy trước, tìm theo thời gian: `last_review`, `timestamp`…, phân trang keyset), `apply.ts` (gộp, idempotent, thẻ/bài chỉ bị thay bởi bản mới hơn), `engine.ts` (đẩy → sổ cái XP → kéo → hồ sơ), `manager.ts` (lịch chạy, chỉ cửa sổ main), `xpLedger.ts`, `supabaseTransport.ts` (mỏng, test dùng transport giả). Con trỏ và `device_id` nằm trong bảng SQLite `sync_state` (migration v14, thêm `words.updated_at`).
- **XP**: `awardXP()` ghi thêm sổ cái của máy (`myenglish_xp_device_v1`, tạo từ XP cũ lần đầu, phần dư gốc ở ngày `0001-01-01`). Tổng XP của tài khoản = tổng các máy; trên máy giữ `max(local, gộp)` nên XP không bao giờ giảm.
- **Giao diện**: tab riêng "Tài khoản" (`AccountTab`/`AccountSettings`) với nút ở đáy sidebar, trên bộ chọn giao diện (không nằm trong 5 mục chính của chế độ đơn giản); tab "Xếp hạng" (`LeaderboardTab`, trong nhóm "Hôm nay" của chế độ đơn giản), "Hạng tuần này" ở màn Tiến độ.
- **CSP**: `connect-src` thêm `https://*.supabase.co` (cả `devCsp`).

## Không đồng bộ (cố ý)

`grammar_book_*`, `grammar_exercise_imports`, `grammar_custom_exercises`, `vocab_catalog`, sổ lỗi có nguồn `grammar` (trích sách), `app_kv` nguyên bảng, khóa API, đường dẫn CLI, các key `grammar_book_revision/hidden_items/accepted_answers`, cài đặt riêng máy (giao diện, nhắc, autostart). Chỉ allowlist `SYNCED_KV` (`sync/keys.ts`) đi qua; test khẳng định không lọt.

## Hành vi cần biết

- Đăng xuất giữ dữ liệu trên máy. Đăng nhập tài khoản khác trên cùng máy: hộp chọn "gộp" hoặc "xóa dữ liệu máy rồi bắt đầu từ tài khoản mới".
- "Đặt lại toàn bộ dữ liệu" khi đang đăng nhập xóa luôn bản đồng bộ trên tài khoản (cần mạng), nếu không lần đồng bộ sau tải lại hết. Phiên đăng nhập (`sb-*`) được giữ.
- Nhập file sao lưu: lần đồng bộ sau đẩy lại toàn bộ (`resetPushCursors`).
- Giới hạn chấp nhận: hai máy ôn cùng một thẻ giữa hai lần đồng bộ thì thẻ lấy lần mới hơn (log vẫn đủ); xóa từ không lan sang máy khác; XP gốc bị cộng đôi nếu hai máy cùng khôi phục một file sao lưu; XP casual vẫn sửa tay được; một số cài đặt chỉ có hiệu lực sau khi mở lại app.

## Việc còn lại / cần kiểm thật

1. Tạo project Supabase, chạy migration, đặt `.env.local` (xem `supabase/README.md`), `npm run tauri dev`: xác nhận CSP không chặn, đăng ký/đăng nhập, học trên máy A rồi thấy ở máy B, XP lên BXH, tạo/vào nhóm.
2. Thử RLS thật: người dùng B không đọc được `sync_rows`/`xp_daily` của A.
3. Build phát hành cần biến `VITE_SUPABASE_*` lúc `npm run build` (đưa vào `scripts/build-*.sh`/CI nếu muốn bản phát hành có tài khoản).

## Gỡ Quick Input (cùng đợt, theo yêu cầu)

Đã xóa toàn bộ: nút ở sidebar, `QuickInput.tsx`, cửa sổ `quick-input`, phím tắt toàn cục ⌘⇧E (plugin `global-shortcut` ở Rust và JS), lệnh Rust `toggle_quick_input`/`hide_quick_input`/`submit_word`/`get_clipboard_text` cùng bộ đọc clipboard (`arboard`), capability `quick-input.json`, `contextHandover.ts` và các dòng hướng dẫn nhắc phím tắt (Onboarding, Ôn tập). `cargo check`/`cargo test` OK (31 test).

## Đưa bảng xếp hạng ra ngoài (động lực xếp hạng)

Nguyên tắc: so với người ngay trên mình (không phải top 1), chu kỳ tuần, hiện đúng lúc có thể hành động, chỉ nói điều tích cực (không "bạn vừa bị vượt"), có công tắc tắt.

- **Server**: `supabase/migrations/0002_standing.sql` (chạy một lần sau 0001): RPC `my_standing(p_from, p_group)` trả hạng, số người, XP, người ngay trên và ngay dưới. Đã thử trên pglite (dẫn đầu, đồng hạng, 0 XP, không phải thành viên nhóm).
- **Client**: `stores/standingStore.ts` (cache hạng trong localStorage theo tuần và người dùng, làm tươi sau đăng nhập và sau mỗi lần đồng bộ qua sự kiện `myenglish-sync-finished`, giữ số cũ khi mất mạng), `services/leaderboard.ts` (`fetchStanding`, `xpToPass`, `rankChange`, `weekTimeLeft`, `standingMessage`).
- **Giao diện** (`dashboard/RankWidgets.tsx`): `RankPanel`: màn Hôm nay chia hai cột (từ 1000px trở lên), trái là nội dung hôm nay, phải là cột xếp hạng dính khi cuộn: hạng, XP, "còn N XP nữa là vượt X", đếm ngược tuần, top 10 (kèm hàng của mình nếu ngoài top), chọn Tất cả/nhóm; chưa đăng nhập thì thẻ mời đăng nhập (ẩn được); tắt widget thì về một cột, `RankLine` ở sidebar dưới ô streak, `RankDelta` ở cuối phiên ôn (đồng bộ ngay rồi so hạng với lúc bắt đầu phiên, nêu tên người vừa vượt).
- **Ưu tiên nhóm**: nếu bạn ở trong nhóm, widget và tab Xếp hạng mặc định theo nhóm đầu tiên; đổi được bằng nút nhóm trên thẻ. Lựa chọn dùng chung giữa widget và tab.
- **Công tắc** "Hiện thứ hạng XP trong ứng dụng" ở trang Tài khoản (tắt thì chỉ còn tab Xếp hạng).
- Kiểm tra: `vitest` 631/631 (`rankWidgets.test.ts`), `tsc`, `vite build`; giao diện xem trong `verify-harness` (`?rank`) với Supabase giả. Chưa chạy với Supabase thật: cần chạy 0002 trước.
- Chưa làm (đề xuất sau): tooltip tray và nudge theo hạng, tóm tắt thứ Hai, giải đấu theo cấp (cần chia giải ở server).

## Avatar

Chọn một trong 20 avatar có sẵn (emoji trên nền màu, `services/avatars.ts`); `profiles.avatar` chỉ lưu id ngắn (vd `fox-amber`), nên bảng xếp hạng không phải tải ảnh. Id lạ hoặc chưa chọn thì hiện chữ cái đầu của tên với màu cố định theo tên (`components/Avatar.tsx`).
- **Server**: `supabase/migrations/0003_avatar.sql` (chạy sau 0002): cột `avatar` có check `^[a-z0-9-]{1,24}$`, cho người dùng sửa cột này, và RPC `leaderboard` trả thêm `avatar` (hàm được thay thế vì đổi cột trả về). Đã thử trên pglite, chạy lại được.
- **Client**: bấm avatar ở trang Tài khoản để mở bảng chọn; hiện ở nút Tài khoản dưới sidebar, tab Xếp hạng và cột xếp hạng ở Hôm nay. Chưa chạy 0003 thì hồ sơ vẫn tải bình thường (không có avatar) và đổi avatar báo cần chạy migration.
- Kiểm tra: `vitest` 635/635 (`avatars.test.ts`), `tsc`; giao diện xem trong `verify-harness`.

## Quy tắc gộp: tiến độ trước, thời gian sau

Rà lại cơ chế và đổi theo gợi ý "bên nào lớn hơn thì lấy, kết hợp thời gian". Trước đó thẻ/bài chỉ so thời gian (last-write-wins), nên máy đi sau nhưng học muộn hơn có thể ghi đè thẻ mà máy kia đã đi xa hơn (và đồng hồ lệch làm tệ thêm).

| Dữ liệu | Quy tắc |
|---|---|
| Thẻ từ vựng (hai chiều), bài ngữ pháp, sổ lỗi | Bên có **nhiều lượt ôn hơn** (`reps`, chỉ tăng, không có tính năng nào đặt lại) thắng; bằng nhau thì **lần ôn muộn hơn** thắng |
| XP | Đã luôn lấy lớn hơn: sổ cái mỗi máy mỗi ngày giữ giá trị lớn hơn, tổng trên máy = `max(local, tổng các máy)`. Không bao giờ giảm |
| Level | Suy ra từ XP nên không giảm; thêm chốt ở server (trigger) không cho `profiles.level` giảm, trừ khi "Đặt lại toàn bộ dữ liệu" |
| Chuỗi ngày (study_logs), điểm quiz, bài đã giới thiệu | Lấy số lớn hơn / hợp hai bên theo từng khóa |
| Từ (tạm dừng, nội dung từ tự thêm), cài đặt | Bản đổi muộn hơn thắng |
| Lịch sử ôn, sự kiện | Chỉ thêm, không bao giờ ghi đè |

- **Server**: `supabase/migrations/0004_progress_merge.sql` thêm cột `prog` (suy ra từ `data.reps`) vào `sync_rows`, `sync_push` so cặp `(prog, ts)`; backfill hàng cũ; trigger giữ level. Đã thử trên pglite (nhiều lượt hơn nhưng cũ hơn thắng, ít lượt hơn nhưng mới hơn thua, bằng nhau thì mới hơn thắng, kv vẫn theo thời gian, level không giảm, `sync_clear` về 1, chạy lại được).
- **Client**: `apply.ts` so `(reps, last_review)` cho thẻ và sổ lỗi, `grammarProgressIsAhead` cho bài ngữ pháp.
- **Test** (`cloudSync.test.ts`, 638 tổng): máy chậm nhưng học muộn hơn không ghi đè thẻ máy kia đã đi xa hơn; bằng số lượt thì lần muộn hơn thắng; bài ngữ pháp nhiều lượt hơn thắng.
- Hệ quả cần biết: hai máy cùng ôn một thẻ giữa hai lần đồng bộ vẫn chỉ giữ một trạng thái lịch; nay là bên có nhiều lượt ôn hơn (vẫn đủ log và XP của cả hai).
