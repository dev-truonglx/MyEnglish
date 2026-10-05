import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import { getDatabase } from "@/services/db";
import { saveReminderSettings } from "@/services/reminderSettings";
import FocusReviewModal from "@/components/FocusReviewModal";
import ReviewNudge from "@/components/ReviewNudge";
import WeeklyProgressCard from "@/components/WeeklyProgressCard";
import { getAllWords } from "@/services/db";
import { saveReviewLog } from "@/services/smartReview";
import { saveMnemonic } from "@/services/aiMnemonic";

const DAY = 864e5;
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

async function seed() {
  const db = await getDatabase();
  const words: Array<[string, string, string, string, string, string | null]> = [
    // id, word, pos, meaning, topic, example
    ["w-new", "idempotent", "adjective", "Lũy đẳng: gọi nhiều lần vẫn cho cùng kết quả", "DevOps", "A PUT request should be idempotent."],
    ["w-deploy", "deploy", "verb", "Triển khai", "DevOps", "We deploy every Friday."],
    ["w-release", "release", "verb", "Phát hành", "DevOps", null],
    ["w-rollback", "rollback", "verb", "Hoàn tác phiên bản", "DevOps", null],
    ["w-pipeline", "pipeline", "noun", "Luồng xử lý", "DevOps", null],
    ["w-banana", "banana", "noun", "Quả chuối", "Food", null],
    ["w-apple", "apple", "noun", "Quả táo", "Food", null],
  ];
  for (const [id, word, pos, meaning, topic, ex] of words) {
    await db.execute(
      `INSERT OR REPLACE INTO words (id, word, part_of_speech, meaning_vn, synonyms, antonyms, topic, created_at) VALUES ($1,$2,$3,$4,'[]','[]',$5,$6)`,
      [id, word, pos, meaning, topic, iso(-5 * DAY)]
    );
    if (ex) await db.execute(`INSERT INTO examples (id, word_id, sentence_en, sentence_vn, grammar_analysis) VALUES ($1,$2,$3,$4,'')`, [`e-${id}`, id, ex, "Câu ví dụ."]);
    if (id !== "w-new") {
      await db.execute(
        `INSERT OR REPLACE INTO srs_reviews (word_id, ease_factor, interval, repetitions, next_review_date, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps)
         VALUES ($1, 2.5, 3, 3, $2, 3, 5, 3, 3, 3, 0, 2, $3, 0)`,
        [id, id === "w-deploy" ? iso(-60000) : iso(5 * DAY), iso(-3 * DAY)]
      );
    }
  }
}

function Weekly() {
  const [words, setWords] = useState<any[] | null>(null);
  React.useEffect(() => {
    (async () => {
      const base = { exerciseType: "multiple_choice" as const, responseTimeMs: 1000, wrongAttempts: 0, xpEarned: 10, direction: "recognition" as const, timestamp: new Date().toISOString() };
      for (let i = 0; i < 8; i++) await saveReviewLog({ ...base, wordId: "w-deploy", isCorrect: true, rating: 3, isScheduled: true });
      await saveReviewLog({ ...base, wordId: "w-release", isCorrect: false, rating: 1, isScheduled: true });
      setWords(await getAllWords());
    })();
  }, []);
  return words ? <div className="p-6 max-w-2xl mx-auto"><WeeklyProgressCard words={words} /></div> : null;
}

function App() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    saveReminderSettings({ includeGrammar: false, wordsPerSession: 3, snoozeMinutes: 10, intervalMinutes: 30 });
    saveMnemonic("w-deploy", "Deploy = đẩy (ploy) code ra (de) server", "Triển khai");
    seed().then(() => setReady(true));
  }, []);
  if (!ready) return <div>seeding…</div>;
  const q = new URLSearchParams(location.search);
  if (q.has("weekly")) return <Weekly />;
  return q.has("nudge") ? <ReviewNudge onDone={() => ((window as any).__nudgeDone = true)} /> : <FocusReviewModal isPreview />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
