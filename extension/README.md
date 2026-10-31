# MyEnglish Chrome Extension (Manifest V3)

Bản Extension Chrome chính thức cho **MyEnglish**, giữ nguyên 100% logic thuật toán FSRS, cơ sở dữ liệu SQLite và đồng bộ dữ liệu đám mây hai chiều với bản Desktop (Tauri) và Web (Next.js).

---

## ✨ Tính năng nổi bật & Cải tiến mới

1. **Khắc phục giao diện Popup rộng rãi, không còn bị hẹp**:
   - Popup được mở rộng kích thước chuẩn **780px x 600px** (trước đây bị giới hạn cứng 420px).
   - Nội dung hiển thị đầy đủ, thoáng đãng, các thẻ bài tập, biểu đồ và mục ôn tập không bị tràn hay cắt chữ.
   - Bỏ thanh cuộn lồng nhau (double scrollbars), cuộn nội dung mượt mà.

2. **Tính năng Mở giao diện trong Tab mới (Full Dashboard)**:
   - **Nút nổi bật trên Popup**: Bấm **"🚀 Mở trong tab mới"** ở thanh tiêu đề Popup để mở tab toàn màn hình.
   - **Tùy chọn tự động mở tab**: Tích chọn *"Luôn mở tab mới khi click icon"* ngay trên thanh thông báo của Popup. Khi bật tùy chọn này, mỗi lần bạn click vào icon MyEnglish trên thanh công cụ, trình duyệt sẽ mở thẳng tab lớn mà không cần qua popup!
   - **Menu chuột phải (Context Menu)**: Click chuột phải vào biểu tượng MyEnglish trên toolbar ➜ Chọn **"🚀 Mở MyEnglish trong tab mới"**.
   - **Phím tắt nhanh**: Nhấn tổ hợp phím **`Alt + Shift + E`** (hoặc `Option + Shift + E` trên Mac) ở bất kỳ đâu trong Chrome để mở/chuyển ngay tới tab MyEnglish.
   - **Chrome Side Panel**: Bấm **"◨ Thanh bên"** để vừa đọc báo vừa học song song.

3. **Giữ nguyên toàn bộ logic học tập**:
   - Thuật toán lặp lại ngắt quãng FSRS (Rust WebAssembly).
   - Bộ 5000 từ vựng Oxford 5000 (A1 - C1) kèm phiên âm IPA, giải nghĩa tiếng Việt, ví dụ ngữ cảnh.
   - Toàn bộ 31 chủ đề Ngữ pháp tiếng Anh với lý thuyết và bài tập tương tác.
   - Cơ sở dữ liệu SQLite WASM lưu trữ an toàn, học ngoại tuyến (offline) hoàn toàn.

4. **Đăng nhập & Đồng bộ dữ liệu**:
   - Đăng nhập tài khoản Supabase (dùng chung tài khoản với bản Desktop và Web).
   - Đồng bộ 2 chiều tự động: tiến độ học từ, lịch sử ôn tập SRS, điểm kinh nghiệm XP, chuỗi ngày học Streak, bài học ngữ pháp và từ vựng tự thêm.

---

## 🚀 Hướng dẫn Cài đặt / Cập nhật vào Chrome

### 1. Build Extension
```bash
npm run build:extension
# hoặc đóng gói file zip:
npm run package:extension
```
- Thư mục giải nén: `dist-extension/`
- File zip đóng gói sẵn: `release_dist/myenglish-chrome-extension.zip`

### 2. Cài đặt hoặc Tải lại trong Chrome
1. Mở Chrome và truy cập: `chrome://extensions`
2. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên bên phải.
3. Nếu đã cài trước đó: Bấm vào **biểu tượng làm mới (Reload 🔄)** trên card MyEnglish Extension.
4. Nếu chưa cài: Bấm **"Tải tiện ích đã giải nén" (Load unpacked)** và chọn thư mục `dist-extension/`.
