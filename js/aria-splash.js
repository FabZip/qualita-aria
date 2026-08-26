(() => {
  'use strict';

  const FULL_DURATION=3000;
  const REDUCED_DURATION=850;
  const EXIT_DURATION=380;
  const REDUCED_EXIT_DURATION=180;
  const SAFETY_TIMEOUT=4600;
  const splash=document.getElementById('aria-splash');
  const skip=document.getElementById('aria-splash-skip');
  let closeTimer=0;
  let removalTimer=0;
  let safetyTimer=0;
  let closing=false;
  let removed=false;

  if(!splash)return;

  const alreadyShown=document.documentElement.classList.contains('aria-splash-seen');
  document.documentElement.classList.remove('aria-splash-seen');
  if(alreadyShown){
    splash.remove();
    return
  }

  const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clearTimers(){
    window.clearTimeout(closeTimer);
    window.clearTimeout(removalTimer);
    window.clearTimeout(safetyTimer);
    closeTimer=0;
    removalTimer=0;
    safetyTimer=0
  }

  function removeSplash(){
    if(removed)return;
    removed=true;
    clearTimers();
    skip?.removeEventListener('click',onSkip);
    splash.removeEventListener('animationend',onExitEnd);
    if(document.activeElement===skip)skip.blur();
    splash.remove()
  }

  function onExitEnd(event){
    if(event.target===splash&&event.animationName==='aria-splash-out')removeSplash()
  }

  function finish(immediate=false){
    if(closing||removed)return;
    closing=true;
    window.clearTimeout(closeTimer);
    window.clearTimeout(safetyTimer);
    splash.style.pointerEvents='none';
    splash.setAttribute('aria-hidden','true');
    splash.classList.add('aria-splash--leaving');
    splash.addEventListener('animationend',onExitEnd,{once:true});
    const delay=immediate||reducedMotion()?REDUCED_EXIT_DURATION:EXIT_DURATION;
    removalTimer=window.setTimeout(removeSplash,delay+80)
  }

  function onSkip(){finish(true)}

  skip?.addEventListener('click',onSkip,{once:true});
  closeTimer=window.setTimeout(()=>finish(false),reducedMotion()?REDUCED_DURATION:FULL_DURATION);
  safetyTimer=window.setTimeout(()=>finish(true),SAFETY_TIMEOUT)
})();
