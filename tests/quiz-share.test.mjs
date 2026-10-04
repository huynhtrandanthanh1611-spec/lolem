import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {randomBytes} from 'node:crypto';
const source=fs.readFileSync(new URL('../quiz-share.js',import.meta.url),'utf8');
const moduleURL='data:text/javascript,'+encodeURIComponent(source);
const {createShareLink,loadSharedQuiz,questionsFromSnapshot,createSnapshot,hasSharedQuiz,MAX_SHARE_URL_LENGTH,MAX_SNAPSHOT_BYTES}=await import(moduleURL);
const {recordAnswer}=await import('data:text/javascript,'+encodeURIComponent(fs.readFileSync(new URL('../answer-history.js',import.meta.url),'utf8')));
const {journeyLayout}=await import('data:text/javascript,'+encodeURIComponent(fs.readFileSync(new URL('../journey-layout.js',import.meta.url),'utf8')));
const base='https://huynhtrandanthanh1611-spec.github.io/lolem/';
const makeQuestions=count=>Array.from({length:count},(_,i)=>({id:'test-'+i,text:`Câu ${i+1}: Từ nào chỉ hoạt động?`,left:'đọc sách',right:'quyển sách',correct:i%2,category:'Tiếng Việt – lớp 2'}));
const forged=snapshot=>base+'?quiz='+snapshot.quizId+'#data=1.'+gzipSync(JSON.stringify(snapshot)).toString('base64url');

for(const count of [1,5,10,17,20,100]){
  const teacher=makeQuestions(count), original=structuredClone(teacher);
  const shared=await createShareLink(base+'?old=1#home',teacher,'Tiếng Việt lớp 2',{shuffle:false,seconds:15});
  assert.ok(shared.url.length<=MAX_SHARE_URL_LENGTH);
  assert.ok(hasSharedQuiz(shared.url));
  assert.equal(new URL(shared.url).searchParams.has('old'),false);
  teacher[0].text='Giáo viên sửa sau khi gửi';teacher.reverse();
  const snapshot=await loadSharedQuiz(shared.url),student=questionsFromSnapshot(snapshot);
  assert.deepEqual(student,original,'Link is an immutable snapshot, independent from teacher edits');
  assert.equal(snapshot.settings.seconds,15);
  assert.equal(snapshot.title,'Tiếng Việt lớp 2');
  assert.ok(Object.isFrozen(snapshot.questions[0].options));
  assert.throws(()=>{student[0].correct=1},TypeError);
  assert.deepEqual(questionsFromSnapshot(await loadSharedQuiz(shared.url)),original,'Refresh restores the entire quiz');
  const history=[];
  student.forEach((q,i)=>recordAnswer(history,q,i,i<14?q.correct:1-q.correct));
  assert.equal(history.length,count);
  assert.equal(history.filter(q=>q.isCorrect).length,Math.min(14,count));
  const layout=journeyLayout(count,count-1,700,84);
  assert.equal(layout.positions.length,count);
  assert.equal(layout.currentStep,count-1);
  assert.ok(700-(layout.positions.at(-1)-layout.scrollLeft)>0,'Last pedestal leaves space toward the prince');
  // A completely separate process gets ONLY the URL, with all browser storage forbidden.
  const isolated=spawnSync(process.execPath,['--input-type=module','-e',`
    Object.defineProperty(globalThis,'localStorage',{get(){throw Error('No teacher storage')}});
    Object.defineProperty(globalThis,'sessionStorage',{get(){throw Error('Private session')}});
    const mod=await import(${JSON.stringify(moduleURL)});
    const quiz=await mod.loadSharedQuiz(process.argv[1]);
    process.stdout.write(JSON.stringify(mod.questionsFromSnapshot(quiz)));
  `,shared.url],{encoding:'utf8'});
  assert.equal(isolated.status,0,isolated.stderr);
  assert.deepEqual(JSON.parse(isolated.stdout),original,'New device without any teacher storage receives the exact quiz');
  console.log(`Shared ${count} questions: ${shared.url.length} URL characters; isolated load, refresh, history and final pedestal passed.`);
}

for(const bad of [[],[{text:'',left:'A',right:'B',correct:0}],[{text:'A',left:' ',right:'B',correct:0}],[{text:'A',left:'B',right:'C'}],[{text:'A',left:'B',right:'C',correct:2}]]){
  await assert.rejects(()=>createShareLink(base,bad),/hoàn tất/);
}
await assert.rejects(()=>createShareLink(base,[{...makeQuestions(1)[0],image:'data:image/png;base64,abcd'}]),/URL ảnh công khai/);
await assert.rejects(()=>createShareLink(base,[{...makeQuestions(1)[0],image:'blob:https://example.com/123'}]),/URL ảnh công khai/);
const external=[{...makeQuestions(1)[0],imageURL:'https://example.com/flower.webp',metadata:{topic:'Hoạt động'}}];
assert.deepEqual(questionsFromSnapshot(await loadSharedQuiz((await createShareLink(base,external)).url)),external);
const a=await createShareLink(base,makeQuestions(1)),b=await createShareLink(base,makeQuestions(1));
assert.notEqual(a.snapshot.quizId,b.snapshot.quizId,'Regenerating produces a new ID');
for(const url of [base+'?quiz=missing',base+'?quiz=',a.url.slice(0,-7),a.url.replace(a.snapshot.quizId,b.snapshot.quizId),base+'?quiz=unknown#data=1.%%%25',a.url.replace('#data=1.','#data=9.'),a.url+'&data=duplicate']){
  await assert.rejects(()=>loadSharedQuiz(url),/Không tìm thấy/);
}
for(const change of [s=>s.questions=[],s=>s.questions[0].correctAnswer=4,s=>s.questions[0].options=['A'],s=>s.questions.push(s.questions[0]),s=>s.settings.seconds=-1,s=>s.questions[0].extra={image:'data:image/png;base64,a'},s=>s.version=99]){
  const forgedSnapshot=structuredClone(a.snapshot);change(forgedSnapshot);
  await assert.rejects(()=>loadSharedQuiz(forged(forgedSnapshot)),/Không tìm thấy/);
}
const duplicates=makeQuestions(3);duplicates[0].id='question-2';duplicates[1].id='question-2';duplicates[2].id='question-2';
const unique=await loadSharedQuiz((await createShareLink(base,duplicates)).url);
assert.equal(new Set(unique.questions.map(q=>q.id)).size,3);
const huge=makeQuestions(60).map(q=>({...q,text:randomBytes(130).toString('hex'),left:randomBytes(65).toString('hex'),right:randomBytes(65).toString('hex')}));
await assert.rejects(()=>createShareLink(base,huge),/quá lớn/);
const bomb={...a.snapshot,padding:'x'.repeat(MAX_SNAPSHOT_BYTES+1)};
await assert.rejects(()=>loadSharedQuiz(forged(bomb)),/Không tìm thấy/);
assert.equal(hasSharedQuiz(base+'#home'),false);
assert.equal(hasSharedQuiz(base+'?quiz=missing'),true);
console.log('Validation, unique snapshots, read-only data, external assets, malformed links, size limits and bounded decompression passed.');
