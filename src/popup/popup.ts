import { savePending } from "../lib/pendingFiles";

const MAX_BYTES = 50 * 1024 * 1024;
const IDLE_TEXT = "Click or drop a .dxf";
const DRAGOVER_TEXT = "Release to open";

const dropzone = mustGet<HTMLDivElement>("#dropzone");
const dropzoneText = mustGet<HTMLParagraphElement>("#dropzoneText");
const fileInput = mustGet<HTMLInputElement>("#fileInput");
const statusText = mustGet<HTMLParagraphElement>("#status");
const errorText = mustGet<HTMLParagraphElement>("#error");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) {
    void handleFile(file);
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
  dropzoneText.textContent = DRAGOVER_TEXT;
});

dropzone.addEventListener("dragleave", (event) => {
  if (event.target !== dropzone) {
    return;
  }
  dropzone.classList.remove("dragover");
  dropzoneText.textContent = IDLE_TEXT;
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  dropzoneText.textContent = IDLE_TEXT;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    void handleFile(file);
  }
});

async function handleFile(file: File): Promise<void> {
  clearMessages();

  if (!file.name.toLowerCase().endsWith(".dxf")) {
    errorText.textContent =
      "Could not read file. Please choose a valid .dxf file.";
    return;
  }

  if (file.size > MAX_BYTES) {
    errorText.textContent =
      "File is too large. The viewer supports drawings up to 50 MB.";
    return;
  }

  statusText.classList.remove("hidden");
  statusText.textContent = "Opening viewer…";
  dropzoneText.textContent = "";

  try {
    const fileBuffer = await file.arrayBuffer();
    const fileId = crypto.randomUUID();
    await savePending({
      id: fileId,
      name: file.name,
      size: file.size,
      buffer: fileBuffer,
      createdAt: Date.now(),
    });

    const url = chrome.runtime.getURL(`src/viewer/viewer.html?id=${fileId}`);
    await openViewerTab(url);

    window.close();
  } catch (err) {
    console.error(err);
    statusText.classList.add("hidden");
    statusText.textContent = "";
    dropzoneText.textContent = IDLE_TEXT;
    errorText.textContent =
      "Could not open the viewer. Please try again.";
  }
}

async function openViewerTab(url: string): Promise<void> {
  // Some Chromium-based browsers reject chrome.tabs.create on the very first
  // session after install (treating it as an "onboarding" tab). Retry a few
  // times, then fall back to window.open which works from a user-gesture popup.
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

function clearMessages(): void {
  statusText.classList.add("hidden");
  statusText.textContent = "";
  errorText.textContent = "";
  dropzoneText.textContent = IDLE_TEXT;
}

function mustGet<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Popup element missing: ${selector}`);
  }
  return node;
}
