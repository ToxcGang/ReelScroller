// Content script for Instagram Reels auto-scrolling
// Behavior: when enabled, listen for the end of the currently visible video and scroll to the next one, then autoplay it.

(() => {
  let enabled = false;
  let observer = null;
  let adCheckInterval = null;

  function log(...args){
    console.log('[ReelScroller]', ...args);
  }

  function getAllVideos(){
    return Array.from(document.querySelectorAll('video')).filter(v => v && v.offsetParent !== null);
  }

  function videoCenterDistance(video){
    const r = video.getBoundingClientRect();
    const videoCenter = (r.top + r.bottom) / 2;
    const screenCenter = window.innerHeight / 2;
    return Math.abs(videoCenter - screenCenter);
  }

  function findFocusedVideo(){
    const vids = getAllVideos();
    if (vids.length === 0) return null;
    vids.sort((a,b) => videoCenterDistance(a) - videoCenterDistance(b));
    return vids[0];
  }

  function findNextVideo(current){
    const vids = getAllVideos().sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const idx = vids.indexOf(current);
    if (idx === -1) return vids[0] || null;
    return vids[idx+1] || null;
  }

  // Heuristics to detect ad/sponsored overlays near a video
  // contextRect (optional) — if provided, require matched anchors/elements to overlap this rect.
  function isAdElement(el, contextRect){
    if (!el) return false;
    try{
      const style = window.getComputedStyle && window.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0)) return false;
    } catch(e){}

    // Strong textual indicators
    try{
      const text = (el.innerText || el.textContent || '').toString().toLowerCase().trim();
      const adRegex = /sponsored|paid partnership|paid promotion|advertisement|promoted|sponsored by|sponsor/;
      if (adRegex.test(text)) return true;
    } catch(e){}

    // aria/title/alt
    try{
      const aria = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.getAttribute('alt') || '')) || '';
      if (aria && /sponsored|sponsor|promoted/i.test(aria)) return true;
    } catch(e){}

    // class tokens
    try{
      if (el.classList){
        for (const t of el.classList){
          const tt = t.toString().toLowerCase();
          if (tt === 'sponsored' || tt === 'sponsor' || tt === 'promoted') return true;
        }
      }
    } catch(e){}

    // data attributes and image alts
    try{
      const dataTest = (el.getAttribute && (el.getAttribute('data-testid') || el.getAttribute('data-sponsor') || el.getAttribute('data-sponsored') || '')) || '';
      if (dataTest && /sponsor|sponsored/i.test(dataTest)) return true;
    } catch(e){}
    try{
      const imgs = el.querySelectorAll && el.querySelectorAll('img, svg');
      if (imgs && imgs.length){
        for (let k=0;k<imgs.length;k++){
          const alt = (imgs[k].getAttribute('alt') || imgs[k].getAttribute('title') || '').toString().toLowerCase();
          if (alt && /sponsored|promotion|paid/i.test(alt)) return true;
        }
      }
    } catch(e){}

    // Strict Facebook ad/link detection using URL parsing (only treat clear clickthroughs)
    try{
      function hrefLooksLikeFacebookAd(h){
        if (!h) return false;
        try{
          const url = new URL(h, location.href);
          const host = url.hostname.toLowerCase();
          const path = (url.pathname || '').toLowerCase();
          // Redirector used for clicks
          if (host === 'l.facebook.com' && path.startsWith('/l.php')) return true;
          // facebook.com with a path segment exactly 'ads'
          const segments = path.split('/').filter(Boolean);
          if ((host === 'facebook.com' || host.endsWith('.facebook.com')) && segments.includes('ads')) return true;
          // query params common with ad clickthroughs
          const qp = url.searchParams;
          if (qp && (qp.has('ad_id') || qp.has('ad_click_id'))) return true;
        } catch(e){}
        return false;
      }

      // For anchors, require visible bounding rect and overlap with contextRect (if provided)
      if (el.tagName && el.tagName.toLowerCase() === 'a'){
        const h = el.getAttribute('href') || '';
        if (h && hrefLooksLikeFacebookAd(h)){
          try{
            const er = el.getBoundingClientRect();
            if (er.width <= 0 || er.height <= 0) return false;
            if (contextRect){
              const ix = Math.max(0, Math.min(er.right, contextRect.right) - Math.max(er.left, contextRect.left));
              const iy = Math.max(0, Math.min(er.bottom, contextRect.bottom) - Math.max(er.top, contextRect.top));
              if (ix * iy <= 0) return false;
            }
          } catch(e){}
          log('isAdElement: anchor href matches facebook ad', h.slice(0,120));
          return true;
        }
      }

      if (el.querySelectorAll){
        const anchors = el.querySelectorAll('a[href]');
        for (let i=0;i<anchors.length && i<20;i++){
          try{
            const href = anchors[i].getAttribute('href') || '';
            const dataHref = anchors[i].getAttribute('data-href') || anchors[i].getAttribute('data-url') || '';
            if ((href && hrefLooksLikeFacebookAd(href)) || (dataHref && hrefLooksLikeFacebookAd(dataHref))){
              try{
                const ar = anchors[i].getBoundingClientRect();
                if (ar.width <= 0 || ar.height <= 0) continue;
                if (contextRect){
                  const ix = Math.max(0, Math.min(ar.right, contextRect.right) - Math.max(ar.left, contextRect.left));
                  const iy = Math.max(0, Math.min(ar.bottom, contextRect.bottom) - Math.max(ar.top, contextRect.top));
                  if (ix * iy <= 0) continue;
                }
              } catch(e){}
              log('isAdElement: descendant anchor matches facebook ad', href.slice(0,120), dataHref.slice(0,120));
              return true;
            }
          } catch(e){}
        }
      }
    } catch(e){}

    return false;
  }

  function detectAdNearby(video){
    if (!video) return false;
    const rect = video.getBoundingClientRect();
    try{
      const points = [
        {x: rect.left + rect.width/2, y: rect.top + rect.height/2},
        {x: rect.left + rect.width/2, y: rect.top + 5},
        {x: rect.left + rect.width/2, y: rect.bottom - 5},
        {x: rect.left + 5, y: rect.top + rect.height/2},
        {x: rect.right - 5, y: rect.top + rect.height/2}
      ];
      for (const p of points){
        if (p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight) continue;
        const elems = document.elementsFromPoint(p.x, p.y);
        if (!elems || !elems.length) continue;
        for (const el of elems){
          if (isAdElement(el, rect)){
            try{
              const er = el.getBoundingClientRect();
              const ix = Math.max(0, Math.min(er.right, rect.right) - Math.max(er.left, rect.left));
              const iy = Math.max(0, Math.min(er.bottom, rect.bottom) - Math.max(er.top, rect.top));
              const interArea = ix * iy;
              const focusedArea = (rect.width * rect.height) || 1;
              if (interArea > 0 && (interArea > focusedArea * 0.005 || er.width < rect.width * 0.9)){
                log('detectAdNearby: matched element', el, (el.innerText||'').slice(0,80));
                return true;
              }
            } catch(e){}
          }
          let a = el;
          for (let i=0;i<5 && a; i++){
            try{
              if (isAdElement(a, rect)){
                const ar = a.getBoundingClientRect();
                const ix = Math.max(0, Math.min(ar.right, rect.right) - Math.max(ar.left, rect.left));
                const iy = Math.max(0, Math.min(ar.bottom, rect.bottom) - Math.max(ar.top, rect.top));
                if (ix * iy > 0){ log('detectAdNearby: matched ancestor', a); return true; }
              }
            } catch(e){}
            a = a.parentElement;
          }
        }
      }
    } catch(e){}

    let el = video;
    for (let i=0;i<6 && el; i++){
      try{
        if (isAdElement(el, rect)) return true;
        const kids = el.querySelectorAll && el.querySelectorAll(':scope > *');
        if (kids && kids.length){
          for (let j=0;j<kids.length;j++){
            try{
              if (isAdElement(kids[j], rect)){
                const kr = kids[j].getBoundingClientRect();
                const ix = Math.max(0, Math.min(kr.right, rect.right) - Math.max(kr.left, rect.left));
                const iy = Math.max(0, Math.min(kr.bottom, rect.bottom) - Math.max(kr.top, rect.top));
                if (ix * iy > 0) return true;
              }
            } catch(e){}
          }
        }
      } catch(e){}
      el = el.parentElement;
    }
    return false;
  }

  function attachEndedListener(video){
    if (!video) return;
    if (video.__rs_attached) return;
    video.__rs_attached = true;
    video.addEventListener('ended', onVideoEnded);

    let lastCheck = 0;
    function onTimeUpdate(){
      if (video.duration && video.currentTime){
        if (video.duration - video.currentTime < 0.25){
          log('timeupdate near-end', video.currentTime, '/', video.duration, video);
          onVideoEnded({target: video, type: 'timeupdate'});
        }
      }
      lastCheck = Date.now();
    }
    video.addEventListener('timeupdate', onTimeUpdate);

    video.__rs_cleanup = () => {
      try { video.removeEventListener('ended', onVideoEnded); } catch(e){}
      try { video.removeEventListener('timeupdate', onTimeUpdate); } catch(e){}
      video.__rs_attached = false;
      video.__rs_cleanup = null;
    };
  }

  function detachAll(){
    const vids = document.querySelectorAll('video');
    vids.forEach(v => {
      if (v.__rs_cleanup) v.__rs_cleanup();
    });
  }

  let lastHandling = 0;
  let skipCooldownUntil = 0;

  function onVideoEnded(e){
    const now = Date.now();
    if (now - lastHandling < 500) return; // debounce
    if (now < skipCooldownUntil) return; // temporary cooldown after a programmatic skip
    lastHandling = now;

    const current = e && e.target ? e.target : findFocusedVideo();
    log('onVideoEnded triggered', e && e.type, 'current?', !!current);
    if (!current) return;
    try{ log('current state', {currentTime: current.currentTime, duration: current.duration, paused: current.paused}); } catch(err){}

    if (e && e.type === 'timeupdate'){
      try{
        if (!(current.duration && current.currentTime && (current.duration - current.currentTime < 0.25))) return;
      } catch(err){}
    }

    if (detectAdNearby(current)){
      log('Ad detected on current video, skipping to next');
    }

    const next = findNextVideo(current);
    if (!next) return;
    log('Scrolling to next video', next);
    try {
      next.scrollIntoView({behavior: 'smooth', block: 'center'});
    } catch(e){
      window.scrollTo({top: next.getBoundingClientRect().top + window.scrollY - 100, behavior:'smooth'});
    }

    skipCooldownUntil = Date.now() + 1400;

    setTimeout(() => {
      try {
        next.muted = false;
        const p = next.play();
        if (p && p.catch) p.catch(() => {});
      } catch(e){}
    }, 600);
  }

  function attachToAllExisting(){
    const vids = getAllVideos();
    vids.forEach(attachEndedListener);
  }

  function observeNewVideos(){
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations){
        if (m.addedNodes && m.addedNodes.length){
          m.addedNodes.forEach(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (node.tagName && node.tagName.toLowerCase() === 'video') attachEndedListener(node);
            const videos = node.querySelectorAll && node.querySelectorAll('video');
            if (videos && videos.length) videos.forEach(attachEndedListener);

            try {
              const focused = findFocusedVideo();
              if (!focused) return;
              const frect = focused.getBoundingClientRect();
              if (isAdElement(node, frect)) {
                try {
                  const nrect = node.getBoundingClientRect();
                  const ix = Math.max(0, Math.min(nrect.right, frect.right) - Math.max(nrect.left, frect.left));
                  const iy = Math.max(0, Math.min(nrect.bottom, frect.bottom) - Math.max(nrect.top, frect.top));
                  const interArea = ix * iy;
                  const focusedArea = (frect.width * frect.height) || 1;
                  if (interArea > focusedArea * 0.02 || node.contains(focused) || node === focused || (node.closest && node.closest('video') === focused)) {
                    onVideoEnded({target: focused, type: 'ad'});
                  }
                } catch(e){}
              }
            } catch(e){}
          });
        }
      }
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }

  function checkFocusedForAd(){
    const focused = findFocusedVideo();
    if (!focused) return;
    try{
      if (detectAdNearby(focused)){
        setTimeout(() => onVideoEnded({target: focused, type: 'ad'}), 200);
      }
    } catch(e){}
  }

  function start(){
    if (enabled) return;
    enabled = true;
    attachToAllExisting();
    observeNewVideos();
    adCheckInterval = setInterval(checkFocusedForAd, 800);
    log('ReelScroller enabled');
  }

  function stop(){
    if (!enabled) return;
    enabled = false;
    if (observer){ observer.disconnect(); observer = null; }
    if (adCheckInterval){ clearInterval(adCheckInterval); adCheckInterval = null; }
    detachAll();
    log('ReelScroller disabled');
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'ENABLE') start();
    if (msg.type === 'DISABLE') stop();
  });

  // Start by default when the content script is injected so listeners are active for SPA navigation
  try{ start(); log('content script loaded and started'); } catch(e){}

})();