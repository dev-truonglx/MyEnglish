/** Pronunciation lessons for beginners (src/data/pronunciation.ts), played with the system text-to-speech */

/** A word or short phrase the learner listens to */
export interface PronunciationItem {
  text: string;
  /** US IPA, e.g. "/kæʃ/" */
  ipa: string;
  /** Short Vietnamese note (meaning, or what to pay attention to) */
  note?: string;
}

/** Two words that differ by the one sound the lesson is about (ship / sheep) */
export interface MinimalPair {
  a: PronunciationItem;
  b: PronunciationItem;
}

/** One listening question: the app speaks `say`, the learner picks an option */
export interface PronunciationQuizItem {
  /** What the text-to-speech says (a single word or a short phrase) */
  say: string;
  /** Question in Vietnamese, e.g. "Bạn nghe thấy từ nào?" or "Đuôi -ed trong từ này đọc là?" */
  question: string;
  /** 2–3 options; exactly one equals `answer` */
  options: string[];
  answer: string;
  /** Why, in Vietnamese (shown after answering) */
  explanation: string;
}

export interface PronunciationLesson {
  id: string;
  order: number;
  title: string;
  /** One line: what the learner will be able to do */
  tagline: string;
  /** 2–4 short Vietnamese paragraphs: what the sound is and why Vietnamese speakers get it wrong */
  intro: string[];
  /** How to make the sound (mouth, tongue, airflow), in Vietnamese */
  tips: string[];
  examples: PronunciationItem[];
  pairs?: MinimalPair[];
  quiz: PronunciationQuizItem[];
}
