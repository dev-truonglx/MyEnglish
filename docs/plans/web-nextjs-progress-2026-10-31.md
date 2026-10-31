# Bản web Next.js — báo cáo triển khai đợt 1 (2026-10-31)

Nhánh `feat/web-nextjs`, **chưa commit**. Kế hoạch gốc: [web-nextjs-2026-10-31.md](web-nextjs-2026-10-31.md).

## 1. Thuật toán / logic app: KHÔNG thay đổi

- `src/`, `src-tauri/`, `test/`: **0 dòng thay đổi** (`git diff --stat -- src src-tauri test` rỗng).
- Root vẫn qua: `npm run check` (tsc) sạch, `vitest` **921/921**.
- Web chạy chính các file trong `src/` (App, services, stores, components). Chỉ thay "nền tảng" bằng alias khi build web:

| Desktop import | Web dùng | Hành vi trên web |
|---|---|---|
| `@tauri-apps/plugin-sql` | `web/platform/sql.ts` → `web/public/db-worker.mjs` | SQLite WASM trong Worker, lưu OPFS; cùng schema v18, cùng câu SQL, cùng quy ước `$1`→`?` như stub test |
| `@tauri-apps/api/core` (`invoke`) | `web/platform/tauri-core.ts` | bảng ánh xạ 22 lệnh (xem §3) |
| `@tauri-apps/api/event` | `web/platform/tauri-event.ts` | trong tab + giữa các tab qua BroadcastChannel |
| `api/window`, `webview`, `webviewWindow` | `web/platform/tauri-window.ts` | một cửa sổ, nhãn `main` |
| `plugin-notification` | `web/platform/tauri-notification.ts` | Notification API của trình duyệt |
| `plugin-updater/process/autostart/opener` | `web/platform/tauri-desktop-only.ts` | không có (web tự cập nhật khi tải lại) |
| `@/data/vocabCatalog.json` | `web/platform/vocab-catalog.ts` | cùng object, đọc từ bảng `catalog_words` |
| `@/data/grammarCatalog.json` | `web/platform/grammar-catalog.ts` | cùng object, đọc từ `grammar_content` (cần đăng nhập) |
| `import.meta.env.VITE_SUPABASE_*` | `NEXT_PUBLIC_SUPABASE_*` | DefinePlugin, không sửa `supabase.ts` |

## 2. Những điểm hành vi web KHÁC desktop (cần bạn đánh giá)

Không chỗ nào sửa code nghiệp vụ; khác biệt đến từ việc lệnh desktop không có trên web, và code hiện có tự chạy nhánh dự phòng sẵn có của nó:

1. **Popup/nudge nhắc ôn**: `show_review_popup` / `show_review_nudge` báo lỗi trên web → `reminderSettings.ts` tự mở **phiên ôn ngay trong trang** (nhánh fallback có sẵn). Nghĩa là khi đến giờ nhắc mà tab đang mở, modal ôn tập sẽ hiện trong trang.
2. **Bộ chặn popup** (`get_popup_blockers`): web không đo được app toàn màn hình, chia sẻ màn hình hay thời gian rảnh → trả "không có gì chặn". Logic hoãn popup vẫn nguyên, chỉ không có dữ liệu.
3. **AI tắt** (quyết định §11): `check_cli_status` trả `installed: false` → các mục AI tự ẩn như máy chưa cài CLI. Lệnh AI khác báo lỗi.
4. **Optimizer FSRS** (`compute_fsrs_parameters`, Rust): không có trên web → dùng trọng số đã sync từ desktop (`myenglish_fsrs_weights_v1`) hoặc mặc định.
5. **Khởi động** (`web/shell/ClientShell.tsx`, bản tương ứng của `main.tsx`):
   - chạy `settleKnownWords`, `initTheme`, `initStrictInputGuards` như desktop;
   - **không chạy** `ensureReleaseMigrationV27` và mirror localStorage↔SQLite (desktop cũng bỏ qua khi không chạy trong Tauri; trình duyệt tự giữ localStorage);
   - **thêm**: một lượt `runSync()` **trước khi** hiện app, để người dùng mới trên trình duyệt thấy tiến độ của mình thay vì màn onboarding. Đây là thứ tự gọi khác desktop (desktop sync sau khi app hiện) — logic sync không đổi.
6. **Badge tray** → số thẻ đến hạn trên tiêu đề tab: `(12) MyEnglish`.
7. **Xuất backup** → tải file về máy qua trình duyệt.
8. **Một tab**: DB OPFS chỉ mở được ở một tab; tab thứ hai hiện "MyEnglish đang mở ở tab khác".

## 3. File mới

```
web/                          Next.js 16.4.3 (App Router, webpack), React 19 runtime
├─ app/layout.tsx             CSS chung src/index.css, theme trước khi vẽ, manifest
├─ app/page.tsx               trang giới thiệu → /learn
├─ app/learn/page.tsx         app (client-only)
├─ app/dev/page.tsx           CHỈ DEV: app không cần tài khoản, bộ từ từ file local (404 ở production)
├─ shell/ClientShell.tsx      khóa tab → đăng nhập bắt buộc → mở DB → nạp bộ từ → sync → <App/>
├─ shell/LoginScreen.tsx      đăng nhập/đăng ký/quên mật khẩu (dùng authStore có sẵn)
├─ shell/StatusScreen.tsx     màn trạng thái khởi động
├─ shell/registerServiceWorker.ts   (agy viết, Claude review/sửa)
├─ platform/*.ts              adapter (bảng §1)
├─ public/db-worker.mjs       Worker SQLite
├─ public/sw.js, manifest.webmanifest   PWA (agy viết, Claude review/sửa)
├─ scripts/copy-sqlite.mjs    chép sqlite-wasm vào public/sqlite (postinstall)
└─ next.config.ts, tsconfig.json, tailwind.config.mjs, postcss.config.mjs, .env.example, .gitignore
supabase/migrations/0008_content.sql        catalog_meta, catalog_words, grammar_content (+RLS)   (subagent)
supabase/migrations/0009_xp_device_limit.sql  xp_push: 10 → 30 thiết bị, chỉ đổi con số           (subagent)
scripts/web/upload-content.mjs              upload bộ từ + sách lên Supabase bằng service_role    (subagent)
supabase/README.md                          thêm mục hướng dẫn 0008/0009 (subagent; Claude sửa dòng "10 devices")
.claude/launch.json                         thêm cấu hình "web-dev" (port 3000)
```

## 4. Đã kiểm chứng

- `next build --webpack` sạch (không lỗi, không cảnh báo); tsc web sạch.
- Production: `/`, `/learn` 200; `/dev` **404**; `sw.js`, `manifest`, `db-worker.mjs`, `sqlite3.wasm` 200.
- **Bundle không chứa nội dung sách ngữ pháp hay bộ từ** (đã grep các chunk; tổng 2.9 MB JS). Lần build đầu có lọt chunk sách 1.1 MB do Next ưu tiên `paths` của tsconfig hơn alias webpack — đã sửa bằng `paths` khớp chính xác.
- Trình duyệt (trang `/dev`): app desktop chạy nguyên vẹn — onboarding 3 bước, đếm từ theo cấp lấy từ SQLite (5.004 từ), học từ mới, tab Hôm nay, tab Ngữ pháp; **F5 giữ dữ liệu** (OPFS `.myenglish-sahpool`, "Đang học 1" sau khi tải lại); console không lỗi.
- Trang `/learn` hiện màn đăng nhập khi chưa đăng nhập.
- Migration 0009: so diff với 0005 chỉ khác số 10 → 30. Script upload `--dry-run`: 5004 từ (v3, 3.6 MB), 74 file ngữ pháp (1.08 MB).

**Chưa kiểm chứng được** (cần bạn): đăng nhập thật, tải bộ từ/sách từ Supabase, sync hai chiều desktop ↔ web — vì cần chạy migration trên project Supabase của bạn và một tài khoản.

## 5. Việc bạn cần làm để chạy thật

1. Supabase SQL editor: chạy `0008_content.sql`, rồi `0009_xp_device_limit.sql`.
2. Trên máy bạn (không commit key):
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> node scripts/web/upload-content.mjs --dry-run
   ```
   rồi chạy lại không có `--dry-run`.
3. Chạy local: `npm --prefix web install` (tạo `web/.env.local` từ `web/.env.example`), `npm --prefix web run dev`, mở `http://localhost:3000/learn`.
4. Vercel: Root Directory = `web`, env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Lưu ý repo chứa cả `src/` ở thư mục cha: cần bật "Include files outside the root directory" (mặc định đã bật) và Install Command `npm install && npm --prefix .. install` để có dependency của `src/`.

## 6. Còn lại (theo lộ trình §10)

- **Mobile (ưu tiên vì đã chốt "ngay từ đầu")**: hiện chưa responsive — sidebar desktop chiếm nửa màn hình điện thoại. Cần sửa bố cục trong component dùng chung (`Sidebar.tsx`, `MainDashboard.tsx`, phiên ôn tập, bài tập) — **chỉ thêm class responsive / thao tác chạm, không đụng logic**; desktop app (cửa sổ ≥ 768px) không đổi. Chờ bạn duyệt vì đây là sửa `src/`.
- Tách tab thành URL (`/today`, `/review`…) — cũng là sửa `MainDashboard.tsx` (UI).
- Web Push khi tab đóng (Edge Function cron), CSP, test adapter tự động, deploy Vercel.

## 7. Phối hợp với agy

- agy CLI chạy headless được, nhưng **mọi lệnh shell phải được cho phép trước theo tiền tố** (`--settings '{"permissions":{"allow":["command(ls)"]}}'`); một lệnh bị từ chối làm hủy cả lượt chạy. Cờ `--dangerously-skip-permissions` bị hệ thống của Claude Code chặn.
- Phần Supabase (migration + script) chuyển cho subagent Claude sau 3 lần agy thất bại vì lý do trên; phần PWA do agy làm thành công.
- Review: subagent — đạt, sửa 2 dòng README lỗi thời; agy — đạt, sửa kích thước icon (thực tế 1024×1024), bổ sung trường hợp bản cập nhật đã chờ sẵn khi mở trang, ghi chú phải tăng `VERSION` khi đổi file SQLite.

---

# Đợt 2 — giao diện điện thoại (2026-10-31)

Nhánh `feat/web-nextjs`, **chưa commit**. agy làm, Claude review/sửa.

## 1. Logic / thuật toán: KHÔNG thay đổi

- 83 file trong `src/components/` + 1 file mới (`dashboard/MobileNav.tsx`). Chỉ đổi class Tailwind và bố cục JSX.
- Thay đổi ngoài class (đã soát từng dòng):
  - `Sidebar.tsx`: thêm prop `variant` ("rail" mặc định = như cũ, "drawer" = trong ngăn kéo mobile) và `onNavigate`; các nút gọi `setActiveTab` y như cũ rồi mới đóng ngăn kéo.
  - `MainDashboard.tsx`: render thêm `<MobileNav>` cùng điều kiện với `<Sidebar>` (ẩn khi đang phiên tập trung).
  - `FreeWritingExercise`, `ReflexChallengeModal`: chữ phím tắt "(Enter)", "(Space)", "(Nhấn Space)" bọc trong span ẩn trên điện thoại — trên máy tính vẫn đọc đúng như cũ.
  - `MistakeReview`: hai nút xuống dòng thuộc tính (không đổi thuộc tính nào).
  - `LearningInsightsCard`, `AdvancedLearningSettings`: bảng bọc thêm `<div className="overflow-x-auto">`.
- `tsc` sạch, `vitest` 921/921, `next build` sạch.

## 2. Desktop: giữ nguyên — đã đo, không chỉ đọc code

Quy tắc: mọi class chỉ dành cho điện thoại viết `max-md:…` (chỉ áp dụng < 768px); class desktop bị đổi thì trả lại bằng `md:…`. App desktop có `minWidth: 800` nên không bao giờ rơi vào khổ điện thoại.

Kiểm chứng: đo **computed style** của mọi phần tử đang hiển thị (display, flex, gap, padding, margin, min-height, cỡ chữ, căn lề, grid…) trên **13 tab**, so bản trước (code gốc, `git stash`) và bản sau:

| Bề rộng | Kết quả |
|---|---|
| 1280px | **0 khác biệt** |
| 900px (giữa md và lg — cửa sổ desktop hẹp) | **0 khác biệt** |

Màn không nằm trong 13 tab (phiên ôn, bài tập, modal) được soát bằng script so class trước/sau từng dòng: 0 lỗi còn lại.

Lỗi tìm ra khi review và đã sửa (agy làm sai hoặc script sửa gộp của Claude gây ra):
- `min-h-10 md:min-h-0` làm desktop đổi min-height `auto` → `0` (lệch 4–5px nhiều chỗ) → đổi toàn bộ thành `max-md:min-h-10`.
- `lg:grid-cols-4` bị đổi thành `md:grid-cols-4` (cửa sổ 800–1023px sẽ hiện 4 cột thay vì 2) → trả lại `lg:`.
- `ReviewNudge.tsx` (cửa sổ nhắc desktop chỉ rộng **400px** → class mobile sẽ áp lên desktop) → **hoàn tác toàn bộ**; web không dùng component này.
- Nhãn "(Enter)/(Space)" bị tách thành 2 mục flex (thêm khoảng trắng trên desktop) → gộp lại.
- Padding thẻ, cỡ chữ ô chọn, căn lề `start→left`, `block→flex` ở một số nút → đưa về như cũ.
- Script sửa gộp của Claude ghép lệch dòng ở 2 file có div bọc thêm → hoàn tác 2 file đó và làm lại tay.

## 3. Điện thoại (375px) — đã kiểm tra

- Thanh điều hướng dưới: Hôm nay · Ôn tập (badge số thẻ đến hạn) · Ngữ pháp · Tiến độ · Thêm (chế độ đơn giản: theo nhóm như sidebar).
- "Thêm" mở ngăn kéo trái chứa toàn bộ sidebar; chọn mục → chuyển tab và tự đóng; chạm nền hoặc Esc để đóng.
- 13 tab: **không tab nào tràn ngang** (đo mọi phần tử).
- Phiên ôn tập, thẻ học từ mới, modal chọn thì ngữ pháp (toàn màn hình, 1 cột) hiển thị tốt; nút chấm điểm lưới 2×2, ô nhập `text-base` (iOS không tự zoom), gợi ý phím tắt ẩn trên điện thoại.

## 4. Ghi chú về agy

- Hết quota giữa chừng: model Claude trong agy (reset ~4h40), rồi Gemini 4 (reset ~12h50); phần còn lại chạy bằng **Gemini 3.8 Flash**. Flash có lúc tự dừng vì thử lệnh shell không được phép — phần dở được giao lại.
- Chất lượng: agy làm đúng hướng nhưng **không giữ được quy tắc "desktop y hệt"** ở ~10% chỗ sửa (nhất là `min-h`, `lg:`, cửa sổ nudge 400px). Vì vậy bước đo computed style trước/sau là bắt buộc cho mọi đợt giao diện sau.

## 5. Còn lại

- Tách tab thành URL (`/today`, `/review`…), Web Push khi tab đóng, deploy Vercel, chạy migration 0008/0009 + đăng nhập thật để thử sync desktop ↔ web.

---

# Đợt 3 — URL theo tab + thông báo đẩy (2026-10-31)

Nhánh `feat/web-nextjs`, **chưa commit**. agy (Gemini 3.8 Flash) làm 3 phần song song, Claude review/sửa.

## 1. Chạm vào `src/` (đều không có tác dụng trên desktop)

| File | Thay đổi | Vì sao desktop không đổi |
|---|---|---|
| `src/App.tsx` | nhận prop tuỳ chọn `initialTab`, `onTabChange`, chuyển cho `MainDashboard` | `main.tsx` render `<App />` không prop |
| `src/components/MainDashboard.tsx` | `useState(initialTab ?? "today")`; gọi `onTabChange` khi tab đổi; nghe event `myenglish-select-tab` → gọi **`handleSelectTab` có sẵn** (vẫn hỏi "Thoát bài đang học?") | không ai truyền prop / phát event trên desktop |
| `src/lib/platformSlots.ts` (mới) | chỗ cắm UI riêng nền tảng | rỗng trên desktop |
| `src/components/CliGuideView.tsx` | render `platformSlots.settingsTop` nếu có | rỗng → không render gì |

Không đụng service/store/thuật toán nào. `tsc` sạch, **928/928 test** (thêm 7 test cho lịch nhắc web).

## 2. Mỗi tab một URL

- `/learn/today`, `/learn/review`, `/learn/words`, `/learn/known`, `/learn/forgotten`, `/learn/grammar`, `/learn/pronunciation`, `/learn/reading`, `/learn/writing`, `/learn/roadmap`, `/learn/progress`, `/learn/settings`, `/learn/leaderboard`, `/learn/account` (map trong `web/shell/tabRoutes.ts`). Tất cả là trang tĩnh; app nằm trong layout nên đổi tab không tải lại.
- Mở thẳng link → đúng tab; back/forward → đổi tab; link sai → về `/learn`.
- Đang dở phiên ôn mà bấm back: app hỏi như desktop; chọn **Học tiếp** → URL tự trở lại `/learn/review` (lịch sử giữ nguyên); chọn **Thoát** → sang tab đích.
- Đã thử trên trình duyệt (`/dev/*` dùng cùng cơ chế): link trực tiếp, chuyển tab, back ×2, forward, cả hai nhánh của hộp xác nhận — đều đúng.

Sửa khi review: agy import hằng số từ `MainDashboard` vào màn khởi động (kéo cả app vào trang đăng nhập) → dùng hằng số cục bộ; URL lệch khi bấm "Học tiếp" → sửa bằng đánh số mục lịch sử + `history.go`.

## 3. Thông báo đẩy khi đóng tab

Nguyên tắc: **giờ nhắc do chính logic nhắc học của app tính trên trình duyệt; server chỉ giao đúng giờ.**

- `web/shell/pushPlan.ts`: lịch 48h tới, chỉ dùng hàm sẵn có — `getReminderSettings` (bật/tắt, hoãn, điều kiện "chỉ khi có thẻ đến hạn"), giờ học đã chọn (`anchorTime`), giờ học tốt nhất đã học được (`getBestReminderHour`), giờ yên lặng ban đêm (`reminderPause`), số thẻ đến hạn tại thời điểm đó (`countDueCards`). Tối đa 12 mục, gộp các giờ cách nhau < 30 phút.
- Chưa chọn giờ học nào và app chưa học được "giờ tốt nhất" → **không nhắc** khi đóng tab (người dùng đã chọn, 2026-10-31; không có giờ mặc định tự đặt).
- Lịch được tải lên khi mở app, sau mỗi lần đồng bộ, khi rời tab và mỗi 30 phút.
- Server (`supabase/functions/send-reminders`, chạy 5 phút/lần bằng pg_cron): gửi mục đến giờ; **bỏ qua nếu đã học trong 2 giờ trước giờ nhắc** (trên bất kỳ máy nào) — Claude đổi từ quy tắc "đã học kể từ lúc lập lịch" của brief vì quy tắc đó làm buổi sáng học trên desktop huỷ luôn lời nhắc buổi tối.
- Bấm thông báo: nếu app đang mở → chuyển sang tab Ôn tập không tải lại (agy làm bằng `navigate` gây tải lại, đã sửa); nếu không → mở `/learn/review`.
- Cài đặt → thẻ "Thông báo khi đóng tab" (chỉ trên web), bật/tắt, hướng dẫn khi trình duyệt chặn / iPhone chưa cài PWA / máy chủ chưa cấu hình.
- Sửa khi review: bật thông báo báo "thành công" dù server không lưu được → nay báo thất bại; service worker không cache code khi chạy localhost.

**Chưa kiểm chứng đầu-cuối** (cần project Supabase + khoá VAPID): gửi/nhận push thật. Đã kiểm chứng: lịch nhắc (7 unit test), thẻ cài đặt hiển thị, build production.

### Việc cần làm để bật
1. Chạy `supabase/migrations/0010_web_push.sql`.
2. `node scripts/web/gen-vapid-keys.mjs` → đặt secrets cho function, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` cho web.
3. Deploy function + bật `pg_cron`/`pg_net` + lên lịch (SQL trong `supabase/README.md`, mục "Web Push (0010)").

### Hạn chế đã biết
- Khi tab đang mở đúng giờ nhắc, có thể nhận cả thông báo đẩy lẫn lời nhắc trong app (Chrome bắt buộc hiện mọi push).
- Đăng xuất chưa tự gỡ đăng ký push của trình duyệt đó.

---

# Đợt 4 — Tối ưu FSRS chạy trên web (2026-10-31)

Nhánh `feat/web-nextjs`, **chưa commit**. Claude làm (agy chỉ còn quota Gemini Flash; phần này cần độ chính xác cao).

## 1. Thuật toán: cùng một mã nguồn với desktop

- Nút "Tối ưu ngay" (Cài đặt nâng cao) học lại 21 tham số FSRS-6 từ lịch sử ôn của người học bằng crate Rust `fsrs` (engine của Anki). Trước đây chỉ desktop chạy được.
- **Chạm vào desktop (`src-tauri`) — chỉ di chuyển code:** đoạn tối ưu FSRS trong `src-tauri/src/lib.rs` (struct đầu vào/kết quả, `build_fsrs_training_items`, `fsrs_metrics`, `optimize_fsrs_parameters`) được chuyển **nguyên văn** sang `src-tauri/src/fsrs_optimizer.rs`; `lib.rs` chèn lại đúng chỗ cũ bằng `include!`. So diff với bản cũ: chỉ khác 2 dòng trống. 31/31 test Rust của desktop vẫn qua (gồm 2 test tối ưu FSRS).
- `web/fsrs-wasm/` (crate mới) `include!` **chính file đó**, cùng `fsrs = "=6.6.2"`, dùng lại `Cargo.lock` của desktop → biên dịch sang WebAssembly (324 KB, không cần thư viện JS nào, không import gì từ môi trường).
- Ngẫu nhiên: `fsrs` chỉ dùng bộ sinh có seed cố định; nguồn ngẫu nhiên của hệ điều hành bị tắt hẳn (`getrandom_backend="unsupported"`) để nếu có chỗ dùng sẽ lỗi ngay chứ không âm thầm cho kết quả khác.

## 2. Kết quả so với desktop

`node scripts/web/fsrs-parity.mjs` (dữ liệu tổng hợp giống test desktop):

| Thẻ / lượt ôn | Chênh lệch tham số lớn nhất | Log loss native / web |
|---|---|---|
| 400 / 2 626 | 9.5e-7 | 0.32078719 / 0.32078719 |
| 2 000 / 13 046 | 9.5e-7 | 0.33339080 / 0.33339086 |
| 5 000 / 32 483 | 2.4e-7 | 0.33594185 / 0.33594185 |

- Chênh lệch = **1 bước làm tròn `f32`**: hàm `exp/ln/pow` lấy từ thư viện toán của hệ điều hành (native) và `libm` của Rust (WASM) có thể khác bit cuối — giống như bản desktop macOS và Windows vẫn khác nhau. Native chạy 1 luồng hay nhiều luồng cho kết quả giống hệt nhau, nên không phải do song song hoá.
- Ảnh hưởng thực tế: lập lịch 13 046 lượt ôn bằng `ts-fsrs` của app với hai bộ tham số → **0 lượt có ngày ôn khác nhau**.

## 3. Trên web

- `web/public/fsrs-worker.mjs` chạy optimizer trong Web Worker (trang không bị đứng); `web/platform/fsrs.ts` + lệnh `compute_fsrs_parameters` trong `web/platform/tauri-core.ts` trả đúng định dạng desktop → màn "Tối ưu theo trí nhớ của bạn" dùng nguyên logic sẵn có (so sánh trước/sau, chỉ áp dụng khi người học đồng ý).
- Đã chạy thật trong trình duyệt: 13 046 lượt ôn trong **57 ms**, đúng MIME `application/wasm`.
- File `.wasm` được commit trong `web/public/fsrs/` nên deploy Vercel không cần Rust. Khi đổi `fsrs_optimizer.rs` hoặc phiên bản `fsrs`: `rustup target add wasm32-unknown-unknown` (một lần), `node web/scripts/build-fsrs-wasm.mjs`, rồi `node scripts/web/fsrs-parity.mjs`.
- Chưa bấm thử nút trong app web với dữ liệu thật (dữ liệu dev chưa đủ 400 lượt ôn); đường gọi từ nút tới Worker là đường `invoke` mà desktop vẫn dùng.
