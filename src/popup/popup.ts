import { MAX_BYTES } from "../lib/constants";
import { applyI18n, initI18n, onLocaleChange, setHtmlLang, t } from "../lib/i18n";
import { openTabSafely } from "../lib/openTab";
import { savePending } from "../lib/pendingFiles";

const dropzone = mustGet<HTMLDivElement>("#dropzone");
const dropzoneText = mustGet<HTMLParagraphElement>("#dropzoneText");
const fileInput = mustGet<HTMLInputElement>("#fileInput");
const statusText = mustGet<HTMLParagraphElement>("#status");
const errorText = mustGet<HTMLParagraphElement>("#error");

void bootstrap();

async function bootstrap(): Promise<void> {
  await initI18n();
  setHtmlLang();
  applyI18n();

  onLocaleChange(() => {
    setHtmlLang();
    applyI18n();
    clearMessages();
  });

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
    dropzoneText.textContent = t("popupDropzoneDragover");
  });

  dropzone.addEventListener("dragleave", (event) => {
    if (event.target !== dropzone) {
      return;
    }
    dropzone.classList.remove("dragover");
    dropzoneText.textContent = t("popupDropzoneIdle");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
    dropzoneText.textContent = t("popupDropzoneIdle");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void handleFile(file);
    }
  });
}

async function handleFile(file: File): Promise<void> {
  clearMessages();

  if (!file.name.toLowerCase().endsWith(".dxf")) {
    errorText.textContent = t("popupErrorInvalidFile");
    return;
  }

  if (file.size > MAX_BYTES) {
    errorText.textContent = t("popupErrorTooLarge");
    return;
  }

  statusText.classList.remove("hidden");
  statusText.textContent = t("popupStatusOpening");
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
    await openTabSafely(url);

    window.close();
  } catch (err) {
    console.error(err);
    statusText.classList.add("hidden");
    statusText.textContent = "";
    dropzoneText.textContent = t("popupDropzoneIdle");
    errorText.textContent = t("popupErrorCantOpen");
  }
}

function clearMessages(): void {
  statusText.classList.add("hidden");
  statusText.textContent = "";
  errorText.textContent = "";
  dropzoneText.textContent = t("popupDropzoneIdle");
}

function mustGet<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Popup element missing: ${selector}`);
  }
  return node;
}
