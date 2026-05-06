// Content script for Instagram Reels auto-scrolling.
// It scrolls when the focused Reel ends and skips Reels with visible sponsored labels.

(() => {
  const CONTROLLER_KEY = '__reelScrollerController';
  const ENABLED_KEY = 'reelScrollerEnabled';
  const SPONSORED_LABEL_RE = /\b(sponsored|paid partnership|paid promotion|advertisement)\b/i;
  const EXACT_AD_LABEL_RE = /^ad$/i;

  if (window[CONTROLLER_KEY]){
    window[CONTROLLER_KEY].initFromStorage();
    return;
  }

  let enabled = false;
  let observer = null;
  let syncInterval = null;
  let lastSkipAt = 0;
  let skipCooldownUntil = 0;
  const attachedVideos = new Set();
  const cleanupByVideo = new WeakMap();

  function log(...args){
    console.log('[ReelScroller]', ...args);
  }

  function isReelsPage(){
    return /^\/reels?(\/|$)/.test(window.location.pathname);
  }

  function normalizeText(value){
    return (value || '').toString().replace(/\s+/g, ' ').trim();
  }

  function textHasSponsoredSignal(value){
    const text = normalizeText(value);
    if (!text || text.length > 100) return false;
    if (EXACT_AD_LABEL_RE.test(text)) return true;
    return SPONSORED_LABEL_RE.test(text);
  }

  function rectArea(rect){
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function rectsIntersect(a, b){
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) > 0;
  }

  function expandRect(rect, horizontal, vertical){
    return {
      left: Math.max(0, rect.left - horizontal),
      right: Math.min(window.innerWidth, rect.right + horizontal),
      top: Math.max(0, rect.top - vertical),
      bottom: Math.min(window.innerHeight, rect.bottom + vertical),
      width: Math.min(window.innerWidth, rect.right + horizontal) - Math.max(0, rect.left - horizontal),
      height: Math.min(window.innerHeight, rect.bottom + vertical) - Math.max(0, rect.top - vertical)
    };
  }

  function isElementVisible(el){
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

    let rect;
    try {
      rect = el.getBoundingClientRect();
    } catch (e) {
      return false;
    }

    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;

    try {
      const style = window.getComputedStyle(el);
      if (!style) return true;
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity || '1') === 0) return false;
    } catch (e) {
      return true;
    }

    return true;
  }

  function isUsableVideo(video){
    if (!video || video.nodeType !== Node.ELEMENT_NODE) return false;
    try {
      const rect = video.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch (e) {
      return false;
    }
  }

  function getVideos(){
    return Array.from(document.querySelectorAll('video')).filter(isUsableVideo);
  }

  function isInViewport(video){
    const rect = video.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }

  function videoCenterDistance(video){
    const rect = video.getBoundingClientRect();
    const videoCenter = (rect.top + rect.bottom) / 2;
    return Math.abs(videoCenter - window.innerHeight / 2);
  }

  function findFocusedVideo(){
    const videos = getVideos();
    if (!videos.length) return null;

    const visibleVideos = videos.filter(isInViewport);
    const candidates = visibleVideos.length ? visibleVideos : videos;
    candidates.sort((a, b) => videoCenterDistance(a) - videoCenterDistance(b));
    return candidates[0] || null;
  }

  function findNextVideo(current){
    const videos = getVideos().sort((a, b) => {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });

    if (!videos.length) return null;
    if (!current) return videos[0];

    const currentRect = current.getBoundingClientRect();
    const currentCenter = (currentRect.top + currentRect.bottom) / 2;

    for (const video of videos){
      if (video === current) continue;
      const rect = video.getBoundingClientRect();
      const center = (rect.top + rect.bottom) / 2;
      if (center > currentCenter + 30) return video;
    }

    const index = videos.indexOf(current);
    return index >= 0 ? videos[index + 1] || null : null;
  }

  function getScrollableParent(el){
    let node = el && el.parentElement;
    while (node && node !== document.body && node !== document.documentElement){
      try {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 20){
          return node;
        }
      } catch (e) {}
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function playSoon(video){
    if (!video) return;
    window.setTimeout(() => {
      try {
        const playResult = video.play();
        if (playResult && playResult.catch) playResult.catch(() => {});
      } catch (e) {}
    }, 650);
  }

  function scrollPast(current, reason){
    if (!enabled) return;

    const now = Date.now();
    if (now < skipCooldownUntil || now - lastSkipAt < 500) return;
    lastSkipAt = now;
    skipCooldownUntil = now + 1300;

    const next = findNextVideo(current);
    log('Skipping Reel', reason, next ? 'with next video' : 'with fallback scroll');

    if (next){
      try {
        next.scrollIntoView({behavior: 'smooth', block: 'center'});
      } catch (e) {
        const rect = next.getBoundingClientRect();
        window.scrollTo({top: rect.top + window.scrollY - 80, behavior: 'smooth'});
      }
      playSoon(next);
      return;
    }

    const scroller = getScrollableParent(current);
    const amount = Math.max(window.innerHeight * 0.85, 480);
    try {
      if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body){
        window.scrollBy({top: amount, behavior: 'smooth'});
      } else {
        scroller.scrollBy({top: Math.max(scroller.clientHeight * 0.85, 480), behavior: 'smooth'});
      }
    } catch (e) {
      window.scrollBy(0, amount);
    }
  }

  function eventVideoIsFocused(video){
    const focused = findFocusedVideo();
    if (!focused || !video) return false;
    if (focused === video) return true;
    return videoCenterDistance(video) < Math.max(window.innerHeight * 0.25, 180);
  }

  function onVideoEnded(event){
    const video = event && event.target ? event.target : findFocusedVideo();
    if (!video || !eventVideoIsFocused(video)) return;

    if (event && event.type === 'timeupdate'){
      try {
        if (!video.duration || !video.currentTime || video.duration - video.currentTime > 0.25) return;
      } catch (e) {
        return;
      }
    }

    scrollPast(video, event && event.type ? event.type : 'ended');
  }

  function attachVideo(video){
    if (!video || attachedVideos.has(video)) return;

    function onTimeUpdate(){
      onVideoEnded({target: video, type: 'timeupdate'});
    }

    video.addEventListener('ended', onVideoEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    attachedVideos.add(video);
    cleanupByVideo.set(video, () => {
      try { video.removeEventListener('ended', onVideoEnded); } catch (e) {}
      try { video.removeEventListener('timeupdate', onTimeUpdate); } catch (e) {}
    });
  }

  function detachAllVideos(){
    attachedVideos.forEach((video) => {
      const cleanup = cleanupByVideo.get(video);
      if (cleanup) cleanup();
    });
    attachedVideos.clear();
  }

  function attachExistingVideos(){
    if (!isReelsPage()){
      detachAllVideos();
      return;
    }

    getVideos().forEach(attachVideo);
  }

  function shouldScanRoot(el, searchRect){
    if (!isElementVisible(el)) return false;
    if (el === document.body || el === document.documentElement) return false;

    const rect = el.getBoundingClientRect();
    if (!rectsIntersect(rect, searchRect)) return false;

    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    return rectArea(rect) < viewportArea * 0.98;
  }

  function hasSponsoredLabel(el, searchRect){
    if (!isElementVisible(el)) return false;

    const rect = el.getBoundingClientRect();
    if (!rectsIntersect(rect, searchRect)) return false;

    if (textHasSponsoredSignal(el.getAttribute && el.getAttribute('aria-label'))) return true;
    if (textHasSponsoredSignal(el.getAttribute && el.getAttribute('title'))) return true;
    if (textHasSponsoredSignal(el.getAttribute && el.getAttribute('alt'))) return true;

    const text = normalizeText(el.innerText || el.textContent);
    return textHasSponsoredSignal(text);
  }

  function rootHasSponsoredLabel(root, searchRect){
    if (!shouldScanRoot(root, searchRect)) return false;
    if (hasSponsoredLabel(root, searchRect)) return true;
    if (!root.querySelectorAll) return false;

    let candidates;
    try {
      candidates = root.querySelectorAll('span, div, a, button, [aria-label], [title], [alt]');
    } catch (e) {
      return false;
    }

    const limit = Math.min(candidates.length, 160);
    for (let i = 0; i < limit; i++){
      if (hasSponsoredLabel(candidates[i], searchRect)) return true;
    }

    return false;
  }

  function scanVisibleSponsoredLabels(searchRect){
    let candidates;
    try {
      candidates = document.querySelectorAll('span, a, button, [aria-label], [title], [alt]');
    } catch (e) {
      return false;
    }

    const limit = Math.min(candidates.length, 700);
    for (let i = 0; i < limit; i++){
      const el = candidates[i];
      if (!isElementVisible(el)) continue;

      let rect;
      try {
        rect = el.getBoundingClientRect();
      } catch (e) {
        continue;
      }

      if (!rectsIntersect(rect, searchRect)) continue;
      if (hasSponsoredLabel(el, searchRect)) return true;
    }

    return false;
  }

  function detectSponsoredNearby(video){
    if (!video || !isReelsPage()) return false;

    const videoRect = video.getBoundingClientRect();
    const searchRect = expandRect(videoRect, Math.min(360, window.innerWidth * 0.28), 140);
    if (scanVisibleSponsoredLabels(searchRect)) return true;

    const samplePoints = [
      {x: videoRect.left + videoRect.width * 0.5, y: videoRect.top + videoRect.height * 0.16},
      {x: videoRect.left + videoRect.width * 0.5, y: videoRect.top + videoRect.height * 0.5},
      {x: videoRect.left + videoRect.width * 0.5, y: videoRect.top + videoRect.height * 0.84},
      {x: videoRect.left + videoRect.width * 0.22, y: videoRect.top + videoRect.height * 0.84},
      {x: videoRect.left + videoRect.width * 0.78, y: videoRect.top + videoRect.height * 0.84}
    ];

    for (const point of samplePoints){
      if (point.x < 0 || point.y < 0 || point.x > window.innerWidth || point.y > window.innerHeight) continue;

      let elements = [];
      try {
        elements = document.elementsFromPoint(point.x, point.y);
      } catch (e) {}

      for (const el of elements){
        let node = el;
        for (let depth = 0; depth < 8 && node; depth++){
          if (rootHasSponsoredLabel(node, searchRect)) return true;
          node = node.parentElement;
        }
      }
    }

    let node = video;
    for (let depth = 0; depth < 8 && node; depth++){
      if (rootHasSponsoredLabel(node, searchRect)) return true;
      node = node.parentElement;
    }

    return false;
  }

  function skipSponsoredIfFocused(){
    const focused = findFocusedVideo();
    if (!focused) return;

    if (detectSponsoredNearby(focused)){
      scrollPast(focused, 'sponsored');
    }
  }

  function syncReelsPage(){
    if (!enabled) return;
    observePage();
    attachExistingVideos();
    if (isReelsPage()) skipSponsoredIfFocused();
  }

  function observePage(){
    if (observer || !document.body) return;

    observer = new MutationObserver(() => {
      window.setTimeout(syncReelsPage, 50);
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }

  function start(){
    if (enabled) return;
    enabled = true;

    if (!document.body){
      window.setTimeout(syncReelsPage, 250);
    } else {
      observePage();
      syncReelsPage();
    }

    if (!syncInterval){
      syncInterval = window.setInterval(syncReelsPage, 800);
    }

    log('enabled');
  }

  function stop(){
    if (!enabled) return;
    enabled = false;

    if (observer){
      observer.disconnect();
      observer = null;
    }

    if (syncInterval){
      window.clearInterval(syncInterval);
      syncInterval = null;
    }

    detachAllVideos();
    log('disabled');
  }

  function applyEnabled(value){
    if (value) start();
    else stop();
  }

  function initFromStorage(){
    try {
      chrome.storage.local.get([ENABLED_KEY], (res) => {
        if (chrome.runtime.lastError){
          console.warn('[ReelScroller] storage read failed', chrome.runtime.lastError.message);
          applyEnabled(true);
          return;
        }

        const hasValue = Object.prototype.hasOwnProperty.call(res, ENABLED_KEY);
        applyEnabled(hasValue ? res[ENABLED_KEY] !== false : true);
      });
    } catch (e) {
      applyEnabled(true);
    }
  }

  const controller = {
    start,
    stop,
    initFromStorage,
    applyEnabled
  };

  window[CONTROLLER_KEY] = controller;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return false;

    if (msg.type === 'PING'){
      if (sendResponse) sendResponse({ok: true, enabled});
      return true;
    }

    if (msg.type === 'ENABLE'){
      start();
      if (sendResponse) sendResponse({ok: true, enabled: true});
      return true;
    }

    if (msg.type === 'DISABLE'){
      stop();
      if (sendResponse) sendResponse({ok: true, enabled: false});
      return true;
    }

    return false;
  });

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes || !changes[ENABLED_KEY]) return;
      applyEnabled(changes[ENABLED_KEY].newValue !== false);
    });
  } catch (e) {}

  initFromStorage();
})();
