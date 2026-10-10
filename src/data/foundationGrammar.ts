import type { GrammarLesson } from "@/types/grammar";

/**
 * Foundation lessons (A0/A1) for absolute/false beginners ("mất gốc").
 * Studied before the regular A1 lessons; each one names the Vietnamese habit that causes the mistake.
 */
export const FOUNDATION_LESSONS: GrammarLesson[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // 0.1 — TO BE (am / is / are)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "found-to-be",
    level: "A1",
    category: "Nền tảng (Foundation)",
    order: 0.1,
    foundation: true,
    title: "The Verb 'to be' (am / is / are)",
    titleVn: "Động từ 'to be': am / is / are",
    tagline: "Từ nhỏ nhưng bắt buộc: nói ai/cái gì thế nào, là gì, đang ở đâu",
    formula: {
      positive: "S + am / is / are + tính từ / danh từ / nơi chốn",
      negative: "S + am / is / are + not + ...",
      question: "Am / Is / Are + S + ...?",
    },
    timeSignals: ["I → am", "he / she / it → is", "you / we / they → are", "danh từ số nhiều → are"],
    usagePoints: [
      {
        title: "am / is / are + tính từ, danh từ hoặc nơi chốn",
        description:
          "Chủ ngữ (người/vật được nói đến trong câu) cần 'be' đứng ngay sau để nối với tính từ (từ chỉ tính chất: busy, ready, new), danh từ (nghề nghiệp, sự vật) hoặc nơi chốn. Chọn dạng theo chủ ngữ: I → am; he/she/it → is; you/we/they → are.",
        examples: [
          {
            sentenceEn: "I am busy today.",
            sentenceVn: "Hôm nay tôi bận.",
            contextNote: "be + tính từ",
            breakdown: [
              { text: "I", role: "subject", label: "Chủ ngữ" },
              { text: "am", role: "verb", label: "Động từ to be (I → am)" },
              { text: "busy", role: "complement", label: "Tính từ (bận)" },
              { text: "today", role: "modifier", label: "Thời gian" },
            ],
          },
          {
            sentenceEn: "She is a tester.",
            sentenceVn: "Cô ấy là tester (người kiểm thử phần mềm).",
            contextNote: "be + danh từ chỉ nghề nghiệp",
            breakdown: [
              { text: "She", role: "subject", label: "Chủ ngữ (ngôi 3 số ít)" },
              { text: "is", role: "verb", label: "Động từ to be (she → is)" },
              { text: "a tester", role: "complement", label: "Danh từ (nghề nghiệp)" },
            ],
          },
        ],
      },
      {
        title: "Phủ định với 'not' & câu hỏi Yes/No",
        description:
          "Phủ định: thêm 'not' ngay SAU am/is/are (is not = isn't, are not = aren't, I am not = I'm not). Câu hỏi Yes/No: đưa am/is/are lên ĐẦU câu, trước chủ ngữ. Trả lời ngắn: Yes, it is. / No, it isn't.",
        examples: [
          {
            sentenceEn: "The server is not ready.",
            sentenceVn: "Máy chủ chưa sẵn sàng.",
            contextNote: "Câu phủ định",
            breakdown: [
              { text: "The server", role: "subject", label: "Chủ ngữ (số ít)" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "not", role: "modifier", label: "Phủ định (is not = isn't)" },
              { text: "ready", role: "complement", label: "Tính từ (sẵn sàng)" },
            ],
          },
          {
            sentenceEn: "Are you free now?",
            sentenceVn: "Bây giờ bạn có rảnh không?",
            contextNote: "Câu hỏi Yes/No — trả lời: Yes, I am. / No, I'm not.",
            breakdown: [
              { text: "Are", role: "verb", label: "To be đưa lên đầu câu" },
              { text: "you", role: "subject", label: "Chủ ngữ" },
              { text: "free", role: "complement", label: "Tính từ (rảnh)" },
              { text: "now", role: "modifier", label: "Thời gian" },
            ],
          },
        ],
      },
    ],
    vnContrast: {
      title: "Tiếng Việt không cần 'là' trước tính từ — tiếng Anh luôn cần 'be'",
      points: [
        {
          vn: "Tôi bận.",
          en: "I am busy.",
          note: "Tiếng Việt nói thẳng 'Tôi bận'. Tiếng Anh bắt buộc có 'am' giữa chủ ngữ và tính từ, không nói 'I busy'.",
        },
        {
          vn: "Ứng dụng chậm quá.",
          en: "The app is very slow.",
          note: "Câu tiếng Việt không có chữ 'là' nào, nhưng câu tiếng Anh vẫn phải có 'is'.",
        },
        {
          vn: "Họ đang ở văn phòng.",
          en: "They are at the office.",
          note: "Nói ai đang 'ở' đâu cũng dùng 'be' (are) + nơi chốn. Không cần thêm động từ nào khác.",
        },
      ],
    },
    commonMistakes: [
      {
        wrong: "I busy today.",
        correct: "I am busy today.",
        explanation: "Thiếu 'be'. Trước tính từ (busy, ready, new...) luôn cần am/is/are.",
      },
      {
        wrong: "He are a developer.",
        correct: "He is a developer.",
        explanation: "He/She/It đi với 'is'. 'Are' chỉ dùng cho you/we/they và danh từ số nhiều.",
      },
      {
        wrong: "Do you ready?",
        correct: "Are you ready?",
        explanation: "'ready' là tính từ nên câu hỏi dùng 'Are'. 'Do' chỉ đi với động từ thường như work, fix, check.",
      },
    ],
    diagnosticExercises: [
      {
        id: "fd-be-1",
        type: "conjugation",
        promptEn: "My manager _____ (be) busy today.",
        promptVn: "Hôm nay quản lý của tôi bận.",
        hint: "'My manager' là một người, giống he/she.",
        correctAnswer: "is",
        explanation: "'My manager' là ngôi thứ 3 số ít (giống he/she) nên dùng 'is'.",
      },
      {
        id: "fd-be-2",
        type: "multiple_choice",
        promptEn: "_____ you ready for the meeting?",
        promptVn: "Bạn đã sẵn sàng cho cuộc họp chưa?",
        hint: "'ready' là tính từ, chủ ngữ là 'you'.",
        options: ["Are", "Is", "Do", "Am"],
        correctAnswer: "Are",
        explanation: "Câu hỏi với tính từ: đưa 'be' lên đầu câu. 'You' luôn đi với 'are'; 'Do' không đứng trước tính từ.",
      },
      {
        id: "fd-be-3",
        type: "error_spotting",
        promptEn: "We [is] [in] [the] [meeting] [now].",
        promptVn: "Bây giờ chúng tôi đang ở trong cuộc họp.",
        hint: "Nhìn kỹ chủ ngữ 'We'.",
        options: ["is", "in", "the", "meeting", "now"],
        correctAnswer: "is",
        correctSentence: "We are in the meeting now.",
        errorWord: "is",
        errorExplanation: "'We' (chúng tôi) là số nhiều nên phải dùng 'are', không dùng 'is'.",
        explanation: "We/You/They luôn đi với 'are': We are in the meeting now.",
      },
    ],
    practiceExercises: [
      {
        id: "fp-be-1",
        type: "sentence_transform",
        promptEn: "Make it negative: 'The app is ready.'",
        promptVn: "Viết câu phủ định: 'Ứng dụng chưa sẵn sàng.'",
        hint: "Thêm 'not' ngay sau 'is'.",
        correctAnswer: "The app is not ready.",
        explanation: "Phủ định của 'be': thêm 'not' ngay sau 'is'. Viết tắt 'isn't' cũng đúng.",
      },
      {
        id: "fp-be-2",
        type: "multiple_choice",
        promptEn: "The new laptops _____ very fast.",
        promptVn: "Những chiếc laptop mới rất nhanh.",
        hint: "'laptops' có đuôi -s: nhiều chiếc.",
        options: ["are", "is", "am", "be"],
        correctAnswer: "are",
        explanation: "'The new laptops' là danh từ số nhiều (giống 'they') nên dùng 'are'.",
      },
      {
        id: "fp-be-3",
        type: "sentence_transform",
        promptEn: "Make it a question: 'They are at the office.'",
        promptVn: "Viết thành câu hỏi: 'Họ có đang ở văn phòng không?'",
        hint: "Đưa 'are' lên đầu câu.",
        correctAnswer: "Are they at the office?",
        explanation: "Câu hỏi Yes/No với 'be': đảo 'are' lên trước chủ ngữ 'they'.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 0.2 — PRONOUNS & POSSESSIVES
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "found-pronouns",
    level: "A1",
    category: "Nền tảng (Foundation)",
    order: 0.2,
    foundation: true,
    title: "Personal Pronouns & Possessive Adjectives",
    titleVn: "Đại từ nhân xưng & tính từ sở hữu",
    tagline: "I hay me, my hay mine: gọi đúng người và nói đúng 'của ai'",
    formula: {
      positive: "I / you / he / she / it / we / they + V + me / you / him / her / it / us / them",
      negative: "S + is / are + not + my / your / his / her / its / our / their + danh từ",
      question: "Is this + your / his / her / their + danh từ?",
    },
    timeSignals: [
      "I → my → me",
      "you → your → you",
      "he → his → him",
      "she → her → her",
      "it → its → it",
      "we → our → us",
      "they → their → them",
    ],
    usagePoints: [
      {
        title: "Chủ ngữ hay tân ngữ: I hay me?",
        description:
          "Đứng TRƯỚC động từ (làm chủ ngữ) dùng I, he, she, we, they. Đứng SAU động từ hoặc sau giới từ như to, for, with (làm tân ngữ — người/vật nhận hành động) dùng me, him, her, us, them.",
        examples: [
          {
            sentenceEn: "He helps me every day.",
            sentenceVn: "Anh ấy giúp tôi mỗi ngày.",
            contextNote: "'tôi' sau động từ → me",
            breakdown: [
              { text: "He", role: "subject", label: "Chủ ngữ (anh ấy)" },
              { text: "helps", role: "verb", label: "Động từ (giúp)" },
              { text: "me", role: "object", label: "Tân ngữ (tôi)" },
              { text: "every day", role: "modifier", label: "Thời gian" },
            ],
          },
          {
            sentenceEn: "I work with them.",
            sentenceVn: "Tôi làm việc với họ.",
            contextNote: "'họ' sau giới từ 'with' → them",
            breakdown: [
              { text: "I", role: "subject", label: "Chủ ngữ (tôi)" },
              { text: "work", role: "verb", label: "Động từ (làm việc)" },
              { text: "with", role: "connector", label: "Giới từ (với)" },
              { text: "them", role: "object", label: "Tân ngữ (họ)" },
            ],
          },
        ],
      },
      {
        title: "Tính từ sở hữu + danh từ: 'của ai?'",
        description:
          "Muốn nói 'của tôi, của anh ấy...' thì đặt my, your, his, her, its, our, their TRƯỚC danh từ. Nhớ: his = của anh ấy (nam), her = của cô ấy (nữ), its = của nó (đồ vật), their = của họ.",
        examples: [
          {
            sentenceEn: "This is my laptop.",
            sentenceVn: "Đây là máy tính xách tay của tôi.",
            contextNote: "my đứng trước danh từ",
            breakdown: [
              { text: "This", role: "subject", label: "Chủ ngữ (cái này)" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "my", role: "modifier", label: "Tính từ sở hữu (của tôi)" },
              { text: "laptop", role: "complement", label: "Danh từ" },
            ],
          },
          {
            sentenceEn: "Their code is very clean.",
            sentenceVn: "Code của họ rất sạch.",
            contextNote: "their + danh từ làm chủ ngữ",
            breakdown: [
              { text: "Their", role: "modifier", label: "Tính từ sở hữu (của họ)" },
              { text: "code", role: "subject", label: "Chủ ngữ (danh từ)" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "very clean", role: "complement", label: "Tính từ (rất sạch)" },
            ],
          },
        ],
      },
    ],
    vnContrast: {
      title: "Tiếng Việt dùng 'của' sau danh từ — tiếng Anh đặt từ sở hữu TRƯỚC danh từ",
      points: [
        {
          vn: "Đây là máy của tôi.",
          en: "This is my laptop.",
          note: "Bỏ chữ 'của', đưa 'my' lên TRƯỚC danh từ. Không nói 'laptop of me'.",
        },
        {
          vn: "Anh ấy giúp tôi.",
          en: "He helps me.",
          note: "Tiếng Việt 'tôi' đứng đâu cũng là 'tôi'. Tiếng Anh: làm chủ ngữ là 'I', đứng sau động từ là 'me'.",
        },
        {
          vn: "Đây là code của cô ấy.",
          en: "This is her code.",
          note: "'của cô ấy' → 'her' (không phải 'she code'). Mỗi người có một từ sở hữu riêng: my, your, his, her, our, their.",
        },
      ],
    },
    commonMistakes: [
      {
        wrong: "This is laptop of me.",
        correct: "This is my laptop.",
        explanation: "Dịch từng chữ 'máy của tôi' là sai. Dùng tính từ sở hữu 'my' đặt trước danh từ.",
      },
      {
        wrong: "Please send the file to I.",
        correct: "Please send the file to me.",
        explanation: "Sau giới từ 'to' (hoặc sau động từ) dùng tân ngữ 'me', không dùng 'I'.",
      },
      {
        wrong: "Lan is my manager. He is very nice.",
        correct: "Lan is my manager. She is very nice.",
        explanation: "Lan là nữ nên dùng 'she' (và 'her'). He/his/him chỉ dùng cho nam.",
      },
    ],
    diagnosticExercises: [
      {
        id: "fd-pr-1",
        type: "multiple_choice",
        promptEn: "This is _____ laptop.",
        promptVn: "Đây là máy tính xách tay của tôi.",
        hint: "Từ nào đứng được ngay trước danh từ?",
        options: ["my", "I", "me", "mine"],
        correctAnswer: "my",
        explanation: "Trước danh từ 'laptop' dùng tính từ sở hữu 'my'. 'Mine' đứng một mình, không đi kèm danh từ.",
      },
      {
        id: "fd-pr-2",
        type: "error_spotting",
        promptEn: "Please [send] [the] [file] [to] [I].",
        promptVn: "Vui lòng gửi file cho tôi.",
        hint: "Từ đứng sau 'to' là người nhận hành động.",
        options: ["send", "the", "file", "to", "I"],
        correctAnswer: "I",
        correctSentence: "Please send the file to me.",
        errorWord: "I",
        errorExplanation: "Sau giới từ 'to' phải dùng tân ngữ 'me'. 'I' chỉ dùng làm chủ ngữ, đứng trước động từ.",
        explanation: "'tôi' đứng sau 'to' là tân ngữ nên dùng 'me': send the file to me.",
      },
      {
        id: "fd-pr-3",
        type: "conjugation",
        promptEn: "Mr. Nam is _____ (we) manager.",
        promptVn: "Anh Nam là quản lý của chúng tôi.",
        hint: "Đổi 'we' sang dạng 'của chúng tôi'.",
        correctAnswer: "our",
        explanation: "'của chúng tôi' là 'our', đặt trước danh từ 'manager'.",
      },
    ],
    practiceExercises: [
      {
        id: "fp-pr-1",
        type: "conjugation",
        promptEn: "Please call _____ (he) tomorrow.",
        promptVn: "Ngày mai vui lòng gọi cho anh ấy.",
        hint: "'anh ấy' đứng sau động từ 'call'.",
        correctAnswer: "him",
        explanation: "Sau động từ 'call' cần tân ngữ: he → him.",
      },
      {
        id: "fp-pr-2",
        type: "sentence_transform",
        promptEn: "Replace \"Lan's\" with his or her: 'This is Lan's laptop.'",
        promptVn: "Thay \"Lan's\" (của Lan) bằng his hoặc her: 'Đây là laptop của cô ấy.'",
        hint: "Lan là nữ → 'của cô ấy'.",
        correctAnswer: "This is her laptop.",
        explanation: "Lan là nữ nên 'của Lan' thành 'her' (của cô ấy), đặt trước danh từ 'laptop'.",
      },
      {
        id: "fp-pr-3",
        type: "multiple_choice",
        promptEn: "They check _____ code every day.",
        promptVn: "Họ kiểm tra code của họ mỗi ngày.",
        hint: "Cần từ mang nghĩa 'của họ'.",
        options: ["their", "they", "them", "there"],
        correctAnswer: "their",
        explanation: "'của họ' là 'their'. 'There' (ở đó) phát âm giống nhưng nghĩa khác hẳn.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 0.3 — SINGULAR & PLURAL NOUNS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "found-plurals",
    level: "A1",
    category: "Nền tảng (Foundation)",
    order: 0.3,
    foundation: true,
    title: "Singular & Plural Nouns",
    titleVn: "Danh từ số ít / số nhiều",
    tagline: "Hai file → two files: tiếng Anh đổi đuôi danh từ khi có từ hai cái trở lên",
    formula: {
      positive: "a / an + danh từ số ít · two / many + danh từ số nhiều (-s / -es / -ies)",
      negative: "S + don't / doesn't have + any + danh từ số nhiều",
      question: "How many + danh từ số nhiều + do / does + S + have?",
    },
    timeSignals: ["a / an → số ít", "one → số ít", "two, three... → số nhiều", "many → số nhiều", "these / those → số nhiều"],
    usagePoints: [
      {
        title: "Thêm -s / -es / -ies",
        description:
          "Danh từ (từ chỉ người, vật: file, bug, laptop) đếm được có hai dạng: số ít (một cái) và số nhiều (từ hai trở lên). Đa số thêm -s: file → files. Tận cùng s, x, ch, sh → thêm -es: branch → branches. Phụ âm + y → bỏ y, thêm -ies: library → libraries (nhưng day → days).",
        examples: [
          {
            sentenceEn: "I have three new emails.",
            sentenceVn: "Tôi có ba email mới.",
            contextNote: "email → emails (+s)",
            breakdown: [
              { text: "I", role: "subject", label: "Chủ ngữ" },
              { text: "have", role: "verb", label: "Động từ (có)" },
              { text: "three", role: "modifier", label: "Số đếm (từ 2 trở lên)" },
              { text: "new emails", role: "object", label: "Danh từ số nhiều (+s)" },
            ],
          },
          {
            sentenceEn: "The app uses two libraries.",
            sentenceVn: "Ứng dụng dùng hai thư viện.",
            contextNote: "library → libraries (y → ies)",
            breakdown: [
              { text: "The app", role: "subject", label: "Chủ ngữ (số ít)" },
              { text: "uses", role: "verb", label: "Động từ (dùng)" },
              { text: "two", role: "modifier", label: "Số đếm" },
              { text: "libraries", role: "object", label: "Danh từ số nhiều (y → ies)" },
            ],
          },
        ],
      },
      {
        title: "a / an + số ít · many + số nhiều · danh từ bất quy tắc",
        description:
          "Một cái → a + danh từ số ít (a bug); trước âm nguyên âm a, e, i, o, u dùng 'an' (an email, an app). 'many' và các số từ 2 trở lên → danh từ số nhiều. Một số từ đổi hẳn dạng: person → people, child → children, man → men, woman → women.",
        examples: [
          {
            sentenceEn: "I have a meeting today.",
            sentenceVn: "Hôm nay tôi có một cuộc họp.",
            contextNote: "a + danh từ số ít",
            breakdown: [
              { text: "I", role: "subject", label: "Chủ ngữ" },
              { text: "have", role: "verb", label: "Động từ (có)" },
              { text: "a meeting", role: "object", label: "a + danh từ số ít" },
              { text: "today", role: "modifier", label: "Thời gian" },
            ],
          },
          {
            sentenceEn: "My team has five people.",
            sentenceVn: "Nhóm của tôi có năm người.",
            contextNote: "person → people (bất quy tắc)",
            breakdown: [
              { text: "My team", role: "subject", label: "Chủ ngữ" },
              { text: "has", role: "verb", label: "Động từ (có)" },
              { text: "five", role: "modifier", label: "Số đếm" },
              { text: "people", role: "object", label: "Số nhiều bất quy tắc (person → people)" },
            ],
          },
        ],
      },
    ],
    vnContrast: {
      title: "Tiếng Việt thêm 'các / những' nhưng danh từ giữ nguyên — tiếng Anh đổi đuôi danh từ",
      points: [
        {
          vn: "Tôi có hai file.",
          en: "I have two files.",
          note: "Tiếng Việt 'file' không đổi dù có bao nhiêu cái. Tiếng Anh: từ hai cái trở lên phải thêm -s: files.",
        },
        {
          vn: "Code có nhiều lỗi.",
          en: "The code has many bugs.",
          note: "'nhiều' → many, và 'many' luôn đi với danh từ số nhiều: many bugs (không phải many bug).",
        },
        {
          vn: "Tôi có một email.",
          en: "I have an email.",
          note: "'một' → a/an, danh từ giữ dạng số ít. 'email' bắt đầu bằng nguyên âm e nên dùng 'an'.",
        },
      ],
    },
    commonMistakes: [
      {
        wrong: "I have two meeting today.",
        correct: "I have two meetings today.",
        explanation: "Có số đếm từ 2 trở lên thì danh từ phải ở dạng số nhiều: meetings.",
      },
      {
        wrong: "We have many bug.",
        correct: "We have many bugs.",
        explanation: "'many' (nhiều) luôn đi với danh từ số nhiều: many bugs.",
      },
      {
        wrong: "My team has five peoples.",
        correct: "My team has five people.",
        explanation: "'people' đã là số nhiều của 'person', không thêm -s nữa.",
      },
    ],
    diagnosticExercises: [
      {
        id: "fd-pl-1",
        type: "multiple_choice",
        promptEn: "I have two new _____ today.",
        promptVn: "Hôm nay tôi có hai email mới.",
        hint: "Có số 'two' đứng trước.",
        options: ["emails", "email", "an email", "emailes"],
        correctAnswer: "emails",
        explanation: "Sau 'two' dùng danh từ số nhiều. 'email' chỉ thêm -s: emails.",
      },
      {
        id: "fd-pl-2",
        type: "conjugation",
        promptEn: "We have three _____ (branch) in this project.",
        promptVn: "Dự án này có ba nhánh (branch) code.",
        hint: "Gõ dạng số nhiều. Từ tận cùng bằng 'ch'.",
        correctAnswer: "branches",
        explanation: "Danh từ tận cùng bằng s, x, ch, sh thì thêm -es: branch → branches.",
      },
      {
        id: "fd-pl-3",
        type: "error_spotting",
        promptEn: "My [team] [has] [five] [peoples] [now].",
        promptVn: "Bây giờ nhóm của tôi có năm người.",
        hint: "Có một từ đã là số nhiều rồi.",
        options: ["team", "has", "five", "peoples", "now"],
        correctAnswer: "peoples",
        correctSentence: "My team has five people now.",
        errorWord: "peoples",
        errorExplanation: "'people' đã là dạng số nhiều của 'person' nên không thêm -s.",
        explanation: "person → people là số nhiều bất quy tắc: five people, không phải five peoples.",
      },
    ],
    practiceExercises: [
      {
        id: "fp-pl-1",
        type: "conjugation",
        promptEn: "The app uses three _____ (library).",
        promptVn: "Ứng dụng dùng ba thư viện.",
        hint: "Gõ dạng số nhiều. Phụ âm + y → ?",
        correctAnswer: "libraries",
        explanation: "Phụ âm + y: bỏ y, thêm -ies. library → libraries.",
      },
      {
        id: "fp-pl-2",
        type: "sentence_transform",
        promptEn: "Change 'one' to 'two': 'Our manager has one child.'",
        promptVn: "Đổi 'one' thành 'two': 'Quản lý của chúng tôi có hai đứa con.'",
        hint: "child có dạng số nhiều bất quy tắc.",
        correctAnswer: "Our manager has two children.",
        explanation: "child → children là số nhiều bất quy tắc, không thêm -s.",
      },
      {
        id: "fp-pl-3",
        type: "multiple_choice",
        promptEn: "Which sentence is correct?",
        promptVn: "Câu nào đúng? (Code của chúng tôi có nhiều lỗi.)",
        options: [
          "We have many bug in the code.",
          "We have many bugs in the code.",
          "We have a bugs in the code.",
          "We have many bugses in the code.",
        ],
        correctAnswer: "We have many bugs in the code.",
        explanation: "'many' đi với danh từ số nhiều; 'bug' chỉ thêm -s: many bugs. 'a' chỉ đi với số ít.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 0.4 — THERE IS / THERE ARE
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "found-there-is",
    level: "A1",
    category: "Nền tảng (Foundation)",
    order: 0.4,
    foundation: true,
    title: "There is / There are",
    titleVn: "There is / There are: nói 'Có...'",
    tagline: "'Có một bug trong code' → There is a bug in the code (không phải 'Have a bug')",
    formula: {
      positive: "There is + a / an + danh từ số ít · There are + danh từ số nhiều",
      negative: "There is not (isn't) + a / an + danh từ · There are not (aren't) + any + danh từ số nhiều",
      question: "Is there + a / an + danh từ? · Are there + any + danh từ số nhiều?",
    },
    timeSignals: [
      "a / an / one → there is",
      "two / many / some → there are",
      "any → phủ định & câu hỏi",
      "Yes, there is. / No, there aren't.",
    ],
    usagePoints: [
      {
        title: "Nói 'có cái gì ở đâu'",
        description:
          "Khi muốn nói một thứ tồn tại ở đâu đó (tiếng Việt: 'Có...'), dùng There is / There are. 'There' ở đây là chủ ngữ giả (đứng vào chỗ chủ ngữ cho câu đủ thành phần), không mang nghĩa 'ở đó'. Chọn is/are theo danh từ ĐỨNG SAU: số ít → is, số nhiều → are.",
        examples: [
          {
            sentenceEn: "There is a bug in the code.",
            sentenceVn: "Có một lỗi trong code.",
            contextNote: "Danh từ số ít → is",
            breakdown: [
              { text: "There", role: "subject", label: "Chủ ngữ giả" },
              { text: "is", role: "verb", label: "be (vì 'a bug' số ít)" },
              { text: "a bug", role: "complement", label: "Danh từ số ít" },
              { text: "in the code", role: "modifier", label: "Nơi chốn" },
            ],
          },
          {
            sentenceEn: "There are two meetings today.",
            sentenceVn: "Hôm nay có hai cuộc họp.",
            contextNote: "Danh từ số nhiều → are",
            breakdown: [
              { text: "There", role: "subject", label: "Chủ ngữ giả" },
              { text: "are", role: "verb", label: "be (vì 'meetings' số nhiều)" },
              { text: "two meetings", role: "complement", label: "Danh từ số nhiều" },
              { text: "today", role: "modifier", label: "Thời gian" },
            ],
          },
        ],
      },
      {
        title: "Phủ định & câu hỏi",
        description:
          "Phủ định: thêm 'not' sau is/are (isn't, aren't); với danh từ số nhiều thường thêm 'any'. Câu hỏi: đảo is/are lên TRƯỚC 'there'. Trả lời ngắn: Yes, there is. / No, there isn't.",
        examples: [
          {
            sentenceEn: "There aren't any tests for this file.",
            sentenceVn: "Không có bài test nào cho file này.",
            contextNote: "Phủ định số nhiều + any",
            breakdown: [
              { text: "There", role: "subject", label: "Chủ ngữ giả" },
              { text: "aren't", role: "verb", label: "are + not" },
              { text: "any tests", role: "complement", label: "any + danh từ số nhiều" },
              { text: "for this file", role: "modifier", label: "Bổ sung (cho file này)" },
            ],
          },
          {
            sentenceEn: "Is there a meeting today?",
            sentenceVn: "Hôm nay có cuộc họp không?",
            contextNote: "Câu hỏi — trả lời: Yes, there is. / No, there isn't.",
            breakdown: [
              { text: "Is", role: "verb", label: "be đưa lên đầu câu" },
              { text: "there", role: "subject", label: "Chủ ngữ giả" },
              { text: "a meeting", role: "complement", label: "Danh từ số ít" },
              { text: "today", role: "modifier", label: "Thời gian" },
            ],
          },
        ],
      },
    ],
    vnContrast: {
      title: "'Có' trong tiếng Việt không phải lúc nào cũng là 'have'",
      points: [
        {
          vn: "Có một bug trong code.",
          en: "There is a bug in the code.",
          note: "Không nói 'Have a bug in the code'. Câu tiếng Anh cần chủ ngữ, nên dùng 'There' làm chủ ngữ giả.",
        },
        {
          vn: "Hôm nay có hai cuộc họp.",
          en: "There are two meetings today.",
          note: "Danh từ phía sau là số nhiều (meetings) nên dùng 'are'.",
        },
        {
          vn: "Tôi có một cái laptop.",
          en: "I have a laptop.",
          note: "Khi 'có' nghĩa là SỞ HỮU (ai đó có gì) thì dùng have/has. Khi 'có' nghĩa là TỒN TẠI ở đâu đó thì dùng There is/are.",
        },
      ],
    },
    commonMistakes: [
      {
        wrong: "Have a bug in the code.",
        correct: "There is a bug in the code.",
        explanation: "Dịch từng chữ 'Có một bug' thành 'Have a bug' là sai. Nói về sự tồn tại thì dùng There is.",
      },
      {
        wrong: "There is three files in the folder.",
        correct: "There are three files in the folder.",
        explanation: "Danh từ phía sau là số nhiều (three files) nên dùng 'are'.",
      },
      {
        wrong: "There have a meeting today.",
        correct: "There is a meeting today.",
        explanation: "Sau 'There' dùng 'be' (is/are), không dùng 'have'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "fd-th-1",
        type: "multiple_choice",
        promptEn: "_____ a bug in the code.",
        promptVn: "Có một lỗi trong code.",
        hint: "'a bug' là số ít.",
        options: ["There is", "There are", "There has", "There have"],
        correctAnswer: "There is",
        explanation: "Nói 'có cái gì ở đâu' dùng There + be. 'a bug' số ít nên dùng 'There is'.",
      },
      {
        id: "fd-th-2",
        type: "conjugation",
        promptEn: "There _____ (be) three files in the folder.",
        promptVn: "Có ba file trong thư mục.",
        hint: "Nhìn danh từ đứng sau: 'three files'.",
        correctAnswer: "are",
        explanation: "'three files' là số nhiều nên dùng 'There are'.",
      },
      {
        id: "fd-th-3",
        type: "error_spotting",
        promptEn: "[There] [is] [two] [meetings] [today].",
        promptVn: "Hôm nay có hai cuộc họp.",
        hint: "is hay are phụ thuộc vào danh từ đứng sau.",
        options: ["There", "is", "two", "meetings", "today"],
        correctAnswer: "is",
        correctSentence: "There are two meetings today.",
        errorWord: "is",
        errorExplanation: "'two meetings' là số nhiều nên phải dùng 'are', không dùng 'is'.",
        explanation: "Với There is/are, chọn is/are theo danh từ phía sau: two meetings → are.",
      },
    ],
    practiceExercises: [
      {
        id: "fp-th-1",
        type: "sentence_transform",
        promptEn: "Make it a question: 'There is a meeting today.'",
        promptVn: "Viết thành câu hỏi: 'Hôm nay có cuộc họp không?'",
        hint: "Đảo 'is' lên trước 'there'.",
        correctAnswer: "Is there a meeting today?",
        explanation: "Câu hỏi với There is: đảo 'is' lên đầu câu, trước 'there'.",
      },
      {
        id: "fp-th-2",
        type: "multiple_choice",
        promptEn: "Which sentence is correct?",
        promptVn: "Câu nào đúng? (Có một email mới cho bạn.)",
        options: [
          "There is a new email for you.",
          "There are a new email for you.",
          "There has a new email for you.",
          "There have a new email for you.",
        ],
        correctAnswer: "There is a new email for you.",
        explanation: "'a new email' là số ít nên dùng 'There is'. Sau 'There' không dùng has/have.",
      },
      {
        id: "fp-th-3",
        type: "conjugation",
        promptEn: "There _____ (not be) any tests for this app.",
        promptVn: "Không có bài test nào cho ứng dụng này.",
        hint: "Phủ định, danh từ 'tests' là số nhiều.",
        correctAnswer: "aren't",
        explanation: "'tests' số nhiều → are; phủ định thêm not: are not = aren't.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 0.5 — CAN / CAN'T
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "found-can",
    level: "A1",
    category: "Nền tảng (Foundation)",
    order: 0.5,
    foundation: true,
    title: "Can / Can't",
    titleVn: "Can / can't: có thể / không thể",
    tagline: "Nói khả năng, xin phép và nhờ vả: I can fix it. Can you help me?",
    formula: {
      positive: "S + can + V nguyên mẫu",
      negative: "S + cannot (can't) + V nguyên mẫu",
      question: "Can + S + V nguyên mẫu ...?",
    },
    timeSignals: ["Can I...? → xin phép", "Can you...? → nhờ vả", "can't = cannot", "Yes, I can. / No, I can't."],
    usagePoints: [
      {
        title: "Khả năng: có thể / biết làm gì",
        description:
          "'can' là động từ khuyết thiếu (động từ phụ đứng trước động từ chính, thêm nghĩa 'có thể'). Sau can luôn là động từ nguyên mẫu (dạng gốc: không -s, không -ing, không 'to'). 'can' giữ nguyên với mọi chủ ngữ: I can, he can, they can. Phủ định: can't (= cannot).",
        examples: [
          {
            sentenceEn: "She can fix this bug.",
            sentenceVn: "Cô ấy có thể sửa lỗi này.",
            contextNote: "Khả năng",
            breakdown: [
              { text: "She", role: "subject", label: "Chủ ngữ" },
              { text: "can", role: "auxiliary", label: "Động từ khuyết thiếu (có thể)" },
              { text: "fix", role: "verb", label: "Động từ nguyên mẫu (không -s)" },
              { text: "this bug", role: "object", label: "Tân ngữ" },
            ],
          },
          {
            sentenceEn: "I can't open the file.",
            sentenceVn: "Tôi không mở được file.",
            contextNote: "Phủ định: can't = cannot",
            breakdown: [
              { text: "I", role: "subject", label: "Chủ ngữ" },
              { text: "can't", role: "auxiliary", label: "can + not (không thể)" },
              { text: "open", role: "verb", label: "Động từ nguyên mẫu" },
              { text: "the file", role: "object", label: "Tân ngữ" },
            ],
          },
        ],
      },
      {
        title: "Xin phép & nhờ vả",
        description:
          "Câu hỏi: đưa 'can' lên ĐẦU câu. 'Can I...?' = xin phép (Tôi ... được không?). 'Can you...?' = nhờ người khác (Bạn ... giúp tôi được không?). Thêm 'please' cho lịch sự hơn.",
        examples: [
          {
            sentenceEn: "Can I use your laptop?",
            sentenceVn: "Tôi dùng laptop của bạn được không?",
            contextNote: "Xin phép",
            breakdown: [
              { text: "Can", role: "auxiliary", label: "can đưa lên đầu câu" },
              { text: "I", role: "subject", label: "Chủ ngữ" },
              { text: "use", role: "verb", label: "Động từ nguyên mẫu" },
              { text: "your laptop", role: "object", label: "Tân ngữ" },
            ],
          },
          {
            sentenceEn: "Can you check my code, please?",
            sentenceVn: "Bạn kiểm tra giúp code của tôi được không?",
            contextNote: "Nhờ vả lịch sự",
            breakdown: [
              { text: "Can", role: "auxiliary", label: "can đưa lên đầu câu" },
              { text: "you", role: "subject", label: "Chủ ngữ" },
              { text: "check", role: "verb", label: "Động từ nguyên mẫu" },
              { text: "my code", role: "object", label: "Tân ngữ" },
              { text: "please", role: "modifier", label: "Lịch sự (làm ơn)" },
            ],
          },
        ],
      },
    ],
    vnContrast: {
      title: "'can' không bao giờ đổi dạng và không đi với 'to'",
      points: [
        {
          vn: "Anh ấy có thể sửa nó.",
          en: "He can fix it.",
          note: "Với 'he', tiếng Anh thường thêm -s cho động từ, nhưng 'can' thì KHÔNG: không có 'cans', và 'fix' cũng không thêm -s.",
        },
        {
          vn: "Tôi có thể giúp bạn.",
          en: "I can help you.",
          note: "'có thể' + động từ → can + động từ nguyên mẫu, không chen 'to' vào giữa (không nói 'can to help').",
        },
        {
          vn: "Bạn giúp tôi được không?",
          en: "Can you help me?",
          note: "Tiếng Việt để 'được không' ở CUỐI câu. Tiếng Anh đưa 'Can' lên ĐẦU câu và không dùng 'do'.",
        },
      ],
    },
    commonMistakes: [
      {
        wrong: "He cans fix it.",
        correct: "He can fix it.",
        explanation: "'can' không bao giờ thêm -s, kể cả với he/she/it.",
      },
      {
        wrong: "I can to help you.",
        correct: "I can help you.",
        explanation: "Sau 'can' là động từ nguyên mẫu, không có 'to'.",
      },
      {
        wrong: "Do you can check my code?",
        correct: "Can you check my code?",
        explanation: "Câu hỏi với 'can' chỉ cần đưa 'can' lên đầu câu, không dùng 'do'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "fd-can-1",
        type: "multiple_choice",
        promptEn: "He can _____ this bug today.",
        promptVn: "Hôm nay anh ấy có thể sửa lỗi này.",
        hint: "Sau 'can' là động từ dạng gốc.",
        options: ["fix", "fixes", "to fix", "fixing"],
        correctAnswer: "fix",
        explanation: "Sau 'can' luôn là động từ nguyên mẫu: can fix. Không thêm -s, -ing hay 'to'.",
      },
      {
        id: "fd-can-2",
        type: "error_spotting",
        promptEn: "She [can] [fixes] [the] [server] [today].",
        promptVn: "Hôm nay cô ấy có thể sửa máy chủ.",
        hint: "Nhìn động từ đứng ngay sau 'can'.",
        options: ["can", "fixes", "the", "server", "today"],
        correctAnswer: "fixes",
        correctSentence: "She can fix the server today.",
        errorWord: "fixes",
        errorExplanation: "Sau 'can' động từ phải ở dạng nguyên mẫu: 'fix', không thêm -es dù chủ ngữ là 'She'.",
        explanation: "can + động từ nguyên mẫu: She can fix the server today.",
      },
      {
        id: "fd-can-3",
        type: "sentence_transform",
        promptEn: "Make it negative: 'I can open the file.'",
        promptVn: "Viết câu phủ định: 'Tôi không mở được file.'",
        hint: "Thêm 'not' vào 'can'.",
        correctAnswer: "I can't open the file.",
        explanation: "Phủ định của can là can't (= cannot), động từ 'open' giữ nguyên.",
      },
    ],
    practiceExercises: [
      {
        id: "fp-can-1",
        type: "conjugation",
        promptEn: "He can _____ (send) the email now.",
        promptVn: "Bây giờ anh ấy có thể gửi email.",
        hint: "Chủ ngữ là 'He' nhưng phía trước có 'can'.",
        correctAnswer: "send",
        explanation: "Sau 'can' động từ luôn ở dạng nguyên mẫu, kể cả với 'He': can send, không phải can sends.",
      },
      {
        id: "fp-can-2",
        type: "sentence_transform",
        promptEn: "Make it a question: 'You can help me.'",
        promptVn: "Viết thành câu hỏi: 'Bạn giúp tôi được không?'",
        hint: "Đưa 'can' lên đầu câu.",
        correctAnswer: "Can you help me?",
        explanation: "Câu hỏi với can: đưa 'Can' lên trước chủ ngữ, không cần 'do'.",
      },
      {
        id: "fp-can-3",
        type: "multiple_choice",
        promptEn: "Which sentence is correct?",
        promptVn: "Câu nào đúng? (Bạn mở được ứng dụng này không?)",
        options: [
          "Do you can open this app?",
          "Can you open this app?",
          "Can you to open this app?",
          "Can you opens this app?",
        ],
        correctAnswer: "Can you open this app?",
        explanation: "Câu hỏi: Can + chủ ngữ + động từ nguyên mẫu. Không dùng 'do', không 'to', không thêm -s.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 0.6 — WH- QUESTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "found-questions",
    level: "A1",
    category: "Nền tảng (Foundation)",
    order: 0.6,
    foundation: true,
    title: "Wh- Questions with do / does / be",
    titleVn: "Câu hỏi: từ để hỏi + trợ động từ",
    tagline: "What, Where, When... luôn đứng ĐẦU câu, theo sau là do/does hoặc am/is/are",
    formula: {
      positive: "Wh- + am / is / are + S ...? (Where is the file?)",
      negative: "Wh- + don't / doesn't + S + V nguyên mẫu? (Why don't you ask?)",
      question: "Wh- + do / does + S + V nguyên mẫu? (What do you do?)",
    },
    formulaLabels: { positive: "Hỏi với to be", negative: "Hỏi phủ định", question: "Hỏi với do / does" },
    timeSignals: [
      "What → cái gì",
      "Where → ở đâu",
      "When → khi nào",
      "Who → ai",
      "Why → tại sao",
      "How → thế nào",
    ],
    usagePoints: [
      {
        title: "Từ để hỏi + am / is / are",
        description:
          "Khi câu có 'be' (am/is/are, ví dụ hỏi ở đâu, là ai), đặt từ để hỏi lên ĐẦU, rồi am/is/are, rồi chủ ngữ. Không cần do/does.",
        examples: [
          {
            sentenceEn: "Where is the meeting room?",
            sentenceVn: "Phòng họp ở đâu?",
            contextNote: "Hỏi nơi chốn",
            breakdown: [
              { text: "Where", role: "modifier", label: "Từ để hỏi (ở đâu)" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "the meeting room", role: "subject", label: "Chủ ngữ" },
            ],
          },
          {
            sentenceEn: "Who is your manager?",
            sentenceVn: "Quản lý của bạn là ai?",
            contextNote: "Hỏi người",
            breakdown: [
              { text: "Who", role: "complement", label: "Từ để hỏi (ai)" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "your manager", role: "subject", label: "Chủ ngữ" },
            ],
          },
        ],
      },
      {
        title: "Từ để hỏi + do / does + động từ thường",
        description:
          "Khi câu có động từ thường (work, fix, start...), cần thêm trợ động từ (động từ phụ giúp tạo câu hỏi) do/does: Từ để hỏi + do/does + chủ ngữ + động từ nguyên mẫu? 'does' cho he/she/it và danh từ số ít; 'do' cho I/you/we/they. Đã có 'does' thì động từ chính KHÔNG thêm -s.",
        examples: [
          {
            sentenceEn: "What do you do?",
            sentenceVn: "Bạn làm nghề gì?",
            contextNote: "Câu hỏi làm quen rất hay gặp",
            breakdown: [
              { text: "What", role: "object", label: "Từ để hỏi (cái gì)" },
              { text: "do", role: "auxiliary", label: "Trợ động từ (không có nghĩa)" },
              { text: "you", role: "subject", label: "Chủ ngữ" },
              { text: "do", role: "verb", label: "Động từ chính (làm)" },
            ],
          },
          {
            sentenceEn: "When does the meeting start?",
            sentenceVn: "Khi nào cuộc họp bắt đầu?",
            contextNote: "Chủ ngữ số ít → does",
            breakdown: [
              { text: "When", role: "modifier", label: "Từ để hỏi (khi nào)" },
              { text: "does", role: "auxiliary", label: "Trợ động từ (chủ ngữ số ít)" },
              { text: "the meeting", role: "subject", label: "Chủ ngữ" },
              { text: "start", role: "verb", label: "Động từ nguyên mẫu (không -s)" },
            ],
          },
        ],
      },
    ],
    vnContrast: {
      title: "Tiếng Việt để từ để hỏi ở CUỐI câu — tiếng Anh đưa lên ĐẦU và thêm do/does",
      points: [
        {
          vn: "Bạn làm gì?",
          en: "What do you do?",
          note: "'gì' đứng cuối câu tiếng Việt, nhưng 'What' phải đứng ĐẦU câu tiếng Anh, sau đó là trợ động từ 'do'.",
        },
        {
          vn: "File ở đâu?",
          en: "Where is the file?",
          note: "'ở đâu' → Where đứng đầu, rồi đến 'is', rồi mới đến chủ ngữ 'the file'.",
        },
        {
          vn: "Khi nào cuộc họp bắt đầu?",
          en: "When does the meeting start?",
          note: "Tiếng Việt không có chữ nào tương đương 'does'. Tiếng Anh bắt buộc có, và 'start' giữ nguyên, không thêm -s.",
        },
      ],
    },
    commonMistakes: [
      {
        wrong: "What you do?",
        correct: "What do you do?",
        explanation: "Câu hỏi với động từ thường phải có trợ động từ 'do/does' sau từ để hỏi.",
      },
      {
        wrong: "Where the file is?",
        correct: "Where is the file?",
        explanation: "Trong câu hỏi, 'is' phải đứng TRƯỚC chủ ngữ 'the file'.",
      },
      {
        wrong: "When does the meeting starts?",
        correct: "When does the meeting start?",
        explanation: "Đã có 'does' thì động từ chính giữ nguyên mẫu: start, không thêm -s.",
      },
    ],
    diagnosticExercises: [
      {
        id: "fd-q-1",
        type: "multiple_choice",
        promptEn: "When _____ the meeting start?",
        promptVn: "Khi nào cuộc họp bắt đầu?",
        hint: "'start' là động từ thường, 'the meeting' là số ít.",
        options: ["does", "do", "is", "are"],
        correctAnswer: "does",
        explanation: "Câu có động từ thường 'start' cần trợ động từ. Chủ ngữ số ít 'the meeting' → does.",
      },
      {
        id: "fd-q-2",
        type: "conjugation",
        promptEn: "Where _____ (be) the new laptops?",
        promptVn: "Những chiếc laptop mới ở đâu?",
        hint: "Chủ ngữ 'the new laptops' là số nhiều.",
        correctAnswer: "are",
        explanation: "Câu hỏi với 'be': Where + are + chủ ngữ số nhiều 'the new laptops'.",
      },
      {
        id: "fd-q-3",
        type: "error_spotting",
        promptEn: "[When] [does] [the] [test] [starts]?",
        promptVn: "Khi nào bài test bắt đầu?",
        hint: "Đã có 'does' rồi thì động từ chính có dạng gì?",
        options: ["When", "does", "the", "test", "starts"],
        correctAnswer: "starts",
        correctSentence: "When does the test start?",
        errorWord: "starts",
        errorExplanation: "Đã có trợ động từ 'does' thì động từ chính phải ở dạng nguyên mẫu: 'start', không thêm -s.",
        explanation: "does + chủ ngữ + động từ nguyên mẫu: When does the test start?",
      },
    ],
    practiceExercises: [
      {
        id: "fp-q-1",
        type: "sentence_transform",
        promptEn: "Ask with 'Where': 'The file is in the folder.'",
        promptVn: "Đặt câu hỏi với 'Where': 'File ở đâu?'",
        hint: "Where + is + chủ ngữ?",
        correctAnswer: "Where is the file?",
        explanation: "Từ để hỏi đứng đầu, rồi đến 'is', rồi chủ ngữ 'the file'.",
      },
      {
        id: "fp-q-2",
        type: "multiple_choice",
        promptEn: "Which question is correct?",
        promptVn: "Câu hỏi nào đúng? (Bạn làm nghề gì?)",
        options: ["What you do?", "What do you do?", "What are you do?", "What does you do?"],
        correctAnswer: "What do you do?",
        explanation: "Động từ thường cần trợ động từ: What + do + you + do? 'you' đi với 'do', không phải 'does'.",
      },
      {
        id: "fp-q-3",
        type: "conjugation",
        promptEn: "How _____ (do) he fix this bug?",
        promptVn: "Anh ấy sửa lỗi này bằng cách nào?",
        hint: "Chủ ngữ là 'he'.",
        correctAnswer: "does",
        explanation: "Chủ ngữ 'he' (ngôi 3 số ít) dùng trợ động từ 'does'; động từ 'fix' giữ nguyên.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 0.7 — PREPOSITIONS IN / ON / AT
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "found-prepositions",
    level: "A1",
    category: "Nền tảng (Foundation)",
    order: 0.7,
    foundation: true,
    title: "Prepositions of Time & Place: in / on / at",
    titleVn: "Giới từ in / on / at (thời gian & nơi chốn)",
    tagline: "at 9 a.m., on Monday, in May — từ nhỏ nhưng dùng sai là người nghe nhận ra ngay",
    formula: {
      positive: "S + be / V + at / on / in + thời gian, nơi chốn (The meeting is at 9 a.m.)",
      negative: "S + am / is / are + not + in / on / at + nơi chốn (The file is not in the folder.)",
      question: "Is / Are + S + at / on / in + ...? (Is he at the office?)",
    },
    timeSignals: [
      "at + giờ: at 9 a.m.",
      "on + thứ, ngày: on Monday",
      "in + tháng, năm: in May",
      "at + địa điểm: at the office",
      "on + bề mặt: on the screen",
      "in + bên trong: in the folder",
    ],
    usagePoints: [
      {
        title: "Thời gian: at → giờ, on → thứ/ngày, in → tháng/năm",
        description:
          "Giới từ là từ nhỏ đứng trước danh từ để chỉ thời gian hoặc vị trí. Mẹo nhớ theo độ 'rộng': at cho một điểm giờ (at 9 a.m., at noon), on cho một ngày (on Monday, on May 5), in cho khoảng dài hơn (in May, in 2026, in the morning).",
        examples: [
          {
            sentenceEn: "The meeting is at 9 a.m.",
            sentenceVn: "Cuộc họp lúc 9 giờ sáng.",
            contextNote: "at + giờ",
            breakdown: [
              { text: "The meeting", role: "subject", label: "Chủ ngữ" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "at", role: "connector", label: "Giới từ (giờ cụ thể)" },
              { text: "9 a.m.", role: "modifier", label: "Thời điểm" },
            ],
          },
          {
            sentenceEn: "We have a demo on Friday.",
            sentenceVn: "Chúng tôi có buổi demo vào thứ Sáu.",
            contextNote: "on + thứ trong tuần",
            breakdown: [
              { text: "We", role: "subject", label: "Chủ ngữ" },
              { text: "have", role: "verb", label: "Động từ (có)" },
              { text: "a demo", role: "object", label: "Tân ngữ" },
              { text: "on", role: "connector", label: "Giới từ (ngày/thứ)" },
              { text: "Friday", role: "modifier", label: "Thứ Sáu" },
            ],
          },
        ],
      },
      {
        title: "Nơi chốn: at → một điểm, on → bề mặt, in → bên trong",
        description:
          "at + một địa điểm cụ thể (at the office, at home, at my desk). on + bề mặt (on the screen, on the page, on the table). in + bên trong một không gian (in the folder, in the room, in the code).",
        examples: [
          {
            sentenceEn: "The file is in the folder.",
            sentenceVn: "File nằm trong thư mục.",
            contextNote: "in = bên trong",
            breakdown: [
              { text: "The file", role: "subject", label: "Chủ ngữ" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "in", role: "connector", label: "Giới từ (bên trong)" },
              { text: "the folder", role: "modifier", label: "Nơi chốn" },
            ],
          },
          {
            sentenceEn: "The error is on the screen.",
            sentenceVn: "Lỗi hiện trên màn hình.",
            contextNote: "on = trên bề mặt",
            breakdown: [
              { text: "The error", role: "subject", label: "Chủ ngữ" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "on", role: "connector", label: "Giới từ (trên bề mặt)" },
              { text: "the screen", role: "modifier", label: "Nơi chốn" },
            ],
          },
        ],
      },
    ],
    vnContrast: {
      title: "'vào / ở / trong / trên' không dịch 1-1 sang in / on / at",
      points: [
        {
          vn: "Chúng ta họp vào thứ Hai.",
          en: "We have a meeting on Monday.",
          note: "'vào' + thứ trong tuần → on. Đừng dịch 'vào' thành 'in'.",
        },
        {
          vn: "Buổi demo bắt đầu vào lúc 9 giờ.",
          en: "The demo starts at 9 a.m.",
          note: "Cùng là 'vào', nhưng trước giờ cụ thể thì dùng at. Giới từ do từ ĐỨNG SAU quyết định, không do tiếng Việt.",
        },
        {
          vn: "Tôi đang ở văn phòng.",
          en: "I am at the office.",
          note: "'ở' + một địa điểm (văn phòng, nhà) → at. Nhưng 'ở trong' thư mục, phòng → in: The file is in the folder.",
        },
      ],
    },
    commonMistakes: [
      {
        wrong: "The meeting is in Monday.",
        correct: "The meeting is on Monday.",
        explanation: "Thứ trong tuần dùng 'on': on Monday, on Friday.",
      },
      {
        wrong: "I start work on 9 a.m.",
        correct: "I start work at 9 a.m.",
        explanation: "Giờ cụ thể dùng 'at': at 9 a.m., at noon.",
      },
      {
        wrong: "The file is on the folder.",
        correct: "The file is in the folder.",
        explanation: "File nằm BÊN TRONG thư mục nên dùng 'in'.",
      },
    ],
    diagnosticExercises: [
      {
        id: "fd-pre-1",
        type: "multiple_choice",
        promptEn: "The meeting is _____ Monday.",
        promptVn: "Cuộc họp vào thứ Hai.",
        hint: "Monday là một thứ trong tuần.",
        options: ["on", "in", "at", "to"],
        correctAnswer: "on",
        explanation: "Thứ trong tuần và ngày cụ thể dùng 'on': on Monday.",
      },
      {
        id: "fd-pre-2",
        type: "conjugation",
        promptEn: "I start work _____ (in / on / at) 9 a.m.",
        promptVn: "Tôi bắt đầu làm việc lúc 9 giờ sáng.",
        hint: "Gõ một giới từ. Phía sau là giờ cụ thể.",
        correctAnswer: "at",
        correctSentence: "I start work at 9 a.m.",
        explanation: "Trước giờ cụ thể (9 a.m., noon) dùng 'at'.",
      },
      {
        id: "fd-pre-3",
        type: "error_spotting",
        promptEn: "The [file] [is] [on] [the] folder.",
        promptVn: "File nằm trong thư mục.",
        hint: "File nằm ở đâu so với thư mục: trên hay bên trong?",
        options: ["file", "is", "on", "the"],
        correctAnswer: "on",
        correctSentence: "The file is in the folder.",
        errorWord: "on",
        errorExplanation: "File nằm BÊN TRONG thư mục nên phải dùng 'in', không dùng 'on'.",
        explanation: "'in' dùng cho vị trí bên trong một không gian: in the folder.",
      },
    ],
    practiceExercises: [
      {
        id: "fp-pre-1",
        type: "sentence_transform",
        promptEn: "Change the time to 'Monday': 'The demo is at 10 a.m.'",
        promptVn: "Đổi thời gian thành thứ Hai: 'Buổi demo vào thứ Hai.'",
        hint: "Đổi luôn cả giới từ.",
        correctAnswer: "The demo is on Monday.",
        explanation: "Giờ dùng 'at', nhưng thứ trong tuần dùng 'on': on Monday.",
      },
      {
        id: "fp-pre-2",
        type: "multiple_choice",
        promptEn: "Which sentence is correct?",
        promptVn: "Câu nào đúng? (Bây giờ tôi đang ở văn phòng.)",
        options: [
          "I am at the office now.",
          "I am on the office now.",
          "I am to the office now.",
          "I at the office now.",
        ],
        correctAnswer: "I am at the office now.",
        explanation: "Ở một địa điểm như văn phòng dùng 'at': at the office. Nhớ giữ cả 'am' trước giới từ.",
      },
      {
        id: "fp-pre-3",
        type: "conjugation",
        promptEn: "We release the app _____ (in / on / at) May.",
        promptVn: "Chúng tôi phát hành ứng dụng vào tháng Năm.",
        hint: "Gõ một giới từ. Phía sau là tên tháng.",
        correctAnswer: "in",
        correctSentence: "We release the app in May.",
        explanation: "Tháng và năm dùng 'in': in May, in 2026.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 0.8 — WORD ORDER: ADJECTIVES, VERY, COMPOUND NOUNS
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "found-word-order",
    level: "A1",
    category: "Nền tảng (Foundation)",
    order: 0.8,
    foundation: true,
    title: "Word Order: Adjectives, 'very' & Compound Nouns",
    titleVn: "Trật tự từ: tính từ, 'very' và danh từ ghép",
    tagline: "Tiếng Anh nói ngược tiếng Việt: 'bug lớn' → big bug, 'trang đăng nhập' → login page",
    formula: {
      positive: "a / an / the + (very) + tính từ + danh từ (a very big bug)",
      negative: "S + is / are + not + (very) + tính từ (The app is not very fast.)",
      question: "Is / Are + S + (very) + tính từ? (Is the file very big?)",
    },
    timeSignals: [
      "very + tính từ: very fast",
      "tính từ + danh từ: new laptop",
      "danh từ + danh từ: login page",
      "danh từ chính đứng CUỐI",
    ],
    usagePoints: [
      {
        title: "Tính từ đứng TRƯỚC danh từ; 'very' đứng trước tính từ",
        description:
          "Tính từ (từ chỉ tính chất: big, new, fast) đứng TRƯỚC danh từ nó mô tả: a new laptop. 'very' (rất) đứng TRƯỚC tính từ: very fast. Tính từ không bao giờ thêm -s, kể cả khi danh từ số nhiều: two new laptops.",
        examples: [
          {
            sentenceEn: "We have a big bug.",
            sentenceVn: "Chúng tôi có một bug lớn.",
            contextNote: "tính từ + danh từ",
            breakdown: [
              { text: "We", role: "subject", label: "Chủ ngữ" },
              { text: "have", role: "verb", label: "Động từ (có)" },
              { text: "a", role: "modifier", label: "Mạo từ (một)" },
              { text: "big", role: "modifier", label: "Tính từ (lớn) — đứng trước" },
              { text: "bug", role: "object", label: "Danh từ chính — đứng sau" },
            ],
          },
          {
            sentenceEn: "The app is very fast.",
            sentenceVn: "Ứng dụng rất nhanh.",
            contextNote: "very + tính từ",
            breakdown: [
              { text: "The app", role: "subject", label: "Chủ ngữ" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "very", role: "modifier", label: "Rất — đứng trước tính từ" },
              { text: "fast", role: "complement", label: "Tính từ (nhanh)" },
            ],
          },
        ],
      },
      {
        title: "Danh từ ghép: danh từ phụ + danh từ chính",
        description:
          "Khi hai danh từ đi liền nhau, danh từ CHÍNH đứng CUỐI, danh từ đứng trước cho biết 'loại gì': login page (trang để đăng nhập), user account (tài khoản người dùng), test case. Danh từ đứng trước giữ dạng số ít: user accounts (không phải users accounts).",
        examples: [
          {
            sentenceEn: "The login page is very slow.",
            sentenceVn: "Trang đăng nhập rất chậm.",
            contextNote: "login (phụ) + page (chính)",
            breakdown: [
              { text: "The", role: "modifier", label: "Mạo từ" },
              { text: "login", role: "modifier", label: "Danh từ phụ (đăng nhập)" },
              { text: "page", role: "subject", label: "Danh từ chính (trang)" },
              { text: "is", role: "verb", label: "Động từ to be" },
              { text: "very slow", role: "complement", label: "very + tính từ" },
            ],
          },
          {
            sentenceEn: "We need a new test case.",
            sentenceVn: "Chúng tôi cần một test case mới.",
            contextNote: "tính từ + danh từ phụ + danh từ chính",
            breakdown: [
              { text: "We", role: "subject", label: "Chủ ngữ" },
              { text: "need", role: "verb", label: "Động từ (cần)" },
              { text: "a new", role: "modifier", label: "Mạo từ + tính từ (mới)" },
              { text: "test", role: "modifier", label: "Danh từ phụ" },
              { text: "case", role: "object", label: "Danh từ chính" },
            ],
          },
        ],
      },
    ],
    vnContrast: {
      title: "Tiếng Việt: danh từ chính đứng TRƯỚC — tiếng Anh: danh từ chính đứng CUỐI",
      points: [
        {
          vn: "Đây là một bug lớn.",
          en: "This is a big bug.",
          note: "Tiếng Việt: danh từ trước, tính từ sau (bug lớn). Tiếng Anh ngược lại: tính từ trước, danh từ sau (big bug).",
        },
        {
          vn: "Trang đăng nhập bị chậm.",
          en: "The login page is slow.",
          note: "'trang' là danh từ chính → 'page' đứng CUỐI; 'đăng nhập' cho biết loại trang → 'login' đứng trước.",
        },
        {
          vn: "Tôi có một máy tính rất nhanh.",
          en: "I have a very fast computer.",
          note: "'rất nhanh' → very fast, và cả cụm đứng TRƯỚC danh từ 'computer'.",
        },
      ],
    },
    commonMistakes: [
      {
        wrong: "We have a bug big.",
        correct: "We have a big bug.",
        explanation: "Tính từ (big) đứng TRƯỚC danh từ (bug), ngược với tiếng Việt.",
      },
      {
        wrong: "Please open the page login.",
        correct: "Please open the login page.",
        explanation: "Trong danh từ ghép, danh từ chính (page) đứng CUỐI.",
      },
      {
        wrong: "The app is fast very.",
        correct: "The app is very fast.",
        explanation: "'very' (rất) luôn đứng TRƯỚC tính từ: very fast.",
      },
    ],
    diagnosticExercises: [
      {
        id: "fd-wo-1",
        type: "multiple_choice",
        promptEn: "Which sentence is correct?",
        promptVn: "Câu nào đúng? (Đây là một bug lớn.)",
        options: ["This is a bug big.", "This is a big bug.", "This is big a bug.", "This is a bug very big."],
        correctAnswer: "This is a big bug.",
        explanation: "Thứ tự đúng: a + tính từ + danh từ: a big bug.",
      },
      {
        id: "fd-wo-2",
        type: "error_spotting",
        promptEn: "[We] [have] [two] [bigs] [bugs].",
        promptVn: "Chúng tôi có hai bug lớn.",
        hint: "Từ nào trong tiếng Anh không bao giờ thêm -s?",
        options: ["We", "have", "two", "bigs", "bugs"],
        correctAnswer: "bigs",
        correctSentence: "We have two big bugs.",
        errorWord: "bigs",
        errorExplanation: "'big' là tính từ, tính từ không bao giờ thêm -s. Chỉ danh từ 'bugs' mới ở dạng số nhiều.",
        explanation: "Tính từ giữ nguyên dù danh từ số nhiều: two big bugs.",
      },
      {
        id: "fd-wo-3",
        type: "sentence_transform",
        promptEn: "Rewrite in the right order: 'Please open the page login.'",
        promptVn: "Viết lại cho đúng trật tự: 'Vui lòng mở trang đăng nhập.'",
        hint: "Danh từ chính (page) đứng cuối.",
        correctAnswer: "Please open the login page.",
        explanation: "Danh từ ghép: danh từ phụ (login) trước, danh từ chính (page) sau.",
      },
    ],
    practiceExercises: [
      {
        id: "fp-wo-1",
        type: "conjugation",
        promptEn: "Please check the _____ (account, user).",
        promptVn: "Vui lòng kiểm tra tài khoản người dùng.",
        hint: "Sắp xếp hai từ trong ngoặc: danh từ chính đứng cuối.",
        correctAnswer: "user account",
        correctSentence: "Please check the user account.",
        explanation: "'tài khoản' là danh từ chính nên 'account' đứng cuối: user account.",
      },
      {
        id: "fp-wo-2",
        type: "multiple_choice",
        promptEn: "The login page is _____ today.",
        promptVn: "Hôm nay trang đăng nhập rất chậm.",
        hint: "'very' đứng ở đâu so với tính từ?",
        options: ["very slow", "slow very", "very slowly", "slowly very"],
        correctAnswer: "very slow",
        explanation: "Sau 'is' dùng tính từ (slow), và 'very' đứng trước tính từ: very slow.",
      },
      {
        id: "fp-wo-3",
        type: "sentence_transform",
        promptEn: "Rewrite in the right order: 'I have a laptop very fast.'",
        promptVn: "Viết lại cho đúng trật tự: 'Tôi có một laptop rất nhanh.'",
        hint: "a + very + tính từ + danh từ.",
        correctAnswer: "I have a very fast laptop.",
        explanation: "Cụm 'very fast' đứng TRƯỚC danh từ 'laptop': a very fast laptop.",
      },
    ],
  },
];
