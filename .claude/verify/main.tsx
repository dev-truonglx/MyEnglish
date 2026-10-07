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
import FlashcardReview from "@/components/FlashcardReview";
import LearningInsightsCard from "@/components/LearningInsightsCard";
import HabitInsightsCard from "@/components/HabitInsightsCard";
import { logLearningEvent } from "@/services/learningEvents";
import AdvancedLearningSettings from "@/components/dashboard/AdvancedLearningSettings";
import { buildReviewSession, getNewCardsIntroducedToday } from "@/services/smartReview";
import { getDueWordsFromDb } from "@/services/db";
import ReviewTab from "@/components/dashboard/ReviewTab";
import { useWordsStore } from "@/stores/wordsStore";
import { summarizeTodayWork } from "@/services/smartReview";
import { applyComebackToWork, resolveComeback } from "@/services/comeback";
import { getLocalDateString } from "@/services/streak";
import OnboardingFlow from "@/components/OnboardingFlow";
import ReadingTab from "@/components/dashboard/ReadingTab";
import WritingTab from "@/components/dashboard/WritingTab";
import { saveMistakes } from "@/services/mistakes";

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

function Flash() {
  const [state, setState] = useState<{ session: any[]; all: any[] } | null>(null);
  React.useEffect(() => {
    (async () => {
      const due = await getDueWordsFromDb();
      const session = buildReviewSession(due, await getNewCardsIntroducedToday());
      setState({ session, all: await getAllWords() });
      (window as any).__session = session.map((c: any) => `${c.word}:${c.direction}`);
    })();
  }, []);
  return state ? (
    <div className="h-screen">
      <FlashcardReview wordsToReview={state.session} distractorPool={state.all} onFinish={() => {}} onExit={() => {}} />
    </div>
  ) : null;
}

function Insights() {
  React.useEffect(() => {
    (async () => {
      const base = { exerciseType: "multiple_choice" as const, responseTimeMs: 4000, wrongAttempts: 0, xpEarned: 10, direction: "recognition" as const };
      for (let i = 0; i < 30; i++) {
        const r = 0.7 + (i % 6) * 0.05;
        await saveReviewLog({ ...base, wordId: "w-deploy", isCorrect: i % 5 !== 0, rating: i % 5 === 0 ? 1 : 3, isScheduled: true,
          timestamp: new Date(Date.now() - i * 3600e3).toISOString(),
          before: { state: 2, stability: 5, difficulty: 5, retrievability: r, elapsedDays: 3 } });
      }
      window.dispatchEvent(new CustomEvent("words-changed"));
    })();
  }, []);
  return <div className="p-6 max-w-3xl mx-auto space-y-4"><LearningInsightsCard /><AdvancedLearningSettings /></div>;
}

function Habits() {
  const [words, setWords] = useState<any[] | null>(null);
  React.useEffect(() => {
    (async () => {
      const day = (d: number, h: number) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 5, 0, 0); return x; };
      for (let d = 0; d < 12; d++) {
        await logLearningEvent("nudge_shown", { at: day(d, 9) });
        await logLearningEvent(d % 4 === 0 ? "nudge_snoozed" : "nudge_opened", { at: day(d, 9) });
        await logLearningEvent("nudge_shown", { at: day(d, 15) });
        await logLearningEvent("nudge_ignored", { at: day(d, 15) });
        await logLearningEvent("popup_shown", { at: day(d, 9) });
        await logLearningEvent(d % 3 === 0 ? "popup_closed_early" : "popup_completed", { at: day(d, 9) });
      }
      for (let w = 0; w < 8; w++) for (let k = 0; k < (w * 3) % 7; k++) await logLearningEvent("mastered", { direction: "recognition", wordId: "w-deploy", at: day(w * 7, 10) });
      const base = { exerciseType: "multiple_choice" as const, responseTimeMs: 4000, wrongAttempts: 0, xpEarned: 10, direction: "recognition" as const, isCorrect: true, rating: 3, isScheduled: true };
      for (let i = 0; i < 40; i++) await saveReviewLog({ ...base, wordId: "w-deploy", timestamp: day(i % 10, i % 3 === 0 ? 21 : 9).toISOString() });
      setWords(await getAllWords());
    })();
  }, []);
  return words ? <div className="p-6 max-w-3xl mx-auto"><HabitInsightsCard words={words} /></div> : null;
}

// ?comeback: 45 reviews overdue and the last study 5 days ago -> today's share instead of the pile.
// ?comeback&done=N: N answers already given today.
function Comeback() {
  const [state, setState] = useState<any>(null);
  React.useEffect(() => {
    (async () => {
      const db = await getDatabase();
      for (let i = 0; i < 45; i++) {
        const id = `w-cb-${i}`;
        await db.execute(
          `INSERT OR REPLACE INTO words (id, word, part_of_speech, meaning_vn, synonyms, antonyms, topic, created_at) VALUES ($1,$2,'noun',$3,'[]','[]','DevOps',$4)`,
          [id, `term${i}`, `nghĩa ${i}`, iso(-40 * DAY)]
        );
        await db.execute(
          `INSERT OR REPLACE INTO srs_reviews (word_id, ease_factor, interval, repetitions, next_review_date, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps)
           VALUES ($1, 2.5, 5, 3, $2, 5, 5, 5, 5, 3, 0, 2, $3, 0)`,
          [id, iso(-(i % 9 + 1) * DAY), iso(-15 * DAY)]
        );
      }
      const d = new Date(); d.setDate(d.getDate() - 6);
      const done = Number(new URLSearchParams(location.search).get("done") || 0);
      localStorage.setItem("myenglish_study_logs_v1", JSON.stringify({ [getLocalDateString(d)]: 12, ...(done ? { [getLocalDateString()]: done } : {}) }));
      const words = await getAllWords();
      useWordsStore.setState({ words });
      const work = summarizeTodayWork(words, await getNewCardsIntroducedToday());
      const cb = resolveComeback(work.reviews, 30);
      setState({ cb, due: applyComebackToWork(work, cb).total });
    })();
  }, []);
  return state ? (
    <ReviewTab
      dueCount={state.due}
      comeback={state.cb}
      libraryStats={{ dueWords: [], learnedCount: 0, leechCount: 0, perTopic: {} }}
      availableTopics={[]}
      handleStartReview={() => ((window as any).__started = true)}
      setMessage={() => {}}
    />
  ) : null;
}

// ?onboarding: the first-run flow; the result is exposed on window.__onboarding
function Onboarding() {
  const [done, setDone] = useState<string | null>(null);
  return done ? (
    <pre className="p-6 text-xs">{done}</pre>
  ) : (
    <OnboardingFlow
      onFinish={async (startNow) => {
        const words = await getAllWords();
        const summary = { startNow, words: words.length, first: words.filter((w) => w.topic !== "DevOps" && w.topic !== "Food").sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 6).map((w) => `${w.word}:${w.cefr_level}`) };
        (window as any).__onboarding = summary;
        setDone(JSON.stringify(summary, null, 2));
      }}
    />
  );
}

// ?reading: the reading tab with a sample text already pasted
function Reading() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    (async () => {
      localStorage.setItem(
        "myenglish_reading_draft_v1",
        "We deployed the release on Friday, but the rollback took longer than expected.\n" +
          "The PUT endpoint must be idempotent: retrying the same request should not create duplicate records. " +
          "Our pipeline now validates the payload before it reaches the database, which reduced latency spikes."
      );
      useWordsStore.setState({ words: await getAllWords() });
      setReady(true);
    })();
  }, []);
  return ready ? <ReadingTab /> : null;
}

// ?writing: the writing tab; the AI correction is answered with a fixed sample, two old mistakes are due
function Writing() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    (async () => {
      (globalThis as any).__tauriInvoke = async (cmd: string) => {
        if (cmd !== "correct_writing_ai") return undefined;
        await new Promise((r) => setTimeout(r, 400));
        return JSON.stringify({
          score: 70,
          corrections: [
            { wrong: "I fix", right: "I fixed", sentence: "Yesterday I fixed the login bug.", category: "tense", why_vn: "Có 'yesterday' nên dùng quá khứ đơn." },
            { wrong: "a API", right: "an API", sentence: "Today I am writing an API for payments.", category: "article", why_vn: "API đọc bắt đầu bằng nguyên âm /eɪ/." },
          ],
          better_version: "Yesterday I fixed the login bug. Today I am writing an API for payments. No blockers.",
          explanation_vn: "Hai lỗi nhỏ về thì và mạo từ, ý rõ ràng.",
        });
      };
      const past = new Date(Date.now() - 3 * DAY);
      await saveMistakes([{ wrong: "He go", right: "He goes", category: "agreement", sentence: "He goes to the office every day.", whyVn: "Chủ ngữ số ít ở hiện tại đơn: thêm -es." },
        { wrong: "discuss about", right: "discuss", category: "preposition", sentence: "We need to discuss the plan.", whyVn: "discuss không đi với about." }], { source: "standup" }, past);
      localStorage.setItem("myenglish_standup_draft_v1", "Yesterday I fix the login bug. Today I am writing a API for payments. No blockers.");
      useWordsStore.setState({ words: await getAllWords() });
      setReady(true);
    })();
  }, []);
  return ready ? <WritingTab onOpenGrammarLesson={(id) => ((window as any).__lesson = id)} /> : null;
}

function App() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => {
    saveReminderSettings({ includeGrammar: false, wordsPerSession: 3, snoozeMinutes: 10, intervalMinutes: 30 });
    saveMnemonic("w-deploy", "Deploy = đẩy (ploy) code ra (de) server", "Triển khai");
    seed()
      .then(async () => {
        // ?milestone: "deploy" is fading (seen 80 days ago, stability 15): remembering it now crosses 21 days
        if (new URLSearchParams(location.search).has("milestone")) {
          const db = await getDatabase();
          await db.execute(`UPDATE srs_reviews SET stability = 15, difficulty = 4, reps = 5, state = 2, last_review = $1, next_review_date = $2 WHERE word_id = 'w-deploy'`, [iso(-80 * DAY), iso(-65 * DAY)]);
        }
      })
      .then(() => setReady(true));
  }, []);
  if (!ready) return <div>seeding…</div>;
  const q = new URLSearchParams(location.search);
  if (q.has("weekly")) return <Weekly />;
  if (q.has("flash")) return <Flash />;
  if (q.has("insights")) return <Insights />;
  if (q.has("habits")) return <Habits />;
  if (q.has("comeback")) return <Comeback />;
  if (q.has("onboarding")) return <Onboarding />;
  if (q.has("reading")) return <Reading />;
  if (q.has("writing")) return <Writing />;
  return q.has("nudge") ? <ReviewNudge onDone={() => ((window as any).__nudgeDone = true)} /> : <FocusReviewModal isPreview />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
