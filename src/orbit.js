/* Orbit's simulation is independent of the Connect Four tree and game clock.
   Degrees are unwrapped per round, so a dropped frame cannot skip a MISS. */
class OrbitGame {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() {
    this.status = 'ready'; this.hits = 0; this.streak = 0; this.elapsed = 0;
    this.angle = -90; this.direction = 1; this.speed = 80; this.target = null;
    this.rewardSlot = null; this.bonusLife = false;
    this.transition = 0; this.events = []; this.colorHits = {white:0,gold:0,red:0};
    this.lives = ['white','white','white','gold','gold','red'].map(color => ({color,state:'ghost',progress:0}));
  }
  start() { this.reset(); this.status = 'running'; this.spawn(); }
  pause() { if (this.status === 'running') this.status = 'paused'; }
  resume() { if (this.status === 'paused') this.status = 'running'; }
  spawn() {
    const difficulty = 1 - Math.exp(-this.hits / 32);
    const late = this.hits >= 60;
    this.speed = (80 + 180 * difficulty) * (.92 + this.random() * .16);
    this.reverseProbability = late ? .5 : .15 + .4 * difficulty;
    if (this.hits && this.random() < this.reverseProbability) this.direction *= -1;
    const reward = late && this.rewardSlot === null && !this.bonusLife && this.random() < .1;
    const roll = this.random();
    const whiteProbability = .9 * Math.exp(-this.hits / 24);
    const goldProbability = .1 + .28 * Math.exp(-Math.pow((this.hits - 28) / 28, 2));
    const color = reward ? 'bonus' : this.hits < 4 || roll < whiteProbability ? 'white' : roll < whiteProbability + goldProbability ? 'gold' : 'red';
    const width = {white:52,gold:30,red:18,bonus:8}[color];
    // A slow round is chosen before placement, never halfway through a target.
    // Its near target still respects a real time-based reaction window.
    const slow = late && this.random() < .12;
    if (slow) this.speed *= .42 + this.random() * .13;
    const reaction = .85 - .5 * difficulty;
    const minimum = this.speed * reaction + 12;
    const far = !slow && this.hits >= 8 && this.random() < .25;
    const maximum = 360 - width - 6;
    const distance = far
      ? Math.max(minimum, maximum - 35 + this.random() * 35)
      : Math.min(maximum, minimum + this.random() * (slow ? 30 : 110));
    this.target = {color,width,distance,travel:0,angle:this.angle + this.direction * (distance + width/2),reaction,slow,far};
  }

  advance(seconds) {
    if (this.status !== 'running' || seconds <= 0) return;
    if (this.transition > 0) {
      const gap = Math.min(seconds,this.transition);
      this.elapsed += gap; this.angle += this.direction*this.speed*gap;
      this.transition -= gap; seconds -= gap;
      if (this.transition <= 1e-8) { this.transition=0; this.spawn(); }
      if (!seconds) return;
    }
    const t = this.target;
    const untilMiss = (t.distance + t.width - t.travel)/this.speed;
    if (seconds > untilMiss) {
      this.elapsed += Math.max(0,untilMiss); this.angle += this.direction*this.speed*Math.max(0,untilMiss);
      t.travel = t.distance+t.width; this.miss('passed');
      // Start the next target only on the next visible update. A long frame must
      // never spawn and consume unseen targets or several lives at once.
    } else {
      this.elapsed += seconds; this.angle += this.direction*this.speed*seconds; t.travel += this.speed*seconds;
    }
    this.angle = ((this.angle % 360)+360)%360;
  }
  tap() {
    if (this.status !== 'running' || !this.target || this.transition > 0) return;
    const t=this.target;
    if (t.travel < t.distance || t.travel > t.distance+t.width) return this.miss('empty');
    this.hits++; this.streak++;
    if (t.color === 'bonus') {
      const index = this.lives.findIndex(l => l.state !== 'active');
      if (index < 0) this.bonusLife = true;
      else {
        this.lives[index].state = 'active'; this.lives[index].progress = 1;
        this.rewardSlot = index;
        this.events.push({type:'life',index,color:this.lives[index].color});
      }
      this.events.push({type:'hit',color:'bonus'});
      this.target=null; this.transition=.16;
      return;
    }
    this.colorHits[t.color]++;
    const thresholds={white:5,gold:3,red:1};
    const slots=this.lives.filter(l=>l.color===t.color);
    slots.forEach((life,index)=>{
      if (life.state !== 'ghost') return;
      life.progress=Math.max(0,Math.min(1,(this.colorHits[t.color]-index*thresholds[t.color])/thresholds[t.color]));
      if (life.progress===1) {life.state='active';this.events.push({type:'life',index:this.lives.indexOf(life),color:t.color});}
    });
    this.events.push({type:'hit',color:t.color}); this.target=null; this.transition=.16;
  }
  miss(reason) {
    // Reward targets are optional: neither a stray tap nor a pass costs a life.
    if (this.target?.color === 'bonus') {
      this.streak=0; this.events.push({type:'safe',reason});
      this.target=null; this.transition=.22; return;
    }
    // The glowing logo is a seventh shield and is always spent first.
    if (this.bonusLife) {
      this.bonusLife=false; this.streak=0;
      this.events.push({type:'miss',reason,index:-1});
      this.target=null; this.transition=.22; return;
    }
    const index=this.lives.findIndex(l=>l.state==='active');
    this.streak=0; this.events.push({type:'miss',reason,index}); this.target=null;
    if (index < 0) { this.status='over'; this.events.push({type:'over'}); }
    else {this.lives[index].state='spent';if(this.rewardSlot===index)this.rewardSlot=null;this.transition=.22;}
  }
}

class OrbitView {
  constructor(element, onHitTarget) {
    this.element=element; this.game=new OrbitGame(); this.canvas=element.querySelector('canvas');
    this.ctx=this.canvas.getContext('2d'); this.overlay=element.querySelector('.orbit__overlay');
    this.action=element.querySelector('.orbit__action'); this.message=element.querySelector('.orbit__message');
    this.stats=element.querySelector('.orbit__stats'); this.feedback=element.querySelector('.orbit__feedback');
    this.lives=[...element.querySelectorAll('.orbit__life')]; this.onHitTarget=onHitTarget;
    this.visible=false; this.last=0; this.raf=0; this.effect=null;
    this.action.addEventListener('click',()=>{
      if(this.game.status==='paused')this.game.resume();else this.game.start();
      this.last=performance.now();this.sync();this.loop();
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    window.addEventListener('pagehide',()=>this.pause());
    this.sync();this.draw();
  }
  show() { this.visible=true;this.last=performance.now();this.sync();this.draw(); }
  hide() { this.pause();this.visible=false;cancelAnimationFrame(this.raf); }
  pause() { this.game.pause();cancelAnimationFrame(this.raf);this.raf=0;this.sync(); }
  hit() {
    if(!this.visible || this.game.status!=='running')return;
    const now=performance.now();this.game.advance((now-this.last)/1000);this.last=now;
    this.game.tap();this.consumeEvents();this.sync();this.draw();
  }
  loop() {
    cancelAnimationFrame(this.raf);
    if(!this.visible || this.game.status!=='running')return;
    this.raf=requestAnimationFrame(now=>{
      this.game.advance((now-this.last)/1000);this.last=now;
      this.consumeEvents();this.sync();this.draw();this.loop();
    });
  }
  consumeEvents() {
    for(const event of this.game.events.splice(0)) {
      if(event.type==='hit'||event.type==='miss'||event.type==='safe'){
        this.effect={...event,at:performance.now()};
        this.feedback.textContent=event.type==='safe'?'SAFE':event.type==='hit'?(event.color==='bonus'?'+1 LIFE':'HIT!'):event.reason==='passed'?'TOO LATE':'MISS';
        this.feedback.dataset.kind=event.type;
        this.feedback.getAnimations().forEach(a=>a.cancel());
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
          this.feedback.animate([{opacity:1,transform:'translateY(0) scale(.85)'},{opacity:1,transform:'translateY(-2px) scale(1.12)',offset:.3},{opacity:0,transform:'translateY(-8px) scale(1)'}],{duration:650,fill:'forwards'});
        else this.feedback.style.opacity='1';
        if(event.type!=='safe')this.onHitTarget?.(event.type);
      }
      if(event.type==='life'||(event.type==='miss'&&event.index>=0)) {
        const el=this.lives[event.index];
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
          el.animate(event.type==='life'?[{transform:'scale(.8)',filter:'brightness(2)'},{transform:'scale(1.4)',offset:.45},{transform:'scale(1)',filter:'brightness(1)'}]:[{transform:'scale(1)',opacity:1},{transform:'scale(1.4)',opacity:0}],{duration:550});
      }
    }
  }
  sync() {
    const g=this.game;
    // The hand needs every frame; labels and life attributes do not. Avoid
    // invalidating iPad style/layout 60–120 times a second while playing.
    const key=`${g.status}|${g.bonusLife}|${g.hits}|${Math.floor(g.elapsed)}|${g.lives.map(l=>`${l.state}:${l.progress}`).join(',')}`;
    if(this.uiKey===key)return;
    this.uiKey=key;
    this.element.dataset.status=g.status;
    this.element.dataset.bonusLife=String(g.bonusLife);
    this.overlay.hidden=g.status==='running';
    this.action.textContent=g.status==='paused'?'Resume':g.status==='over'?'Play again':'Start';
    this.message.textContent=g.status==='paused'?'Paused':g.status==='over'?'GAME OVER':'Tap when the hand meets the bar';
    const time=`${Math.floor(g.elapsed/60)}:${String(Math.floor(g.elapsed%60)).padStart(2,'0')}`;
    this.stats.textContent=`${g.hits} Hits · ${time}`;
    this.lives.forEach((el,i)=>{
      const l=g.lives[i];el.dataset.state=l.state;
      el.style.setProperty('--life-opacity',l.state==='active'?1:l.state==='spent'?0:.28+.6*l.progress);
      el.title=`${l.color} life: ${l.state==='ghost'?Math.round(l.progress*100)+'% earned':l.state}`;
    });
  }
  draw() {
    const ctx=this.ctx,g=this.game;const s=600;
    // Figma artwork is 1254px square. Fit its two gold circles rather than
    // assuming the image centre: (625.3,599.1), radii 455.4 and 511.9.
    // The playable track follows the middle of that hollow annulus.
    const cx=625.3*s/1254,cy=599.1*s/1254,r=483.65*s/1254;
    ctx.clearRect(0,0,s,s);
    ctx.save();ctx.translate(cx,cy);
    // A dark enamel track and bright inner keyline keep the playable ring
    // distinct from the ornamental gold disc underneath.
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.strokeStyle='#62404e';ctx.lineWidth=16;ctx.stroke();
    ctx.strokeStyle='#f9dfa2';ctx.lineWidth=3;ctx.stroke();
    const t=g.target;
    if(t){
      const a=(t.angle-t.width/2)*Math.PI/180,b=(t.angle+t.width/2)*Math.PI/180;
      ctx.beginPath();ctx.arc(0,0,r,a,b);ctx.strokeStyle='#2a2744';ctx.lineWidth=t.color==='bonus'?18:30;ctx.lineCap=t.color==='bonus'?'butt':'round';ctx.stroke();
      if(t.color==='bonus') {
        ctx.save();ctx.shadowColor='#ffffff';ctx.shadowBlur=22;
        ctx.strokeStyle='#ffffff';ctx.lineWidth=12;ctx.lineCap='butt';ctx.stroke();
        ctx.shadowBlur=9;ctx.lineWidth=6;ctx.stroke();ctx.restore();
      } else {
        ctx.strokeStyle={white:'#fffdf3',gold:'#ffcc24',red:'#eb334c'}[t.color];ctx.lineWidth=21;ctx.stroke();
      }
    }
    const radians=g.angle*Math.PI/180;
    ctx.rotate(radians);
    ctx.beginPath();ctx.moveTo(-27,0);ctx.lineTo(r+3,0);ctx.strokeStyle='#3b2545';ctx.lineWidth=14;ctx.lineCap='round';ctx.stroke();
    ctx.strokeStyle='#fff0a1';ctx.lineWidth=7;ctx.stroke();
    ctx.beginPath();ctx.arc(r+3,0,9,0,Math.PI*2);ctx.fillStyle='#fff9eb';ctx.fill();
    ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.fillStyle='#dfad46';ctx.fill();ctx.lineWidth=5;ctx.strokeStyle='#57384d';ctx.stroke();
    ctx.restore();
    if(this.effect){const age=(performance.now()-this.effect.at)/550;
      if(age<1){ctx.save();ctx.globalAlpha=(1-age)*.85;ctx.beginPath();ctx.arc(cx,cy,r+age*30,0,Math.PI*2);ctx.lineWidth=7*(1-age);ctx.strokeStyle=this.effect.type==='safe'?'#ffffff':this.effect.type==='hit'?'#fff3bb':'#e32655';ctx.stroke();ctx.restore();}
    }
  }
}
