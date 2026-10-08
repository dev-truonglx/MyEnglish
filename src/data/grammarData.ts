import type { GrammarLesson } from "@/types/grammar";

export const GRAMMAR_LESSONS: GrammarLesson[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // LEVEL A1: NỀN TẢNG CỐT LÕI (FOUNDATIONAL)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "a1-present-simple",
    level: "A1",
    category: "Thì cơ bản (Tenses)",
    order: 1,
    title: "Present Simple",
    titleVn: "Thì Hiện Tại Đơn",
    tagline: "Diễn tả thói quen, sự thật hiển nhiên, lịch trình và trạng thái hệ thống",
    formula: {
      positive: "S + V(s/es) + (O)",
      negative: "S + do/does + not + V-bare + (O)",
      question: "Do/Does + S + V-bare + (O)?",
    },
    timeSignals: ["always", "usually", "often", "sometimes", "rarely", "never", "every day", "on Mondays"],
    usagePoints: [
      {
        title: "Thói quen hàng ngày & lịch làm việc",
        description: "Dùng để diễn đạt hành động lặp đi lặp lại như một chu kỳ hoặc thói quen sống.",
        examples: [
          {
            sentenceEn: "I review pull requests every morning.",
            sentenceVn: "Tôi xem lại các pull request mỗi buổi sáng.",
            contextNote: "Thói quen công việc",
            breakdown: [
              { text: "I", role: "subject", label: "Chủ ngữ" },
              { text: "review", role: "verb", label: "Động từ chính (V-bare)" },
              { text: "pull requests", role: "object", label: "Tân ngữ" },
              { text: "every morning", role: "modifier", label: "Trạng từ chỉ tần suất" },
            ],
          },
        ],
      },
      {
        title: "Sự thật hiển nhiên & Quy luật tự nhiên/kỹ thuật",
        description: "Diễn tả quy luật khoa học hoặc cách một hệ thống hoạt động ổn định.",
        examples: [
          {
            sentenceEn: "The server restarts automatically when memory exceeds 90%.",
            sentenceVn: "Máy chủ tự động khởi động lại khi bộ nhớ vượt quá 90%.",
            contextNote: "Quy luật vận hành hệ thống",
            breakdown: [
              { text: "The server", role: "subject", label: "Chủ ngữ số ít" },
              { text: "restarts", role: "verb", label: "Động từ thêm 's'" },
              { text: "automatically", role: "modifier", label: "Trạng từ bổ nghĩa" },
            ],
          },
        ],
      },
    ],
    contrast: {
      titleA: "Present Simple (Hiện tại đơn)",
      titleB: "Present Continuous (Hiện tại tiếp diễn)",
      descriptionA: "Hành động ổn định, lâu dài, thói quen thường nhật.",
      descriptionB: "Hành động tạm thời, đang xảy ra ngay lúc nói.",
      exampleA: "I live in Da Nang and work as a software engineer.",
      exampleB: "I am staying in a hotel this week for a tech conference.",
      keyRule: "Gặp động từ chỉ trạng thái (state verbs: know, like, want, understand, believe) luôn dùng Hiện tại đơn, KHÔNG dùng đuôi -ing.",
    },
    commonMistakes: [
      {
        wrong: "He don't write clean code.",
        correct: "He doesn't write clean code.",
        explanation: "Chủ ngữ ngôi thứ 3 số ít (He, She, It) phải dùng trợ động từ 'does not' ('doesn't').",
      },
      {
        wrong: "She works usually on weekends.",
        correct: "She usually works on weekends.",
        explanation: "Trạng từ chỉ tần suất (always, usually, often) đứng TRƯỚC động từ thường và đứng SAU động từ 'to be'.",
      },
      {
        wrong: "I am agree with your solution.",
        correct: "I agree with your solution.",
        explanation: "'Agree' là động từ thường, không dùng to be đi kèm ở thì hiện tại đơn.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-ps-1",
        type: "conjugation",
        promptEn: "The CI/CD pipeline usually _____ (take) about five minutes to complete.",
        promptVn: "Quy trình CI/CD thường mất khoảng năm phút để hoàn thành.",
        correctAnswer: "takes",
        hint: "Chủ ngữ 'The CI/CD pipeline' là danh từ số ít ngôi thứ 3.",
        explanation: "Với chủ ngữ số ít 'The pipeline', động từ 'take' thêm đuôi 's' thành 'takes'.",
      },
      {
        id: "diag-ps-2",
        type: "error_spotting",
        promptEn: "My team [lead] [don't] [approve] [untested] code changes.",
        promptVn: "Chọn từ sai trong câu: Trưởng nhóm của tôi không phê duyệt các thay đổi mã nguồn chưa test.",
        options: ["lead", "don't", "approve", "untested"],
        correctAnswer: "don't",
        correctSentence: "My team lead doesn't approve untested code changes.",
        errorWord: "don't",
        errorExplanation: "'don't' sai vì 'My team lead' là ngôi thứ ba số ít. Phải sửa thành 'doesn't'.",
        explanation: "Chủ ngữ số ít 'My team lead' phải dùng 'doesn't' thay vì 'don't'.",
      },
      {
        id: "diag-ps-3",
        type: "multiple_choice",
        promptEn: "Which sentence is grammatically correct for a daily habit?",
        promptVn: "Câu nào dưới đây đúng ngữ pháp diễn tả thói quen hàng ngày?",
        options: [
          "He is always drinking coffee before daily standup meetings.",
          "He always drinks coffee before daily standup meetings.",
          "He drinks always coffee before daily standup meetings.",
          "He drink always coffee before daily standup meetings.",
        ],
        correctAnswer: "He always drinks coffee before daily standup meetings.",
        explanation: "Trạng từ tần suất 'always' đứng trước động từ thường 'drinks', động từ chia theo ngôi 'He'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-ps-1",
        type: "conjugation",
        promptEn: "Our team _____ (have) a retrospective meeting every two weeks.",
        promptVn: "Đội ngũ của chúng tôi có cuộc họp hồi cứu hai tuần một lần.",
        correctAnswer: ["has", "have"],
        explanation: "Dùng 'has' (đội nhóm như một thực thể) hoặc 'have' (tập thể thành viên). 'Has' là đáp án chuẩn nhất.",
      },
      {
        id: "prac-ps-2",
        type: "multiple_choice",
        promptEn: "Water _____ at 100 degrees Celsius under normal pressure.",
        options: ["boil", "boils", "is boiling", "has boiled"],
        correctAnswer: "boils",
        explanation: "Sự thật hiển nhiên/quy luật tự nhiên luôn dùng hiện tại đơn với động từ chia số ít 'boils'.",
      },
      {
        id: "prac-ps-3",
        type: "sentence_transform",
        promptEn: "Rewrite using 'seldom': 'He almost never pushes code directly to the main branch.'",
        promptVn: "Viết lại câu dùng từ 'seldom':",
        correctAnswer: "He seldom pushes code directly to the main branch.",
        explanation: "'Seldom' thay thế cho 'almost never', đứng trước động từ thường 'pushes'.",
      },
    ],
  },

  {
    id: "a1-present-continuous",
    level: "A1",
    category: "Thì cơ bản (Tenses)",
    order: 2,
    title: "Present Continuous",
    titleVn: "Thì Hiện Tại Tiếp Diễn",
    tagline: "Hành động đang diễn ra ngay lúc nói hoặc kế hoạch chắc chắn trong tương lai gần",
    formula: {
      positive: "S + am/is/are + V-ing + (O)",
      negative: "S + am/is/are + not + V-ing + (O)",
      question: "Am/Is/Are + S + V-ing + (O)?",
    },
    timeSignals: ["now", "right now", "at the moment", "currently", "at present", "Look!", "Listen!"],
    usagePoints: [
      {
        title: "Đang diễn ra ngay tại thời điểm nói",
        description: "Hành động bắt đầu trước lúc nói và chưa kết thúc.",
        examples: [
          {
            sentenceEn: "We are migrating our database to PostgreSQL right now.",
            sentenceVn: "Chúng tôi hiện đang di chuyển cơ sở dữ liệu sang PostgreSQL.",
            contextNote: "Hành động đang diễn ra",
            breakdown: [
              { text: "We", role: "subject", label: "Chủ ngữ số nhiều" },
              { text: "are migrating", role: "verb", label: "To be + V-ing" },
              { text: "our database", role: "object", label: "Tân ngữ" },
              { text: "right now", role: "modifier", label: "Dấu hiệu thời gian" },
            ],
          },
        ],
      },
      {
        title: "Kế hoạch đã sắp xếp trong tương lai gần",
        description: "Lịch trình cá nhân đã được chốt thời gian và địa điểm cụ thể.",
        examples: [
          {
            sentenceEn: "I am presenting our new architecture at the meeting tomorrow.",
            sentenceVn: "Tôi sẽ thuyết trình kiến trúc mới tại cuộc họp ngày mai.",
            contextNote: "Kế hoạch đã chốt",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Action Verbs (Động từ hành động)",
      titleB: "Stative Verbs (Động từ trạng thái)",
      descriptionA: "Chỉ hành động thực tế có thể bắt đầu/kết thúc: run, write, build, test. Dùng được thì tiếp diễn.",
      descriptionB: "Chỉ cảm xúc, nhận thức, sở hữu: understand, know, prefer, belong, resemble. KHÔNG dùng tiếp diễn.",
      exampleA: "I am writing a unit test.",
      exampleB: "I understand the concept now. (KHÔNG nói: I am understanding)",
      keyRule: "Khi muốn diễn tả cảm xúc/nhận thức ở hiện tại, luôn dùng Hiện tại đơn.",
    },
    commonMistakes: [
      {
        wrong: "I am wanting to refactor this function.",
        correct: "I want to refactor this function.",
        explanation: "'Want' là stative verb, không chia thì tiếp diễn.",
      },
      {
        wrong: "He is debuging the program.",
        correct: "He is debugging the program.",
        explanation: "Quy tắc chính tả: từ 1 âm tiết kết thúc bằng 1 nguyên âm + 1 phụ âm thì gấp đôi phụ âm cuối trước khi thêm -ing.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-pc-1",
        type: "conjugation",
        promptEn: "Quiet please! The lead architect _____ (explain) the system flow at the moment.",
        promptVn: "Xin giữ im lặng! Kiến trúc sư trưởng đang giải thích luồng hệ thống lúc này.",
        correctAnswer: "is explaining",
        hint: "'at the moment' là dấu hiệu của hiện tại tiếp diễn, chủ ngữ số ít.",
        explanation: "Chủ ngữ 'The lead architect' đi với 'is' + 'explaining'.",
      },
      {
        id: "diag-pc-2",
        type: "multiple_choice",
        promptEn: "Which sentence is incorrect?",
        promptVn: "Câu nào dưới đây SAI ngữ pháp?",
        options: [
          "They are building a cross-platform mobile app.",
          "I am knowing the answer to this technical question.",
          "The CPU usage is increasing rapidly.",
          "We are currently hiring two backend engineers.",
        ],
        correctAnswer: "I am knowing the answer to this technical question.",
        explanation: "'Know' là động từ tri giác/trạng thái (stative verb), phải dùng 'I know' chứ không dùng 'I am knowing'.",
      },
      {
        id: "diag-pc-3",
        type: "error_spotting",
        promptEn: "Look! The deployment server [is] [runing] [out] [of] disk space.",
        promptVn: "Chọn từ bị sai chính tả/ngữ pháp:",
        options: ["is", "runing", "out", "of"],
        correctAnswer: "runing",
        correctSentence: "Look! The deployment server is running out of disk space.",
        errorWord: "runing",
        errorExplanation: "'run' kết thúc bằng phụ âm sau 1 nguyên âm ngắn, phải gấp đôi 'n' thành 'running'.",
        explanation: "Chính tả đúng là 'running' (gấp đôi chữ n).",
      },
    ],
    practiceExercises: [
      {
        id: "prac-pc-1",
        type: "conjugation",
        promptEn: "Listen! Someone _____ (knock) on the server room door.",
        correctAnswer: "is knocking",
        explanation: "Thì hiện tại tiếp diễn với mệnh lệnh gây chú ý 'Listen!'.",
      },
      {
        id: "prac-pc-2",
        type: "multiple_choice",
        promptEn: "Why _____ (you / look) at me like that? Did I break the staging environment?",
        options: ["do you look", "are you looking", "you are looking", "have you looked"],
        correctAnswer: "are you looking",
        explanation: "Câu hỏi thì hiện tại tiếp diễn: 'Why are you looking...'",
      },
    ],
  },

  {
    id: "a1-past-simple",
    level: "A1",
    category: "Thì cơ bản (Tenses)",
    order: 3,
    title: "Past Simple",
    titleVn: "Thì Quá Khứ Đơn",
    tagline: "Hành động đã xảy ra và chấm dứt hoàn toàn tại một thời điểm xác định trong quá khứ",
    formula: {
      positive: "S + V-ed / V2 + (O)",
      negative: "S + did + not + V-bare + (O)",
      question: "Did + S + V-bare + (O)?",
    },
    timeSignals: ["yesterday", "last night", "last week", "two days ago", "in 2020", "when I was in college"],
    usagePoints: [
      {
        title: "Hành động đã kết thúc trong quá khứ với thời gian cụ thể",
        description: "Điểm mấu chốt là hành động đã đóng lại hoàn toàn trong quá khứ.",
        examples: [
          {
            sentenceEn: "We released version 1.0 yesterday afternoon.",
            sentenceVn: "Chúng tôi đã phát hành phiên bản 1.0 chiều hôm qua.",
            contextNote: "Sự kiện có mốc thời gian rõ ràng",
            breakdown: [
              { text: "We", role: "subject", label: "Chủ ngữ" },
              { text: "released", role: "verb", label: "Động từ dạng quá khứ (V-ed)" },
              { text: "version 1.0", role: "object", label: "Tân ngữ" },
              { text: "yesterday afternoon", role: "modifier", label: "Mốc thời gian xác định" },
            ],
          },
        ],
      },
      {
        title: "Chuỗi hành động liên tiếp trong quá khứ",
        description: "Kể lại một loạt hành động diễn ra nối tiếp nhau.",
        examples: [
          {
            sentenceEn: "He pulled the latest branch, merged the changes, and ran the tests.",
            sentenceVn: "Anh ấy đã kéo nhánh mới nhất về, gộp thay đổi và chạy các bài kiểm thử.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Regular Verbs (Động từ có quy tắc)",
      titleB: "Irregular Verbs (Động từ bất quy tắc)",
      descriptionA: "Chỉ cần thêm -ed vào đuôi (work $\\rightarrow$ worked, test $\\rightarrow$ tested).",
      descriptionB: "Biến đổi không theo quy tắc cố định (write $\\rightarrow$ wrote, build $\\rightarrow$ built, go $\\rightarrow$ went).",
      exampleA: "I pushed the commit.",
      exampleB: "I found the bug.",
      keyRule: "Khi phủ định hoặc đặt câu hỏi đã có trợ động từ 'did', động từ chính PHẢI trở về dạng nguyên thể không chia (V-bare).",
    },
    commonMistakes: [
      {
        wrong: "I didn't wrote that script.",
        correct: "I didn't write that script.",
        explanation: "Sau trợ động từ 'didn't', động từ trở về nguyên mẫu 'write', không giữ dạng 'wrote'.",
      },
      {
        wrong: "Did you checked the network log?",
        correct: "Did you check the network log?",
        explanation: "Trong câu hỏi với 'Did', động từ chính giữ nguyên thể 'check'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-pst-1",
        type: "conjugation",
        promptEn: "Last night, the senior developer _____ (find) the memory leak in the worker thread.",
        promptVn: "Đêm qua, lập trình viên senior đã tìm thấy chỗ rò rỉ bộ nhớ trong luồng xử lý worker.",
        correctAnswer: "found",
        hint: "Động từ bất quy tắc của 'find'.",
        explanation: "'Find' là động từ bất quy tắc, quá khứ là 'found'.",
      },
      {
        id: "diag-pst-2",
        type: "error_spotting",
        promptEn: "We [didn't] [received] [the] [confirmation] email two hours ago.",
        promptVn: "Chọn từ sai trong câu phủ định quá khứ đơn:",
        options: ["didn't", "received", "the", "confirmation"],
        correctAnswer: "received",
        correctSentence: "We didn't receive the confirmation email two hours ago.",
        errorWord: "received",
        errorExplanation: "Sau trợ động từ 'didn't', động từ phải ở dạng nguyên mẫu 'receive'.",
        explanation: "Sửa 'received' thành 'receive'.",
      },
      {
        id: "diag-pst-3",
        type: "multiple_choice",
        promptEn: "When _____ the bug report?",
        options: [
          "did they submit",
          "did they submitted",
          "they submitted",
          "have they submitted",
        ],
        correctAnswer: "did they submit",
        explanation: "Cấu trúc câu hỏi quá khứ đơn: Wh-word + did + S + V-bare.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-pst-1",
        type: "conjugation",
        promptEn: "Three years ago, he _____ (build) his first open-source project.",
        correctAnswer: "built",
        explanation: "Quá khứ của 'build' là 'built'.",
      },
      {
        id: "prac-pst-2",
        type: "sentence_transform",
        promptEn: "Change to negative: 'The system crashed during the stress test.'",
        promptVn: "Chuyển câu sau sang thể phủ định:",
        correctAnswer: ["The system didn't crash during the stress test.", "The system did not crash during the stress test."],
        explanation: "Phủ định quá khứ đơn dùng 'didn't crash'.",
      },
    ],
  },

  {
    id: "a1-future-simple",
    level: "A1",
    category: "Thì cơ bản (Tenses)",
    order: 4,
    title: "Future: Will vs Be Going To",
    titleVn: "Tương Lai: Will vs Be Going To",
    tagline: "Phân biệt quyết định tức thì, dự đoán khách quan và kế hoạch đã chuẩn bị từ trước",
    formula: {
      positive: "Will + V-bare | S + am/is/are + going to + V-bare",
      negative: "Won't + V-bare | S + am/is/are + not + going to + V-bare",
      question: "Will + S + V-bare? | Am/Is/Are + S + going to + V-bare?",
    },
    timeSignals: ["tomorrow", "next week", "in the future", "soon", "later today"],
    usagePoints: [
      {
        title: "Will: Quyết định bộc phát ngay lúc nói",
        description: "Khi bạn vừa nghe một thông tin và đưa ra lời đề nghị hoặc quyết định ngay tại chỗ.",
        examples: [
          {
            sentenceEn: "The server is overloaded. I will reboot it now.",
            sentenceVn: "Máy chủ đang quá tải. Tôi sẽ khởi động lại nó ngay.",
            contextNote: "Quyết định đưa ra ngay tức thì",
          },
        ],
      },
      {
        title: "Be going to: Dự định đã lên kế hoạch từ trước hoặc có dấu hiệu rõ ràng",
        description: "Hành động đã được cân nhắc từ trước thời điểm nói hoặc có bằng chứng thực tế trước mắt.",
        examples: [
          {
            sentenceEn: "Look at the memory chart! The service is going to crash.",
            sentenceVn: "Nhìn biểu đồ bộ nhớ kìa! Dịch vụ sắp bị sập rồi.",
            contextNote: "Dự đoán có bằng chứng trước mắt",
          },
          {
            sentenceEn: "We are going to upgrade our framework next month.",
            sentenceVn: "Chúng tôi dự định nâng cấp framework vào tháng tới.",
            contextNote: "Kế hoạch đã chốt trước",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Will (Tương lai đơn)",
      titleB: "Be Going To (Tương lai gần)",
      descriptionA: "Quyết định tức thì, lời hứa, đề nghị giúp đỡ, dự đoán dựa trên ý kiến cá nhân.",
      descriptionB: "Kế hoạch đã chuẩn bị sẵn, dự đoán có chứng cứ thực tế nhìn thấy được.",
      exampleA: "Don't worry, I'll help you fix the merge conflict.",
      exampleB: "I have already booked the flight. I am going to attend React Conf.",
      keyRule: "Có chứng cứ hiện tại (Look at those dark clouds! / Look at this graph!) $\\rightarrow$ luôn ưu tiên 'be going to'.",
    },
    commonMistakes: [
      {
        wrong: "Look at the smoke! The laptop will explode.",
        correct: "Look at the smoke! The laptop is going to explode.",
        explanation: "Có dấu hiệu bằng chứng nhìn thấy trước mắt (khói bốc lên) phải dùng 'is going to'.",
      },
      {
        wrong: "I will going to write the docs.",
        correct: "I am going to write the docs.",
        explanation: "Không kết hợp cả 'will' và 'going to' cùng một lúc.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-fut-1",
        type: "multiple_choice",
        promptEn: "'The phone is ringing!' - 'Hold on, I _____ answer it.'",
        promptVn: "'Điện thoại đang reo kìa!' - 'Chờ chút, tôi sẽ nghe ngay.'",
        options: ["will", "am going to", "am answering", "answered"],
        correctAnswer: "will",
        explanation: "Quyết định tức thì ngay khi nghe chuông điện thoại, dùng 'will'.",
      },
      {
        id: "diag-fut-2",
        type: "multiple_choice",
        promptEn: "We bought the tickets last week. We _____ visit the tech exhibition tomorrow.",
        promptVn: "Chúng tôi đã mua vé tuần trước. Ngày mai chúng tôi sẽ đi tham quan triển lãm công nghệ.",
        options: ["are going to", "will", "would", "shall"],
        correctAnswer: "are going to",
        explanation: "Kế hoạch đã có sự chuẩn bị và hành động từ trước (đã mua vé), dùng 'are going to'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-fut-1",
        type: "conjugation",
        promptEn: "I promise I _____ (not disclose) any confidential credentials.",
        correctAnswer: ["won't disclose", "will not disclose"],
        explanation: "Lời hứa (promise) luôn dùng 'will / won't'.",
      },
    ],
  },

  {
    id: "a1-nouns-articles",
    level: "A1",
    category: "Cấu trúc danh từ (Articles & Nouns)",
    order: 5,
    title: "Articles: A, An, The & Zero Article",
    titleVn: "Mạo Từ: A, An, The và Không Dùng Mạo Từ",
    tagline: "Làm chủ quy tắc mạo từ xác định và bất định - Lỗi người Việt hay gặp nhất",
    formula: {
      positive: "a/an + danh từ số ít đếm được | the + danh từ đã xác định | ∅ + danh từ số nhiều / không đếm được nói chung",
      negative: "N/A",
      question: "N/A",
    },
    timeSignals: ["the first time mentioned (a/an)", "second time mentioned (the)", "unique items (the sun, the internet)"],
    usagePoints: [
      {
        title: "A / An: Lần đầu nhắc tới, chưa xác định",
        description: "Dùng 'a' trước phụ âm, 'an' trước nguyên âm (phát âm: u, e, o, a, i).",
        examples: [
          {
            sentenceEn: "We found a bug in the authentication module.",
            sentenceVn: "Chúng tôi đã tìm thấy một con bug trong module xác thực.",
            contextNote: "Một con bug bất kỳ mới phát hiện",
          },
        ],
      },
      {
        title: "The: Đối tượng cả người nói và người nghe đều biết rõ",
        description: "Vật độc nhất, hoặc đối tượng đã được nhắc đến ở câu trước.",
        examples: [
          {
            sentenceEn: "We found a bug. The bug caused memory leaks.",
            sentenceVn: "Chúng tôi tìm thấy một con bug. Con bug đó đã gây rò rỉ bộ nhớ.",
          },
        ],
      },
      {
        title: "Zero Article (Không mạo từ): Khái niệm chung, số nhiều tổng quát",
        description: "Nói về bản chất của sự vật nói chung, không xác định nhóm cá biệt.",
        examples: [
          {
            sentenceEn: "Software engineers need strong problem-solving skills.",
            sentenceVn: "Các kỹ sư phần mềm (nói chung) cần kỹ năng giải quyết vấn đề tốt.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "A vs An (Dựa theo PHÁT ÂM, không phải mặt chữ)",
      titleB: "Exceptions cần lưu ý",
      descriptionA: "Dựa vào âm thanh đầu tiên phát ra khi đọc.",
      descriptionB: "Chữ viết là nguyên âm nhưng phát âm là bán nguyên âm /j/ $\\rightarrow$ dùng 'a'.",
      exampleA: "an hour (âm 'h' câm), an error",
      exampleB: "a user (phát âm là /juːzər/), a unique design, a URL",
      keyRule: "Chú ý các từ: 'an hour', 'a university', 'a European country', 'a useful tool'.",
    },
    commonMistakes: [
      {
        wrong: "I am software engineer.",
        correct: "I am a software engineer.",
        explanation: "Chỉ nghề nghiệp trong tiếng Anh bắt buộc phải có mạo từ 'a' hoặc 'an'.",
      },
      {
        wrong: "He created an user account.",
        correct: "He created a user account.",
        explanation: "'User' bắt đầu bằng âm phụ âm /j/ (y-sound), do đó dùng 'a user'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-art-1",
        type: "multiple_choice",
        promptEn: "She has been working as _____ UI designer for over _____ year.",
        options: ["a / a", "an / a", "a / an", "the / the"],
        correctAnswer: "a / a",
        explanation: "'UI' bắt đầu bằng âm /juː/ (dùng 'a'), 'year' bắt đầu bằng âm /j/ (dùng 'a').",
      },
      {
        id: "diag-art-2",
        type: "error_spotting",
        promptEn: "It takes about [an] [hour] [to] [deploy] [a] [new] [feature] [to] [the] [production].",
        promptVn: "Chọn mạo từ dùng thừa/sai trong câu:",
        options: ["an", "a", "the", "production"],
        correctAnswer: "the",
        correctSentence: "It takes about an hour to deploy a new feature to production.",
        errorWord: "the",
        errorExplanation: "Môi trường 'production' trong tech thường dùng 'in production' hoặc 'to production' không có mạo từ 'the'.",
        explanation: "Dùng 'to production' thay vì 'to the production'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-art-1",
        type: "multiple_choice",
        promptEn: "Could you send me _____ link to _____ API documentation you mentioned earlier?",
        options: ["the / the", "a / the", "the / a", "a / a"],
        correctAnswer: "the / the",
        explanation: "Cả link và tài liệu API đều đã được xác định cụ thể qua mệnh đề 'you mentioned earlier'.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LEVEL A2: SƠ CẤP (ELEMENTARY)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "a2-past-continuous",
    level: "A2",
    category: "Thì nâng cao (Tenses)",
    order: 6,
    title: "Past Continuous",
    titleVn: "Thì Quá Khứ Tiếp Diễn",
    tagline: "Hành động đang diễn ra tại một thời điểm quá khứ hoặc bị hành động khác xen vào",
    formula: {
      positive: "S + was/were + V-ing + (O)",
      negative: "S + was/were + not + V-ing + (O)",
      question: "Was/Were + S + V-ing + (O)?",
    },
    timeSignals: ["at 8 PM yesterday", "at that time", "when", "while", "as"],
    usagePoints: [
      {
        title: "Đang diễn ra tại một thời điểm cụ thể trong quá khứ",
        description: "Nhấn mạnh quá trình của hành động tại thời khắc quá khứ.",
        examples: [
          {
            sentenceEn: "At 10 PM last night, I was still writing the unit tests.",
            sentenceVn: "Lúc 10 giờ tối hôm qua, tôi vẫn đang viết các bài kiểm thử.",
          },
        ],
      },
      {
        title: "Hành động đang diễn ra thì có hành động khác xen vào (When / While)",
        description: "Hành động dài đang diễn ra dùng Quá khứ tiếp diễn; hành động ngắn xen vào dùng Quá khứ đơn.",
        examples: [
          {
            sentenceEn: "While we were running the benchmark, the electricity went out.",
            sentenceVn: "Trong lúc chúng tôi đang chạy benchmark thì mất điện.",
            contextNote: "Hành động đang diễn ra (were running) bị cắt ngang (went out)",
          },
        ],
      },
    ],
    contrast: {
      titleA: "When (Thường đi với Quá khứ đơn)",
      titleB: "While (Thường đi với Quá khứ tiếp diễn)",
      descriptionA: "Hành động ngắn xen vào, thời điểm cắt ngang.",
      descriptionB: "Hành động kéo dài, đang tiếp diễn.",
      exampleA: "I was debugging when my manager called me.",
      exampleB: "While I was debugging, my manager called me.",
      keyRule: "While + S + was/were + V-ing | When + S + V2/ed.",
    },
    commonMistakes: [
      {
        wrong: "While we discussed the architecture, the client called.",
        correct: "While we were discussing the architecture, the client called.",
        explanation: "Vế sau 'While' diễn tả hành động đang tiếp diễn nên chia quá khứ tiếp diễn 'were discussing'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-pastc-1",
        type: "conjugation",
        promptEn: "He _____ (test) the payment gateway when the server suddenly crashed.",
        promptVn: "Anh ấy đang kiểm thử cổng thanh toán thì máy chủ đột ngột bị sập.",
        correctAnswer: "was testing",
        hint: "Hành động kéo dài bị cắt ngang bởi 'crashed'.",
        explanation: "Chủ ngữ 'He' đi với 'was testing'.",
      },
      {
        id: "diag-pastc-2",
        type: "multiple_choice",
        promptEn: "What _____ at 9 AM yesterday when the incident occurred?",
        options: [
          "were you doing",
          "did you do",
          "are you doing",
          "have you done",
        ],
        correctAnswer: "were you doing",
        explanation: "Hỏi hành động đang diễn ra tại thời điểm cụ thể trong quá khứ 'at 9 AM yesterday'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-pastc-1",
        type: "sentence_transform",
        promptEn: "Combine using 'while': 'I read the documentation. The build finished.'",
        correctAnswer: [
          "While I was reading the documentation, the build finished.",
          "The build finished while I was reading the documentation.",
        ],
        explanation: "'While I was reading...' diễn tả hành động đang diễn ra.",
      },
    ],
  },

  {
    id: "a2-present-perfect-basic",
    level: "A2",
    category: "Thì nâng cao (Tenses)",
    order: 7,
    title: "Present Perfect (Basic)",
    titleVn: "Hiện Tại Hoàn Thành (Cơ Bản)",
    tagline: "Diễn tả trải nghiệm sống, hành động vừa mới xảy ra hoặc có kết quả ở hiện tại",
    formula: {
      positive: "S + have/has + V3/ed + (O)",
      negative: "S + have/has + not + V3/ed + (O)",
      question: "Have/Has + S + V3/ed + (O)?",
    },
    timeSignals: ["already", "just", "yet", "ever", "never", "recently", "so far"],
    usagePoints: [
      {
        title: "Trải nghiệm tới thời điểm hiện tại (Ever / Never)",
        description: "Nhấn mạnh kinh nghiệm, không quan tâm chính xác thời gian xảy ra.",
        examples: [
          {
            sentenceEn: "Have you ever contributed to an open-source project?",
            sentenceVn: "Bạn đã từng đóng góp vào dự án mã nguồn mở nào chưa?",
          },
        ],
      },
      {
        title: "Vừa mới xảy ra (Just / Already / Yet)",
        description: "Hành động hoàn tất cách đây ít phút hoặc kết quả vẫn còn ảnh hưởng tới hiện tại.",
        examples: [
          {
            sentenceEn: "I have just merged your pull request into main.",
            sentenceVn: "Tôi vừa mới gộp pull request của bạn vào nhánh main xong.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Already (Đã làm rồi)",
      titleB: "Yet (Chưa làm - dùng trong phủ định & câu hỏi)",
      descriptionA: "Dùng trong câu khẳng định, đứng giữa have/has và V3.",
      descriptionB: "Dùng ở cuối câu phủ định hoặc câu hỏi.",
      exampleA: "I have already resolved the conflict.",
      exampleB: "I haven't reviewed the PR yet. / Have you pushed the code yet?",
      keyRule: "'Yet' luôn đứng ở cuối câu phủ định hoặc nghi vấn.",
    },
    commonMistakes: [
      {
        wrong: "I have seen that movie yesterday.",
        correct: "I saw that movie yesterday.",
        explanation: "Có mốc thời gian quá khứ cụ thể ('yesterday') thì PHẢI dùng Quá khứ đơn, KHÔNG dùng Hiện tại hoàn thành.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-pp-1",
        type: "conjugation",
        promptEn: "We _____ (already / push) the hotfix to the staging environment.",
        correctAnswer: ["have already pushed", "has already pushed"],
        explanation: "Chủ ngữ 'We' dùng 'have already pushed'.",
      },
      {
        id: "diag-pp-2",
        type: "multiple_choice",
        promptEn: "Has the QA team approved the release candidate _____?",
        options: ["yet", "already", "just", "ago"],
        correctAnswer: "yet",
        explanation: "'Yet' dùng ở cuối câu hỏi hiện tại hoàn thành.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-pp-1",
        type: "sentence_transform",
        promptEn: "Write negative with 'yet': 'He has finished the documentation.'",
        correctAnswer: ["He hasn't finished the documentation yet.", "He has not finished the documentation yet."],
        explanation: "Dạng phủ định với 'yet': S + has not + V3 + yet.",
      },
    ],
  },

  {
    id: "a2-modals-basic",
    level: "A2",
    category: "Động từ khiếm khuyết (Modals)",
    order: 8,
    title: "Modal Verbs: Can, Could, Must, Should",
    titleVn: "Động Từ Khiếm Khuyết Cơ Bản",
    tagline: "Biểu đạt khả năng, lời khuyên, sự cho phép và tính bắt buộc",
    formula: {
      positive: "S + modal + V-bare",
      negative: "S + modal + not + V-bare",
      question: "Modal + S + V-bare?",
    },
    timeSignals: ["always followed by V-bare (không chia 's', không dùng 'to')"],
    usagePoints: [
      {
        title: "Can / Could: Khả năng & Lời yêu cầu lịch sự",
        description: "'Can' cho hiện tại, 'Could' cho quá khứ hoặc yêu cầu trang trọng.",
        examples: [
          {
            sentenceEn: "Could you please review my pull request when you have time?",
            sentenceVn: "Bạn có thể vui lòng xem qua PR của tôi khi bạn rảnh không?",
          },
        ],
      },
      {
        title: "Should: Lời khuyên & Đề xuất",
        description: "Nên làm gì đó vì nó tốt hoặc hợp lý.",
        examples: [
          {
            sentenceEn: "You should add automated tests before deploying to production.",
            sentenceVn: "Bạn nên bổ sung các bài kiểm thử tự động trước khi triển khai lên production.",
          },
        ],
      },
      {
        title: "Must vs Have to: Sự bắt buộc",
        description: "'Must' mang tính bắt buộc chủ quan hoặc quy định ngặt nghèo; 'Don't have to' mang nghĩa không cần thiết.",
        examples: [
          {
            sentenceEn: "You must never commit secret API keys to public repositories.",
            sentenceVn: "Bạn tuyệt đối không được commit API key bí mật lên repo công khai.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Mustn't (Cấm - tuyệt đối không được làm)",
      titleB: "Don't have to (Không cần thiết - làm cũng được, không làm cũng không sao)",
      descriptionA: "Prohibition: Vi phạm sẽ bị phạt hoặc gây hậu quả nghiêm trọng.",
      descriptionB: "No obligation: Bạn có quyền lựa chọn.",
      exampleA: "You mustn't share your root credentials.",
      exampleB: "You don't have to come to the office today; remote work is allowed.",
      keyRule: "Đừng nhầm lẫn 'mustn't' với 'don't have to'.",
    },
    commonMistakes: [
      {
        wrong: "He can to code in Rust.",
        correct: "He can code in Rust.",
        explanation: "Sau modal verb (can, could, should, must) là V-bare, KHÔNG có 'to'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-mod-1",
        type: "multiple_choice",
        promptEn: "Security policy: You _____ share your two-factor authentication codes with anyone.",
        options: ["mustn't", "don't have to", "should", "needn't"],
        correctAnswer: "mustn't",
        explanation: "Quy định cấm tuyệt đối về bảo mật dùng 'mustn't'.",
      },
      {
        id: "diag-mod-2",
        type: "error_spotting",
        promptEn: "We [should] [to] [write] [more] [unit] [tests] [this] [sprint].",
        promptVn: "Chọn từ bị thừa/sai:",
        options: ["should", "to", "write", "more"],
        correctAnswer: "to",
        correctSentence: "We should write more unit tests this sprint.",
        errorWord: "to",
        errorExplanation: "Sau 'should' là V-bare, không dùng giới từ 'to'.",
        explanation: "Bỏ 'to', chỉ dùng 'should write'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-mod-1",
        type: "multiple_choice",
        promptEn: "The meeting is optional. You _____ attend if you have urgent tasks.",
        options: ["don't have to", "mustn't", "can't", "shouldn't"],
        correctAnswer: "don't have to",
        explanation: "Họp tự chọn (optional) nghĩa là không bắt buộc: 'don't have to'.",
      },
    ],
  },

  {
    id: "a2-comparatives",
    level: "A2",
    category: "So sánh (Comparisons)",
    order: 9,
    title: "Comparatives & Superlatives",
    titleVn: "So Sánh Hơn & So Sánh Nhất",
    tagline: "So sánh hiệu năng, kích thước, chi phí và chất lượng bằng tính từ/trạng từ",
    formula: {
      positive: "Tính từ ngắn: adj-er + than / the + adj-est | Tính từ dài: more + adj + than / the most + adj",
      negative: "not as + adj + as",
      question: "Is X adj-er / more adj than Y?",
    },
    timeSignals: ["than", "the ... in/of", "as ... as"],
    usagePoints: [
      {
        title: "So sánh hơn (Comparatives)",
        description: "So sánh giữa 2 đối tượng.",
        examples: [
          {
            sentenceEn: "Redis is faster than traditional SQL databases for caching.",
            sentenceVn: "Redis nhanh hơn các cơ sở dữ liệu SQL truyền thống trong việc lưu cache.",
          },
        ],
      },
      {
        title: "So sánh nhất (Superlatives)",
        description: "So sánh 1 đối tượng với toàn bộ tập hợp (từ 3 đối tượng trở lên).",
        examples: [
          {
            sentenceEn: "Security is the most critical aspect of financial software.",
            sentenceVn: "Bảo mật là khía cạnh quan trọng nhất của phần mềm tài chính.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Irregular Adjectives (Bất quy tắc)",
      titleB: "Dạng so sánh tương ứng",
      descriptionA: "Các từ phổ biến có dạng so sánh biến đổi đặc biệt.",
      descriptionB: "good $\\rightarrow$ better $\\rightarrow$ best; bad $\\rightarrow$ worse $\\rightarrow$ worst; far $\\rightarrow$ farther/further.",
      exampleA: "This algorithm produces better results.",
      exampleB: "This is the worst outage we have had this year.",
      keyRule: "Tuyệt đối không dùng 'more better' hoặc 'most fastest' (tránh double comparatives).",
    },
    commonMistakes: [
      {
        wrong: "Postgres is more fast than MySQL.",
        correct: "Postgres is faster than MySQL.",
        explanation: "'Fast' là tính từ ngắn (1 âm tiết), so sánh hơn thêm đuôi -er thành 'faster'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-comp-1",
        type: "conjugation",
        promptEn: "Vite has a _____ (fast) cold start time than Webpack.",
        promptVn: "Vite có thời gian khởi động nguội nhanh hơn Webpack.",
        correctAnswer: "faster",
        explanation: "'Fast' thêm đuôi '-er' thành 'faster'.",
      },
      {
        id: "diag-comp-2",
        type: "multiple_choice",
        promptEn: "This is _____ bug I have ever encountered in my career.",
        options: ["the most complex", "more complex", "most complex", "complexest"],
        correctAnswer: "the most complex",
        explanation: "So sánh nhất với tính từ dài: 'the most complex'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-comp-1",
        type: "conjugation",
        promptEn: "The new architecture is significantly _____ (good) than the legacy monolith.",
        correctAnswer: "better",
        explanation: "Dạng so sánh hơn của 'good' là 'better'.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LEVEL B1: TRUNG CẤP (INTERMEDIATE)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "b1-pres-perf-vs-past-simple",
    level: "B1",
    category: "Thì nâng cao (Tenses)",
    order: 10,
    title: "Present Perfect vs Past Simple",
    titleVn: "Hiện Tại Hoàn Thành vs Quá Khứ Đơn",
    tagline: "Phân biệt rõ ràng giữa thời gian xác định đã đóng lại và kết quả còn liên hệ tới hiện tại",
    formula: {
      positive: "Past Simple: S + V2/ed (thời gian đã qua) | Present Perfect: S + have/has + V3 (thời gian mở)",
      negative: "didn't + V-bare vs haven't/hasn't + V3",
      question: "Did + S + V-bare? vs Have/Has + S + V3?",
    },
    timeSignals: ["Past: yesterday, in 2021, ago, last month", "Pres Perf: since, for, so far, recently, this week"],
    usagePoints: [
      {
        title: "Khoảng thời gian đã kết thúc vs Chưa kết thúc",
        description: "Nếu khoảng thời gian chứa hành động đã trôi qua (yesterday, last year) $\\rightarrow$ Quá khứ đơn. Nếu khoảng thời gian vẫn còn tiếp diễn (today, this year, so far) $\\rightarrow$ Hiện tại hoàn thành.",
        examples: [
          {
            sentenceEn: "I lived in Singapore for two years. (Now I live in Vietnam)",
            sentenceVn: "Tôi đã từng sống ở Singapore trong 2 năm. (Bây giờ không còn ở đó nữa)",
          },
          {
            sentenceEn: "I have lived in Singapore for two years. (I still live there now)",
            sentenceVn: "Tôi đã sống ở Singapore được 2 năm rồi. (Hiện tại vẫn đang sống ở đó)",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Past Simple (Quá khứ đơn)",
      titleB: "Present Perfect (Hiện tại hoàn thành)",
      descriptionA: "Hành động xảy ra ở thời điểm xác định trong quá khứ, không còn tiếp diễn.",
      descriptionB: "Hành động xảy ra ở thời điểm không xác định, hoặc kéo dài từ quá khứ đến hiện tại.",
      exampleA: "I lost my flash drive yesterday.",
      exampleB: "I have lost my flash drive! (I cannot find it right now)",
      keyRule: "Có từ chỉ mốc thời gian quá khứ rõ ràng (ago, yesterday, last...) $\\rightarrow$ 100% dùng Quá khứ đơn.",
    },
    commonMistakes: [
      {
        wrong: "I have graduated from university in 2020.",
        correct: "I graduated from university in 2020.",
        explanation: "Có năm cụ thể trong quá khứ ('in 2020') phải dùng Quá khứ đơn 'graduated'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-pvp-1",
        type: "multiple_choice",
        promptEn: "We _____ three microservices last quarter, and we _____ two more so far this quarter.",
        options: [
          "deployed / have deployed",
          "have deployed / deployed",
          "deployed / deployed",
          "have deployed / have deployed",
        ],
        correctAnswer: "deployed / have deployed",
        explanation: "'Last quarter' đã kết thúc dùng 'deployed'; 'so far this quarter' vẫn đang diễn ra dùng 'have deployed'.",
      },
      {
        id: "diag-pvp-2",
        type: "conjugation",
        promptEn: "The lead engineer _____ (work) at Google for five years before joining our startup in 2022.",
        promptVn: "Kỹ sư trưởng đã làm việc ở Google 5 năm trước khi gia nhập startup của chúng tôi vào năm 2022.",
        correctAnswer: ["worked", "had worked"],
        explanation: "Hành động làm việc ở Google đã kết thúc trong quá khứ (trước năm 2022), dùng quá khứ đơn 'worked' (hoặc quá khứ hoàn thành 'had worked').",
      },
    ],
    practiceExercises: [
      {
        id: "prac-pvp-1",
        type: "multiple_choice",
        promptEn: "_____ you ever _____ with Kubernetes in production?",
        options: [
          "Have / worked",
          "Did / work",
          "Were / working",
          "Do / work",
        ],
        correctAnswer: "Have / worked",
        explanation: "Hỏi về trải nghiệm cuộc đời tới thời điểm hiện tại: 'Have you ever worked...'",
      },
    ],
  },

  {
    id: "b1-conditionals-0-1",
    level: "B1",
    category: "Câu điều kiện (Conditionals)",
    order: 11,
    title: "Conditionals: Type 0 & Type 1",
    titleVn: "Câu Điều Kiện: Loại 0 & Loại 1",
    tagline: "Quy luật logic if-else: Sự thật hiển nhiên và khả năng có thật ở tương lai",
    formula: {
      positive: "Type 0: If + S + V(hiện tại đơn), S + V(hiện tại đơn) | Type 1: If + S + V(hiện tại đơn), S + will + V-bare",
      negative: "If S doesn't/don't V, S won't V",
      question: "What will happen if S + V(hiện tại)?",
    },
    timeSignals: ["if", "when", "unless (= if not)", "as soon as", "provided that"],
    usagePoints: [
      {
        title: "Loại 0: Chân lý khoa học & Quy luật hệ thống",
        description: "Bất cứ khi nào điều kiện A xảy ra thì kết quả B tất yếu sẽ xảy ra.",
        examples: [
          {
            sentenceEn: "If memory usage exceeds the limit, the operating system kills the process.",
            sentenceVn: "Nếu mức dùng bộ nhớ vượt quá giới hạn, hệ điều hành sẽ dừng tiến trình đó.",
          },
        ],
      },
      {
        title: "Loại 1: Tình huống có thể xảy ra trong tương lai",
        description: "Điều kiện có thể thành sự thật ở hiện tại hoặc tương lai dẫn đến kết quả tương ứng.",
        examples: [
          {
            sentenceEn: "If we finish the testing today, we will deploy the release tomorrow.",
            sentenceVn: "Nếu hôm nay chúng tôi kiểm thử xong, ngày mai chúng tôi sẽ triển khai bản phát hành.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Unless",
      titleB: "If ... not",
      descriptionA: "'Unless' mang nghĩa phủ định sẵn (= trừ khi).",
      descriptionB: "Không dùng phủ định kép trong mệnh đề 'unless'.",
      exampleA: "Unless you provide a valid token, the API will reject the request.",
      exampleB: "If you do not provide a valid token, the API will reject the request.",
      keyRule: "Trong mệnh đề IF, KHÔNG ĐƯỢC dùng 'will'. Ví dụ: 'If it will rain' là SAI, phải nói 'If it rains'.",
    },
    commonMistakes: [
      {
        wrong: "If it will rain tomorrow, we will cancel the outdoor demo.",
        correct: "If it rains tomorrow, we will cancel the outdoor demo.",
        explanation: "Mệnh đề 'If' chỉ điều kiện tương lai luôn dùng thì Hiện tại đơn, không dùng 'will'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-c01-1",
        type: "conjugation",
        promptEn: "If the authentication token _____ (expire), the client will automatically request a refresh.",
        promptVn: "Nếu mã token xác thực hết hạn, máy khách sẽ tự động yêu cầu làm mới.",
        correctAnswer: "expires",
        hint: "Mệnh đề If của câu điều kiện loại 1 chia thì hiện tại đơn.",
        explanation: "Chủ ngữ 'The token' số ít nên 'expire' chia thành 'expires'.",
      },
      {
        id: "diag-c01-2",
        type: "multiple_choice",
        promptEn: "We won't be able to ship the product on time _____ we hire two more frontend developers.",
        options: ["unless", "if", "provided that", "as long as"],
        correctAnswer: "unless",
        explanation: "'Unless' mang nghĩa 'trừ khi' (= if we don't hire).",
      },
    ],
    practiceExercises: [
      {
        id: "prac-c01-1",
        type: "sentence_transform",
        promptEn: "Rewrite using 'Unless': 'If you do not optimize the database queries, the site will be slow.'",
        correctAnswer: [
          "Unless you optimize the database queries, the site will be slow.",
          "The site will be slow unless you optimize the database queries.",
        ],
        explanation: "Thay thế 'If you do not optimize' bằng 'Unless you optimize'.",
      },
    ],
  },

  {
    id: "b1-passive-basic",
    level: "B1",
    category: "Thể bị động (Passive Voice)",
    order: 12,
    title: "Passive Voice (Foundational)",
    titleVn: "Câu Bị Động Căn Bản",
    tagline: "Nhấn mạnh hành động và đối tượng tiếp nhận thay vì người thực hiện - Phổ biến trong văn bản kỹ thuật",
    formula: {
      positive: "S + be (chia theo thì) + V3/ed + (by O)",
      negative: "S + be + not + V3/ed + (by O)",
      question: "Be + S + V3/ed?",
    },
    timeSignals: ["by the system", "automatically", "in production", "frequently used in technical docs"],
    usagePoints: [
      {
        title: "Khi người thực hiện không quan trọng hoặc đã rõ ràng",
        description: "Rất phổ biến trong tài liệu mô tả API, logs hệ thống, ticket Jira.",
        examples: [
          {
            sentenceEn: "All user passwords are encrypted using bcrypt before being stored.",
            sentenceVn: "Mọi mật khẩu của người dùng đều được mã hóa bằng bcrypt trước khi lưu trữ.",
          },
          {
            sentenceEn: "A new feature branch was created yesterday.",
            sentenceVn: "Một nhánh tính năng mới đã được tạo ngày hôm qua.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Active Voice (Chủ động)",
      titleB: "Passive Voice (Bị động)",
      descriptionA: "Nhấn mạnh ai là người làm hành động.",
      descriptionB: "Nhấn mạnh đối tượng nào được/bị tác động.",
      exampleA: "The background scheduler cleans up temporary files every night.",
      exampleB: "Temporary files are cleaned up every night by the background scheduler.",
      keyRule: "Động từ 'to be' phải được chia đúng theo thì của câu chủ động và đúng số ít/nhiều của tân ngữ đưa lên làm chủ ngữ mới.",
    },
    commonMistakes: [
      {
        wrong: "The bug was fixed the senior developer.",
        correct: "The bug was fixed by the senior developer.",
        explanation: "Khi muốn nêu rõ tác nhân gây ra hành động trong câu bị động, bắt buộc dùng giới từ 'by'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-pas-1",
        type: "conjugation",
        promptEn: "Millions of HTTP requests _____ (handle) by our load balancer every single minute.",
        promptVn: "Hàng triệu yêu cầu HTTP được bộ cân bằng tải xử lý mỗi phút.",
        correctAnswer: "are handled",
        hint: "Thì hiện tại đơn bị động, chủ ngữ số nhiều.",
        explanation: "Chủ ngữ số nhiều 'requests' ở hiện tại đơn dùng 'are handled'.",
      },
      {
        id: "diag-pas-2",
        type: "sentence_transform",
        promptEn: "Change to Passive: 'The engineer discovered a critical vulnerability yesterday.'",
        correctAnswer: [
          "A critical vulnerability was discovered yesterday by the engineer.",
          "A critical vulnerability was discovered by the engineer yesterday.",
          "Yesterday a critical vulnerability was discovered by the engineer.",
          "A critical vulnerability was discovered yesterday.",
        ],
        explanation: "Tân ngữ 'A critical vulnerability' làm chủ ngữ + was discovered.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-pas-1",
        type: "multiple_choice",
        promptEn: "The data _____ transmitted across the network without encryption.",
        options: ["should not be", "should not", "should be not", "should not being"],
        correctAnswer: "should not be",
        explanation: "Bị động với modal verb: Modal + not + be + V3.",
      },
    ],
  },

  {
    id: "b1-relative-clauses",
    level: "B1",
    category: "Mệnh đề (Clauses)",
    order: 13,
    title: "Defining Relative Clauses",
    titleVn: "Mệnh Đề Quan Hệ Xác Định",
    tagline: "Nối hai câu ngắn thành một câu mạch lạc, làm rõ danh từ đứng trước bằng Who, Which, That, Whose",
    formula: {
      positive: "N (người) + who/that + V | N (vật) + which/that + V | N + whose + N",
      negative: "N/A",
      question: "N/A",
    },
    timeSignals: ["who (cho người)", "which (cho vật)", "that (cho cả người và vật)", "whose (sở hữu)"],
    usagePoints: [
      {
        title: "Bổ nghĩa thiết yếu cho danh từ",
        description: "Nếu bỏ mệnh đề này đi, câu sẽ không trọn vẹn ý nghĩa.",
        examples: [
          {
            sentenceEn: "The developer who wrote this module no longer works here.",
            sentenceVn: "Lập trình viên người mà đã viết module này không còn làm việc ở đây nữa.",
          },
          {
            sentenceEn: "We need an algorithm that can process data in real time.",
            sentenceVn: "Chúng ta cần một thuật toán có thể xử lý dữ liệu theo thời gian thực.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Who (Thay thế cho người)",
      titleB: "Which (Thay thế cho vật/sự việc)",
      descriptionA: "Chỉ người (the developer, the manager, the client).",
      descriptionB: "Chỉ đồ vật, khái niệm, công nghệ (the tool, the language, the database).",
      exampleA: "The engineer who solved the bug received a bonus.",
      exampleB: "The framework which we selected is open source.",
      keyRule: "Trong mệnh đề quan hệ xác định (không có dấu phẩy), 'that' có thể thay thế cho cả 'who' và 'which'.",
    },
    commonMistakes: [
      {
        wrong: "The laptop who I bought yesterday is very fast.",
        correct: "The laptop which I bought yesterday is very fast.",
        explanation: "'Laptop' là đồ vật, không dùng đại từ quan hệ 'who'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-rel-1",
        type: "multiple_choice",
        promptEn: "We are looking for a candidate _____ has deep expertise in distributed systems.",
        options: ["who", "which", "whose", "whom"],
        correctAnswer: "who",
        explanation: "'A candidate' là danh từ chỉ người làm chủ ngữ, dùng 'who'.",
      },
      {
        id: "diag-rel-2",
        type: "multiple_choice",
        promptEn: "This is the library _____ repository was archived last month.",
        options: ["whose", "which", "who", "where"],
        correctAnswer: "whose",
        explanation: "Chỉ quan hệ sở hữu (repository của library đó), dùng 'whose repository'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-rel-1",
        type: "sentence_transform",
        promptEn: "Combine into one sentence: 'I work with a framework. It simplifies state management.'",
        correctAnswer: [
          "I work with a framework that simplifies state management.",
          "I work with a framework which simplifies state management.",
        ],
        explanation: "Dùng 'that' hoặc 'which' để nối hai câu.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LEVEL B2: TRUNG CẤP NÂNG CAO (UPPER-INTERMEDIATE)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "b2-conditionals-2-3",
    level: "B2",
    category: "Câu điều kiện (Conditionals)",
    order: 14,
    title: "Conditionals: Type 2 & Type 3",
    titleVn: "Câu Điều Kiện: Loại 2 & Loại 3",
    tagline: "Giả định trái thực tế ở hiện tại và tiếc nuối những điều đã không xảy ra trong quá khứ",
    formula: {
      positive: "Type 2: If + S + V2/were, S + would + V-bare | Type 3: If + S + had + V3, S + would have + V3",
      negative: "If S hadn't V3, S wouldn't have V3",
      question: "What would you do if...?",
    },
    timeSignals: ["unreal present (Type 2)", "past regret (Type 3)"],
    usagePoints: [
      {
        title: "Loại 2: Giả định trái với hiện tại hoặc tương lai không có thật",
        description: "Ước muốn điều gì đó khác đi ngay lúc này.",
        examples: [
          {
            sentenceEn: "If I were the tech lead, I would adopt Rust for all new microservices.",
            sentenceVn: "Nếu tôi là trưởng nhóm kỹ thuật, tôi sẽ áp dụng Rust cho mọi microservice mới.",
          },
        ],
      },
      {
        title: "Loại 3: Tiếc nuối về một hành động trong quá khứ",
        description: "Quá khứ đã xảy ra một đằng, giả định nếu xảy ra một nẻo.",
        examples: [
          {
            sentenceEn: "If we had written thorough end-to-end tests, the regression would not have reached production.",
            sentenceVn: "Nếu chúng ta đã viết bài kiểm thử E2E kỹ càng, lỗi hồi quy đã không lọt lên production.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Type 2 (Trái hiện tại)",
      titleB: "Type 3 (Trái quá khứ)",
      descriptionA: "Dùng thì quá khứ đơn (to be luôn là 'were') + would + V.",
      descriptionB: "Dùng thì quá khứ hoàn thành (had + V3) + would have + V3.",
      exampleA: "If I had more time today, I would refactor this component.",
      exampleB: "If I had had more time yesterday, I would have refactored this component.",
      keyRule: "Trong Type 2 văn phong chuẩn mực, 'were' dùng cho tất cả các ngôi (If I were you...).",
    },
    commonMistakes: [
      {
        wrong: "If we would have tested earlier, we would have found the bug.",
        correct: "If we had tested earlier, we would have found the bug.",
        explanation: "Trong mệnh đề 'If' của câu điều kiện loại 3, KHÔNG dùng 'would have', phải dùng 'had + V3'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-c23-1",
        type: "conjugation",
        promptEn: "If the QA engineer _____ (catch) the bug during sprint testing, we wouldn't have suffered two hours of downtime.",
        promptVn: "Nếu kỹ sư QA phát hiện ra bug trong lúc test sprint, chúng ta đã không chịu 2 giờ sập hệ thống.",
        correctAnswer: "had caught",
        hint: "Câu điều kiện loại 3 diễn tả tiếc nuối quá khứ.",
        explanation: "Mệnh đề If loại 3 dùng quá khứ hoàn thành: 'had caught'.",
      },
      {
        id: "diag-c23-2",
        type: "multiple_choice",
        promptEn: "If you _____ offer me a 30% salary increase, I still wouldn't leave this innovative team.",
        options: ["were to", "will", "have to", "would"],
        correctAnswer: "were to",
        explanation: "'Were to' dùng trong câu điều kiện loại 2 để nhấn mạnh tính giả định ít khả thi.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-c23-1",
        type: "sentence_transform",
        promptEn: "Write Type 2 conditional: 'I don't have root access, so I cannot restart the service.'",
        correctAnswer: [
          "If I had root access, I could restart the service.",
          "If I had root access, I would be able to restart the service.",
          "I could restart the service if I had root access.",
        ],
        explanation: "Giả định trái hiện tại: If I had root access...",
      },
    ],
  },

  {
    id: "b2-gerund-vs-infinitive",
    level: "B2",
    category: "Cấu trúc động từ (Verb Patterns)",
    order: 15,
    title: "Gerund vs Infinitive",
    titleVn: "Danh Động Từ vs Động Từ Nguyên Mẫu",
    tagline: "Quy tắc quyết định dùng V-ing hay To-V sau các động từ như suggest, avoid, stop, remember",
    formula: {
      positive: "Verb + V-ing | Verb + to-V | Verb + O + to-V",
      negative: "Verb + not V-ing | Verb + not to-V",
      question: "N/A",
    },
    timeSignals: ["preposition always followed by V-ing (interested in doing, good at coding)"],
    usagePoints: [
      {
        title: "Các động từ chỉ đi với Gerund (V-ing)",
        description: "avoid, consider, delay, deny, enjoy, finish, postpone, recommend, risk, suggest.",
        examples: [
          {
            sentenceEn: "I strongly recommend refactoring this legacy function.",
            sentenceVn: "Tôi tha thiết đề xuất việc tái cấu trúc hàm cũ này.",
          },
        ],
      },
      {
        title: "Các động từ chỉ đi với Infinitive (To-V)",
        description: "agree, decide, demand, expect, hope, manage, plan, promise, refuse, tend.",
        examples: [
          {
            sentenceEn: "We managed to reduce our AWS cloud costs by 40%.",
            sentenceVn: "Chúng tôi đã xoay sở giảm được 40% chi phí đám mây AWS.",
          },
        ],
      },
      {
        title: "Các động từ đổi nghĩa tùy theo V-ing hay To-V",
        description: "remember, forget, stop, try, regret.",
        examples: [
          {
            sentenceEn: "Stop running the script! (Dừng hẳn hành động đang làm)",
            sentenceVn: "Hãy dừng việc chạy đoạn script lại ngay!",
          },
          {
            sentenceEn: "He stopped to check the server logs. (Dừng lại để bắt đầu việc khác)",
            sentenceVn: "Anh ấy dừng lại để kiểm tra nhật ký máy chủ.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Remember to do",
      titleB: "Remember doing",
      descriptionA: "Nhớ phải làm một nhiệm vụ (hướng tới tương lai).",
      descriptionB: "Nhớ lại một ký ức hoặc sự việc đã từng làm trong quá khứ.",
      exampleA: "Please remember to revoke the temporary API key.",
      exampleB: "I remember revoking that API key yesterday.",
      keyRule: "Sau mọi giới từ (in, on, at, about, without, before, after) luôn dùng V-ing.",
    },
    commonMistakes: [
      {
        wrong: "He suggested to upgrade the database.",
        correct: "He suggested upgrading the database.",
        explanation: "Động từ 'suggest' bắt buộc đi với V-ing (hoặc 'suggest that S should V').",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-gvi-1",
        type: "multiple_choice",
        promptEn: "We must avoid _____ breaking changes to the public API.",
        options: ["introducing", "to introduce", "introduce", "having introduced"],
        correctAnswer: "introducing",
        explanation: "'Avoid' luôn đi kèm với V-ing (Gerund).",
      },
      {
        id: "diag-gvi-2",
        type: "conjugation",
        promptEn: "Don't forget _____ (sanitize) all user input before saving it to the database.",
        promptVn: "Đừng quên khử độc mọi dữ liệu người dùng trước khi lưu vào database.",
        correctAnswer: "to sanitize",
        hint: "Nhớ phải thực hiện một nhiệm vụ trong tương lai.",
        explanation: "'Forget to do something' nghĩa là quên không làm một bổn phận.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-gvi-1",
        type: "multiple_choice",
        promptEn: "She is capable of _____ complex concurrency problems with ease.",
        options: ["solving", "to solve", "solve", "solved"],
        correctAnswer: "solving",
        explanation: "Sau giới từ 'of' luôn dùng V-ing: 'capable of solving'.",
      },
    ],
  },

  {
    id: "b2-reduced-relative-clauses",
    level: "B2",
    category: "Mệnh đề (Clauses)",
    order: 16,
    title: "Reduced Relative Clauses",
    titleVn: "Mệnh Đề Quan Hệ Rút Gọn",
    tagline: "Rút gọn mệnh đề quan hệ bằng V-ing (chủ động) hoặc V3/ed (bị động) giúp câu văn ngắn gọn, súc tích",
    formula: {
      positive: "Chủ động: N + V-ing | Bị động: N + V3/ed | Tính từ/Cụm giới từ: N + adj phrase",
      negative: "N/A",
      question: "N/A",
    },
    timeSignals: ["Used heavily in technical documentation & academic papers"],
    usagePoints: [
      {
        title: "Rút gọn thể chủ động (Dùng V-ing)",
        description: "Bỏ đại từ quan hệ và to be, biến động từ chính thành V-ing.",
        examples: [
          {
            sentenceEn: "The service handling incoming webhooks crashed unexpectedly.",
            sentenceVn: "Dịch vụ xử lý các webhook gửi đến đã bị sập đột ngột.",
            contextNote: "= The service which handles incoming webhooks...",
          },
        ],
      },
      {
        title: "Rút gọn thể bị động (Dùng V3/ed)",
        description: "Bỏ đại từ quan hệ và to be, giữ lại phân từ hai V3.",
        examples: [
          {
            sentenceEn: "Any pull request merged into main triggers an automated deployment.",
            sentenceVn: "Bất kỳ pull request nào được gộp vào main đều kích hoạt luồng triển khai tự động.",
            contextNote: "= Any pull request that is merged into main...",
          },
        ],
      },
    ],
    contrast: {
      titleA: "V-ing (Active Participle)",
      titleB: "V3/ed (Passive Participle)",
      descriptionA: "Danh từ đứng trước tự thực hiện hành động đó.",
      descriptionB: "Danh từ đứng trước chịu sự tác động của hành động.",
      exampleA: "Packages containing vulnerabilities must be updated.",
      exampleB: "Packages created by the build system are stored in S3.",
      keyRule: "Chỉ rút gọn được khi đại từ quan hệ đóng vai trò làm CHỦ NGỮ trong mệnh đề phụ.",
    },
    commonMistakes: [
      {
        wrong: "The data processing by the worker thread is confidential.",
        correct: "The data processed by the worker thread is confidential.",
        explanation: "Dữ liệu được xử lý bởi worker thread (thể bị động) nên phải dùng 'processed'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-rrc-1",
        type: "multiple_choice",
        promptEn: "Queries _____ more than two seconds are logged into the slow-query file.",
        options: ["taking", "taken", "which taking", "took"],
        correctAnswer: "taking",
        explanation: "Chủ động: Queries (which take) $\\rightarrow$ Queries taking.",
      },
      {
        id: "diag-rrc-2",
        type: "conjugation",
        promptEn: "Tokens _____ (generate) by this authentication service expire in 24 hours.",
        promptVn: "Các mã token được tạo ra bởi dịch vụ xác thực này sẽ hết hạn sau 24 giờ.",
        correctAnswer: "generated",
        hint: "Rút gọn mệnh đề quan hệ ở thể bị động (which are generated).",
        explanation: "Rút gọn thể bị động dùng phân từ hai: 'generated'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-rrc-1",
        type: "sentence_transform",
        promptEn: "Reduce: 'We noticed several workers that were consuming excessive CPU.'",
        correctAnswer: "We noticed several workers consuming excessive CPU.",
        explanation: "Rút gọn bằng cách bỏ 'that were' và giữ 'consuming'.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LEVEL C1: CAO CẤP (ADVANCED)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "c1-inversion",
    level: "C1",
    category: "Cấu trúc nâng cao (Advanced Structures)",
    order: 17,
    title: "Inversion for Emphasis",
    titleVn: "Đảo Ngữ Để Nhấn Mạnh",
    tagline: "Đảo trợ động từ lên trước chủ ngữ khi đứng đầu bằng từ mang nghĩa phủ định hoặc giới hạn",
    formula: {
      positive: "Negative Adverbial + Auxiliary Verb + Subject + Main Verb",
      negative: "Never / Rarely / Seldom / Under no circumstances + aux + S + V",
      question: "N/A",
    },
    timeSignals: ["Never before", "Rarely", "Seldom", "Hardly ... when", "Only when", "Under no circumstances", "Not only ... but also"],
    usagePoints: [
      {
        title: "Đảo ngữ với trạng từ tần suất phủ định",
        description: "Tạo cảm giác trang trọng, nhấn mạnh tính hiếm có hoặc mức độ nghiêm trọng.",
        examples: [
          {
            sentenceEn: "Rarely have I seen such an elegant algorithmic implementation.",
            sentenceVn: "Hiếm khi nào tôi được chứng kiến một cách triển khai thuật toán tinh tế đến vậy.",
          },
        ],
      },
      {
        title: "Under no circumstances: Tuyệt đối không bao giờ",
        description: "Nhấn mạnh nguyên tắc bất di bất dịch.",
        examples: [
          {
            sentenceEn: "Under no circumstances should production credentials be logged in plain text.",
            sentenceVn: "Trong bất kỳ hoàn cảnh nào cũng tuyệt đối không được ghi thông tin xác thực production ra dạng văn bản thô.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "Standard Word Order (Trật tự chuẩn)",
      titleB: "Inverted Word Order (Trật tự đảo ngữ)",
      descriptionA: "Subject + Verb + Object (Giao tiếp thông thường).",
      descriptionB: "Negative Marker + Trợ động từ + Subject + Verb (Văn phong cao cấp, diễn thuyết, tài liệu trang trọng).",
      exampleA: "We have seldom encountered such a critical deadlock.",
      exampleB: "Seldom have we encountered such a critical deadlock.",
      keyRule: "Cấu trúc câu sau từ đảo ngữ giống hệt cấu trúc của một câu hỏi nghi vấn (Trợ động từ + S + V).",
    },
    commonMistakes: [
      {
        wrong: "Never I have seen such a severe data breach.",
        correct: "Never have I seen such a severe data breach.",
        explanation: "Khi 'Never' đứng đầu câu mang nghĩa nhấn mạnh, phải đảo trợ động từ 'have' lên trước chủ ngữ 'I'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-inv-1",
        type: "multiple_choice",
        promptEn: "Only after running comprehensive stress tests _____ deploy the update.",
        options: ["did we", "we did", "we have", "have we to"],
        correctAnswer: "did we",
        explanation: "'Only after...' đứng đầu câu đòi hỏi đảo trợ động từ 'did we deploy'.",
      },
      {
        id: "diag-inv-2",
        type: "sentence_transform",
        promptEn: "Rewrite starting with 'Never before': 'We have never before experienced such traffic volume.'",
        correctAnswer: "Never before have we experienced such traffic volume.",
        explanation: "Đảo trợ động từ 'have' lên trước chủ ngữ 'we'.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-inv-1",
        type: "multiple_choice",
        promptEn: "Hardly _____ the server restarted when new requests flooded in.",
        options: ["had", "has", "did", "was"],
        correctAnswer: "had",
        explanation: "Cấu trúc: Hardly had + S + V3 when...",
      },
    ],
  },

  {
    id: "c1-cleft-sentences",
    level: "C1",
    category: "Cấu trúc nâng cao (Advanced Structures)",
    order: 18,
    title: "Cleft Sentences (It is ... that)",
    titleVn: "Câu Chẻ Nhấn Mạnh",
    tagline: "Nhấn mạnh chính xác vào đối tượng, lý do hoặc thời điểm gây ra vấn đề bằng 'It is/was ... that'",
    formula: {
      positive: "It is/was + [Thành phần nhấn mạnh] + that/who + [Mệnh đề còn lại]",
      negative: "It wasn't until + [Mốc thời gian] + that + S + V",
      question: "Was it X that caused Y?",
    },
    timeSignals: ["It was ... that", "It is ... that", "It wasn't until ... that", "What ... is/was"],
    usagePoints: [
      {
        title: "Nhấn mạnh chủ ngữ hoặc nguyên nhân cốt lõi",
        description: "Tách một câu đơn thành hai mệnh đề để làm nổi bật tâm điểm thông tin.",
        examples: [
          {
            sentenceEn: "It was a missing environment variable that caused the container to exit.",
            sentenceVn: "Chính biến môi trường bị thiếu là nguyên nhân khiến container bị tắt.",
          },
        ],
      },
      {
        title: "Wh- Clefts (What we need is...)",
        description: "Nhấn mạnh mục tiêu hoặc hành động cần thiết.",
        examples: [
          {
            sentenceEn: "What we really need right now is a comprehensive disaster recovery plan.",
            sentenceVn: "Điều mà chúng ta thực sự cần ngay lúc này là một kế hoạch khắc phục thảm họa toàn diện.",
          },
        ],
      },
    ],
    contrast: {
      titleA: "It-Cleft (Nhấn mạnh đối tượng)",
      titleB: "Wh-Cleft (Nhấn mạnh nội dung/hành động)",
      descriptionA: "It is/was X that did Y.",
      descriptionB: "What X does/is is Y.",
      exampleA: "It was John who discovered the race condition.",
      exampleB: "What John discovered was a race condition in the cache.",
      keyRule: "Dùng để loại bỏ sự mơ hồ và khẳng định chắc chắn nguyên nhân.",
    },
    commonMistakes: [
      {
        wrong: "It was because of a syntax error which the build failed.",
        correct: "It was because of a syntax error that the build failed.",
        explanation: "Trong câu chẻ 'It is/was ... that', từ nối chuẩn xác nhất luôn là 'that', không dùng 'which'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "diag-cle-1",
        type: "multiple_choice",
        promptEn: "It was the corrupted cache file _____ caused the unexpected crash.",
        options: ["that", "which", "what", "where"],
        correctAnswer: "that",
        explanation: "Câu chẻ nhấn mạnh: 'It was X that...'",
      },
      {
        id: "diag-cle-2",
        type: "sentence_transform",
        promptEn: "Rewrite to emphasize 'the database migration': 'The database migration caused the performance bottleneck.'",
        correctAnswer: [
          "It was the database migration that caused the performance bottleneck.",
          "It was the database migration which caused the performance bottleneck.",
        ],
        explanation: "Dùng cấu trúc câu chẻ It was ... that để nhấn mạnh.",
      },
    ],
    practiceExercises: [
      {
        id: "prac-cle-1",
        type: "multiple_choice",
        promptEn: "_____ we need most at this moment is solid test coverage.",
        options: ["What", "That", "Which", "It is"],
        correctAnswer: "What",
        explanation: "Wh-cleft sentence: 'What we need most... is...'",
      },
    ],
  },
];

export function getLessonsByLevel(level?: string): GrammarLesson[] {
  if (!level || level === "all") return GRAMMAR_LESSONS;
  return GRAMMAR_LESSONS.filter((l) => l.level === level);
}

export function getLessonById(id: string): GrammarLesson | undefined {
  return GRAMMAR_LESSONS.find((l) => l.id === id);
}
