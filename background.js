// Background script: manages per-tab enabled state and toolbar toggle (MV2-compatible)

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

chrome.browserAction.onClicked.addListener((tab) => {
  const tabId = tab.id;
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

function isInstagramUrl(url){
  return typeof url === 'string' && url.includes('instagram.com');
}

// When a tab finishes loading, enable by default if no preference exists, and re-send enable if stored true
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isInstagramUrl(tab && tab.url)){
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
  }
});

// When a new tab is created, set default ON for instagram pages
chrome.tabs.onCreated.addListener((tab) => {
  if (isInstagramUrl(tab && tab.url)){
    chrome.storage.local.get([storageKey(tab.id)], (res) => {
      if (!res.hasOwnProperty(storageKey(tab.id))){
        setEnabledForTab(tab.id, true);
        chrome.tabs.sendMessage(tab.id, {type: 'ENABLE'}, () => {});
      }
    });
  }
});

// Initial scan (in case the extension is reloaded) - enable for existing Instagram tabs if no preference
chrome.tabs.query({url: '*://www.instagram.com/*'}, (tabs) => {
  if (!tabs || !tabs.length) return;
  tabs.forEach(tab => {
    chrome.storage.local.get([storageKey(tab.id)], (res) => {
      if (!res.hasOwnProperty(storageKey(tab.id))){
        setEnabledForTab(tab.id, true);
        chrome.tabs.sendMessage(tab.id, {type: 'ENABLE'}, () => {});
      }
    });
  });
});

// Clean up storage when tab is removed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove([storageKey(tabId)]);
});