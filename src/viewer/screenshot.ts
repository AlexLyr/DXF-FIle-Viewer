import { getViewerCanvas } from "./types";
import { state } from "./state";
import { dom } from "./dom";
import { worldToScreen } from "./coords";
import { getUnitLabel } from "./units";
import { showToast } from "./toast";
import { t } from "../lib/i18n";

function formatTimestampLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

function buildImageFileName(sourceName: string): string {
  const base = (sourceName || "drawing").replace(/\.(dxf|dwg)$/i, "") || "drawing";
  return `${base}__view_${formatTimestampLocal(new Date())}.png`;
}

function saveBlobToFile(blob: Blob, fileName: string): boolean {
  try {
    downloadBlob(blob, fileName);
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function drawMeasureOverlayToImage(ctx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
  if (!state.measureActive || !state.measureStart || !state.measureEnd) return;
  const a = worldToScreen(state.measureStart.x, state.measureStart.y);
  const b = worldToScreen(state.measureEnd.x, state.measureEnd.y);
  if (!a || !b) return;

  const ax = a.x * scaleX;
  const ay = a.y * scaleY;
  const bx = b.x * scaleX;
  const by = b.y * scaleY;

  const vars = getComputedStyle(document.documentElement);
  const accent = vars.getPropertyValue("--accent-strong").trim() || "#2b76ff";
  const bg = vars.getPropertyValue("--bg-elevated").trim() || "#f6f7f9";

  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, 2 * ((scaleX + scaleY) / 2));
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  const wdx = state.measureEnd.x - state.measureStart.x;
  const wdy = state.measureEnd.y - state.measureStart.y;
  const wlen = Math.hypot(wdx, wdy);
  const unit = getUnitLabel(state.viewer);
  const label = `${wlen.toFixed(2)} ${unit}`;

  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const fontPx = Math.max(12, 12 * ((scaleX + scaleY) / 2));
  ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif`;
  const textW = ctx.measureText(label).width;
  const padX = 8 * ((scaleX + scaleY) / 2);
  const padY = 5 * ((scaleX + scaleY) / 2);
  const boxH = fontPx + padY * 2;
  const boxW = textW + padX * 2;
  const boxX = mx - boxW / 2;
  const boxY = my - boxH - 10 * ((scaleX + scaleY) / 2);

  ctx.fillStyle = bg;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, 1.2 * ((scaleX + scaleY) / 2));
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = accent;
  ctx.fillText(label, boxX + padX, boxY + boxH - padY - 1);
  ctx.restore();
}

export function setScreenshotEnabled(enabled: boolean): void {
  dom.screenshotBtn.disabled = !enabled;
  dom.screenshotBtn.setAttribute("aria-disabled", String(!enabled));
}

async function writePngToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (!("clipboard" in navigator) || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export async function takeScreenshot(): Promise<void> {
  if (!state.viewer || dom.screenshotBtn.disabled) return;
  const canvas = getViewerCanvas(state.viewer);
  if (!canvas) return;
  try {
    state.viewer.Render();
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) {
      showToast(t("viewerToastScreenshotError"), { variant: "error" });
      return;
    }
    ctx.drawImage(canvas, 0, 0);
    const scaleX = canvas.clientWidth > 0 ? out.width / canvas.clientWidth : 1;
    const scaleY = canvas.clientHeight > 0 ? out.height / canvas.clientHeight : 1;
    drawMeasureOverlayToImage(ctx, scaleX, scaleY);
    const blob = await canvasToPngBlob(out);
    if (!blob) {
      showToast(t("viewerToastScreenshotError"), { variant: "error" });
      return;
    }
    const fileName = buildImageFileName(state.currentName);
    const [clipboardOk, saveOk] = await Promise.all([writePngToClipboard(blob), Promise.resolve(saveBlobToFile(blob, fileName))]);
    if (clipboardOk && saveOk) {
      showToast(t("viewerToastScreenshotSaved"));
      return;
    }
    if (saveOk) {
      showToast(t("viewerToastScreenshotClipboardBlocked"));
      return;
    }
    showToast(t("viewerToastScreenshotError"), { variant: "error" });
  } catch {
    showToast(t("viewerToastScreenshotError"), { variant: "error" });
  }
}
