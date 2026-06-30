import { getOrCreateDistinctId } from "./lib/analyticsIdentity";

const WELCOME_PAGE_URL = "https://alexlyr.github.io/dxf-file-viewer-pages/welcome/";
const UNINSTALL_PAGE_URL = "https://alexlyr.github.io/dxf-file-viewer-pages/uninstall/";

void configureTrackingUrls();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== chrome.runtime.OnInstalledReason.INSTALL) {
    return;
  }

  void openWelcomeWithDistinctId();
});

async function configureTrackingUrls(): Promise<void> {
  try {
    const did = await getOrCreateDistinctId();
    await chrome.runtime.setUninstallURL(withDistinctId(UNINSTALL_PAGE_URL, did));
  } catch {
    await chrome.runtime.setUninstallURL(UNINSTALL_PAGE_URL);
  }
}

async function openWelcomeWithDistinctId(): Promise<void> {
  try {
    const did = await getOrCreateDistinctId();
    await chrome.tabs.create({ url: withDistinctId(WELCOME_PAGE_URL, did) });
  } catch {
    await chrome.tabs.create({ url: WELCOME_PAGE_URL });
  }
}

function withDistinctId(baseUrl: string, did: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("did", did);
  return url.toString();
}
