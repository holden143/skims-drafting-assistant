chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_SKIMS_PANEL") {
    (async () => {
      if (typeof message.selectedText === "string" && message.selectedText.trim()) {
        await chrome.storage.session.set({ selectedTicketText: message.selectedText.slice(0, 12000) });
      }
      if (sender.tab?.windowId !== undefined) {
        await chrome.sidePanel.open({ windowId: sender.tab.windowId });
      }
      sendResponse({ ok: true });
    })().catch(() => sendResponse({ ok: false }));
    return true;
  }
});