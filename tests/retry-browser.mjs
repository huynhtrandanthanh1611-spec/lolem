import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:4173/current/';
const questions=[
  {id:'sum',text:'40 + 20 = ?',left:'60',right:'70',correct:0},
  {id:'word',text:'Từ nào chỉ hoạt động?',left:'quyển sách',right:'đọc sách',correct:1},
  {id:'last',text:'7 + 8 = ?',left:'15',right:'16',correct:0},
];
const results=[];
await mkdir('test-results',{recursive:true});

async function setup(browser,{seconds=0,tilt=false,count=3}={}) {
  const context=await browser.newContext({viewport:{width:1024,height:648},hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(({questions,seconds})=>{
    localStorage.setItem('royal-questions',JSON.stringify(questions));
    localStorage.setItem('royal-settings',JSON.stringify({seconds,effects:false}));
    window.__testRoll=0;window.__cameraStarts=0;
    if(navigator.mediaDevices){const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{window.__cameraStarts++;return original(...args)}}
  },{questions:questions.slice(0,count),seconds});
  if(tilt) await page.route('**/assets/vision.mjs',route=>route.fulfill({contentType:'application/javascript',body:`
    export const FilesetResolver={forVisionTasks:async()=>({})};
    export const FaceLandmarker={createFromOptions:async()=>({detectForVideo(video){
      if(window.__testRoll===null)return {faceLandmarks:[]};
      const points=[];points[33]={x:.3,y:.4};
      points[263]={x:.7,y:.4+Math.tan(window.__testRoll*Math.PI/180)*.4*video.videoWidth/video.videoHeight};
      return {faceLandmarks:[points]};
    },close(){}})};
  `}));
  await page.goto(base);
  if(tilt){
    await page.locator('[data-action="camera"]').tap();
    await page.waitForFunction(()=>document.querySelector('[data-action="camera"]')?.classList.contains('step-done'));
    await page.locator('[data-action="calibrate"]').tap();
    await page.waitForFunction(()=>document.querySelector('[data-action="calibrate"]')?.classList.contains('step-done'));
  }else await page.getByRole('button',{name:'CHẠM',exact:true}).tap();
  await page.locator('[data-action="start"]').tap();
  await page.waitForFunction(()=>document.querySelector('#left-answer')?.disabled===false);
  return {page,context,errors};
}
async function state(page){
  return page.evaluate(()=>({
    question:document.querySelector('#question-count')?.textContent,
    pedestal:document.querySelector('#princess-walker')?.dataset.pedestalIndex,
    left:document.querySelector('#princess-walker')?.style.left,
    passed:document.querySelectorAll('.journey-stone.passed').length,
    score:document.querySelector('#score')?.textContent,
    screen:document.body.dataset.screen,
    phase:document.querySelector('#journey-lane')?.dataset.meetingPhase||null,
  }));
}
async function wrong(page,side=1){
  const before=await state(page);
  await page.locator(`[data-answer="${side}"]`).tap();
  assert.equal(await page.locator('.answer.wrong').count(),1);
  assert.equal(await page.locator('.answer.correct').count(),0,'Do not reveal the correct answer');
  assert.equal(await page.locator('#feedback').textContent(),'Chưa đúng, em thử lại nhé!');
  assert.equal(await page.locator('.answer:disabled').count(),2);
  await page.keyboard.press(side?'ArrowRight':'ArrowLeft');
  assert.deepEqual(await state(page),before);
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.answer:disabled').count(),2,'Inputs stay locked during feedback');
  await page.waitForFunction(()=>document.querySelector('#left-answer')?.disabled===false);
  await page.waitForTimeout(500); // Past the old automatic advancement deadline.
  assert.deepEqual(await state(page),before,'Wrong answers must not change question, step, score or ending');
  assert.equal(await page.locator('.answer.wrong,.answer.correct').count(),0);
}
async function correct(page,side,next){
  await page.locator(`[data-answer="${side}"]`).tap();
  assert.equal(await page.locator('.answer.correct').count(),1);
  assert.equal(await page.locator('#feedback').textContent(),'Chính xác!');
  await page.keyboard.press(side?'ArrowRight':'ArrowLeft');
  await page.waitForFunction(expected=>document.querySelector('#question-count')?.textContent===expected,next);
}

for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await launcher.launch(engine==='chromium'?{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}:{});
  async function test(name,fn){
    try{await fn();results.push({engine,test:name,status:'passed'})}
    catch(error){results.push({engine,test:name,status:'failed',error:String(error)})}
  }
  try{
    await test('Repeated wrong answers, one step per completion, final-question gate, first-attempt score, review and replay',async()=>{
      const {page,context,errors}=await setup(browser);
      try{
        for(let n=0;n<3;n++)await wrong(page);
        await correct(page,0,'2/3');
        let s=await state(page);
        assert.equal(s.pedestal,'1');assert.equal(s.passed,1);assert.equal(s.score,'0');assert.equal(s.phase,null);
        await correct(page,1,'3/3');
        assert.equal((await state(page)).score,'1');
        assert.equal((await state(page)).passed,2);
        await wrong(page);await wrong(page);
        await page.locator('[data-answer="0"]').tap();
        await page.waitForFunction(()=>document.querySelectorAll('.journey-stone.passed').length===3);
        assert.equal((await state(page)).phase,null,'Last pedestal completes before the final scene');
        await page.waitForFunction(()=>document.querySelector('#journey-lane')?.dataset.meetingPhase==='run');
        await page.waitForFunction(()=>document.querySelector('#journey-lane')?.dataset.meetingPhase==='hands');
        await page.waitForFunction(()=>document.querySelector('#journey-lane')?.dataset.meetingPhase==='hug');
        await page.locator('[data-action="review"]').waitFor();
        assert.equal(await page.locator('.crystal-correct strong').textContent(),'1');
        assert.equal(await page.locator('.crystal-wrong strong').textContent(),'2');
        assert.equal(await page.locator('.crystal-score strong').textContent(),'1/3');
        await page.screenshot({path:`test-results/${engine}-retry-ending.jpg`,quality:80});
        await page.locator('[data-action="review"]').tap();
        assert.equal(await page.locator('.review-card').count(),3);
        const cards=page.locator('.review-card');
        assert.match(await cards.nth(0).innerText(),/Đã hoàn thành sau 4 lần thử/);
        assert.equal(await cards.nth(0).locator('.answer-wrong').count(),3);
        assert.match(await cards.nth(0).innerText(),/Lần 4: 60/);
        assert.match(await cards.nth(1).innerText(),/Đúng ngay lần đầu/);
        assert.match(await cards.nth(2).innerText(),/Đã hoàn thành sau 3 lần thử/);
        await page.screenshot({path:`test-results/${engine}-retry-review.jpg`,quality:80});
        await page.locator('[data-action="results"]').first().tap();
        await page.locator('[data-action="replay"]').tap();
        assert.equal((await state(page)).question,'1/3');assert.equal((await state(page)).score,'0');assert.equal((await state(page)).passed,0);
        await correct(page,0,'2/3');
        assert.equal((await state(page)).score,'1','Replay resets attempts and scoring');
        assert.deepEqual(errors,[]);
      }finally{await context.close()}
    });
    await test('Timeout retries the same final question and leaving cancels pending feedback',async()=>{
      const {page,context,errors}=await setup(browser,{seconds:2,count:1});
      try{
        await page.waitForFunction(()=>document.querySelector('#feedback')?.textContent==='Hết giờ, em thử lại nhé!');
        assert.equal((await state(page)).question,'1/1');assert.equal((await state(page)).passed,0);assert.equal((await state(page)).phase,null);
        assert.equal(await page.locator('.answer.correct').count(),0);
        await page.waitForFunction(()=>document.querySelector('#left-answer')?.disabled===false);
        await page.locator('[data-answer="0"]').tap();
        await page.locator('[data-action="review"]').waitFor();
        assert.equal(await page.locator('.crystal-score strong').textContent(),'0/1');
        await page.locator('[data-action="review"]').tap();
        assert.match(await page.locator('.review-card').innerText(),/Lần 1: Chưa chọn \(hết giờ\)/);
        assert.match(await page.locator('.review-card').innerText(),/Lần 2: 60/);
        await page.locator('[data-action="results"]').first().tap();
        await page.locator('[data-action="replay"]').tap();
        await page.locator('[data-answer="1"]').tap();
        await page.locator('[data-action="home"]').tap();
        await page.waitForTimeout(1400);
        assert.equal((await state(page)).screen,'home');assert.deepEqual(errors,[]);
      }finally{await context.close()}
    });
    if(engine==='chromium')await test('Camera retry needs recentering, held tilt cannot repeat, touch retry keeps the stream',async()=>{
      const {page,context,errors}=await setup(browser,{tilt:true});
      try{
        await page.evaluate(()=>{window.__testRoll=-25});
        await page.locator('.answer.wrong').waitFor();
        await page.waitForTimeout(3000);
        assert.equal((await state(page)).question,'1/3');assert.equal((await state(page)).passed,0);
        assert.equal(await page.locator('.answer.wrong').count(),0,'Holding the same tilt does not submit again');
        await page.evaluate(()=>{window.__testRoll=0});
        await page.waitForFunction(()=>document.querySelector('#camera-status')?.textContent==='Sẵn sàng! Nghiêng đầu để chọn');
        await page.evaluate(()=>{window.__testRoll=-25});
        await page.locator('.answer.wrong').waitFor();
        await page.waitForFunction(()=>document.querySelector('#left-answer')?.disabled===false);
        assert.equal(await page.evaluate(()=>window.__cameraStarts),1);
        await page.locator('[data-answer="0"]').tap(); // Touch works while waiting to recenter.
        await page.waitForFunction(()=>document.querySelector('#question-count')?.textContent==='2/3');
        await page.evaluate(()=>{window.__testRoll=0});
        await page.waitForFunction(()=>document.querySelector('#left-answer')?.disabled===false);
        await page.evaluate(()=>{window.__testRoll=-25});
        await page.waitForFunction(()=>document.querySelector('#question-count')?.textContent==='3/3');
        await page.waitForTimeout(1400);
        assert.equal((await state(page)).passed,2,'Held tilt cannot answer the next question');
        await page.evaluate(()=>{window.__testRoll=0});
        await page.waitForFunction(()=>document.querySelector('#left-answer')?.disabled===false);
        await page.evaluate(()=>{window.__testRoll=25});
        await page.locator('[data-action="review"]').waitFor();
        assert.equal(await page.locator('.crystal-score strong').textContent(),'2/3');
        await page.locator('[data-action="review"]').tap();
        assert.match(await page.locator('.review-card').first().innerText(),/Đã hoàn thành sau 3 lần thử/);
        assert.equal(await page.evaluate(()=>window.__cameraStarts),1);
        assert.deepEqual(errors,[]);
      }finally{await context.close()}
    });
  }finally{await browser.close()}
}
await writeFile('test-results/retry-results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
assert.equal(results.filter(row=>row.status==='failed').length,0,'See test-results/retry-results.json');
