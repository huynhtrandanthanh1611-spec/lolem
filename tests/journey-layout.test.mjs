import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../journey-layout.js',import.meta.url),'utf8');
const {journeyLayout}=await import('data:text/javascript,'+encodeURIComponent(source));
for(const total of [1,2,5,10,15,20,50,301,1000]){
 for(const width of [150,320,620,960,1800]){
  for(const step of [0,Math.floor(total/2),total-1,total]){
   const layout=journeyLayout(total,step,width,86);
   assert.equal(layout.positions.length,total,'Every question has one pedestal');
   assert.equal(layout.currentStep,Math.min(step,total-1),'Completion cannot move past the final pedestal');
   for(let i=1;i<total;i++)assert.ok(layout.positions[i]-layout.positions[i-1]>layout.stoneWidth,'Pedestals cannot overlap');
   const x=layout.positions[layout.currentStep]-layout.scrollLeft;
   assert.ok(x-layout.stoneWidth/2>=0&&x+layout.stoneWidth/2<=width,'Current pedestal must be fully visible');
   if(step>=total-1)assert.ok(width-x>=layout.padding-.01,'Visible path continues after the final pedestal');
  }
 }
}
console.log('Journey layout: 180 scenarios passed.');
