// One immutable record per question, with every accepted attempt in play order.
// The first answer still determines the score; only a correct answer completes it.
export function recordAnswer(history, question, questionIndex, selectedOption) {
  if (!question || !Number.isInteger(questionIndex) || questionIndex < 0 ||
      questionIndex > history.length || questionIndex < history.length - 1 ||
      ![0, 1, -1].includes(selectedOption) || ![0, 1].includes(question.correct)) return null;
  const previous = history[questionIndex];
  if (previous?.completed || (questionIndex > 0 && !history[questionIndex - 1]?.completed)) return null;
  const snapshot = previous || {
    questionId: question.id ?? String(questionIndex + 1),
    questionIndex,
    questionText: question.text,
    options: Object.freeze([question.left, question.right]),
    correctAnswer: question.correct,
  };
  const attempt = Object.freeze({
    selectedAnswer: selectedOption === -1 ? null : selectedOption,
    isCorrect: selectedOption === snapshot.correctAnswer,
  });
  const first = previous?.attempts[0] || attempt;
  const record = Object.freeze({
    ...snapshot,
    // Retain the original answer fields for first-attempt scoring.
    selectedAnswer: first.selectedAnswer,
    isCorrect: first.isCorrect,
    firstTryCorrect: first.isCorrect,
    attempts: Object.freeze([...(previous?.attempts || []), attempt]),
    finalAnswer: attempt.isCorrect ? attempt.selectedAnswer : null,
    completed: attempt.isCorrect,
  });
  history[questionIndex] = record;
  return record;
}
