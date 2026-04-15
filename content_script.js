// Content script for Instagram Reels auto-scrolling
// Behavior: when enabled, listen for the end of the currently visible video and scroll to the next one, then autoplay it.

(() => {
  let enabled = false;
  let observer = null;
  let adCheckInterval = null;

  function log(...args){
    // Uncomment to debug
    // console.log('[ReelScroller]', ...args);
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
  function isAdElement(el){
    if (!el || !el.innerText) return false;
    try{
      const text = (el.innerText || '').toLowerCase().trim();
      // common signals: "sponsored", "paid partnership", "advertisement"
      if (/sponsored|paid partnership|advertisement|promoted/i.test(text)) return true;
    } catch(e){/* ignore */}
    try{
      const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
      if (aria && /sponsored|ad|advertisement|promoted/i.test(aria)) return true;
    } catch(e){}
    try{
      const cls = (el.className || '').toString().toLowerCase();
      if (cls && (cls.includes('sponsored') || cls.includes('ad') || cls.includes('promoted'))) return true;
    } catch(e){}
    return false;
  }

  function detectAdNearby(video){
    if (!video) return false;
    // check ancestors and their subtrees for ad markers
    let el = video;
    for (let i=0;i<6 && el; i++){
      if (isAdElement(el)) return true;
      // look for elements with ad-like text within this ancestor
      try{
        const candidates = el.querySelectorAll && el.querySelectorAll('*');
        if (candidates && candidates.length){
          for (let j=0;j<candidates.length;j++){
            const n = candidates[j];
            if (isAdElement(n)) return true;
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

    // fallback: if 'ended' isn't fired, detect near-end using timeupdate
    let lastCheck = 0;
    function onTimeUpdate(){
      if (video.duration && video.currentTime){
        if (video.duration - video.currentTime < 0.25){
          // near end
          onVideoEnded({target: video});
        }
      }
      lastCheck = Date.now();
    }
    video.addEventListener('timeupdate', onTimeUpdate);

    // Store cleanup
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
  function onVideoEnded(e){
    const now = Date.now();
    if (now - lastHandling < 500) return; // debounce
    lastHandling = now;
    const current = e && e.target ? e.target : findFocusedVideo();
    if (!current) return;

    // If current is an ad container / ad detected, immediately find next
    if (detectAdNearby(current)){
      log('Ad detected on current video, skipping to next');
    }

    const next = findNextVideo(current);
    if (!next) return;
    log('Scrolling to next video', next);
    // Scroll parent-most container that contains the video into view
    try {
      next.scrollIntoView({behavior: 'smooth', block: 'center'});
    } catch(e){
      window.scrollTo({top: next.getBoundingClientRect().top + window.scrollY - 100, behavior:'smooth'});
    }

    // Attempt to autoplay after a short delay (Instagram may lazily load/play)
    setTimeout(() => {
      try {
        // Unmute briefly so autoplay is allowed by site; site may reset mute
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

            // If an ad label appears within added nodes, and it relates to the focused video, skip
            try{
              if (isAdElement(node)){
                const focused = findFocusedVideo();
                if (focused && (node.contains(focused) || node === focused || node.closest('video') === focused || node.compareDocumentPosition(focused) & Node.DOCUMENT_POSITION_CONTAINS)){
                  onVideoEnded({target: focused});
                }
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
        // small delay to avoid fighting site transitions
        setTimeout(() => onVideoEnded({target: focused}), 200);
      }
    } catch(e){}
  }

  function start(){
    if (enabled) return;
    enabled = true;
    attachToAllExisting();
    observeNewVideos();
    // periodically check focused video for ad label
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

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'ENABLE') start();
    if (msg.type === 'DISABLE') stop();
  });

  // If the page navigates or reloads while the tab is enabled, background will ask us to enable.
  // No further bootstrapping needed here.
})();