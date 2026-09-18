// Angles are relative to the calibrated upright pose, in degrees.
export const TILT_CONFIG = Object.freeze({enter:13,exit:9,center:7,alpha:.4,centerMs:250,unstableMs:200,graceMs:260,holdMs:700,frameMs:40,calibrationMs:900});
export class TiltController {
  constructor(config={}) { this.config={...TILT_CONFIG,...config};this.reset(); }
  reset(){this.state='WAIT_FOR_CENTER';this.side=-1;this.elapsed=0;this.smoothed=null;this.lastAt=null;this.missingAt=null;this.centerAt=null;this.unstableAt=null;}
  waitForCenter(){this.state='WAIT_FOR_CENTER';this.side=-1;this.elapsed=0;this.centerAt=null;this.unstableAt=null;}
  snapshot(extra={}){return {state:this.state,side:this.side,progress:Math.min(1,this.elapsed/this.config.holdMs),roll:this.smoothed,confirmed:null,missing:false,...extra};}
  update(roll,now,{blocked=false}={}) {
    const c=this.config,dt=this.lastAt===null?0:Math.max(0,now-this.lastAt);this.lastAt=now;
    if(dt>c.graceMs){this.waitForCenter();this.smoothed=null;}
    if(!Number.isFinite(roll)){
      this.missingAt??=now;if(this.centerAt!==null)this.centerAt+=dt;
      if(now-this.missingAt>=c.graceMs){this.waitForCenter();this.smoothed=null;return this.snapshot({missing:true});}
      return this.snapshot(); // Freeze, never confirm an answer without a valid frame.
    }
    const returning=this.missingAt!==null;
    if(returning&&now-this.missingAt>=c.graceMs){this.waitForCenter();this.smoothed=null;}
    this.missingAt=null;if(returning&&this.centerAt!==null)this.centerAt+=dt;
    const alpha=1-Math.pow(1-c.alpha,Math.min(dt||c.frameMs,100)/c.frameMs);
    this.smoothed=this.smoothed===null?roll:alpha*roll+(1-alpha)*this.smoothed;
    const a=this.smoothed,abs=Math.abs(a),sameDirection=a>0?0:1;
    if(abs<=c.center){this.centerAt??=now;}else this.centerAt=null;
    // This also recovers any stale leaning/wait state once upright is stable.
    if(this.centerAt!==null&&now-this.centerAt>=c.centerMs){this.state='CENTER';this.side=-1;this.elapsed=0;this.unstableAt=null;}
    if(this.state==='WAIT_FOR_CENTER')return this.snapshot();
    if(blocked){this.side=-1;this.elapsed=0;this.unstableAt=null;return this.snapshot();}
    if(this.state==='CENTER'){
      if(abs>=c.enter){this.side=sameDirection;this.state=this.side===0?'LEANING_LEFT':'LEANING_RIGHT';this.elapsed=0;this.unstableAt=null;}
      return this.snapshot();
    }
    if(abs>=c.enter&&sameDirection!==this.side){this.side=sameDirection;this.state=this.side===0?'LEANING_LEFT':'LEANING_RIGHT';this.elapsed=0;this.unstableAt=null;return this.snapshot();}
    if(abs<c.exit||sameDirection!==this.side){
      this.unstableAt??=now;
      if(now-this.unstableAt>=c.unstableMs){this.state='WAIT_FOR_CENTER';this.side=-1;this.elapsed=0;}
      return this.snapshot();
    }
    const wasUnstable=this.unstableAt!==null;this.unstableAt=null;
    if(!returning&&!wasUnstable)this.elapsed+=Math.min(dt,100);
    if(this.elapsed>=c.holdMs){const side=this.side;this.waitForCenter();return this.snapshot({confirmed:side,progress:1});}
    return this.snapshot();
  }
}
export class PoseCalibration {
  constructor(config={}){this.config={...TILT_CONFIG,...config};this.reset();}
  reset(){this.samples=[];this.lastValid=null;}
  add(roll,now){
    if(!Number.isFinite(roll)){if(this.lastValid!==null&&now-this.lastValid>this.config.graceMs)this.reset();return null;}
    if(this.lastValid!==null&&now-this.lastValid>this.config.graceMs)this.reset();
    this.lastValid=now;this.samples.push({roll,at:now});
    const values=this.samples.map(x=>x.roll),span=Math.max(...values)-Math.min(...values);
    if(span>6){this.samples=[{roll,at:now}];return null;}
    if(this.samples.length<12||now-this.samples[0].at<this.config.calibrationMs)return null;
    const ordered=values.sort((a,b)=>a-b),middle=Math.floor(ordered.length/2);
    return ordered.length%2?ordered[middle]:(ordered[middle-1]+ordered[middle])/2;
  }
}
export function headRoll(points,width,height){
  const left=points?.[33],right=points?.[263];
  if(!left||!right||!width||!height)return null;
  const dx=(right.x-left.x)*width,dy=(right.y-left.y)*height;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<8)return null;
  let angle=Math.atan2(dy,dx)*180/Math.PI;
  if(angle>90)angle-=180;if(angle< -90)angle+=180;return angle;
}
