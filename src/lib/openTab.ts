export async function openTabSafely(url: string): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.tabs.create({ url });
      return;
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  const fallback = window.open(url, "_blank");
  if (!fallback) {
    throw lastError ?? new Error("Failed to open viewer tab");
  }
}
