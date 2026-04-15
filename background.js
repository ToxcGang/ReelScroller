// Background script: manages per-tab enabled state and toolbar toggle (MV2-compatible)

console.log('[ReelScroller - background] loaded');

// Ping instagram tabs to see if content script is present
function pingInstagramTabs(){
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || !tabs.length) return;
    tabs.forEach(tab => {
      if (!tab || !tab.url || !tab.id) return;
      if (!tab.url.includes('instagram.com')) return;
      chrome.tabs.sendMessage(tab.id, {type: 'PING'}, () => {
        if (chrome.runtime.lastError){
          console.log('[ReelScroller] no content script in tab', tab.id, chrome.runtime.lastError.message);
        } else {
          console.log('[ReelScroller] content script present in tab', tab.id);
        }
      });
    });
  });
}

// run once at startup
try{ pingInstagramTabs(); } catch(e) { console.warn('[ReelScroller] ping failed', e); }

const storageKey = (tabId) => String(tabId);

function setEnabledForTab(tabId, enabled){
  const obj = {};
  obj[storageKey(tabId)] = enabled;
  chrome.storage.local.set(obj);
  try {
    chrome.browserAction.setBadgeText({text: enabled ? 'ON' : '', tabId});
  } catch (e) {
    // ignore
  }
}

function injectContentScript(tabId, callback){
  try{
    chrome.tabs.executeScript(tabId, {file: 'content_script_clean.js'}, () => {
      if (chrome.runtime.lastError){
        console.warn('[ReelScroller] inject error', chrome.runtime.lastError.message);
      } else {
        console.log('[ReelScroller] injected content_script into tab', tabId);
      }
      if (callback) callback();
    });
  } catch(e){
    console.warn('[ReelScroller] inject exception', e);
    if (callback) callback();
  }
}

chrome.browserAction.onClicked.addListener((tab) => {
  const tabId = tab.id;
  injectContentScript(tabId, () => {
    chrome.storage.local.get([storageKey(tabId)], (res) => {
      const currently = !!res[storageKey(tabId)];
      const next = !currently;
      setEnabledForTab(tabId, next);
      chrome.tabs.sendMessage(tabId, {type: next ? 'ENABLE' : 'DISABLE'}, () => {
        if (chrome.runtime.lastError) {
          // console.warn('sendMessage error', chrome.runtime.lastError);
        }
      });
    });
  });
});

function isInstagramUrl(url){
  return typeof url === 'string' && url.includes('instagram.com');
}

// When a tab finishes loading, inject content script and enable by default if no preference exists
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isInstagramUrl(tab && tab.url)){
    injectContentScript(tabId, () => {
      chrome.storage.local.get([storageKey(tabId)], (res) => {
        const val = res.hasOwnProperty(storageKey(tabId)) ? res[storageKey(tabId)] : undefined;
        if (val === undefined){
          // default ON
          setEnabledForTab(tabId, true);
          chrome.tabs.sendMessage(tabId, {type: 'ENABLE'}, () => {});
        } else if (val){
          chrome.tabs.sendMessage(tabId, {type: 'ENABLE'}, () => {});
        }
      });
    });
  }
});

// When a new tab is created, inject and set default ON for instagram pages
chrome.tabs.onCreated.addListener((tab) => {
  if (isInstagramUrl(tab && tab.url)){
    injectContentScript(tab.id, () => {
      chrome.storage.local.get([storageKey(tab.id)], (res) => {
        if (!res.hasOwnProperty(storageKey(tab.id))){
          setEnabledForTab(tab.id, true);
          chrome.tabs.sendMessage(tab.id, {type: 'ENABLE'}, () => {});
        }
      });
    });
  }
});

// Initial scan (in case the extension is reloaded) - inject & enable for existing Instagram tabs if no preference
chrome.tabs.query({}, (tabs) => {
  if (!tabs || !tabs.length) return;
  tabs.forEach(tab => {
    if (!isInstagramUrl(tab.url)) return;
    injectContentScript(tab.id, () => {
      chrome.storage.local.get([storageKey(tab.id)], (res) => {
        if (!res.hasOwnProperty(storageKey(tab.id))){
          setEnabledForTab(tab.id, true);
          chrome.tabs.sendMessage(tab.id, {type: 'ENABLE'}, () => {});
        }
      });
    });
  });
});

// Clean up storage when tab is removed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove([storageKey(tabId)]);
});