import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../answer-history.js',import.meta.url),'utf8');
const {recordAnswer}=await import('data:text/javascript,'+encodeURIComponent(source));

for (const count of [1, 5, 8, 10, 13, 17, 20, 30, 50, 301, 1000]) {
  const history = [];
  let firstTryCount = 0;
  for (let index = 0; index < count; index++) {
    const question = {id:'q-'+index, text:'Câu '+(index+1), left:'<', right:'>', correct:index%2};
    const firstTry = index%3===0;
    const choices = firstTry ? [question.correct] : [1-question.correct, -1, 1-question.correct, question.correct];
    let entry;
    for (const [attemptIndex, choice] of choices.entries()) {
      entry = recordAnswer(history, question, index, choice);
      assert.equal(history.length,index+1,'Retries stay in the same history entry');
      assert.equal(entry.questionIndex,index);
      assert.equal(entry.questionId,question.id);
      assert.equal(entry.attempts.length,attemptIndex+1);
      assert.equal(entry.attempts.at(-1).selectedAnswer,choice===-1?null:choice);
      assert.equal(entry.completed,choice===question.correct);
      assert.equal(entry.firstTryCorrect,firstTry);
      assert.equal(entry.isCorrect,firstTry,'Legacy scoring remains based on the first attempt');
      if (!entry.completed) {
        assert.equal(entry.finalAnswer,null);
        assert.equal(recordAnswer(history,question,index+1,question.correct),null,'Cannot skip an unfinished question');
      }
      assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.attempts) && Object.isFrozen(entry.attempts.at(-1)));
    }
    firstTryCount+=Number(firstTry);
    assert.equal(entry.finalAnswer,question.correct);
    assert.equal(entry.completed,true);
    assert.equal(recordAnswer(history,question,index,question.correct),null,'Completed questions cannot award another point or step');
    assert.equal(recordAnswer(history,question,index,1-question.correct),null);
    question.text='Changed';question.left='Changed';
    assert.equal(entry.questionText,'Câu '+(index+1));
    assert.deepEqual(entry.options,['<','>']);
  }
  assert.equal(history.length,count);
  assert.equal(history.filter(entry=>entry.firstTryCorrect).length,firstTryCount);
  assert.ok(history.every(entry=>entry.completed));
}
const history=[],q={text:'40 + 20 = ?',left:'60',right:'70',correct:0};
for (const bad of [-1,.5,1]) assert.equal(recordAnswer(history,q,bad,0),null);
assert.equal(recordAnswer(history,q,0,2),null);
assert.equal(recordAnswer(history,undefined,0,0),null);
const wrong=recordAnswer(history,q,0,1);
const corrected=recordAnswer(history,q,0,0);
assert.equal(corrected.questionId,'1');
assert.equal(wrong.attempts.length,1,'Earlier snapshots do not change');
assert.equal(wrong.completed,false);
assert.deepEqual(corrected.attempts,[{selectedAnswer:1,isCorrect:false},{selectedAnswer:0,isCorrect:true}]);
assert.equal(corrected.selectedAnswer,1,'Keep the original answer for scoring');
assert.equal(corrected.finalAnswer,0);
console.log('Answer history: retries, timeouts, immutable attempts, first-answer scoring, completion and duplicate guards passed.');
