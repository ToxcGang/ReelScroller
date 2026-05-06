// Background script: global toolbar toggle and Instagram tab coordination.

console.log('[ReelScroller - background] loaded');

const ENABLED_KEY = 'reelScrollerEnabled';

function isInstagramUrl(url){
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'instagram.com' || parsed.hostname.endsWith('.instagram.com');
  } catch (e) {
    return url.includes('instagram.com');
  }
}

function getEnabled(callback){
  chrome.storage.local.get([ENABLED_KEY], (res) => {
    if (chrome.runtime.lastError){
      console.warn('[ReelScroller] storage read failed', chrome.runtime.lastError.message);
      callback(true);
      return;
    }

    const hasValue = Object.prototype.hasOwnProperty.call(res, ENABLED_KEY);
    callback(hasValue ? res[ENABLED_KEY] !== false : true);
  });
}

function setEnabled(enabled, callback){
  const value = !!enabled;
  const data = {};
  data[ENABLED_KEY] = value;

  chrome.storage.local.set(data, () => {
    if (chrome.runtime.lastError){
      console.warn('[ReelScroller] storage write failed', chrome.runtime.lastError.message);
    }
    updateToolbar(value);
    if (callback) callback(value);
  });
}

function updateToolbar(enabled){
  try {
    chrome.browserAction.setBadgeText({text: enabled ? 'ON' : ''});
    chrome.browserAction.setBadgeBackgroundColor({color: enabled ? '#2e7d32' : '#666666'});
    chrome.browserAction.setTitle({title: `Reel Scroller: ${enabled ? 'On' : 'Off'}`});
  } catch (e) {
    // Browser action APIs can be unavailable during extension startup in some contexts.
  }
}

function injectContentScript(tabId, callback){
  try {
    chrome.tabs.executeScript(tabId, {file: 'content_script_clean.js'}, () => {
      if (chrome.runtime.lastError){
        console.warn('[ReelScroller] content script inject failed', chrome.runtime.lastError.message);
      }
      if (callback) callback();
    });
  } catch (e) {
    console.warn('[ReelScroller] content script inject exception', e);
    if (callback) callback();
  }
}

function sendStateToTab(tabId, enabled){
  chrome.tabs.sendMessage(tabId, {type: enabled ? 'ENABLE' : 'DISABLE'}, () => {
    if (chrome.runtime.lastError){
      // Existing tabs may not have the content script yet. Inject once, then retry.
      injectContentScript(tabId, () => {
        chrome.tabs.sendMessage(tabId, {type: enabled ? 'ENABLE' : 'DISABLE'}, () => {
          if (chrome.runtime.lastError){
            console.warn('[ReelScroller] state message failed', chrome.runtime.lastError.message);
          }
        });
      });
    }
  });
}

function applyStateToInstagramTabs(enabled){
  chrome.tabs.query({}, (tabs) => {
    if (!tabs || !tabs.length) return;
    tabs.forEach((tab) => {
      if (!tab || typeof tab.id !== 'number' || !isInstagramUrl(tab.url)) return;
      sendStateToTab(tab.id, enabled);
    });
  });
}

chrome.browserAction.onClicked.addListener(() => {
  getEnabled((currentlyEnabled) => {
    setEnabled(!currentlyEnabled, (nextEnabled) => {
      applyStateToInstagramTabs(nextEnabled);
    });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !isInstagramUrl(tab && tab.url)) return;

  getEnabled((enabled) => {
    updateToolbar(enabled);
    sendStateToTab(tabId, enabled);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  getEnabled((enabled) => {
    updateToolbar(enabled);
    applyStateToInstagramTabs(enabled);
  });
});

chrome.runtime.onStartup.addListener(() => {
  getEnabled((enabled) => {
    updateToolbar(enabled);
    applyStateToInstagramTabs(enabled);
  });
});

getEnabled((enabled) => {
  updateToolbar(enabled);
  applyStateToInstagramTabs(enabled);
});
