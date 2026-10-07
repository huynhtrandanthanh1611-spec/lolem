import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://127.0.0.1:4173';
const results = [];
await mkdir('test-results', { recursive: true });

async function inspect(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
    };
    const inside = r => r.x >= -1 && r.y >= -1 && r.right <= innerWidth+1 && r.bottom <= innerHeight+1;
    const overlap = (a,b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
    const rects = Object.fromEntries(['.setup-title','header nav','.opening-guide','.test-mirror-section','.opening-startup','.opening-stack','[data-action="start"]'].map(s=>[s,rect(s)]));
    const buttons = [...document.querySelectorAll('.opening-stack button,header .nav')].filter(el=>el.getClientRects().length).map(el=>{
      const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return { text:el.textContent.trim(), height:r.height, visible:inside(r), hit:el===hit||el.contains(hit) };
    });
    const main=document.querySelector('#app'),image=document.querySelector('.opening-background');
    const imageRect=image.getBoundingClientRect();
    return { viewport:[innerWidth,innerHeight], rects, buttons,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
      needsScroll:main.scrollHeight>main.clientHeight+1,scrollMode:getComputedStyle(main).overflowY,
      visible:Object.values(rects).every(inside),
      detached:!overlap(rects['.test-mirror-section'],rects['.opening-startup']),
      guideClear:!overlap(rects['.opening-guide'],rects['.opening-startup']),
      background:image.complete&&image.naturalWidth>0&&imageRect.width>=innerWidth&&imageRect.height>=innerHeight&&getComputedStyle(image).objectFit==='cover',
      noScale:[document.body,main,document.querySelector('.opening-scene')].every(el=>getComputedStyle(el).transform==='none'),
      mirrorRatio:rects['.test-mirror-section'].width/rects['.test-mirror-section'].height,
    };
  });
}
async function ready(page, url) {
  await page.goto(url);
  await page.locator('.opening-stack').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.opening-background').evaluate(image=>image.decode());
}
function check(m, tablet) {
  assert.equal(m.horizontalOverflow,false,'No horizontal scrollbar');
  assert.equal(m.needsScroll,false,'Ordinary tablet viewport must fit without scrolling');
  assert.ok(m.visible&&m.buttons.every(b=>b.visible&&b.hit),'All controls visible and unobstructed');
  assert.ok(m.detached&&m.guideClear,'Mirror remains separate; guide cannot overlap controls');
  assert.ok(m.background&&m.noScale,'Cover background and no app scaling');
  assert.ok(Math.abs(m.mirrorRatio-1064/1478)<.005,'Original oval frame ratio');
  if(tablet) assert.ok(m.buttons.every(b=>b.height>=44),'Touch targets are at least 44px');
}

for (const [engine, launcher] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await launcher.launch(engine==='chromium'?{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}:{});
  try {
    for (const [width,height] of [[1920,1080],[1366,768],[1024,768],[1180,820],[1194,834],[1366,1024],[768,1024],[820,1180],[1024,648],[1180,700],[1194,714],[1366,904]]) {
      const tablet=!((width===1920)||(width===1366&&height===768));
      const context=await browser.newContext({viewport:{width,height},hasTouch:tablet,isMobile:tablet});
      const page=await context.newPage();
      try {
        await ready(page,base+'/current/');
        const m=await inspect(page);
        await page.screenshot({path:`test-results/${engine}-${width}x${height}.jpg`, quality:85});
        check(m,tablet);
        if(!tablet) {
          const baseline=await context.newPage();
          await ready(baseline,base+'/baseline/');
          const old=await inspect(baseline);
          for(const s of Object.keys(m.rects)) for(const key of ['x','y','width','height'])
            assert.ok(Math.abs(m.rects[s][key]-old.rects[s][key])<=1,`Desktop unchanged: ${s} ${key}`);
        }
        results.push({engine,width,height,status:'passed',measurements:m});
      } catch(error) {
        results.push({engine,width,height,status:'failed',error:String(error),measurements:await inspect(page).catch(()=>null)});
      } finally {await context.close();}
    }
    const context=await browser.newContext({viewport:{width:1024,height:648},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    try {
      await ready(page,base+'/current/');
      await page.getByRole('button',{name:'CHẠM',exact:true}).tap();
      await page.locator('[data-action="start"]').tap();
      await page.locator('#question-count').waitFor();
      const pathY=await page.locator('.journey-path').evaluate(el=>el.getBoundingClientRect().y);
      await page.locator('[data-answer="0"]').tap();
      await page.waitForFunction(()=>document.querySelector('#question-count')?.textContent==='2/10');
      assert.equal(await page.locator('.journey-path').evaluate(el=>el.getBoundingClientRect().y),pathY);
      await page.setViewportSize({width:768,height:1024});
      await page.locator('[data-action="home"]').tap();
      check(await inspect(page),true);
      await page.setViewportSize({width:1024,height:420});
      await page.waitForFunction(()=>document.querySelector('#app').clientHeight===420);
      const small=await inspect(page);
      assert.equal(small.scrollMode,'auto');
      await page.locator('[data-action="start"]').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('[data-action="start"]').isVisible());
      await page.locator('[data-action="start"]').tap();
      await page.locator('#question-count').waitFor();
      results.push({engine,test:'Touch play, rotation, journey baseline and short-height scrolling',status:'passed'});
    } catch(error) {results.push({engine,test:'Touch and rotation',status:'failed',error:String(error)});}
    await context.close();
    if(engine==='chromium') {
      const context=await browser.newContext({viewport:{width:1024,height:648},hasTouch:true});
      const page=await context.newPage();
      try {
        await ready(page,base+'/current/');
        await page.locator('[data-action="camera"]').tap();
        await page.waitForFunction(()=>document.querySelector('[data-action="camera"]').classList.contains('step-done'),{},{timeout:60000});
        await page.locator('[data-action="calibrate"]').tap();
        check(await inspect(page),true);
        results.push({engine,test:'Camera opens using synthetic video; calibration button receives touch',status:'passed',limitation:'Synthetic video has no face; real head tracking still needs a physical iPad.'});
      } catch(error) {results.push({engine,test:'Synthetic camera/calibration',status:'failed',error:String(error)});}
      await context.close();
    }
  } finally {await browser.close();}
}
await writeFile('test-results/results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({measurements,...row})=>row),null,2));
assert.equal(results.filter(row=>row.status==='failed').length,0,'See test-results/results.json and screenshots for failures');
