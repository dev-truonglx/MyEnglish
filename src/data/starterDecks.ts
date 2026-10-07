/**
 * Ready-made word decks, so a new learner can start without the AI CLI (which normally fills in meaning,
 * IPA and examples). Each example contains the word in a form the cloze exercises can blank
 * (base form or a regular -s/-ed/-ing form; phrases appear exactly as written).
 * Loaded on demand (onboarding and the Capture tab), never in the startup bundle.
 */

export interface StarterWord {
  word: string;
  ipa: string;
  pos: "noun" | "verb" | "adjective" | "adverb" | "phrase";
  vn: string;
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  en: string;
  enVn: string;
  coll?: string[];
}

export interface StarterDeck {
  id: string;
  /** What the learner wants to do in English (onboarding step 1) */
  goal: string;
  title: string;
  description: string;
  /** Topic given to every word of the deck */
  topic: string;
  words: StarterWord[];
}

export const STARTER_DECKS: StarterDeck[] = [
  {
    id: "docs",
    goal: "Đọc tài liệu kỹ thuật",
    title: "Từ hay gặp trong tài liệu kỹ thuật",
    description: "Docs, README, changelog, thông báo lỗi",
    topic: "Technical Docs",
    words: [
      { word: "default", ipa: "/dɪˈfɔːlt/", pos: "noun", vn: "mặc định", cefr: "B1", en: "By default, logs are written to the console.", enVn: "Theo mặc định, log được ghi ra console.", coll: ["by default", "default value"] },
      { word: "optional", ipa: "/ˈɑːpʃənl/", pos: "adjective", vn: "không bắt buộc, tùy chọn", cefr: "B1", en: "The second parameter is optional.", enVn: "Tham số thứ hai là không bắt buộc.", coll: ["optional parameter", "optional field"] },
      { word: "configure", ipa: "/kənˈfɪɡjər/", pos: "verb", vn: "cấu hình, thiết lập", cefr: "B1", en: "You can configure the timeout in the settings file.", enVn: "Bạn có thể cấu hình thời gian chờ trong file cài đặt.", coll: ["configure a server", "configure settings"] },
      { word: "compatible", ipa: "/kəmˈpætəbl/", pos: "adjective", vn: "tương thích", cefr: "B1", en: "This library is compatible with Node 18 and later.", enVn: "Thư viện này tương thích với Node 18 trở lên.", coll: ["compatible with", "fully compatible"] },
      { word: "behavior", ipa: "/bɪˈheɪvjər/", pos: "noun", vn: "hành vi, cách hoạt động", cefr: "B1", en: "This change does not affect the existing behavior.", enVn: "Thay đổi này không ảnh hưởng đến cách hoạt động hiện tại.", coll: ["default behavior", "unexpected behavior"] },
      { word: "dependency", ipa: "/dɪˈpendənsi/", pos: "noun", vn: "thư viện/thành phần phụ thuộc", cefr: "B2", en: "Run npm install to download all dependencies.", enVn: "Chạy npm install để tải tất cả các thư viện phụ thuộc.", coll: ["install dependencies", "dependency conflict"] },
      { word: "deprecated", ipa: "/ˈdeprəkeɪtɪd/", pos: "adjective", vn: "không còn khuyến khích dùng, sắp bị loại bỏ", cefr: "B2", en: "This method is deprecated and will be removed in version 3.0.", enVn: "Phương thức này đã bị đánh dấu ngừng hỗ trợ và sẽ bị xóa ở phiên bản 3.0.", coll: ["deprecated API", "mark as deprecated"] },
      { word: "implement", ipa: "/ˈɪmplɪment/", pos: "verb", vn: "triển khai, hiện thực (tính năng, giao diện)", cefr: "B2", en: "The class must implement the Serializable interface.", enVn: "Lớp này phải hiện thực interface Serializable.", coll: ["implement a feature", "implement an interface"] },
      { word: "override", ipa: "/ˌoʊvərˈraɪd/", pos: "verb", vn: "ghi đè", cefr: "B2", en: "You can override the default value with an environment variable.", enVn: "Bạn có thể ghi đè giá trị mặc định bằng một biến môi trường.", coll: ["override a method", "override the default"] },
      { word: "retrieve", ipa: "/rɪˈtriːv/", pos: "verb", vn: "lấy (dữ liệu) ra", cefr: "B2", en: "This function retrieves the user's profile from the database.", enVn: "Hàm này lấy hồ sơ người dùng từ cơ sở dữ liệu.", coll: ["retrieve data", "retrieve a record"] },
      { word: "validate", ipa: "/ˈvælɪdeɪt/", pos: "verb", vn: "kiểm tra tính hợp lệ", cefr: "B2", en: "Always validate user input on the server.", enVn: "Luôn kiểm tra tính hợp lệ của dữ liệu người dùng nhập ở phía server.", coll: ["validate input", "validate a token"] },
      { word: "specify", ipa: "/ˈspesɪfaɪ/", pos: "verb", vn: "chỉ định, nêu rõ", cefr: "B2", en: "Specify the port number with the --port flag.", enVn: "Chỉ định số cổng bằng cờ --port.", coll: ["specify a value", "unless otherwise specified"] },
      { word: "explicit", ipa: "/ɪkˈsplɪsɪt/", pos: "adjective", vn: "tường minh, rõ ràng", cefr: "B2", en: "Use explicit types instead of relying on type inference.", enVn: "Hãy dùng kiểu tường minh thay vì dựa vào suy luận kiểu.", coll: ["explicit type", "make it explicit"] },
      { word: "constraint", ipa: "/kənˈstreɪnt/", pos: "noun", vn: "ràng buộc, giới hạn", cefr: "B2", en: "The database enforces a unique constraint on the email column.", enVn: "Cơ sở dữ liệu áp đặt ràng buộc duy nhất lên cột email.", coll: ["unique constraint", "time constraint"] },
      { word: "fallback", ipa: "/ˈfɔːlbæk/", pos: "noun", vn: "phương án dự phòng", cefr: "B2", en: "If the API fails, the app uses cached data as a fallback.", enVn: "Nếu API lỗi, ứng dụng dùng dữ liệu đã lưu đệm làm phương án dự phòng.", coll: ["as a fallback", "fallback value"] },
      { word: "invoke", ipa: "/ɪnˈvoʊk/", pos: "verb", vn: "gọi (hàm, lệnh)", cefr: "C1", en: "The callback is invoked when the request completes.", enVn: "Hàm callback được gọi khi request hoàn tất.", coll: ["invoke a function", "invoke a command"] },
      { word: "threshold", ipa: "/ˈθreʃhoʊld/", pos: "noun", vn: "ngưỡng", cefr: "C1", en: "An alert is sent when CPU usage exceeds the threshold.", enVn: "Cảnh báo được gửi khi mức dùng CPU vượt quá ngưỡng.", coll: ["exceed a threshold", "set a threshold"] },
      { word: "arbitrary", ipa: "/ˈɑːrbɪtreri/", pos: "adjective", vn: "tùy ý, bất kỳ", cefr: "C1", en: "The function accepts an arbitrary number of arguments.", enVn: "Hàm này nhận một số lượng đối số tùy ý.", coll: ["arbitrary value", "arbitrary code"] },
      { word: "latency", ipa: "/ˈleɪtənsi/", pos: "noun", vn: "độ trễ", cefr: "C1", en: "Caching reduced the average latency from 300 ms to 50 ms.", enVn: "Bộ nhớ đệm đã giảm độ trễ trung bình từ 300 ms xuống 50 ms.", coll: ["low latency", "network latency"] },
      { word: "throughput", ipa: "/ˈθruːpʊt/", pos: "noun", vn: "thông lượng (lượng xử lý mỗi đơn vị thời gian)", cefr: "C1", en: "Batching requests increases throughput.", enVn: "Gom các request lại giúp tăng thông lượng.", coll: ["high throughput", "increase throughput"] },
      { word: "concurrent", ipa: "/kənˈkɜːrənt/", pos: "adjective", vn: "đồng thời", cefr: "C1", en: "The server can handle thousands of concurrent connections.", enVn: "Server có thể xử lý hàng nghìn kết nối đồng thời.", coll: ["concurrent requests", "concurrent users"] },
      { word: "immutable", ipa: "/ɪˈmjuːtəbl/", pos: "adjective", vn: "bất biến, không thay đổi được", cefr: "C1", en: "Strings in Java are immutable.", enVn: "Chuỗi trong Java là bất biến.", coll: ["immutable object", "immutable data"] },
      { word: "payload", ipa: "/ˈpeɪloʊd/", pos: "noun", vn: "phần dữ liệu gửi kèm (thân request/message)", cefr: "C1", en: "The request payload must be valid JSON.", enVn: "Dữ liệu gửi kèm trong request phải là JSON hợp lệ.", coll: ["request payload", "JSON payload"] },
      { word: "scalable", ipa: "/ˈskeɪləbl/", pos: "adjective", vn: "có khả năng mở rộng", cefr: "C1", en: "We need a scalable solution for millions of users.", enVn: "Chúng ta cần một giải pháp có khả năng mở rộng cho hàng triệu người dùng.", coll: ["highly scalable", "scalable architecture"] },
      { word: "trade-off", ipa: "/ˈtreɪd ɔːf/", pos: "noun", vn: "sự đánh đổi", cefr: "C1", en: "There is a trade-off between speed and memory usage.", enVn: "Có sự đánh đổi giữa tốc độ và lượng bộ nhớ sử dụng.", coll: ["make a trade-off", "trade-off between"] },
      { word: "troubleshoot", ipa: "/ˈtrʌblʃuːt/", pos: "verb", vn: "tìm và xử lý sự cố", cefr: "C1", en: "This guide helps you troubleshoot common installation errors.", enVn: "Hướng dẫn này giúp bạn tìm và xử lý các lỗi cài đặt thường gặp.", coll: ["troubleshoot an issue", "troubleshooting guide"] },
    ],
  },
  {
    id: "meetings",
    goal: "Họp và standup",
    title: "Họp, standup và trao đổi trong nhóm",
    description: "Báo cáo tiến độ, thống nhất, hẹn trao đổi tiếp",
    topic: "Meetings & Standup",
    words: [
      { word: "update", ipa: "/ˈʌpdeɪt/", pos: "noun", vn: "thông tin cập nhật", cefr: "A2", en: "Here's a quick update on the payment feature.", enVn: "Đây là cập nhật nhanh về tính năng thanh toán.", coll: ["give an update", "status update"] },
      { word: "agenda", ipa: "/əˈdʒendə/", pos: "noun", vn: "nội dung, chương trình cuộc họp", cefr: "B1", en: "Let's go through the agenda for today's meeting.", enVn: "Chúng ta cùng điểm qua nội dung cuộc họp hôm nay.", coll: ["on the agenda", "set the agenda"] },
      { word: "deadline", ipa: "/ˈdedlaɪn/", pos: "noun", vn: "hạn chót", cefr: "B1", en: "We might miss the deadline if the API isn't ready.", enVn: "Chúng ta có thể trễ hạn nếu API chưa sẵn sàng.", coll: ["meet a deadline", "miss a deadline"] },
      { word: "priority", ipa: "/praɪˈɔːrəti/", pos: "noun", vn: "mức ưu tiên", cefr: "B1", en: "Fixing the login bug is our top priority.", enVn: "Sửa lỗi đăng nhập là ưu tiên hàng đầu của chúng ta.", coll: ["top priority", "high priority"] },
      { word: "estimate", ipa: "/ˈestɪmeɪt/", pos: "verb", vn: "ước lượng", cefr: "B1", en: "Can you estimate how long this task will take?", enVn: "Bạn có thể ước lượng việc này mất bao lâu không?", coll: ["rough estimate", "estimate the effort"] },
      { word: "postpone", ipa: "/poʊstˈpoʊn/", pos: "verb", vn: "hoãn lại", cefr: "B1", en: "The release has been postponed until next week.", enVn: "Việc phát hành đã bị hoãn đến tuần sau.", coll: ["postpone a meeting"] },
      { word: "mute", ipa: "/mjuːt/", pos: "noun", vn: "chế độ tắt tiếng (mic)", cefr: "B1", en: "You're on mute, we can't hear you.", enVn: "Bạn đang tắt mic, chúng tôi không nghe được.", coll: ["on mute", "unmute yourself"] },
      { word: "blocker", ipa: "/ˈblɑːkər/", pos: "noun", vn: "vấn đề đang chặn tiến độ", cefr: "B2", en: "I have no blockers today.", enVn: "Hôm nay tôi không có vấn đề gì bị chặn.", coll: ["have a blocker", "remove a blocker"] },
      { word: "follow up", ipa: "/ˌfɑːloʊ ˈʌp/", pos: "phrase", vn: "trao đổi tiếp, liên hệ lại sau", cefr: "B2", en: "I'll follow up with the design team after lunch.", enVn: "Tôi sẽ trao đổi tiếp với nhóm thiết kế sau bữa trưa.", coll: ["follow up on", "follow up with someone"] },
      { word: "align", ipa: "/əˈlaɪn/", pos: "verb", vn: "thống nhất (quan điểm, mục tiêu)", cefr: "B2", en: "We need to align on the priorities for this sprint.", enVn: "Chúng ta cần thống nhất thứ tự ưu tiên cho sprint này.", coll: ["align on", "be aligned with"] },
      { word: "clarify", ipa: "/ˈklærəfaɪ/", pos: "verb", vn: "làm rõ", cefr: "B2", en: "Could you clarify what you mean by real-time?", enVn: "Bạn có thể làm rõ ý bạn khi nói real-time không?", coll: ["clarify a requirement", "let me clarify"] },
      { word: "on track", ipa: "/ɑːn ˈtræk/", pos: "phrase", vn: "đúng tiến độ", cefr: "B2", en: "The project is on track for the March release.", enVn: "Dự án đang đúng tiến độ để phát hành vào tháng Ba.", coll: ["be on track", "get back on track"] },
      { word: "behind schedule", ipa: "/bɪˈhaɪnd ˈskedʒuːl/", pos: "phrase", vn: "chậm tiến độ", cefr: "B2", en: "We are two days behind schedule.", enVn: "Chúng ta đang chậm tiến độ hai ngày.", coll: ["fall behind schedule"] },
      { word: "take ownership", ipa: "/teɪk ˈoʊnərʃɪp/", pos: "phrase", vn: "nhận trách nhiệm chính", cefr: "B2", en: "Can someone take ownership of the migration?", enVn: "Có ai nhận trách nhiệm chính cho việc migration không?", coll: ["take ownership of"] },
      { word: "wrap up", ipa: "/ræp ˈʌp/", pos: "phrase", vn: "kết thúc, tổng kết", cefr: "B2", en: "Let's wrap up the meeting, we're out of time.", enVn: "Chúng ta kết thúc cuộc họp nhé, hết giờ rồi.", coll: ["wrap up a meeting", "wrap things up"] },
      { word: "action item", ipa: "/ˈækʃn ˌaɪtəm/", pos: "noun", vn: "việc cần làm sau cuộc họp", cefr: "B2", en: "Each action item needs an owner.", enVn: "Mỗi việc cần làm sau cuộc họp phải có người phụ trách.", coll: ["assign action items"] },
      { word: "heads-up", ipa: "/ˈhedz ʌp/", pos: "noun", vn: "lời báo trước", cefr: "B2", en: "Just a heads-up: the server will be down tonight.", enVn: "Báo trước một chút: tối nay server sẽ tạm ngừng.", coll: ["give someone a heads-up", "just a heads-up"] },
      { word: "walk through", ipa: "/ˌwɔːk ˈθruː/", pos: "phrase", vn: "trình bày, hướng dẫn từng bước", cefr: "B2", en: "Let me share my screen and walk through the new login flow.", enVn: "Để tôi chia sẻ màn hình và trình bày từng bước luồng đăng nhập mới.", coll: ["walk someone through"] },
      { word: "bandwidth", ipa: "/ˈbændwɪdθ/", pos: "noun", vn: "thời gian/sức để nhận thêm việc (nghĩa bóng)", cefr: "C1", en: "I don't have the bandwidth to take on another task this week.", enVn: "Tuần này tôi không còn sức để nhận thêm việc nữa.", coll: ["have the bandwidth", "limited bandwidth"] },
      { word: "elaborate", ipa: "/ɪˈlæbəreɪt/", pos: "verb", vn: "nói rõ hơn, trình bày chi tiết", cefr: "C1", en: "Could you elaborate on the performance issue?", enVn: "Bạn có thể nói rõ hơn về vấn đề hiệu năng không?", coll: ["elaborate on"] },
      { word: "escalate", ipa: "/ˈeskəleɪt/", pos: "verb", vn: "báo lên cấp cao hơn để xử lý", cefr: "C1", en: "If the client is still unhappy, we should escalate the issue.", enVn: "Nếu khách hàng vẫn không hài lòng, chúng ta nên báo vấn đề lên cấp trên.", coll: ["escalate an issue", "escalate to the manager"] },
      { word: "stakeholder", ipa: "/ˈsteɪkhoʊldər/", pos: "noun", vn: "bên liên quan", cefr: "C1", en: "We need approval from all stakeholders before the launch.", enVn: "Chúng ta cần sự đồng ý của tất cả các bên liên quan trước khi ra mắt.", coll: ["key stakeholders"] },
      { word: "feasible", ipa: "/ˈfiːzəbl/", pos: "adjective", vn: "khả thi", cefr: "C1", en: "Is it feasible to finish this by Friday?", enVn: "Hoàn thành việc này trước thứ Sáu có khả thi không?", coll: ["technically feasible"] },
      { word: "push back", ipa: "/ˌpʊʃ ˈbæk/", pos: "phrase", vn: "phản đối (một đề xuất)", cefr: "C1", en: "I'd like to push back on that idea, it adds a lot of risk.", enVn: "Tôi muốn phản đối ý đó một chút, nó thêm nhiều rủi ro.", coll: ["push back on"] },
      { word: "circle back", ipa: "/ˌsɜːrkl ˈbæk/", pos: "phrase", vn: "quay lại bàn tiếp sau", cefr: "C1", en: "Let's circle back to this after the demo.", enVn: "Chúng ta quay lại vấn đề này sau buổi demo nhé.", coll: ["circle back to"] },
    ],
  },
  {
    id: "code-review",
    goal: "Viết PR và code review",
    title: "Pull request và code review",
    description: "Mô tả PR, góp ý, trả lời góp ý",
    topic: "Code Review",
    words: [
      { word: "approve", ipa: "/əˈpruːv/", pos: "verb", vn: "chấp thuận, duyệt", cefr: "B1", en: "I approved the pull request after the tests passed.", enVn: "Tôi đã duyệt pull request sau khi test chạy qua.", coll: ["approve a PR", "approve the changes"] },
      { word: "suggestion", ipa: "/səˈdʒestʃən/", pos: "noun", vn: "gợi ý, đề xuất", cefr: "B1", en: "I left a few suggestions on the PR.", enVn: "Tôi đã để lại vài gợi ý trên PR.", coll: ["make a suggestion", "minor suggestion"] },
      { word: "simplify", ipa: "/ˈsɪmplɪfaɪ/", pos: "verb", vn: "đơn giản hóa", cefr: "B1", en: "You could simplify this loop with map().", enVn: "Bạn có thể đơn giản hóa vòng lặp này bằng map().", coll: ["simplify the logic"] },
      { word: "address", ipa: "/əˈdres/", pos: "verb", vn: "xử lý, giải quyết (góp ý, vấn đề)", cefr: "B2", en: "I've addressed all your comments.", enVn: "Tôi đã xử lý tất cả các góp ý của bạn.", coll: ["address comments", "address an issue"] },
      { word: "consistent", ipa: "/kənˈsɪstənt/", pos: "adjective", vn: "nhất quán", cefr: "B2", en: "Please keep the naming consistent with the rest of the file.", enVn: "Hãy giữ cách đặt tên nhất quán với phần còn lại của file.", coll: ["consistent with", "stay consistent"] },
      { word: "duplicate", ipa: "/ˈduːplɪkət/", pos: "adjective", vn: "trùng lặp", cefr: "B2", en: "There is a lot of duplicate code in these two files.", enVn: "Có rất nhiều code trùng lặp trong hai file này.", coll: ["duplicate code"] },
      { word: "leftover", ipa: "/ˈleftoʊvər/", pos: "adjective", vn: "còn sót lại", cefr: "B2", en: "Please remove the leftover console.log calls.", enVn: "Vui lòng xóa các lệnh console.log còn sót lại.", coll: ["leftover code"] },
      { word: "typo", ipa: "/ˈtaɪpoʊ/", pos: "noun", vn: "lỗi đánh máy", cefr: "B2", en: "There's a typo in the error message.", enVn: "Có lỗi đánh máy trong thông báo lỗi.", coll: ["fix a typo"] },
      { word: "merge conflict", ipa: "/ˈmɜːrdʒ ˌkɑːnflɪkt/", pos: "noun", vn: "xung đột khi gộp code", cefr: "B2", en: "I need to resolve a merge conflict in the config file.", enVn: "Tôi cần giải quyết xung đột merge trong file cấu hình.", coll: ["resolve a merge conflict"] },
      { word: "out of scope", ipa: "/ˌaʊt əv ˈskoʊp/", pos: "phrase", vn: "nằm ngoài phạm vi", cefr: "B2", en: "Refactoring the API is out of scope for this PR.", enVn: "Tái cấu trúc API nằm ngoài phạm vi của PR này.", coll: ["out of scope for"] },
      { word: "straightforward", ipa: "/ˌstreɪtˈfɔːrwərd/", pos: "adjective", vn: "đơn giản, dễ hiểu", cefr: "B2", en: "The fix is straightforward: add a null check.", enVn: "Cách sửa đơn giản thôi: thêm một bước kiểm tra null.", coll: ["fairly straightforward"] },
      { word: "refactor", ipa: "/riːˈfæktər/", pos: "verb", vn: "tái cấu trúc code (không đổi hành vi)", cefr: "C1", en: "I refactored the payment module to remove duplicate code.", enVn: "Tôi đã tái cấu trúc module thanh toán để bỏ code trùng lặp.", coll: ["refactor the code"] },
      { word: "nitpick", ipa: "/ˈnɪtpɪk/", pos: "noun", vn: "góp ý nhỏ, chi tiết vụn vặt (hay viết tắt là nit)", cefr: "C1", en: "Just a nitpick: this variable name could be clearer.", enVn: "Chỉ là góp ý nhỏ: tên biến này có thể rõ ràng hơn.", coll: ["minor nitpick"] },
      { word: "readability", ipa: "/ˌriːdəˈbɪləti/", pos: "noun", vn: "tính dễ đọc", cefr: "C1", en: "Splitting this function would improve readability.", enVn: "Tách hàm này ra sẽ giúp code dễ đọc hơn.", coll: ["improve readability", "for readability"] },
      { word: "edge case", ipa: "/ˈedʒ keɪs/", pos: "noun", vn: "trường hợp biên, tình huống hiếm", cefr: "C1", en: "What happens in the edge case where the list is empty?", enVn: "Điều gì xảy ra trong trường hợp biên khi danh sách rỗng?", coll: ["handle edge cases", "cover an edge case"] },
      { word: "regression", ipa: "/rɪˈɡreʃn/", pos: "noun", vn: "lỗi hồi quy (tính năng cũ hỏng sau thay đổi)", cefr: "C1", en: "This change caused a regression in the search page.", enVn: "Thay đổi này gây lỗi hồi quy ở trang tìm kiếm.", coll: ["introduce a regression", "regression test"] },
      { word: "rebase", ipa: "/riːˈbeɪs/", pos: "verb", vn: "đặt lại nhánh lên commit mới nhất (git rebase)", cefr: "C1", en: "Please rebase your branch onto main before merging.", enVn: "Vui lòng rebase nhánh của bạn lên main trước khi merge.", coll: ["rebase onto main"] },
      { word: "revert", ipa: "/rɪˈvɜːrt/", pos: "verb", vn: "hoàn tác (một thay đổi)", cefr: "C1", en: "We reverted the commit because it broke the build.", enVn: "Chúng tôi đã hoàn tác commit đó vì nó làm hỏng bản build.", coll: ["revert a commit", "revert the change"] },
      { word: "rationale", ipa: "/ˌræʃəˈnæl/", pos: "noun", vn: "lý do, cơ sở của một quyết định", cefr: "C1", en: "Can you add a comment explaining the rationale for this approach?", enVn: "Bạn có thể thêm comment giải thích lý do chọn cách làm này không?", coll: ["the rationale for"] },
      { word: "workaround", ipa: "/ˈwɜːrkəraʊnd/", pos: "noun", vn: "cách xử lý tạm thời", cefr: "C1", en: "This is a temporary workaround until the library is fixed.", enVn: "Đây là cách xử lý tạm thời cho đến khi thư viện được sửa.", coll: ["temporary workaround", "find a workaround"] },
      { word: "hotfix", ipa: "/ˈhɑːtfɪks/", pos: "noun", vn: "bản sửa lỗi khẩn cấp", cefr: "C1", en: "We shipped a hotfix for the crash on iOS.", enVn: "Chúng tôi đã phát hành bản sửa lỗi khẩn cấp cho lỗi crash trên iOS.", coll: ["ship a hotfix"] },
      { word: "backward compatible", ipa: "/ˈbækwərd kəmˈpætəbl/", pos: "adjective", vn: "tương thích ngược", cefr: "C1", en: "Is this change backward compatible with older clients?", enVn: "Thay đổi này có tương thích ngược với các client cũ không?", coll: ["remain backward compatible"] },
      { word: "coverage", ipa: "/ˈkʌvərɪdʒ/", pos: "noun", vn: "độ bao phủ (của test)", cefr: "C1", en: "Please add tests to keep the coverage above 80%.", enVn: "Vui lòng thêm test để giữ độ bao phủ trên 80%.", coll: ["test coverage", "code coverage"] },
      { word: "flaky", ipa: "/ˈfleɪki/", pos: "adjective", vn: "chập chờn, lúc qua lúc lỗi (test)", cefr: "C1", en: "The CI failed because of a flaky test.", enVn: "CI lỗi vì một test chập chờn.", coll: ["flaky test"] },
      { word: "squash", ipa: "/skwɑːʃ/", pos: "verb", vn: "gộp nhiều commit thành một", cefr: "C1", en: "Please squash your commits before merging.", enVn: "Vui lòng gộp các commit lại trước khi merge.", coll: ["squash commits", "squash and merge"] },
    ],
  },
  {
    id: "interview",
    goal: "Phỏng vấn xin việc",
    title: "Phỏng vấn xin việc",
    description: "Giới thiệu bản thân, kinh nghiệm, câu hỏi hành vi",
    topic: "Job Interview",
    words: [
      { word: "responsibility", ipa: "/rɪˌspɑːnsəˈbɪləti/", pos: "noun", vn: "trách nhiệm", cefr: "B1", en: "My main responsibility was building the backend APIs.", enVn: "Trách nhiệm chính của tôi là xây dựng các API backend.", coll: ["main responsibility", "take responsibility for"] },
      { word: "achievement", ipa: "/əˈtʃiːvmənt/", pos: "noun", vn: "thành tích", cefr: "B1", en: "My biggest achievement was cutting the page load time in half.", enVn: "Thành tích lớn nhất của tôi là giảm một nửa thời gian tải trang.", coll: ["a major achievement"] },
      { word: "challenge", ipa: "/ˈtʃælɪndʒ/", pos: "noun", vn: "thử thách, khó khăn", cefr: "B1", en: "The biggest challenge was migrating the data without downtime.", enVn: "Thử thách lớn nhất là chuyển dữ liệu mà không làm gián đoạn hệ thống.", coll: ["face a challenge", "overcome a challenge"] },
      { word: "strength", ipa: "/streŋθ/", pos: "noun", vn: "điểm mạnh", cefr: "B1", en: "One of my strengths is debugging complex issues.", enVn: "Một trong những điểm mạnh của tôi là gỡ lỗi các vấn đề phức tạp.", coll: ["key strength"] },
      { word: "weakness", ipa: "/ˈwiːknəs/", pos: "noun", vn: "điểm yếu", cefr: "B1", en: "My weakness is that I sometimes take on too much work.", enVn: "Điểm yếu của tôi là đôi khi nhận quá nhiều việc.", coll: ["biggest weakness"] },
      { word: "background", ipa: "/ˈbækɡraʊnd/", pos: "noun", vn: "kiến thức, kinh nghiệm nền tảng", cefr: "B1", en: "I have a background in mobile development.", enVn: "Tôi có nền tảng về phát triển ứng dụng di động.", coll: ["background in", "technical background"] },
      { word: "opportunity", ipa: "/ˌɑːpərˈtuːnəti/", pos: "noun", vn: "cơ hội", cefr: "B1", en: "I'm looking for an opportunity to work on large-scale systems.", enVn: "Tôi đang tìm cơ hội làm việc với các hệ thống quy mô lớn.", coll: ["career opportunity", "take the opportunity"] },
      { word: "lead", ipa: "/liːd/", pos: "verb", vn: "dẫn dắt, phụ trách", cefr: "B1", en: "I lead a team of four engineers.", enVn: "Tôi đang dẫn dắt một nhóm bốn kỹ sư.", coll: ["lead a team", "lead a project"] },
      { word: "adapt", ipa: "/əˈdæpt/", pos: "verb", vn: "thích nghi", cefr: "B1", en: "I adapt quickly to new technologies.", enVn: "Tôi thích nghi nhanh với công nghệ mới.", coll: ["adapt to"] },
      { word: "conflict", ipa: "/ˈkɑːnflɪkt/", pos: "noun", vn: "mâu thuẫn, bất đồng", cefr: "B1", en: "Tell me about a time you handled a conflict in your team.", enVn: "Hãy kể về một lần bạn xử lý mâu thuẫn trong nhóm.", coll: ["handle a conflict", "resolve a conflict"] },
      { word: "requirement", ipa: "/rɪˈkwaɪərmənt/", pos: "noun", vn: "yêu cầu", cefr: "B1", en: "I clarified the requirements with the client before coding.", enVn: "Tôi đã làm rõ các yêu cầu với khách hàng trước khi viết code.", coll: ["meet the requirements", "business requirements"] },
      { word: "promote", ipa: "/prəˈmoʊt/", pos: "verb", vn: "thăng chức", cefr: "B1", en: "I was promoted to senior engineer after two years.", enVn: "Tôi được thăng chức lên kỹ sư senior sau hai năm.", coll: ["be promoted to"] },
      { word: "collaborate", ipa: "/kəˈlæbəreɪt/", pos: "verb", vn: "hợp tác, cộng tác", cefr: "B2", en: "I collaborated closely with designers and product managers.", enVn: "Tôi đã cộng tác chặt chẽ với designer và product manager.", coll: ["collaborate with", "collaborate closely"] },
      { word: "contribute", ipa: "/kənˈtrɪbjuːt/", pos: "verb", vn: "đóng góp", cefr: "B2", en: "I contributed to several open-source projects.", enVn: "Tôi đã đóng góp cho một số dự án mã nguồn mở.", coll: ["contribute to"] },
      { word: "expectation", ipa: "/ˌekspekˈteɪʃn/", pos: "noun", vn: "kỳ vọng, mong muốn", cefr: "B2", en: "What are your salary expectations?", enVn: "Mức lương mong muốn của bạn là bao nhiêu?", coll: ["salary expectations", "meet expectations"] },
      { word: "notice period", ipa: "/ˈnoʊtɪs ˌpɪriəd/", pos: "noun", vn: "thời gian báo trước khi nghỉ việc", cefr: "B2", en: "My notice period is one month.", enVn: "Thời gian báo trước khi nghỉ việc của tôi là một tháng.", coll: ["serve a notice period"] },
      { word: "mentor", ipa: "/ˈmentɔːr/", pos: "verb", vn: "kèm cặp, hướng dẫn", cefr: "B2", en: "I mentored two junior developers last year.", enVn: "Năm ngoái tôi đã kèm cặp hai lập trình viên junior.", coll: ["mentor junior developers"] },
      { word: "deliver", ipa: "/dɪˈlɪvər/", pos: "verb", vn: "hoàn thành và bàn giao (sản phẩm, kết quả)", cefr: "B2", en: "We delivered the project two weeks ahead of schedule.", enVn: "Chúng tôi đã bàn giao dự án sớm hai tuần so với kế hoạch.", coll: ["deliver results", "deliver on time"] },
      { word: "initiative", ipa: "/ɪˈnɪʃətɪv/", pos: "noun", vn: "sự chủ động", cefr: "B2", en: "I took the initiative to set up automated testing.", enVn: "Tôi đã chủ động thiết lập kiểm thử tự động.", coll: ["take the initiative", "show initiative"] },
      { word: "impact", ipa: "/ˈɪmpækt/", pos: "noun", vn: "tác động, ảnh hưởng", cefr: "B2", en: "The new cache had a big impact on performance.", enVn: "Bộ nhớ đệm mới có tác động lớn đến hiệu năng.", coll: ["have an impact on", "business impact"] },
      { word: "passionate", ipa: "/ˈpæʃənət/", pos: "adjective", vn: "đam mê", cefr: "B2", en: "I'm passionate about building developer tools.", enVn: "Tôi đam mê xây dựng các công cụ cho lập trình viên.", coll: ["passionate about"] },
      { word: "relocate", ipa: "/ˌriːˈloʊkeɪt/", pos: "verb", vn: "chuyển nơi sống/làm việc", cefr: "B2", en: "Are you willing to relocate to Singapore?", enVn: "Bạn có sẵn sàng chuyển đến Singapore làm việc không?", coll: ["relocate to", "willing to relocate"] },
      { word: "outcome", ipa: "/ˈaʊtkʌm/", pos: "noun", vn: "kết quả", cefr: "B2", en: "What was the outcome of that project?", enVn: "Kết quả của dự án đó thế nào?", coll: ["positive outcome"] },
      { word: "prioritize", ipa: "/praɪˈɔːrətaɪz/", pos: "verb", vn: "sắp xếp thứ tự ưu tiên", cefr: "B2", en: "How do you prioritize when you have several deadlines?", enVn: "Bạn sắp xếp ưu tiên thế nào khi có nhiều hạn chót?", coll: ["prioritize tasks"] },
      { word: "proficient", ipa: "/prəˈfɪʃnt/", pos: "adjective", vn: "thành thạo", cefr: "C1", en: "I'm proficient in TypeScript and Go.", enVn: "Tôi thành thạo TypeScript và Go.", coll: ["proficient in"] },
    ],
  },
];
