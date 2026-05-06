// Deprecated shim for content_script.js — replaced by content_script_clean.js
(function(){
  // No-op shim to prevent accidental loading of the broken legacy script.
  try{
    console.log('[ReelScroller] deprecated content_script.js loaded — no-op');
  }catch(e){}
})();
