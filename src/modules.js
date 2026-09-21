/* Visible module and timed-board session are intentionally separate.
   Leaving a running clock never stops it or unlocks historical variations. */
class BottomRightModule {
  constructor(element,clock,game,{onChange,toast,newBoard}) {
    this.element=element;this.clock=clock;this.board=game;this.onChange=onChange;this.toast=toast;this.newBoard=newBoard;
    this.mode='picker';this.selection=0;this.clockSelected=false;this.suppressClickUntil=0;
    this.cover=element.querySelector('.module__cover');this.track=element.querySelector('.module__track');
    this.clockPane=element.querySelector('#gameClock');this.orbitPane=element.querySelector('.orbit');
    this.back=element.querySelector('.module__back');this.badge=element.querySelector('.module__timed');
    this.lock=element.querySelector('.clock__new-board');
    this.gamepad=document.querySelector('.decoGamepad');
    this.orbit=new OrbitView(this.orbitPane,kind=>{
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
        this.gamepad.animate(kind==='hit'?[{transform:'rotate(0) scale(1)'},{transform:'rotate(-8deg) scale(1.08)'},{transform:'rotate(0) scale(1)'}]:[{transform:'translateX(0)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],{duration:240});
    });
    element.querySelectorAll('[data-enter-mode]').forEach(b=>b.addEventListener('click',()=>{
      if(performance.now()<this.suppressClickUntil)return;
      this.enter(b.dataset.enterMode);
    }));
    element.querySelectorAll('[data-select-mode]').forEach(b=>b.addEventListener('click',()=>this.select(Number(b.dataset.selectMode))));
    this.back.addEventListener('click',()=>this.showPicker());
    this.badge.addEventListener('click',()=>this.enter('clock'));
    element.querySelector('.clock__new-board button').addEventListener('click',async()=>{await this.newBoard();this.enter('clock');});
    let swipe=null;
    this.cover.addEventListener('pointerdown',e=>{if(e.isPrimary&&e.button===0)swipe={id:e.pointerId,x:e.clientX,y:e.clientY};});
    this.cover.addEventListener('pointerup',e=>{
      if(!swipe||swipe.id!==e.pointerId)return;
      const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;
      if(Math.abs(dx)>30&&Math.abs(dx)>Math.abs(dy)*1.2){
        this.suppressClickUntil=performance.now()+400;this.select(dx<0?1:0);
      }
    });
    this.cover.addEventListener('pointercancel',()=>swipe=null);
    this.cover.addEventListener('keydown',e=>{
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();this.select(e.key==='ArrowRight'?1:0);}
    });
    const hit=e=>{
      if(this.mode!=='orbit'||e.target.closest('button'))return;
      if(e.isPrimary&&e.button===0){e.preventDefault();this.orbit.hit();}
    };
    element.addEventListener('pointerdown',hit);
    this.gamepad.addEventListener('pointerdown',e=>{if(this.mode==='orbit'&&e.isPrimary&&e.button===0){e.preventDefault();this.orbit.hit();}});
    this.gamepad.addEventListener('click',e=>{if(e.detail===0&&this.mode==='orbit')this.orbit.hit();});
    this.orbitPane.addEventListener('keydown',e=>{
      if((e.code==='Space'||e.code==='Enter')&&!e.target.closest('button')){e.preventDefault();if(!e.repeat)this.orbit.hit();}
    });
    this.select(0);this.sync();
  }
  get clockRequired() {return this.clockSelected||this.clock.status!=='setup';}
  select(index) {
    this.selection=index;
    this.track.querySelectorAll('.module__slide').forEach((slide,i)=>{slide.inert=i!==index;slide.setAttribute('aria-hidden',String(i!==index));});
  }
  enter(mode) {
    this.mode=mode;this.clockSelected=mode==='clock';
    if(mode==='orbit'){this.orbit.show();}else this.orbit.hide();
    this.sync();this.animateIn(mode==='orbit'?this.orbitPane:this.clockPane);this.onChange();
  }
  showPicker() {
    this.orbit.hide();this.selection=this.mode==='orbit'?1:0;
    this.mode='picker';this.clockSelected=false;this.select(this.selection);this.sync();this.animateIn(this.cover);this.onChange();
  }
  reset() {
    this.orbit.hide();this.orbit.game.reset();this.orbit.sync();
    this.mode='picker';this.clockSelected=false;this.select(0);this.sync();
  }
  sync() {
    this.element.dataset.module=this.mode;
    this.cover.hidden=this.mode!=='picker';this.clockPane.hidden=this.mode!=='clock';this.orbitPane.hidden=this.mode!=='orbit';
    this.back.hidden=this.mode==='picker';this.badge.hidden=this.mode==='clock'||this.clock.status==='setup';
    this.badge.textContent=this.clock.status==='finished'?'Clock result':'Live Clock';
    this.gamepad.classList.toggle('is-playable',this.mode==='orbit');
    this.gamepad.disabled=this.mode!=='orbit';this.gamepad.setAttribute('aria-label',this.mode==='orbit'?'Hit Orbit target':'Game controller');
    const needsNew=this.clock.status==='setup'&&this.board.nodeById.size>1;
    this.lock.hidden=!needsNew;
    this.clockPane.querySelectorAll('[data-clock-preset]').forEach(b=>b.disabled=needsNew);
  }
  animateIn(el) {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    el.getAnimations().forEach(animation=>animation.cancel());
    el.animate([{opacity:0,transform:'scale(1.025)'},{opacity:1,transform:'scale(1)'}],{duration:440,easing:'cubic-bezier(.22,.8,.25,1)'});
  }
}
