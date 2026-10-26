// Background service worker (MV3)
// Handles: token storage, message routing between popup and content script,
//          message origin validation.

const VALID_ACTIONS = new Set(["FILL_FORM", "VALIDATE_FIELDS", "CLEAR_FORM", "DETECT_PAGE", "SCAN_FIELDS", "TEST_FILL", "GET_TOKEN", "SET_TOKEN", "CLEAR_TOKEN"]);

function deliverToContentScript(tabId, message, sendResponse, retried = false) {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    const messageError = chrome.runtime.lastError?.message;
    if (!messageError) {
      sendResponse(response || { ok: false, error: "The page script did not return a response." });
      return;
    }

    if (retried || !messageError.includes("Receiving end does not exist")) {
      sendResponse({ ok: false, error: messageError });
      return;
    }

    // The tab may have been open before the extension was loaded or refreshed.
    // Reuse any already-loaded field map, then inject the missing content script.
    chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: () => ({
        hasFieldMap: typeof SPICE_PART_A_FIELDS !== "undefined",
        hasContentScript: Boolean(window.__ledgerlyMcaAssistantLoaded),
      }),
    }, (results) => {
      const inspectError = chrome.runtime.lastError?.message;
      if (inspectError) {
        sendResponse({ ok: false, error: `Could not prepare the page scanner: ${inspectError}` });
        return;
      }

      const state = results?.[0]?.result || {};
      const files = [];
      if (!state.hasFieldMap) files.push("field-map.js");
      if (!state.hasContentScript) files.push("content.js");
      if (!files.length) {
        sendResponse({ ok: false, error: "The page script is present but did not respond. Reload the page and try again." });
        return;
      }

      chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files }, () => {
        const injectError = chrome.runtime.lastError?.message;
        if (injectError) {
          sendResponse({ ok: false, error: `Could not start the page scanner: ${injectError}` });
          return;
        }
        deliverToContentScript(tabId, message, sendResponse, true);
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from our own extension pages or content scripts
  if (sender.id !== chrome.runtime.id) return;

  const action = message?.action;
  if (!action || !VALID_ACTIONS.has(action)) {
    sendResponse({ ok: false, error: "Unknown action" });
    return;
  }

  // Token management (popup ↔ storage)
  if (action === "GET_TOKEN") {
    chrome.storage.session.get(["extToken", "extTokenMeta"], (data) => {
      sendResponse({ ok: true, token: data.extToken || null, meta: data.extTokenMeta || null });
    });
    return true; // async
  }

  if (action === "SET_TOKEN") {
    const { token, meta } = message;
    if (!token) { sendResponse({ ok: false, error: "No token" }); return; }
    chrome.storage.session.set({ extToken: token, extTokenMeta: meta }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (action === "CLEAR_TOKEN") {
    chrome.storage.session.remove(["extToken", "extTokenMeta"], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // Content script actions — relay to active tab
  if (["FILL_FORM", "VALIDATE_FIELDS", "CLEAR_FORM", "DETECT_PAGE", "SCAN_FIELDS", "TEST_FILL"].includes(action)) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }
      if (message.sampleData === true && !tab.url?.startsWith("http://localhost:4000/")) {
        sendResponse({ ok: false, error: "Sample data is restricted to the local demo form at localhost:4000." });
        return;
      }
      // Guard: FILL/VALIDATE/CLEAR/SCAN only allowed on MCA domain (any subdomain) or local test server
      const isMCA = tab.url?.includes("mca.gov.in") || tab.url?.startsWith("http://localhost:4000/");
      if (action !== "DETECT_PAGE" && !isMCA) {
        sendResponse({ ok: false, error: "Active tab is not an MCA page. Navigate to the MCA portal (mca.gov.in) or the local test form." });
        return;
      }
      deliverToContentScript(tab.id, message, sendResponse);
    });
    return true; // async
  }
});
