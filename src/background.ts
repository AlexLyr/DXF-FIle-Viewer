const WELCOME_PAGE_URL = "https://alexlyr.github.io/DXF-FIle-Viewer/welcome/";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== chrome.runtime.OnInstalledReason.INSTALL) {
    return;
  }

  chrome.tabs.create({ url: WELCOME_PAGE_URL });
});
