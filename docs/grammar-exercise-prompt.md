# Prompt tạo bài tập Ngữ pháp tiếng Anh bằng AI (JSON Import)

Tài liệu này cung cấp Prompt chuẩn để người học sao chép và gửi cho bất kỳ AI nào (ChatGPT, Claude, Gemini, DeepSeek, v.v.) cùng với tài liệu / ghi chú ngữ pháp của mình, nhằm tạo ra bộ câu hỏi bài tập tương thích 100% với hệ thống MyEnglish.

---

## Cách sử dụng

### Cách 1: Sử dụng bộ công cụ chọn thì & số lượng câu trong app (Khuyên dùng)
1. Trong màn hình **Ngữ pháp**, bấm nút **"Sao chép Prompt AI"** (hoặc mở modal qua **"Nhập bài tập & Lịch sử" → tab "Lấy Prompt AI"**).
2. Chọn chế độ **"13 Thì tiếng Anh"**:
   - Tích chọn 1 hoặc nhiều thì bạn muốn tạo bài tập (ví dụ: *Hiện tại đơn, Quá khứ đơn, Tương lai đơn*).
   - Nhập số lượng câu hỏi mong muốn cho mỗi thì (ví dụ: mỗi thì 5 câu, 10 câu...).
   - Có thể dùng các nút chọn nhanh: *3 thì cơ bản, 4 thì Hiện tại, Tất cả 13 thì...*
3. Bấm **"Sao chép Prompt AI"**: Prompt sẽ tự động tổng hợp danh sách các thì, số lượng câu từng thì và yêu cầu AI gán đúng `lessonId` cho từng câu.
4. Gửi cho ChatGPT / Claude / Gemini và sao chép khối JSON trả về.
5. Quay lại app, dán vào tab **"Nhập bài tập (JSON)"** và bấm **"Lưu vào hệ thống"**.

### Cách 2: Sao chép Prompt mẫu thủ công bên dưới

---

## Nội dung Prompt (Copy phần dưới)

````text
Bạn là chuyên gia biên soạn bài tập ngữ pháp tiếng Anh (chuyên ngành Công nghệ Thông tin & Tiếng Anh giao tiếp công sở).
Dưới đây là tài liệu / ghi chú ngữ pháp của tôi (hoặc yêu cầu tạo bài tập):
---
[DÁN NỘI DUNG TÀI LIỆU HOẶC GHI YÊU CẦU CỦA BẠN VÀO ĐÂY]
---

Hãy tạo cho tôi một bộ bài tập ngữ pháp gồm 5 đến 15 câu hỏi.
Yêu cầu về nội dung:
- Câu hỏi có ngữ cảnh tự nhiên, ưu tiên công việc ngành IT, lập trình, văn phòng hoặc giao tiếp hàng ngày.
- Đa dạng giữa 2 dạng: "choose" (trắc nghiệm chọn 1 trong 4 đáp án) và "fill_blank" (điền từ / chia động từ vào chỗ trống).
- Mỗi câu PHẢI có giải thích ngữ pháp bằng tiếng Việt ("explainVn") và dịch nghĩa câu ("vi").

BẮT BUỘC xuất ra DUY NHẤT một khối mã JSON hợp lệ theo định dạng bên dưới (không viết thêm lời chào hay giải thích nào ngoài khối ```json):

```json
{
  "format": "myenglish-grammar-exercises",
  "version": 1,
  "chapterId": "ch01",
  "title": "Bài tập bổ sung: Thì hiện tại đơn",
  "exercises": [
    {
      "lessonId": "ch01-l01",
      "type": "choose",
      "prompt": "Our DevOps engineer usually ___ the production server every Sunday midnight.",
      "options": ["restarts", "restart", "is restarting", "restarted"],
      "answers": [["restarts"]],
      "answerSentence": "Our DevOps engineer usually restarts the production server every Sunday midnight.",
      "explainVn": "Diễn tả hành động lặp đi lặp lại có chu kỳ (thì hiện tại đơn), chủ ngữ 'DevOps engineer' là số ít nên động từ thêm 's'.",
      "vi": "Kỹ sư DevOps của chúng tôi thường khởi động lại máy chủ production vào nửa đêm mỗi Chủ nhật."
    },
    {
      "lessonId": "ch01-l01",
      "type": "fill_blank",
      "prompt": "The cronjob ___ (trigger) a database backup every 6 hours.",
      "answers": [["triggers"]],
      "answerSentence": "The cronjob triggers a database backup every 6 hours.",
      "explainVn": "Thì hiện tại đơn diễn tả lịch trình định kỳ, chủ ngữ 'The cronjob' là danh từ số ít.",
      "vi": "Cronjob kích hoạt sao lưu cơ sở dữ liệu mỗi 6 giờ."
    }
  ]
}
```

Quy tắc cấu trúc JSON:
1. "format": Bắt buộc là "myenglish-grammar-exercises".
2. "chapterId": Mã chương từ "ch01" đến "ch31" tương ứng với chương ngữ pháp (ví dụ: ch01 cho các thì, ch02 cho sự phối hợp thì, ch03 cho câu điều kiện, ch11 cho mệnh đề quan hệ, ch29 cho câu bị động...).
3. "lessonId": Mã bài học cụ thể nếu biết (ví dụ: "ch01-l01" cho Hiện tại đơn, "ch01-l02" cho Hiện tại tiếp diễn... Nếu không rõ mã bài, có thể để trống).
4. "prompt": Câu hỏi bài tập. Chỗ cần điền hoặc chọn đáp án PHẢI dùng đúng 3 dấu gạch dưới: "___". Nếu là bài tập chia động từ thì ghi rõ dạng nguyên thể trong ngoặc, ví dụ: "___ (trigger)".
5. "options": Mảng 4 phương án lựa chọn (bắt buộc đối với type "choose").
6. "answers": Mảng 2 chiều chứa các phương án đúng được chấp nhận, ví dụ: [["triggers"]] hoặc [["don't", "do not"]].
7. "answerSentence": Toàn bộ câu hoàn chỉnh sau khi điền đáp án đúng.
8. "explainVn": Giải thích chi tiết ngữ pháp bằng tiếng Việt vì sao chọn đáp án đó.
9. "vi": Bản dịch nghĩa tiếng Việt của toàn bộ câu.
````
