import { dom } from "./dom";

type ToastOptions = { variant?: "info" | "error"; durationMs?: number };

const DEFAULT_TOAST_MS = 1800;
let hideTimer = 0;
let cleanupTimer = 0;

export function showToast(message: string, options?: ToastOptions): void {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }
  if (cleanupTimer) {
    window.clearTimeout(cleanupTimer);
    cleanupTimer = 0;
  }
  const durationMs = options?.durationMs ?? DEFAULT_TOAST_MS;
  const variant = options?.variant ?? "info";
  dom.toast.textContent = message;
  dom.toast.classList.toggle("error", variant === "error");
  dom.toast.classList.remove("hidden");
  requestAnimationFrame(() => {
    dom.toast.classList.add("visible");
  });
  hideTimer = window.setTimeout(() => {
    dom.toast.classList.remove("visible");
    cleanupTimer = window.setTimeout(() => {
      dom.toast.classList.add("hidden");
      dom.toast.classList.remove("error");
      cleanupTimer = 0;
    }, 180);
    hideTimer = 0;
  }, durationMs);
}
