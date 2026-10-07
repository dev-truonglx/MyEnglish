import { parseTerms, type WordDetail, type ReviewCard } from "@/types/database";
import MultipleChoiceExercise from "./exercises/MultipleChoiceExercise";
import SentenceBuilderExercise from "./exercises/SentenceBuilderExercise";
import ContextMatchExercise from "./exercises/ContextMatchExercise";
import MeaningMatchExercise from "./exercises/MeaningMatchExercise";
import ListeningDictationExercise from "./exercises/ListeningDictationExercise";
import ReverseClozeExercise from "./exercises/ReverseClozeExercise";
import FreeWritingExercise from "./exercises/FreeWritingExercise";
import { getUserOverrideLevel } from "@/services/userProficiency";
import { useReviewSession } from "@/hooks/useReviewSession";
import { pickExample, wordFormsPattern } from "@/services/smartReview";
import { handleSpeak } from "./review/speech";
import SessionSummary from "./review/SessionSummary";
import ReviewTopBar from "./review/ReviewTopBar";
import CardBadges from "./review/CardBadges";
import FlipCard from "./review/FlipCard";
import ClozeCard from "./review/ClozeCard";
import SpellingCard from "./review/SpellingCard";
import GradingBar from "./review/GradingBar";
import PretestCard, { PretestFeedback } from "./review/PretestCard";

export type { StudyMode } from "@/hooks/useReviewSession";

interface FlashcardReviewProps {
  /** Cards to review (plain words are treated as recognition cards) */
  wordsToReview: Array<WordDetail | ReviewCard>;
  /** Full vocabulary used for multiple-choice / context-match distractors */
  distractorPool?: WordDetail[];
  /** Extra practice outside the schedule: answers are logged but FSRS is not updated */
  practiceMode?: boolean;
  onFinish: () => void;
  onExit: () => void;
}

export default function FlashcardReview({
  wordsToReview,
  distractorPool,
  practiceMode = false,
  onFinish,
  onExit,
}: FlashcardReviewProps) {
  const {
    revealedWithoutRecall,
    pendingRating,
    confirmCorrectAnswer,
    mode,
    handleModeChange,
    setFallbackMode,
    queue,
    currentIndex,
    currentWord,
    effectiveExerciseType,
    isFlipped,
    setIsFlipped,
    reviewCount,
    sessionCompleted,
    lastResult,
    intervalPreviews,
    userInput,
    setUserInput,
    hasCheckedAnswer,
    isCorrect,
    showHint,
    setShowHint,
    wrongAttempts,
    isShaking,
    feedbackMessage,
    setFeedbackMessage,
    isAdvancing,
    sessionStats,
    lastXPReward,
    showXPPopup,
    xpState,
    inputRef,
    gradeExercise,
    handleGrade,
    handleCheckAnswer,
    handleSkip,
    handleShowAnswer,
    consecutiveCorrect,
    isIntroCard,
    handleIntroDone,
    pretest,
    isPretestCard,
    pretestResult,
    handlePretestDone,
    exerciseCountsForSchedule,
    quizRightAfterIntro,
    celebration,
  } = useReviewSession({ wordsToReview, distractorPool, practiceMode });

  // Session Completed view with Learning Evaluation Metrics
  if (sessionCompleted) {
    return (
      <SessionSummary
        wordsToReview={wordsToReview}
        sessionStats={sessionStats}
        reviewCount={reviewCount}
        xpState={xpState}
        lastResult={lastResult}
        onFinish={onFinish}
      />
    );
  }

  if (!currentWord) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <p className="text-slate-500 dark:text-zinc-400 text-xs">Không có thẻ nào cần ôn tập hôm nay.</p>
        <button onClick={onExit} className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">
          Quay lại
        </button>
      </div>
    );
  }

  const synonyms = parseTerms(currentWord.synonyms);

  // Cloze sentence: the example for this review (rotated, the learner's own sentence first). Only
  // sentences that contain the word are used; without one the cloze falls back to spelling.
  const clozeExample = pickExample(currentWord);
  const originalSentence = clozeExample?.sentence_en ?? "";

  // Mask the word (escaped, with inflections) so terms like "c++" or ".net" can't break the regex
  // (every occurrence is masked, otherwise a second occurrence would reveal the answer)
  const wordPattern = new RegExp(wordFormsPattern(currentWord.word), "gi");
  const clozeDisplaySentence = originalSentence.replace(wordPattern, "____[ ? ]____");
  // Words still to come in this session: never shown inside another card's exercise
  const upcomingIds = new Set(queue.slice(currentIndex + 1).map((c) => c.id));

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-4 md:p-6 max-w-2xl mx-auto w-full select-none h-full min-h-[620px]">
      {/* Top Bar with Mode Selector & Progress */}
      <ReviewTopBar
        onExit={onExit}
        mode={mode}
        handleModeChange={handleModeChange}
        currentIndex={currentIndex}
        queue={queue}
        currentWord={currentWord}
        practiceMode={practiceMode}
      />

      {/* FLASHCARD BODY CONTAINER - Rock solid vertical height */}
      <div
        onClick={effectiveExerciseType === "flip" && !isIntroCard ? () => setIsFlipped((prev) => !prev) : undefined}
        className={`w-full flex-1 my-auto min-h-[520px] h-[560px] md:h-[580px] max-h-[78vh] overflow-hidden rounded-3xl border bg-white dark:bg-zinc-950 p-5 md:p-6 shadow-xl dark:shadow-2xl flex flex-col justify-between transition-all relative ${
          effectiveExerciseType === "flip" ? "cursor-pointer hover:border-slate-400 dark:hover:border-zinc-700/80" : ""
        } ${
          hasCheckedAnswer
            ? isCorrect
              ? "border-emerald-500/60 shadow-emerald-500/10"
              : "border-rose-500/60 shadow-rose-500/10"
            : "border-slate-200 dark:border-zinc-800"
        }`}
      >
        {celebration && (
          <div
            role="status"
            className={`absolute left-1/2 -translate-x-1/2 top-2 z-50 max-w-[90%] px-4 py-2 rounded-2xl shadow-lg border text-left animate-in fade-in slide-in-from-top-2 duration-200 ${
              celebration.kind === "mastered"
                ? "bg-emerald-600 border-emerald-400 text-white"
                : "bg-violet-600 border-violet-400 text-white"
            }`}
          >
            <div className="text-xs font-bold">{celebration.title}</div>
            <div className="text-[11px] opacity-90">{celebration.detail}</div>
          </div>
        )}
        {/* Combo is a visual cheer only: it earns no XP (speed and streaks of easy answers are not rewarded) */}
        {consecutiveCorrect >= 3 && !celebration && (
          <div className="absolute -top-3 -right-3 z-50 animate-bounce">
            <div className="px-3 py-1 bg-gradient-to-r from-orange-500 to-rose-600 text-white font-black rounded-xl text-sm shadow-lg border-2 border-white/50 dark:border-zinc-800 flex items-center gap-1.5 transform rotate-3">
              <span className="text-lg">🔥</span>
              <span>Combo x{consecutiveCorrect}!</span>
            </div>
          </div>
        )}
        {/* Top Badges */}
        <CardBadges
          currentWord={currentWord}
          showXPPopup={showXPPopup}
          lastXPReward={lastXPReward}
          effectiveExerciseType={effectiveExerciseType}
          mode={mode}
        />
        {isPretestCard ? null : isIntroCard ? (
          <div className="mt-1 space-y-1.5">
            {pretestResult && <PretestFeedback result={pretestResult} />}
            <div className="text-center text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
              {currentWord.srs.reps ? "🔁 Học lại từ hay quên" : "✨ Từ mới"} — đọc nghĩa, ví dụ và nghe phát âm. Bạn sẽ được hỏi lại sau vài thẻ.
            </div>
          </div>
        ) : quizRightAfterIntro ? (
          <div className="mt-1 text-center text-[11px] text-cyan-700 dark:text-cyan-300">
            Vừa xem từ này xong nên câu này chỉ để luyện — lần chấm điểm đầu tiên sẽ là lúc gặp lại sau khoảng 10 phút.
          </div>
        ) : !practiceMode && !exerciseCountsForSchedule ? (
          <div className="mt-1 text-center text-[11px] text-amber-700 dark:text-amber-300">
            Dạng bài này không kiểm tra {currentWord.direction === "production" ? "khả năng tự nhớ ra từ" : "việc hiểu nghĩa"} của thẻ này — chỉ tính là luyện thêm, lịch ôn không đổi.
          </div>
        ) : null}

        {/* ----------------- MODE: MULTIPLE CHOICE ----------------- */}
        {effectiveExerciseType === "multiple_choice" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <MultipleChoiceExercise
              key={`${currentWord.id}-${currentIndex}`}
              word={currentWord}
              allWords={distractorPool && distractorPool.length >= 4 ? distractorPool : wordsToReview}
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("multiple_choice", attempts, rating), "multiple_choice", attempts);
              }}
              onSpeak={(t) => handleSpeak(t)}
            />
          </div>
        )}

        {/* ----------------- MODE: SENTENCE BUILDER ----------------- */}
        {effectiveExerciseType === "sentence_builder" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <SentenceBuilderExercise
              key={`${currentWord.id}-${currentIndex}`}
              word={currentWord}
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("sentence_builder", attempts, rating), "sentence_builder", attempts);
              }}
              onSpeak={(t) => handleSpeak(t)}
              onFallback={() => setFallbackMode("flip")}
            />
          </div>
        )}

        {/* ----------------- MODE: CONTEXT MATCH ----------------- */}
        {effectiveExerciseType === "context_match" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <ContextMatchExercise
              key={`${currentWord.id}-${currentIndex}`}
              word={currentWord}
              allWords={distractorPool && distractorPool.length >= 4 ? distractorPool : wordsToReview}
              excludeIds={upcomingIds}
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("context_match", attempts, rating), "context_match", attempts);
              }}
              onSpeak={(t) => handleSpeak(t)}
              onFallback={() => setFallbackMode("multiple_choice")}
            />
          </div>
        )}

        {/* ----------------- MODE: MEANING MATCH (MINI-GAME) ----------------- */}
        {effectiveExerciseType === "meaning_match" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <MeaningMatchExercise
              key={`${currentWord.id}-${currentIndex}`}
              word={currentWord}
              allWords={distractorPool && distractorPool.length >= 4 ? distractorPool : wordsToReview}
              excludeIds={upcomingIds}
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("meaning_match", attempts, rating), "meaning_match", attempts);
              }}
              onSpeak={(t) => handleSpeak(t)}
              onFallback={() => setFallbackMode("multiple_choice")}
            />
          </div>
        )}

        {/* ----------------- MODE: LISTENING DICTATION ----------------- */}
        {effectiveExerciseType === "listening" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <ListeningDictationExercise
              key={`${currentWord.id}-${currentIndex}`}
              word={currentWord}
              allWords={distractorPool && distractorPool.length >= 4 ? distractorPool : wordsToReview}
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("listening", attempts, rating), "listening", attempts);
              }}
              onSpeak={(t, rate) => handleSpeak(t, rate)}
            />
          </div>
        )}

        {/* ----------------- MODE: FREE WRITING (AI-graded own sentence) ----------------- */}
        {effectiveExerciseType === "free_writing" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <FreeWritingExercise
              key={`${currentWord.id}-${currentIndex}`}
              word={currentWord}
              level={getUserOverrideLevel() ?? undefined}
              onComplete={(_isCorrect, attempts, rating) => handleGrade(rating, "free_writing", attempts)}
              onSpeak={(t) => handleSpeak(t)}
              onFallback={() => setFallbackMode("spelling")}
            />
          </div>
        )}

        {/* ----------------- MODE: REVERSE CLOZE ----------------- */}
        {effectiveExerciseType === "reverse_cloze" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <ReverseClozeExercise
              key={`${currentWord.id}-${currentIndex}`}
              word={currentWord}
              allWords={distractorPool && distractorPool.length >= 4 ? distractorPool : wordsToReview}
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("reverse_cloze", attempts, rating), "reverse_cloze", attempts);
              }}
              onSpeak={(t) => handleSpeak(t)}
              onFallback={() => setFallbackMode("flip")}
            />
          </div>
        )}

        {/* ----------------- MODE 1: STANDARD FLIP ----------------- */}
        {effectiveExerciseType === "flip" &&
          (isPretestCard && pretest ? (
            <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
              <PretestCard question={pretest} phonetic={currentWord.phonetic} onDone={handlePretestDone} />
            </div>
          ) : (
            <FlipCard
              currentWord={currentWord}
              synonyms={synonyms}
              isFlipped={isFlipped}
              setIsFlipped={setIsFlipped}
            />
          ))}

        {/* ----------------- MODE 2: CLOZE DELETION ----------------- */}
        {effectiveExerciseType === "cloze" && (
          <ClozeCard
            currentWord={currentWord}
            hasCheckedAnswer={hasCheckedAnswer}
            inputRef={inputRef}
            userInput={userInput}
            setUserInput={setUserInput}
            feedbackMessage={feedbackMessage}
            setFeedbackMessage={setFeedbackMessage}
            isAdvancing={isAdvancing}
            isCorrect={isCorrect}
            isShaking={isShaking}
            wrongAttempts={wrongAttempts}
            showHint={showHint}
            setShowHint={setShowHint}
            handleSkip={handleSkip}
            handleShowAnswer={handleShowAnswer}
            originalSentence={originalSentence}
            clozeDisplaySentence={clozeDisplaySentence}
          />
        )}

        {/* ----------------- MODE 3: SPELLING PRACTICE ----------------- */}
        {effectiveExerciseType === "spelling" && (
          <SpellingCard
            currentWord={currentWord}
            hasCheckedAnswer={hasCheckedAnswer}
            inputRef={inputRef}
            userInput={userInput}
            setUserInput={setUserInput}
            feedbackMessage={feedbackMessage}
            setFeedbackMessage={setFeedbackMessage}
            isAdvancing={isAdvancing}
            isCorrect={isCorrect}
            isShaking={isShaking}
            wrongAttempts={wrongAttempts}
            showHint={showHint}
            setShowHint={setShowHint}
            handleSkip={handleSkip}
            handleShowAnswer={handleShowAnswer}
          />
        )}

      </div>

      {/* BOTTOM ACTION BAR - Always present with fixed height (h-14) so card NEVER jumps */}
      {isPretestCard ? <div className="w-full mt-3 h-14 shrink-0" /> : <GradingBar
        effectiveExerciseType={effectiveExerciseType}
        handleGrade={handleGrade}
        isAdvancing={isAdvancing}
        isFlipped={isFlipped}
        setIsFlipped={setIsFlipped}
        hasCheckedAnswer={hasCheckedAnswer}
        isCorrect={isCorrect}
        intervalPreviews={intervalPreviews}
        handleCheckAnswer={handleCheckAnswer}
        userInput={userInput}
        onlyAgain={revealedWithoutRecall}
        allowEasy={currentWord.direction === "production"}
        pendingRating={pendingRating}
        onContinue={confirmCorrectAnswer}
        introMode={isIntroCard}
        onIntroDone={handleIntroDone}
      />}
    </div>
  );
}
