const fs = require('fs');

let content = fs.readFileSync('src/components/FlashcardReview.tsx', 'utf8');

content = content.replace(/import ContextMatchExercise from "\.\/exercises\/ContextMatchExercise";/, 'import ContextMatchExercise from "./exercises/ContextMatchExercise";\nimport MeaningMatchExercise from "./exercises/MeaningMatchExercise";');

const contextMatchBlock = `
        {/* ----------------- MODE: CONTEXT MATCH ----------------- */}
        {effectiveExerciseType === "context_match" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <ContextMatchExercise
              key={\`\${currentWord.id}-\${currentIndex}\`}
              word={currentWord}
              allWords={distractorPool && distractorPool.length >= 4 ? distractorPool : wordsToReview}
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("context_match", attempts, rating), "context_match", attempts);
              }}
              onSpeak={(t) => handleSpeak(t)}
              onFallback={() => setFallbackMode("multiple_choice")}
            />
          </div>
        )}`;

const meaningMatchBlock = `
        {/* ----------------- MODE: MEANING MATCH (MINI-GAME) ----------------- */}
        {effectiveExerciseType === "meaning_match" && (
          <div className="flex-1 min-h-0 flex flex-col justify-center py-2 overflow-y-auto">
            <MeaningMatchExercise
              key={\`\${currentWord.id}-\${currentIndex}\`}
              word={currentWord}
              allWords={distractorPool && distractorPool.length >= 4 ? distractorPool : wordsToReview}
              onComplete={(_isCorrect, attempts, rating) => {
                handleGrade(gradeExercise("meaning_match", attempts, rating), "meaning_match", attempts);
              }}
              onSpeak={(t) => handleSpeak(t)}
              onFallback={() => setFallbackMode("multiple_choice")}
            />
          </div>
        )}`;

content = content.replace(contextMatchBlock, contextMatchBlock + '\n' + meaningMatchBlock);

fs.writeFileSync('src/components/FlashcardReview.tsx', content);
