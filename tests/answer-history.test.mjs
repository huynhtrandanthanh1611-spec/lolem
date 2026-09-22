import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../answer-history.js',import.meta.url),'utf8');
const {recordAnswer}=await import('data:text/javascript,'+encodeURIComponent(source));

for (const count of [1, 5, 8, 10, 13, 17, 20, 30, 50, 301, 1000]) {
  const history = [];
  let correct = 0;
  for (let index = 0; index < count; index++) {
    const question = {id: 'q-' + index, text: 'Câu ' + (index + 1), left: '<', right: '>', correct: index % 2};
    const selected = index % 3 === 0 ? question.correct : index % 3 === 1 ? 1 - question.correct : -1;
    const result = recordAnswer(history, question, index, selected);
    assert.equal(result.questionIndex, index);
    assert.equal(result.questionId, question.id);
    assert.equal(result.isCorrect, selected === question.correct);
    assert.equal(result.selectedAnswer, selected === -1 ? null : selected);
    assert.equal(result.correctAnswer, question.correct);
    assert.deepEqual(result.options, ['<', '>']);
    correct += Number(result.isCorrect);
    // A second touch/tilt event for the same question cannot create another entry.
    assert.equal(recordAnswer(history, question, index, 1 - question.correct), null);
    question.text = 'Changed after play'; question.left = 'Changed option';
    assert.equal(result.questionText, 'Câu ' + (index + 1));
    assert.equal(result.options[0], '<');
  }
  assert.equal(history.length, count);
  assert.equal(history.at(-1).questionIndex, count - 1);
  assert.equal(history.filter(answer => answer.isCorrect).length, correct);
}
const history = [], q = {text:'A', left:'B', right:'C', correct:0};
assert.equal(recordAnswer(history, q, 1, 0), null, 'Cannot skip a question');
assert.equal(recordAnswer(history, q, 0, 2), null, 'Reject invalid options');
assert.equal(recordAnswer(history, undefined, 0, 0), null);
assert.equal(history.length, 0);
assert.equal(recordAnswer(history, q, 0, 0).questionId, '1');
console.log('Answer history: dynamic rounds, snapshots, timeouts and duplicate submissions passed.');
