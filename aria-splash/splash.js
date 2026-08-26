(() => {
  'use strict';

  const FULL_DURATION = 3000;
  const REDUCED_DURATION = 850;
  const EXIT_DURATION = 380;
  const splash = document.getElementById('ariaSplash');
  const controls = document.getElementById('demoControls');
  const replayButton = document.getElementById('replaySplash');
  const splashMarkup = splash.outerHTML;
  let closeTimer = 0;
  let removalTimer = 0;

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clearTimers() {
    window.clearTimeout(closeTimer);
    window.clearTimeout(removalTimer);
    closeTimer = 0;
    removalTimer = 0;
  }

  function finish(immediate = false) {
    const current = document.getElementById('ariaSplash');
    if (!current || current.classList.contains('is-leaving')) return;
    clearTimers();
    current.classList.add('is-leaving');
    current.setAttribute('aria-hidden', 'true');
    const delay = immediate ? 180 : EXIT_DURATION;
    removalTimer = window.setTimeout(() => {
      current.remove();
      controls.hidden = false;
      replayButton.focus({ preventScroll: true });
    }, delay);
  }

  function scheduleFinish() {
    closeTimer = window.setTimeout(() => finish(reducedMotion()), reducedMotion() ? REDUCED_DURATION : FULL_DURATION);
  }

  function bindSplash() {
    const skip = document.getElementById('skipSplash');
    skip.addEventListener('click', () => finish(true), { once: true });
    scheduleFinish();
  }

  function replay() {
    clearTimers();
    controls.hidden = true;
    document.body.insertAdjacentHTML('beforeend', splashMarkup);
    bindSplash();
  }

  replayButton.addEventListener('click', replay);
  bindSplash();
})();
