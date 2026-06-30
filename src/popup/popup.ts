import { MAX_BYTES } from "../lib/constants";
import { getAnalyticsEnabled, setAnalyticsEnabled, track } from "../lib/analytics";
import { applyI18n, initI18n, onLocaleChange, setHtmlLang, t } from "../lib/i18n";
import { openTabSafely } from "../lib/openTab";
import { savePending } from "../lib/pendingFiles";

const dropzone = mustGet<HTMLDivElement>("#dropzone");
const dropzoneText = mustGet<HTMLParagraphElement>("#dropzoneText");
const fileInput = mustGet<HTMLInputElement>("#fileInput");
const statusText = mustGet<HTMLParagraphElement>("#status");
const errorText = mustGet<HTMLParagraphElement>("#error");
const analyticsSettings = mustGet<HTMLElement>("#analyticsSettings");
const analyticsToggle = mustGet<HTMLInputElement>("#analyticsToggle");

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

  analyticsToggle.checked = getAnalyticsEnabled();
  analyticsToggle.addEventListener("change", () => {
    const enabled = analyticsToggle.checked;
    if (!enabled) {
      track("analytics_consent_changed", { enabled: false });
    }
    setAnalyticsEnabled(enabled);
    if (enabled) {
      track("analytics_consent_changed", { enabled: true });
    }
  });
  analyticsSettings.addEventListener("click", (event) => event.stopPropagation());
  analyticsSettings.addEventListener("keydown", (event) => event.stopPropagation());
  track("popup_opened");

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
      void handleFile(file, "popup_picker");
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
      void handleFile(file, "popup_drop");
    }
  });
}

async function handleFile(file: File, source: "popup_picker" | "popup_drop"): Promise<void> {
  clearMessages();
  track("file_open_started", {
    source,
    file_type: fileTypeFromName(file.name),
    size_bucket: getSizeBucket(file.size),
  });

  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".dxf") && !lower.endsWith(".dwg")) {
    track("file_open_failed", { source, reason: "invalid_extension" });
    errorText.textContent = t("popupErrorInvalidFile");
    return;
  }

  if (file.size > MAX_BYTES) {
    track("file_open_failed", { source, reason: "file_too_large" });
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
    track("file_open_succeeded", {
      source,
      file_type: fileTypeFromName(file.name),
      size_bucket: getSizeBucket(file.size),
    });

    window.close();
  } catch (err) {
    console.error(err);
    track("file_open_failed", { source, reason: "open_failed" });
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

function getSizeBucket(size: number): string {
  if (size < 1024 * 1024) return "lt_1mb";
  if (size <= 10 * 1024 * 1024) return "1_to_10mb";
  return "gt_10mb";
}

function fileTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".dwg")) return "dwg";
  if (lower.endsWith(".dxf")) return "dxf";
  return "unknown";
}
