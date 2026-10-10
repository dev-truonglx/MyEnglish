export type GrammarLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export type SyntaxRole =
  | "subject"
  | "verb"
  | "auxiliary"
  | "object"
  | "modifier"
  | "complement"
  | "connector";

export interface SyntaxToken {
  text: string;
  role: SyntaxRole;
  label: string; // e.g. "Chủ ngữ (S)", "Động từ chính (V)", "Trợ động từ", "Tân ngữ (O)"
}

export interface GrammarExample {
  sentenceEn: string;
  sentenceVn: string;
  contextNote?: string; // e.g. "Hành động lặp đi lặp lại", "Code/Hệ thống"
  breakdown?: SyntaxToken[];
}

export interface GrammarMistake {
  wrong: string;
  correct: string;
  explanation: string;
}

export interface GrammarContrast {
  titleA: string;
  titleB: string;
  descriptionA: string;
  descriptionB: string;
  exampleA: string;
  exampleB: string;
  keyRule: string;
}

export type ExerciseType =
  | "multiple_choice"
  | "conjugation"
  | "error_spotting"
  | "sentence_transform";

export interface GrammarExercise {
  id: string;
  type: ExerciseType;
  promptEn: string;
  promptVn?: string;
  hint?: string;
  options?: string[]; // for multiple_choice
  correctAnswer: string | string[]; // possible normalized variants
  correctSentence?: string; // full canonical correct English sentence (useful for error_spotting / transformations)
  errorWord?: string; // for error_spotting (token to highlight)
  errorExplanation?: string;
  explanation: string;
  breakdown?: SyntaxToken[];
}

/** How the structure differs from Vietnamese: the source of most beginner mistakes */
export interface VnContrast {
  title: string;
  points: Array<{
    /** The Vietnamese way of saying it */
    vn: string;
    /** The English sentence */
    en: string;
    /** Why they differ, in Vietnamese */
    note: string;
  }>;
}

export interface GrammarLesson {
  id: string;
  level: GrammarLevel;
  category: string; // e.g. "Tenses", "Modals", "Clauses", "Conditionals"
  order: number;
  title: string;
  titleVn: string;
  tagline: string; // Tóm tắt ngắn 1 dòng
  formula: {
    positive: string;
    negative: string;
    question: string;
  };
  /** Labels of the three formulas when they are not affirmative / negative / question */
  formulaLabels?: {
    positive: string;
    negative: string;
    question: string;
  };
  timeSignals: string[]; // Dấu hiệu nhận biết: always, usually, right now, yesterday...
  usagePoints: Array<{
    title: string;
    description: string;
    examples: GrammarExample[];
  }>;
  contrast?: GrammarContrast;
  commonMistakes: GrammarMistake[];
  /** Foundation lesson for absolute beginners (A0/A1): studied first, not part of the A1 level check */
  foundation?: boolean;
  vnContrast?: VnContrast;
  diagnosticExercises: GrammarExercise[]; // 2-3 câu làm kiểm tra đầu vào trước
  practiceExercises: GrammarExercise[]; // 3-4 câu luyện tập củng cố
}

export type DiagnosticStatus =
  | "unattempted"
  | "passed_first_try"
  | "reviewed_and_passed"
  | "needs_work";

export interface GrammarProgress {
  lessonId: string;
  diagnosticStatus: DiagnosticStatus;
  score: number; // 0 - 100%
  mastery: number; // 0 - 100%
  reps: number; // số lần ôn
  lapses: number; // số lần làm sai
  lastAttemptDate?: string;
  nextReviewDate: string; // ISO date string
  streak: number;
  firstTryBonusAwarded?: boolean; // first-try XP bonus is only given once per lesson
  // FSRS memory state of the lesson (absent on progress saved before grammar used FSRS)
  stability?: number;
  difficulty?: number;
  fsrsState?: number; // ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning
  lastReview?: string; // last attempt that updated the schedule (lastAttemptDate counts every attempt)
}
