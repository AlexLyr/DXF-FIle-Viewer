const WELCOME_PAGE_URL = "https://alexlyr.github.io/dxf-file-viewer-pages/welcome/";
const UNINSTALL_PAGE_URL = "https://alexlyr.github.io/dxf-file-viewer-pages/uninstall/";

chrome.runtime.setUninstallURL(UNINSTALL_PAGE_URL);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== chrome.runtime.OnInstalledReason.INSTALL) {
    return;
  }

  chrome.tabs.create({ url: WELCOME_PAGE_URL });
});
