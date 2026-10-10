/**
 * Item bank for the adaptive placement test: grammar (fill the blank) and listening (text-to-speech,
 * pick the Vietnamese meaning) per CEFR level, plus a few very easy words to tell an absolute beginner
 * (A0, "mất gốc") from an A1 learner. Vocabulary items stay in PLACEMENT_BANK (services/placement.ts).
 * Pure data: every item has exactly one acceptable option, and `answer` is one of `options`.
 */
import type { GrammarLevel } from "@/types/grammar";

export interface PlacementGrammarItem {
  /** Sentence with exactly one blank "_____" */
  sentence: string;
  /** 3 or 4 fillers, exactly ONE grammatical */
  options: string[];
  answer: string;
  /** Vietnamese meaning of the full correct sentence */
  vn: string;
}

export interface PlacementListeningItem {
  /** What the text-to-speech says: one word (A1/A2) or a short sentence (B1+) */
  say: string;
  /** Question in Vietnamese, e.g. "Bạn nghe thấy gì? Chọn nghĩa đúng" */
  question: string;
  /** 4 Vietnamese options (meanings / paraphrases), exactly one correct */
  options: string[];
  answer: string;
}

export const PLACEMENT_GRAMMAR: Record<GrammarLevel, PlacementGrammarItem[]> = {
  A1: [
    // to be
    {
      sentence: "My manager _____ in the office today.",
      options: ["is", "are", "am", "be"],
      answer: "is",
      vn: "Hôm nay quản lý của tôi có mặt ở văn phòng.",
    },
    // present simple, 3rd person -s
    {
      sentence: "She _____ code in Python every day.",
      options: ["writes", "write", "writing", "is write"],
      answer: "writes",
      vn: "Cô ấy viết code bằng Python mỗi ngày.",
    },
    // there is / there are + plural
    {
      sentence: "There _____ three bugs in this file.",
      options: ["are", "is", "has", "be"],
      answer: "are",
      vn: "Có ba lỗi trong file này.",
    },
    // can
    {
      sentence: "He _____ speak English very well.",
      options: ["can", "cans", "can to", "is can"],
      answer: "can",
      vn: "Anh ấy có thể nói tiếng Anh rất tốt.",
    },
  ],
  A2: [
    // past simple, irregular verb
    {
      sentence: "Yesterday I _____ the report to my team lead.",
      options: ["sent", "send", "sended", "sends"],
      answer: "sent",
      vn: "Hôm qua tôi đã gửi báo cáo cho trưởng nhóm.",
    },
    // comparative
    {
      sentence: "The new server is _____ than the old one.",
      options: ["faster", "fast", "more fast", "fastest"],
      answer: "faster",
      vn: "Máy chủ mới nhanh hơn máy chủ cũ.",
    },
    // be going to
    {
      sentence: "Next week we _____ release the new version.",
      options: ["are going to", "going to", "are go to", "goes to"],
      answer: "are going to",
      vn: "Tuần sau chúng tôi sẽ phát hành phiên bản mới.",
    },
    // present continuous vs present simple
    {
      sentence: "Please wait, I _____ the tests right now.",
      options: ["am running", "run", "runs", "running"],
      answer: "am running",
      vn: "Vui lòng đợi, tôi đang chạy kiểm thử ngay lúc này.",
    },
  ],
  B1: [
    // present perfect vs past simple (since)
    {
      sentence: "I _____ at this company since 2020.",
      options: ["have worked", "work", "worked", "am working"],
      answer: "have worked",
      vn: "Tôi đã làm việc ở công ty này từ năm 2020.",
    },
    // first conditional
    {
      sentence: "If the tests pass, we _____ the code tonight.",
      options: ["will deploy", "deployed", "deploys", "deploying"],
      answer: "will deploy",
      vn: "Nếu kiểm thử chạy qua, tối nay chúng tôi sẽ triển khai code.",
    },
    // passive, past simple
    {
      sentence: "This feature _____ by our team last month.",
      options: ["was built", "built", "was build", "is building"],
      answer: "was built",
      vn: "Tính năng này được nhóm chúng tôi xây dựng vào tháng trước.",
    },
    // relative pronoun who / which
    {
      sentence: "The developer _____ wrote this code has left the company.",
      options: ["who", "which", "what", "whose"],
      answer: "who",
      vn: "Lập trình viên đã viết đoạn code này đã nghỉ việc ở công ty.",
    },
  ],
  B2: [
    // third conditional
    {
      sentence: "If we _____ the logs, we would have found the bug earlier.",
      options: ["had checked", "have checked", "would check", "checks"],
      answer: "had checked",
      vn: "Nếu chúng tôi đã kiểm tra log thì đã tìm ra lỗi sớm hơn.",
    },
    // gerund vs infinitive after suggest
    {
      sentence: "I suggest _____ the release until Monday.",
      options: ["delaying", "to delay", "delay", "delayed"],
      answer: "delaying",
      vn: "Tôi đề nghị hoãn bản phát hành đến thứ Hai.",
    },
    // passive with a modal verb
    {
      sentence: "This bug should _____ before the release.",
      options: ["be fixed", "fixed", "being fixed", "be fix"],
      answer: "be fixed",
      vn: "Lỗi này nên được sửa trước khi phát hành.",
    },
    // reported yes/no question
    {
      sentence: "My manager asked me _____ I could finish the task by Friday.",
      options: ["whether", "that", "do", "what"],
      answer: "whether",
      vn: "Quản lý hỏi tôi liệu tôi có thể hoàn thành công việc trước thứ Sáu không.",
    },
  ],
  C1: [
    // negative inversion
    {
      sentence: "Rarely _____ such a clean codebase.",
      options: ["have I seen", "I have seen", "I saw", "seen I have"],
      answer: "have I seen",
      vn: "Hiếm khi tôi thấy một codebase gọn gàng như vậy.",
    },
    // wh-cleft
    {
      sentence: "_____ we need now is a clear plan.",
      options: ["What", "That", "Which", "It"],
      answer: "What",
      vn: "Điều chúng ta cần lúc này là một kế hoạch rõ ràng.",
    },
    // mixed conditional (past condition, present result)
    {
      sentence: "If I had learned English earlier, I _____ a better job now.",
      options: ["would have", "will have", "had", "would had"],
      answer: "would have",
      vn: "Nếu tôi học tiếng Anh sớm hơn thì bây giờ tôi đã có công việc tốt hơn.",
    },
    // subjunctive after "It is essential that"
    {
      sentence: "It is essential that the server _____ restarted tonight.",
      options: ["be", "to be", "been", "being"],
      answer: "be",
      vn: "Điều thiết yếu là máy chủ phải được khởi động lại tối nay.",
    },
  ],
};

const HEAR_WORD = "Bạn nghe thấy từ gì? Chọn nghĩa đúng";
const HEAR_SENTENCE = "Câu bạn nghe có ý gì?";

export const PLACEMENT_LISTENING: Record<GrammarLevel, PlacementListeningItem[]> = {
  A1: [
    {
      say: "Monday",
      question: HEAR_WORD,
      options: ["thứ Hai", "thứ Ba", "Chủ nhật", "buổi sáng"],
      answer: "thứ Hai",
    },
    {
      say: "computer",
      question: HEAR_WORD,
      options: ["máy tính", "điện thoại", "bàn phím", "màn hình"],
      answer: "máy tính",
    },
    {
      say: "office",
      question: HEAR_WORD,
      options: ["văn phòng", "nhà riêng", "cửa hàng", "trường học"],
      answer: "văn phòng",
    },
  ],
  A2: [
    {
      say: "meeting",
      question: HEAR_WORD,
      options: ["cuộc họp", "bữa trưa", "báo cáo", "khách hàng"],
      answer: "cuộc họp",
    },
    {
      say: "yesterday",
      question: HEAR_WORD,
      options: ["hôm qua", "ngày mai", "hôm nay", "tuần trước"],
      answer: "hôm qua",
    },
    {
      say: "password",
      question: HEAR_WORD,
      options: ["mật khẩu", "tên đăng nhập", "hộ chiếu", "địa chỉ email"],
      answer: "mật khẩu",
    },
  ],
  B1: [
    {
      say: "Can you send me the meeting notes after lunch?",
      question: HEAR_SENTENCE,
      options: [
        "Người nói nhờ bạn gửi biên bản cuộc họp sau bữa trưa.",
        "Người nói sẽ gửi cho bạn biên bản cuộc họp sau bữa trưa.",
        "Người nói rủ bạn đi ăn trưa trước cuộc họp.",
        "Người nói hỏi cuộc họp chiều nay có bị hủy không.",
      ],
      answer: "Người nói nhờ bạn gửi biên bản cuộc họp sau bữa trưa.",
    },
    {
      say: "The build failed because someone forgot to update the settings file.",
      question: HEAR_SENTENCE,
      options: [
        "Bản build bị lỗi vì có người quên cập nhật file cấu hình.",
        "Bản build chạy thành công sau khi file cấu hình được cập nhật.",
        "Có người đã xóa file cấu hình nên phải build lại từ đầu.",
        "Bạn cần nhớ cập nhật file cấu hình trước khi build.",
      ],
      answer: "Bản build bị lỗi vì có người quên cập nhật file cấu hình.",
    },
    {
      say: "I will be on holiday next week, so please ask Anna.",
      question: HEAR_SENTENCE,
      options: [
        "Tuần sau người nói đi nghỉ, nên hãy hỏi Anna.",
        "Tuần sau Anna đi nghỉ, nên hãy hỏi người nói.",
        "Người nói vừa đi nghỉ về và sẵn sàng trả lời câu hỏi.",
        "Tuần sau người nói và Anna sẽ cùng đi nghỉ.",
      ],
      answer: "Tuần sau người nói đi nghỉ, nên hãy hỏi Anna.",
    },
  ],
  B2: [
    {
      say: "We need to postpone the release until the security issues are fixed.",
      question: HEAR_SENTENCE,
      options: [
        "Cần hoãn bản phát hành cho đến khi sửa xong các lỗi bảo mật.",
        "Cứ phát hành ngay, các lỗi bảo mật sẽ sửa sau.",
        "Bản phát hành đã bị hủy hẳn vì có lỗi bảo mật.",
        "Các lỗi bảo mật đã được sửa xong trước khi phát hành.",
      ],
      answer: "Cần hoãn bản phát hành cho đến khi sửa xong các lỗi bảo mật.",
    },
    {
      say: "Unless the client approves the design by Friday, we cannot start coding.",
      question: HEAR_SENTENCE,
      options: [
        "Nếu khách hàng chưa duyệt thiết kế trước thứ Sáu thì nhóm chưa thể bắt đầu viết code.",
        "Khách hàng đã duyệt thiết kế, nên thứ Sáu nhóm sẽ bắt đầu viết code.",
        "Nhóm sẽ viết code xong trước thứ Sáu rồi gửi khách hàng duyệt thiết kế.",
        "Khách hàng muốn tự viết code nếu thiết kế được duyệt trước thứ Sáu.",
      ],
      answer: "Nếu khách hàng chưa duyệt thiết kế trước thứ Sáu thì nhóm chưa thể bắt đầu viết code.",
    },
    {
      say: "The performance problem turned out to be a missing database index.",
      question: HEAR_SENTENCE,
      options: [
        "Hóa ra vấn đề hiệu năng là do cơ sở dữ liệu thiếu chỉ mục.",
        "Việc thêm chỉ mục cho cơ sở dữ liệu đã làm hệ thống chậm đi.",
        "Nhóm vẫn chưa tìm ra nguyên nhân của vấn đề hiệu năng.",
        "Cơ sở dữ liệu bị mất dữ liệu sau khi nâng cấp hiệu năng.",
      ],
      answer: "Hóa ra vấn đề hiệu năng là do cơ sở dữ liệu thiếu chỉ mục.",
    },
  ],
  C1: [
    {
      say: "Had we tested the migration properly, the outage could have been avoided.",
      question: HEAR_SENTENCE,
      options: [
        "Nếu đã kiểm thử kỹ việc chuyển đổi dữ liệu thì đã tránh được sự cố.",
        "Nhờ kiểm thử kỹ việc chuyển đổi dữ liệu nên nhóm đã tránh được sự cố.",
        "Nhóm sẽ kiểm thử kỹ việc chuyển đổi dữ liệu để tránh sự cố lần sau.",
        "Sự cố vẫn xảy ra dù việc chuyển đổi dữ liệu đã được kiểm thử kỹ.",
      ],
      answer: "Nếu đã kiểm thử kỹ việc chuyển đổi dữ liệu thì đã tránh được sự cố.",
    },
    {
      say: "It was not the code but the unclear requirements that delayed the project.",
      question: HEAR_SENTENCE,
      options: [
        "Dự án bị chậm là do yêu cầu không rõ ràng, chứ không phải do code.",
        "Dự án bị chậm vì code kém, dù yêu cầu đã rất rõ ràng.",
        "Cả code lẫn yêu cầu không rõ ràng đều làm dự án bị chậm.",
        "Yêu cầu rõ ràng nên dự án đã hoàn thành đúng hạn.",
      ],
      answer: "Dự án bị chậm là do yêu cầu không rõ ràng, chứ không phải do code.",
    },
    {
      say: "The proposal, while ambitious, glosses over the cost of maintaining the system.",
      question: HEAR_SENTENCE,
      options: [
        "Đề xuất tuy nhiều tham vọng nhưng lướt qua, không bàn kỹ chi phí bảo trì hệ thống.",
        "Đề xuất bị từ chối vì chi phí bảo trì hệ thống quá cao.",
        "Đề xuất phân tích rất kỹ chi phí bảo trì hệ thống.",
        "Đề xuất khá dè dặt và chỉ tập trung vào chi phí bảo trì.",
      ],
      answer: "Đề xuất tuy nhiều tham vọng nhưng lướt qua, không bàn kỹ chi phí bảo trì hệ thống.",
    },
  ],
};

/** Very easy items below A1, to tell an absolute beginner (A0) from an A1 learner */
export const PLACEMENT_A0_VOCAB: Array<{ word: string; meaning: string }> = [
  { word: "yes", meaning: "vâng, có" },
  { word: "name", meaning: "tên" },
  { word: "today", meaning: "hôm nay" },
  { word: "work", meaning: "làm việc, công việc" },
  { word: "big", meaning: "to, lớn" },
  { word: "phone", meaning: "điện thoại" },
];
