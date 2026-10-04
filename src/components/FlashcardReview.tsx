import { parseTerms, type WordDetail, type ReviewCard } from "@/types/database";
import MultipleChoiceExercise from "./exercises/MultipleChoiceExercise";
import SentenceBuilderExercise from "./exercises/SentenceBuilderExercise";
import ContextMatchExercise from "./exercises/ContextMatchExercise";
import ListeningDictationExercise from "./exercises/ListeningDictationExercise";
import ReverseClozeExercise from "./exercises/ReverseClozeExercise";
import { useReviewSession } from "@/hooks/useReviewSession";
import { wordFormsPattern } from "@/services/smartReview";
import { handleSpeak } from "./review/speech";
import SessionSummary from "./review/SessionSummary";
import ReviewTopBar from "./review/ReviewTopBar";
import CardBadges from "./review/CardBadges";
import FlipCard from "./review/FlipCard";
import ClozeCard from "./review/ClozeCard";
import SpellingCard from "./review/SpellingCard";
import GradingBar from "./review/GradingBar";

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

  // Prepare cloze sentence: replace word with blank
  const primaryExample = currentWord.examples[0];
  const originalSentence =
    primaryExample?.sentence_en ||
    `Developers frequently need to manage and inspect ${currentWord.word} in modern distributed software.`;

  // Mask the word (escaped, with inflections) so terms like "c++" or ".net" can't break the regex
  // (every occurrence is masked, otherwise a second occurrence would reveal the answer)
  const wordPattern = new RegExp(wordFormsPattern(currentWord.word), "gi");
  const clozeDisplaySentence = wordPattern.test(originalSentence)
    ? originalSentence.replace(wordPattern, "____[ ? ]____")
    : `${originalSentence} (Ngữ cảnh cần từ: ____[ ? ]____)`;

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
        onClick={effectiveExerciseType === "flip" ? () => setIsFlipped((prev) => !prev) : undefined}
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
        {/* Top Badges */}
        <CardBadges
          currentWord={currentWord}
          showXPPopup={showXPPopup}
          lastXPReward={lastXPReward}
          effectiveExerciseType={effectiveExerciseType}
          mode={mode}
        />

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
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("context_match", attempts, rating), "context_match", attempts);
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
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("listening", attempts, rating), "listening", attempts);
              }}
              onSpeak={(t, rate) => handleSpeak(t, rate)}
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
        {effectiveExerciseType === "flip" && (
          <FlipCard
            currentWord={currentWord}
            synonyms={synonyms}
            isFlipped={isFlipped}
            setIsFlipped={setIsFlipped}
          />
        )}

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
      <GradingBar
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
      />
    </div>
  );
}
