# Phiên bản website (Next.js) cho MyEnglish — nghiên cứu & kế hoạch chuyển đổi

Ngày: 2026-10-31 · Trạng thái: **đề xuất, chưa triển khai**

---

## 1. Tóm tắt & khuyến nghị

**Khuyến nghị: "local-first trên web + nội dung và tiến độ trên Supabase"**, không viết lại nghiệp vụ thành API server.

- Toàn bộ `src/services`, `src/utils`, `src/types`, `src/hooks` (FSRS/ts-fsrs, smartReview, grammar engine, XP, quest, streak…) **giữ nguyên từng dòng**. Web chạy đúng các file đó.
- Trên trình duyệt, SQLite vẫn là nơi app đọc/ghi: dùng **SQLite WASM (`@sqlite.org/sqlite-wasm`, VFS `opfs-sahpool`) trong Web Worker**, bọc lại theo đúng interface `Database.select/execute` của `@tauri-apps/plugin-sql`. Cùng engine SQLite, cùng schema v18, cùng câu SQL → thuật toán và kết quả giống hệt desktop.
- **Supabase là nơi lưu chung:**
  - Tiến độ học: đã có (`sync_rows`, `xp_daily`, `profiles`). Web là thêm một "máy" dùng chung sync engine hiện tại.
  - Từ vựng (bộ Oxford 5000): đưa lên bảng `catalog_words` (nội dung chung, ai cũng đọc được).
  - Ngữ pháp: đưa lên bảng **dùng chung** `grammar_content`, chỉ người đã đăng nhập đọc được — xem rủi ro bản quyền ở §9.1.
- Next.js (App Router) trên Vercel lo phần web: định tuyến, đăng nhập bắt buộc (`@supabase/ssr`), landing, PWA + Web Push cho nhắc học. AI tắt trên web ở bản đầu. Quyết định đã chốt: §11.

**Bằng chứng hướng này khả thi:** repo đã chạy được app thật trong trình duyệt — `.claude/verify/vite.config.ts` alias `@tauri-apps/plugin-sql` sang `sqlStub.ts` (sql.js) và các plugin Tauri sang stub; test (`test/stubs/tauriSql.ts`) chạy toàn bộ service trên `node:sqlite`. Web chỉ cần biến cái "stub" đó thành adapter thật, bền (OPFS).

---

## 2. Hiện trạng (đo trên repo, commit `b8fffb6`)

| Hạng mục | Số liệu |
|---|---|
| Stack | Tauri 2 + React 18 + Vite 6 + Tailwind 3 + Zustand 5 + ts-fsrs 5 + supabase-js 2 |
| Mã nguồn `src/` | ~65k dòng TS/TSX; 107 service/util, ~100 component |
| SQL | 31 file gọi `getDatabase`, 113 `db.select` + 130 `db.execute`, schema v18 (`PRAGMA user_version`) |
| Bảng SQLite | `words`, `examples`, `srs_reviews`, `srs_production`, `review_logs`, `learning_events`, `mistakes`, `grammar_progress`, `grammar_custom_exercises`, `grammar_book_*`, `grammar_exercise_imports`, `vocab_catalog(+_meta)`, `app_kv`, `sync_state`, `sync_tombstones` |
| localStorage | ~96 key `myenglish_*`, sao lưu ngược vào `app_kv` (`storageBackup.ts`); 29+ key đi theo tài khoản qua `SYNCED_KV` |
| Dữ liệu đóng gói | `vocabCatalog.json` 3.4 MB (5004 từ), `grammarCatalog.json` 1.1 MB |
| Phụ thuộc Tauri | 20 file import `@tauri-apps/*`; 22 lệnh Rust (`invoke`); 6 sự kiện (`words-changed`, `review-popup-opened`, `review-nudge-opened`, `open-review-tab`, `desktop-notification-received`…) |
| Rust (`src-tauri/src/lib.rs`, 2.9k dòng) | cửa sổ popup/nudge, tray, thông báo, autostart, updater, gọi CLI AI, `compute_fsrs_parameters` (fsrs-rs), xuất backup |
| Supabase | migrations 0001–0007: `profiles`, `sync_rows` (LWW theo `ts`), `xp_daily` (sổ XP theo thiết bị, tối đa 10 thiết bị), `groups`, `sync_usage` (quota 300k dòng) |

Nhận xét then chốt: **nghiệp vụ đã tách khỏi Tauri gần như hoàn toàn**; phần dính Tauri là "vỏ" (cửa sổ, tray, thông báo, CLI AI, optimizer). Vì vậy không cần — và không nên — chuyển SQL sang Postgres.

---

## 3. So sánh hướng kiến trúc

| | A. Supabase là nguồn dữ liệu chính (server-first) | B. Local-first trên web (SQLite WASM) + sync | **C. B + nội dung lên Supabase (đề xuất)** |
|---|---|---|---|
| Giữ nguyên thuật toán | Phải viết lại 243 câu SQL sang Postgres/RPC, sửa mọi service gọi DB | Giữ nguyên | Giữ nguyên |
| Độ trễ khi chấm thẻ | 1 round-trip mạng / thẻ (100–300 ms) | ~1 ms | ~1 ms |
| Offline | Không | Có | Có |
| Desktop | Phải đổi theo hoặc chạy 2 mô hình | Không đổi | Không đổi |
| Xung đột desktop ↔ web | Mới, phải thiết kế lại | Dùng chiến lược sẵn có (LWW, `maxMap`, `progress_merge`…) | Như B |
| Từ vựng/ngữ pháp trên Supabase | Có | Không (đóng gói) | **Có** |
| Công sức | Rất lớn (3–4 tháng) | Vừa | Vừa + 1–2 tuần |

Hướng A chỉ đáng khi cần truy vấn tiến độ phía server (giáo viên xem lớp, phân tích tổng hợp). Khi đó vẫn có thể làm thêm sau bằng **view/hàm Postgres đọc `sync_rows`** mà không đụng client.

---

## 4. Kiến trúc đích

```
┌──────────────────────────── Trình duyệt ─────────────────────────────┐
│  Next.js (App Router)                                                 │
│   ├─ app/(public)  landing, /leaderboard (SSR)                        │
│   ├─ app/(auth)    /login /signup /reset (Server Actions + @supabase/ssr)
│   └─ app/(app)     /today /review /grammar …  ("use client", ssr:false)│
│         │                                                             │
│         ▼                                                             │
│  @myenglish/core  (src/services, utils, types, hooks — KHÔNG ĐỔI)     │
│         │  getDatabase()            localStorage   events             │
│         ▼                               │            │                │
│  platform/web ──────────────────────────┴────────────┘                │
│   ├─ sql: Worker ⇄ SQLite WASM (OPFS sahpool)  ← cùng schema v18      │
│   ├─ events: BroadcastChannel (thay Tauri emit/listen giữa các tab)   │
│   ├─ notify: Notification API + Service Worker (Web Push)             │
│   ├─ ai: fetch('/api/ai/*')                                           │
│   └─ files: Blob download / <input type=file>                         │
│         │ sync engine (src/services/sync, KHÔNG ĐỔI)                  │
└─────────┼─────────────────────────────────────────────────────────────┘
          ▼
┌──────────────────────────── Supabase ────────────────────────────────┐
│ Auth · profiles · sync_rows · xp_daily · groups (đã có)               │
│ catalog_words · catalog_meta                (mới — nội dung chung)    │
│ grammar_content                              (mới — dùng chung, đã login)│
│ push_subscriptions                           (mới — Web Push)         │
│ Edge Function cron: web push nhắc ôn                                   │
└───────────────────────────────────────────────────────────────────────┘
          ▲
   Desktop Tauri (không đổi, chỉ thêm: kéo catalog/sách ngữ pháp từ Supabase)
```

### 4.1. Cấu trúc repo

Giai đoạn đầu **không di chuyển file** để desktop không bị ảnh hưởng:

```
MyEnglish/
├─ src/                 ← giữ nguyên, dùng chung
├─ src-tauri/           ← giữ nguyên
├─ web/                 ← MỚI: Next.js 15
│  ├─ app/              ← routes (§6)
│  ├─ platform/         ← adapter thay @tauri-apps/* (§4.2)
│  ├─ workers/sqlite.worker.ts
│  ├─ public/sw.js, manifest.webmanifest
│  └─ next.config.ts    ← resolveAlias: "@" → ../src, "@tauri-apps/*" → platform/*
└─ supabase/migrations/0008_content.sql, 0009_web.sql
```

Khi web ổn định, chuyển sang npm workspaces (`packages/core`, `packages/ui`, `apps/desktop`, `apps/web`) — việc đổi chỗ thuần cơ học.

### 4.2. Lớp adapter (điểm mấu chốt để "giữ nguyên thuật toán")

Bước 1 — alias (giống `.claude/verify/vite.config.ts`, không sửa service nào):

| Import hiện tại | Trên web trỏ tới |
|---|---|
| `@tauri-apps/plugin-sql` | `platform/sql.ts` — class `Database` có `load/select/execute/close`, gửi câu SQL vào Worker; giữ nguyên quy ước `$1,$2` → `?` và boolean → 0/1 như `test/stubs/tauriSql.ts` |
| `@tauri-apps/api/core` (`invoke`) | `platform/invoke.ts` — bảng ánh xạ lệnh (§5) |
| `@tauri-apps/api/event` | `platform/events.ts` — `emit/listen` qua `BroadcastChannel("myenglish")` |
| `@tauri-apps/api/window`, `webview`, `webviewWindow` | stub (label luôn `main`) |
| `plugin-notification` | `Notification` API |
| `plugin-autostart`, `plugin-updater`, `plugin-process` | no-op |

Bước 2 (dần dần) — thay alias bằng module `platform` có kiểu rõ ràng (`isDesktop`, `capabilities.popupWindow`…) để UI ẩn các mục chỉ có ở desktop (autostart, đường dẫn CLI, cập nhật app).

### 4.3. SQLite trên web — chi tiết

- `@sqlite.org/sqlite-wasm` chạy trong **Dedicated Worker**, VFS `opfs-sahpool` (không cần header COOP/COEP, nhanh hơn VFS `opfs` thường). Mỗi lệnh `select/execute` là một message; interface vốn đã `async` nên service không phải đổi.
- **Nhiều tab:** `opfs-sahpool` chỉ cho một kết nối. Dùng **Web Locks** chọn "tab chủ" giữ DB; tab khác hoặc (v1) hiện "MyEnglish đang mở ở tab khác — chuyển sang đây?", hoặc (v2) chuyển tiếp truy vấn qua BroadcastChannel tới tab chủ.
- `PRAGMA journal_mode = WAL` không áp dụng cho OPFS — `initSchema` đã `.catch(() => {})` nên không lỗi.
- Ghi chú từ review 2026-10-14: plugin-sql không giữ transaction qua nhiều `execute` → code đã dùng câu lệnh nhiều dòng một lần; trên Worker vẫn đúng.
- Gọi `navigator.storage.persist()` sau đăng nhập để trình duyệt không tự xoá dữ liệu.
- Trình duyệt không có OPFS (một số chế độ ẩn danh): chạy SQLite trong RAM, tải lại từ Supabase mỗi lần đăng nhập (bắt buộc có tài khoản).

### 4.4. localStorage

Web có `localStorage` thật nên ~96 key chạy nguyên. `storageBackup.ts` (mirror vào `app_kv`) vẫn bật để reset/khôi phục chạy như desktop. Lưu ý: mọi truy cập `localStorage/window` ở **cấp module** sẽ vỡ khi Next render trên server → toàn bộ khu `(app)` nạp bằng `dynamic(() => import(...), { ssr: false })` (§7.2).

---

## 5. Bảng chuyển đổi tính năng desktop → web

| Desktop (Tauri) | Web | Ghi chú |
|---|---|---|
| `getDatabase()` / plugin-sql | SQLite WASM + OPFS | §4.3 |
| Sự kiện `words-changed` giữa cửa sổ | BroadcastChannel giữa tab | payload `{source}` giữ nguyên |
| Cửa sổ `review-popup` nổi trên app khác | Modal `FocusReviewModal` trong trang; tuỳ chọn **Document Picture-in-Picture** (Chrome/Edge) để có "cửa sổ nổi" thật | Safari/Firefox: chỉ modal |
| Cửa sổ `review-nudge` góc màn hình | Toast trong trang + Web Push khi tab đóng | logic `reminderMoments`, `popupSession` giữ nguyên |
| `set_tray_due_count` | `document.title` "(12) MyEnglish", favicon badge, Badging API (PWA đã cài) | |
| `send_desktop_notification` | `Notification` API (khi tab mở) / Web Push (khi đóng) | cần xin quyền; iOS chỉ khi PWA đã "Thêm vào màn hình chính" |
| `get_popup_blockers`, `is_cursor_over_nudge` | trả về "không chặn" / `false` | các khái niệm "đang họp, toàn màn hình" không đo được trên web |
| `check_cli_status` + `*_ai` (gọi CLI `agy/gemini`) | **Tắt trên web** (§11): `check_cli_status` trả `installed: false` để UI tự ẩn các mục AI như khi máy chưa cài CLI | nếu bật lại sau: Route Handler gọi Gemini API, §7.4 |
| `compute_fsrs_parameters` (fsrs-rs) | GĐ đầu: **dùng trọng số desktop đã tính** — `myenglish_fsrs_weights_v1` đã sync (lww). Sau: fsrs-rs biên dịch WASM chạy trong Worker | không có desktop thì dùng trọng số mặc định ts-fsrs như hiện tại |
| `export_backup` | `Blob` + `<a download>` | |
| Nhập JSON sách ngữ pháp (`GrammarImportDialog`) | `<input type=file>`, chỉ lưu trên trình duyệt | sách mặc định đã có sẵn từ `grammar_content` |
| autostart, updater, `prepare_update_exit` | bỏ; PWA tự cập nhật qua service worker ("Có bản mới — tải lại") | |
| `log_debug` | `console` (+ Sentry tuỳ chọn) | |
| `CliGuideView` (tab "Cài đặt", 1.9k dòng) | Tách: phần cài CLI chỉ hiện ở desktop; phần còn lại thành `/settings` | |
| `speechSynthesis` (đọc từ, nghe-chép) | giữ nguyên | giọng khác nhau theo hệ điều hành/trình duyệt |
| Phím tắt bàn phím trong bài tập | giữ nguyên + thêm thao tác chạm cho mobile | |

---

## 6. Dữ liệu trên Supabase

### 6.1. Từ vựng — `catalog_words` (migration `0008_content.sql`)

```sql
create table public.catalog_meta (
  key text primary key,          -- 'vocab_version', 'vocab_source'
  value text not null
);
create table public.catalog_words (
  id text primary key,           -- = vocabCatalog.json words[].id (khoá sync `wordKey` đang dùng)
  word text not null,
  cefr text not null,            -- A1..C1 — từ Oxford, không do AI
  list int, ord int, freq int, is_it boolean,
  pos text,
  vn text,                       -- nghĩa (AI viết)
  senses jsonb, ipa_us jsonb, ipa_uk jsonb,
  variants jsonb, irregular jsonb, examples jsonb,
  version int not null,
  updated_at timestamptz not null default now()
);
alter table public.catalog_words enable row level security;
create policy catalog_read on public.catalog_words for select using (true);  -- chỉ đọc; ghi bằng service_role
```

- Nguồn sự thật chuyển từ `src/data/vocabCatalog.json` sang bảng này. Script `scripts/wordlists/build_catalog_from_anki.py` thêm bước **upsert lên Supabase** (dùng `service_role`, chạy tay, không bao giờ nằm trong client).
- Client **không truy vấn từng từ**: app vẫn copy catalog vào bảng SQLite `vocab_catalog` như hiện nay (`vocabCatalog.ts`, so `version`). Chỉ đổi nguồn tải: `catalog_meta.vocab_version` mới hơn → tải snapshot (Storage/CDN, ~3.4 MB, gzip còn khoảng 1/4) hoặc trang `catalog_words where version > local`.
- Desktop giữ file JSON đóng gói làm dự phòng offline lần đầu.
- Giữ quy tắc [nguồn chính thống]: từ, cấp độ, IPA lấy từ Oxford/CMU; AI chỉ viết nghĩa và ví dụ — ghi rõ trong `catalog_meta.vocab_source`.

### 6.2. Ngữ pháp — bộ sách dùng chung (đã chốt §11)

```sql
create table public.grammar_content (
  kind text not null,            -- 'chapter' | 'lesson' | 'set' | 'item'
  id text not null,              -- = id trong grammarCatalog.json / grammar_book_* (khoá tiến độ đang dùng)
  parent_id text, ord int,
  data jsonb not null,
  version int not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
alter table public.grammar_content enable row level security;
-- Chỉ người đã đăng nhập đọc được (không cho anon); ghi bằng service_role qua script
create policy grammar_read on public.grammar_content for select to authenticated using (true);
```

- Nguồn: `grammarCatalog.json` hiện tại (31 chương) → script upsert (`scripts/build-grammar-catalog.mjs` thêm bước đẩy lên Supabase, chạy tay bằng `service_role`).
- Client vẫn seed vào bảng SQLite `grammar_book_*` như `grammarBook.ts` đang làm (so `version`), chỉ đổi nguồn từ file đóng gói sang Supabase. Engine (`grammarItems`, `grammarSession`, `grammarPath`) không đổi.
- Bài tập tự thêm (`grammar_custom_exercises`) và việc người dùng tự nhập sách: giữ trên máy như hiện nay (chưa đưa lên cloud ở bản đầu).
- Tiến độ ngữ pháp (`grammar` trong `sync_rows`, các key `myenglish_grammar_*`) **không đổi**.
- Không đóng gói nội dung sách vào JS của web; chỉ phục vụ qua API sau đăng nhập.

### 6.3. Tiến độ học — giữ nguyên

`sync_rows` (`card`, `word`, `log`, `event`, `mistake`, `grammar`, `kv`), `xp_daily`, `profiles`, `groups`, `standing_board`… không đổi. Web chỉ là thêm một thiết bị. Khi trình duyệt mới đăng nhập: kéo toàn bộ theo trang (engine đã phân trang 500 dòng) → hiện thanh tiến độ "Đang tải dữ liệu học…".

### 6.4. Bảng mới khác (`0009_web.sql`)

- `push_subscriptions(user_id, endpoint, keys, tz, created_at)` — Web Push.
- Thay hàm `xp_push`: giới hạn thiết bị 10 → 30 (§9.4).

---

## 7. Next.js — chi tiết kỹ thuật

### 7.1. Bản đồ route (từ `Sidebar.tsx`)

| Tab desktop | Route web | Render |
|---|---|---|
| — | `/` landing | SSG |
| — | `/login`, `/signup`, `/reset-password`, `/auth/callback` | Server Actions |
| Hôm nay | `/today` | client |
| Ôn tập | `/review`, phiên học `/review/session` | client |
| Từ đã học | `/words`, chi tiết `/words/[key]` | client |
| Đã biết | `/known` | client |
| Từ hay quên | `/forgotten` | client |
| Ngữ pháp | `/grammar`, `/grammar/[lessonId]`, `/grammar/import` | client |
| Phát âm | `/pronunciation` | client |
| Đọc | `/reading` | client |
| Viết & sổ lỗi | `/writing` | client |
| Lộ trình từ vựng | `/roadmap` | client |
| Tiến độ | `/progress` | client |
| Xếp hạng | `/leaderboard` (+ `/leaderboard/[group]`) | SSR top công khai + client phần "bạn" |
| Tài khoản / Cài đặt | `/account`, `/settings` | client |
| Phiên tập trung (Focus) | modal trên mọi route + `/focus` | client |

`DashboardTab` hiện là state trong `MainDashboard.tsx` → chuyển thành URL (back/forward, chia sẻ link, F5 giữ trang). `MainDashboard` (1.7k dòng) tách thành `app/(app)/layout.tsx` (Sidebar + Header + banner + modal toàn cục) và từng `page.tsx` bọc tab tương ứng.

### 7.2. Render & SSR

- `app/(app)/layout.tsx` là Server Component chỉ kiểm tra phiên đăng nhập; mọi thứ bên dưới là `ClientShell` nạp bằng `dynamic(..., { ssr: false })` → không lỗi `window/localStorage` ở cấp module, không lệch hydration.
- `main.tsx` bootstrap (khôi phục localStorage từ DB, `ensureReleaseMigrationV27`, `settleKnownWords`, `initTheme`, `initStrictInputGuards`) chuyển vào `ClientShell` với màn hình chờ.
- Theme: script inline trong `<head>` đặt class `dark` trước khi vẽ (tránh nháy).
- Không bundle `vocabCatalog.json`/`grammarCatalog.json` vào JS (hiện import động; trên web phải tải từ Supabase, §6.1).

### 7.3. Đăng nhập

- `@supabase/ssr`: client trình duyệt + client server (cookie). `middleware.ts` làm mới phiên và chặn `(app)` khi chưa đăng nhập.
- `authStore.ts` giữ nguyên logic, chỉ đổi cách tạo client trong `services/supabase.ts`:
  `import.meta.env.VITE_SUPABASE_*` → `process.env.NEXT_PUBLIC_SUPABASE_*` (đặt một hàm `env()` dùng chung cho cả Vite và Next).
- Có thể thêm Google OAuth (web dễ hơn desktop) — quyết định sau.

### 7.4. AI qua Route Handler (hoãn — AI tắt trên web ở bản đầu, §11)

- `app/api/ai/[op]/route.ts` (runtime Node): xác thực bằng cookie Supabase → `ai_take(1)` → gọi Gemini API (`GEMINI_API_KEY` chỉ ở server) với prompt chuyển từ `lib.rs` → trả **chuỗi thô** như CLI trả hiện nay, để `ai.ts` parse y như cũ.
- Timeout giữ tương đương (45 s + 60 s fallback) → cần runtime cho phép > 60 s (Vercel Pro hoặc tự host).

### 7.5. PWA & nhắc học

- `manifest.webmanifest`, service worker (cache shell + file WASM), có thể cài như app.
- Khi tab mở: `reminderSettings`/`reminderMoments` chạy y nguyên, hiện toast + `Notification`.
- Khi tab đóng: Edge Function cron mỗi 15 phút → với mỗi `push_subscriptions` đang trong khung giờ nhắc, đếm thẻ đến hạn từ `sync_rows` (`kind='card'`, trường `due` trong `data`) → gửi Web Push. Đây là lượng thẻ **gần đúng** (lần sync cuối), đủ cho lời nhắc.

### 7.6. Triển khai

- Vercel (dễ nhất) hoặc Cloudflare/tự host. Header: `Content-Security-Policy` cho phép `*.supabase.co`, `wasm-unsafe-eval`; file `.wasm` đúng MIME.
- CI (`.github/workflows/ci.yml`): thêm `next build` + test adapter.

---

## 8. Mockup giao diện

Nguyên tắc: **giữ ngôn ngữ thiết kế desktop** (Tailwind, lucide icons, màu theo tab, dark mode) để component dùng lại được; thêm bố cục mobile.

### 8.1. Khung chính — desktop (≥1024px)

```
┌──────────────┬────────────────────────────────────────────────────────────┐
│  MyEnglish   │  Hôm nay · Thứ Sáu 31/10        🔥 12 ngày   ⚡ 1 240 XP  (A) │
│──────────────│────────────────────────────────────────────────────────────│
│ ☀ Hôm nay    │                                                            │
│ 🔥 Ôn tập  24│              (nội dung route hiện tại)                     │
│ 📚 Từ đã học │                                                            │
│ ✔ Đã biết  3 │                                                            │
│ 🎓 Ngữ pháp 5│                                                            │
│ 🔊 Phát âm   │                                                            │
│ 📖 Đọc       │                                                            │
│ ✍ Viết       │                                                            │
│ 🗺 Lộ trình  │                                                            │
│ 📊 Tiến độ   │                                                            │
│──────────────│                                                            │
│ Từ hay quên  │                                                            │
│ Xếp hạng #7  │                                                            │
│──────────────│                                                            │
│ ⚙ Cài đặt    │                                                            │
│ 👤 Tài khoản │  ☁ Đã đồng bộ 2 phút trước                                 │
└──────────────┴────────────────────────────────────────────────────────────┘
```

Khác desktop app: URL thật cho từng mục; trạng thái đồng bộ luôn hiện ở chân trang; số thẻ đến hạn hiện cả trên tiêu đề tab trình duyệt.

### 8.2. Khung chính — mobile (<768px)

```
┌───────────────────────────┐
│ ☰  Hôm nay     🔥12  ⚡1240 │
├───────────────────────────┤
│                           │
│   (nội dung, 1 cột)       │
│                           │
│                           │
├───────────────────────────┤
│ ☀     🔥24    🎓5    📊   ⋯ │
│Hôm nay Ôn tập Ngữ pháp Tiến độ Thêm│
└───────────────────────────┘
```

Thanh dưới 4 mục chính + "Thêm" (sheet chứa các tab còn lại). Sidebar desktop thành drawer.

### 8.3. Trang "Hôm nay" (`/today`)

```
┌─ Lộ trình hôm nay ────────────────────────┐ ┌─ Xếp hạng tuần ──────┐
│ ① Ôn 24 thẻ đến hạn        [Bắt đầu ▶]    │ │ #7 trong nhóm "IT"   │
│ ② Học 10 từ mới (B1)       ○              │ │ cách #6: 35 XP       │
│ ③ 1 bài ngữ pháp mới       ○              │ └──────────────────────┘
│ ▓▓▓▓▓▓░░░░ 40%                            │ ┌─ Nhiệm vụ ngày ──────┐
└───────────────────────────────────────────┘ │ ☑ Ôn 20 thẻ          │
┌─ Phiên tập trung ─────────────────────────┐ │ ☐ 5 câu nghe-chép    │
│ ⏱ 15 phút · ~32 thẻ · +30 XP dự kiến      │ │ ☐ 1 bài ngữ pháp     │
│ [Bắt đầu phiên tập trung]                 │ │ 🎁 Rương: 1/3        │
└───────────────────────────────────────────┘ └──────────────────────┘
┌─ Thử thách tuần ─  Dễ ✔ · Vừa 60% · Khó 10% ──────────────────────┐
```

Desktop: 2 cột (`TodayRoadmapCard`, `FocusStartCard` | `RankWidgets`, `DailyQuestsCard`); mobile: 1 cột, nút "Bắt đầu" dính đáy màn hình.

### 8.4. Phiên ôn tập (`/review/session`) — toàn màn hình, ẩn sidebar

```
┌────────────────────────────────────────────────────────────┐
│ ✕   ▓▓▓▓▓▓▓▓░░░░░░░  12/32          ⏱ 06:21   🔥 combo 5    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                 deploy   /dɪˈplɔɪ/  🔊                      │
│        "We ____ the new version every Friday."             │
│                                                            │
│        ┌────────────────────────────────────┐              │
│        │ gõ đáp án…                         │              │
│        └────────────────────────────────────┘              │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  [1 Quên]   [2 Khó]   [3 Được]   [4 Dễ]     Space: lật thẻ │
└────────────────────────────────────────────────────────────┘
```

Giữ nguyên `GradingBar`, `ClozeCard`, các `exercises/*`. Mobile: nút chấm to, kéo ngang để lật thẻ; `LetterTilesExercise`, `SentenceBuilderExercise` dùng chạm.

### 8.5. Ngữ pháp (`/grammar`)

```
┌─ Sách của bạn ──────────────────────┐  ┌─ Hôm nay ─────────────┐
│ Ch.1  Hiện tại đơn   ▓▓▓▓▓▓▓▓░ 90%  │  │ 5 mục cần ôn [Ôn ▶]   │
│ Ch.2  Hiện tại TD    ▓▓▓▓░░░░░ 45%  │  │ Bài mới: Ch.3 P1      │
│ Ch.3  Quá khứ đơn    ░░░░░░░░░  0%  │  └───────────────────────┘
│ …                                   │
└─────────────────────────────────────┘
Chưa có sách → thẻ trống: "Nhập dữ liệu sách (JSON)"  [Chọn file]
                         "hoặc đồng bộ từ máy đã nhập" (tự kéo nếu tài khoản đã có)
```

### 8.6. Đăng nhập & lần đầu trên trình duyệt

```
┌──────────── MyEnglish ────────────┐      ┌───── Đang chuẩn bị dữ liệu ─────┐
│  Email     [                 ]    │  →   │ ✔ Bộ từ Oxford 5000 (v3)         │
│  Mật khẩu  [                 ]    │      │ ◐ Tiến độ học  1 850 / 4 200     │
│  [ Đăng nhập ]                    │      │ ○ Sách ngữ pháp                  │
│  Chưa có tài khoản? Đăng ký       │      │ Lần sau sẽ mở ngay, kể cả offline│
└───────────────────────────────────┘      └──────────────────────────────────┘
```

### 8.7. Mục chỉ có ở desktop

Trong `/settings`: nhóm "Ứng dụng máy tính" (tự khởi động, popup nổi, đường dẫn CLI AI, cập nhật) bị ẩn trên web; thay bằng "Thông báo trình duyệt" [Bật], "Cài làm ứng dụng (PWA)", "Thiết bị đã đăng nhập".

> Bước tiếp theo cho mockup: dựng 6 màn trên thành prototype HTML/Figma có thể bấm thử (chưa làm trong tài liệu này).

---

## 9. Điểm cần lưu ý / rủi ro

### 9.1. Bản quyền sách ngữ pháp (quan trọng nhất)
Phần ngữ pháp được chuyển từ một cuốn sách đã xuất bản. Chủ dự án đã chọn **bảng dùng chung** (§11): mọi tài khoản đăng ký đều đọc được nội dung, tức là phân phối nội dung sách cho người dùng của website. Đây là rủi ro pháp lý do chủ dự án chấp nhận. Các biện pháp giảm thiểu trong plan:
- Chỉ người đã đăng nhập đọc được (RLS `to authenticated`, không cho `anon`); không đóng gói vào JS, không đưa vào trang SSR công khai, chặn index (`robots`).
- Có thể gỡ nhanh: một cờ `catalog_meta.grammar_enabled` để tắt toàn bộ nội dung nếu nhận yêu cầu gỡ.
- Nên xin phép nhà xuất bản/tác giả, hoặc dần thay bằng nội dung tự soạn trước khi mở rộng người dùng.
- `json-data/` vẫn không commit.

### 9.2. Nhiều tab / nhiều thiết bị cùng lúc
- Một DB OPFS cho một tab chủ (§4.3).
- Desktop và web dùng song song: xung đột giải theo các chiến lược sync sẵn có (LWW theo `ts`, `progress_merge` 0004…). Cần kiểm thử kịch bản "ôn cùng một thẻ trên 2 máy trong một ngày".

### 9.3. Đồng hồ và ngày
Ranh giới ngày, streak, quest, khung giờ nhắc dùng giờ máy. Trình duyệt có thể khác múi giờ/sai giờ → gửi `tz` khi đăng ký push; giữ logic tính ngày ở client như cũ.

### 9.4. Giới hạn 10 thiết bị XP
`xp_push` (0005) chặn tài khoản có XP từ hơn 10 `device_id`. Mỗi trình duyệt/profile là một thiết bị; xoá dữ liệu trình duyệt sinh `device_id` mới → có thể chạm giới hạn.
**Đã chốt: nâng giới hạn lên 30 thiết bị** (migration mới thay hàm `xp_push`; giới hạn XP/ngày và số dư ban đầu tính trên cả tài khoản vẫn giữ, nên nhiều thiết bị không làm tăng XP tối đa). Web lưu `device_id` trong `localStorage` và cả trong SQLite OPFS để giảm việc sinh id mới.

### 9.5. Dung lượng & hiệu năng
- Catalog 3.4 MB + WASM ~1 MB: chỉ tải lần đầu, cache bằng service worker.
- Lần đầu kéo `sync_rows` có thể vài nghìn tới hàng chục nghìn dòng (`log`/`event` tăng theo thời gian) → nên thêm cửa sổ thời gian cho `log` khi kéo lần đầu (vd. 1 năm, đủ cho optimizer) — cần thay đổi nhỏ ở `pull`.
- Quota 300k dòng/tài khoản không đổi.
- Lazy-load từng route (component lớn: `FocusReviewModal` 2.3k dòng, `smartReview` 2.7k).

### 9.6. Bảo mật
- Chỉ `anon/publishable key` ở client; `service_role` và `GEMINI_API_KEY` chỉ ở server/script.
- XP vẫn là "casual" (client tự báo), như desktop.
- Route AI: bắt buộc đăng nhập + hạn mức, chống bị dùng làm proxy Gemini miễn phí.
- CSP chặn script lạ; không lưu token trong URL.

### 9.7. Khác biệt trình duyệt
- iOS Safari: Web Push chỉ khi đã cài PWA (iOS 16.4+); OPFS có nhưng có thể bị xoá sau 7 ngày không dùng nếu chưa `persist()`/chưa cài PWA.
- Document PiP chỉ Chrome/Edge.
- Giọng `speechSynthesis` khác nhau → bài nghe-chép có thể khác nghe trên desktop.

### 9.8. Kiểm thử "giữ nguyên thuật toán"
- Toàn bộ `test/*.test.ts` (~600 test) tiếp tục chạy trên `node:sqlite` — vẫn là chuẩn.
- Thêm bộ test adapter: chạy một nhóm test chọn lọc (srs, smartReview, grading, recorder, cloudSync) qua `platform/sql.ts` + sqlite-wasm (vitest browser mode hoặc Playwright) → khẳng định cùng kết quả.
- Test chéo: dữ liệu tạo trên desktop → sync → mở web → lịch ôn (`due`, `stability`, `difficulty`) trùng khớp.

---

## 10. Lộ trình triển khai (1 dev, ước lượng)

| GĐ | Nội dung | Kết quả cần đạt | Thời gian |
|---|---|---|---|
Theo quyết định §11: mobile làm cùng lúc với desktop ở mọi giai đoạn; AI tắt trên web; deploy Vercel.

| GĐ | Nội dung | Kết quả cần đạt | Thời gian |
|---|---|---|---|
| 0 | Dựng `web/` Next.js trên Vercel (preview theo PR), alias `@` và `@tauri-apps/*`, adapter sqlite-wasm + OPFS trong Worker; khung layout responsive (sidebar desktop + thanh dưới mobile, §8.1–8.2) | Tab "Hôm nay" chạy trên trình duyệt và điện thoại với dữ liệu thật, F5 không mất dữ liệu | 1.5 tuần |
| 1 | Tách `MainDashboard` thành layout + routes; `ClientShell` + bootstrap; Supabase auth bắt buộc (`@supabase/ssr`, middleware); sync chạy trên web; migration nâng giới hạn 30 thiết bị | Đăng nhập trên web thấy đúng tiến độ từ desktop; ôn thẻ trên web → desktop nhận | 2 tuần |
| 2 | Migration `0008_content`: `catalog_words` + `grammar_content` + script upsert; `vocabCatalog.ts`/`grammarBook.ts` tải theo version từ Supabase | Trình duyệt mới có đủ từ vựng + ngữ pháp mà không cần file đóng gói | 1–1.5 tuần |
| 3 | Phiên ôn tập + bài tập trên cả bàn phím và cảm ứng (`LetterTiles`, `SentenceBuilder`, chấm thẻ, lật thẻ) | Ôn trọn một phiên trên điện thoại | 1.5 tuần |
| 4 | Các tab còn lại responsive; thay phần Tauri: events → BroadcastChannel, popup/nudge → modal/toast, tray → title/badge, export/import file, khoá nhiều tab; ẩn mục desktop-only và mục AI | Mọi tab hoạt động trên desktop + mobile; không còn lỗi `invoke` | 2.5 tuần |
| 5 | PWA (manifest, SW, cache WASM + catalog); Web Push + Edge Function cron | Cài được như app, nhắc học khi tab đóng | 1.5 tuần |
| 6 | Test adapter + test chéo desktop↔web, Lighthouse mobile/desktop, CSP, tên miền | Phát hành beta | 1 tuần |
| 7 (sau) | AI trên web (nếu bật lại); optimizer FSRS bằng WASM; Document PiP; OAuth Google; chuyển sang workspaces | | tuỳ chọn |

Tổng: khoảng **11–12 tuần** cho bản beta đầy đủ (desktop + mobile web); bản ôn tập được trên cả hai (GĐ 0–3) khoảng **6–6.5 tuần**.

---

## 11. Quyết định đã chốt (2026-10-31)

| # | Câu hỏi | Quyết định | Ảnh hưởng tới plan |
|---|---|---|---|
| 1 | Đăng nhập | **Bắt buộc** — không có chế độ khách | `middleware.ts` chặn toàn bộ `(app)`; bỏ luồng gộp dữ liệu khách |
| 2 | Sách ngữ pháp trên Supabase | **Bảng chung** — một bộ sách cho mọi người dùng | §6.2 đổi sang `grammar_*` dùng chung; rủi ro bản quyền ở §9.1 do chủ dự án chấp nhận |
| 3 | AI trên web | **Tắt AI trên web** ở bản đầu | Bỏ Route Handler AI, bảng `ai_usage`; ẩn "Thêm từ bằng AI", chấm câu/sửa bài bằng AI, gợi nhớ AI trên web; desktop giữ CLI |
| 4 | Deploy | **Vercel** | Preview theo PR; env `NEXT_PUBLIC_SUPABASE_*` trên Vercel; tên miền chốt sau |
| 5 | Mobile | **Ngay từ đầu** | Mỗi route làm cả desktop + mobile trong cùng giai đoạn; bỏ GĐ 4 riêng (§10) |
| 6 | Giới hạn 10 thiết bị XP | **Nâng giới hạn** | Migration sửa `xp_push`: 10 → 30 thiết bị (§9.4) |

Còn mở: tên miền; có giữ `grammarCatalog.json` trong bản desktop sau khi sách đã lên Supabase không (đề xuất: desktop cũng kéo từ Supabase rồi bỏ file khỏi repo).
