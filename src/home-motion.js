// SVG water motion obeys the same visibility and reduced-motion rules as CSS.
(() => {
  const home=document.getElementById('homeScreen');
  const water=home?.querySelector('.home__water');
  if(!water)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>{if(document.hidden||home.hidden||document.body.dataset.screen!=='home'||reduce.matches){water.pauseAnimations();}else water.unpauseAnimations();};
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('pageshow',sync);
  reduce.addEventListener('change',sync);
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
  sync();
})();
