// Snapshot each submitted answer in play order, including timeouts.
// Touch and tilt both use the guarded submission in app.js.
export function recordAnswer(history, question, questionIndex, selectedOption) {
  if (!question || questionIndex !== history.length ||
      ![0, 1, -1].includes(selectedOption) || ![0, 1].includes(question.correct)) return null;
  const record = Object.freeze({
    questionId: question.id ?? String(questionIndex + 1),
    questionIndex,
    questionText: question.text,
    options: Object.freeze([question.left, question.right]),
    selectedAnswer: selectedOption === -1 ? null : selectedOption,
    correctAnswer: question.correct,
    isCorrect: selectedOption === question.correct,
  });
  history.push(record);
  return record;
}
