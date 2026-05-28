import { DxfViewer } from "dxf-viewer";
import { Color } from "three";
import { state } from "./state";
import { dom } from "./dom";
import { COMPARE_BASE_PALETTE } from "./colors";
import { getViewerCanvas, type ViewerWithInternals } from "./types";
import { showToast } from "./toast";
import { t } from "../lib/i18n";
import RobotoUrl from "../assets/fonts/roboto.ttf?url";
import DxfWorkerFactory from "../worker/dxf.worker.ts?worker";

let isBaseVisible = true;
let isCompareVisible = true;
let compareOpacity = 100;

export async function enterCompareMode(name: string, buffer: ArrayBuffer): Promise<void> {
  if (!state.viewer) return;
  exitCompareMode();

  const baseHost = document.createElement("div");
  baseHost.className = "canvas-host";
  baseHost.style.position = "absolute";
  baseHost.style.inset = "0";
  baseHost.style.zIndex = "1";
  baseHost.style.background = "transparent";
  baseHost.style.pointerEvents = "none";
  dom.canvasHost.prepend(baseHost);
  state.compareHost = baseHost;

  state.compareViewer = new DxfViewer(baseHost, {
    autoResize: true,
    canvasAlpha: true,
    canvasPremultipliedAlpha: false,
    clearColor: new Color(0x000000),
    clearAlpha: 0,
    colorCorrection: false,
    blackWhiteInversion: false,
    colorPalette: COMPARE_BASE_PALETTE,
  });
  baseHost.style.position = "absolute";
  baseHost.style.inset = "0";
  baseHost.style.top = "0";
  baseHost.style.left = "0";
  baseHost.style.width = "100%";
  baseHost.style.height = "100%";

  const blob = new Blob([buffer], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  state.compareName = name;

  try {
    await state.compareViewer.Load({
      url,
      fonts: [RobotoUrl],
      workerFactory: () => new DxfWorkerFactory(),
    });
    const compareControls = (state.compareViewer as ViewerWithInternals).controls;
    if (compareControls) {
      compareControls.enabled = false;
    }
    applyCompareControlDefaults();
    dom.compareBar.classList.remove("hidden");
    refreshCompareLabel();
    syncCompareFromMain();
  } catch {
    showToast(t("viewerCompareError"), { variant: "error" });
    exitCompareMode();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function syncCompareFromMain(): void {
  if (!state.viewer || !state.compareViewer || state.isSyncingCompare) return;
  if (!isCompareVisible) return;
  const sourceCam = (state.viewer as ViewerWithInternals).camera;
  const targetCam = (state.compareViewer as ViewerWithInternals).camera;
  if (!sourceCam || !targetCam) return;

  state.isSyncingCompare = true;
  try {
    targetCam.position.set(sourceCam.position.x, sourceCam.position.y, 1);
    targetCam.left = sourceCam.left;
    targetCam.right = sourceCam.right;
    targetCam.top = sourceCam.top;
    targetCam.bottom = sourceCam.bottom;
    targetCam.zoom = sourceCam.zoom;
    targetCam.updateProjectionMatrix();
    state.compareViewer.Render();
  } finally {
    state.isSyncingCompare = false;
  }
}

export function toggleCompareBaseVisibility(): void {
  isBaseVisible = !isBaseVisible;
  applyBaseVisibility();
  applyControlsUiState();
}

export function toggleCompareOverlayVisibility(): void {
  isCompareVisible = !isCompareVisible;
  applyCompareVisibility();
  applyControlsUiState();
}

export function setCompareOverlayOpacity(value: number): void {
  compareOpacity = clampOpacity(value);
  applyCompareOpacity();
  applyControlsUiState();
}

export function exitCompareMode(): void {
  applyCompareControlDefaults();
  dom.compareBar.classList.add("hidden");
  refreshCompareLabel();
  if (state.compareViewer) {
    const host = state.compareHost;
    state.compareViewer.Destroy();
    state.compareViewer = null;
    if (host) host.remove();
  }
  state.compareHost = null;
  state.compareName = "";
}

export function refreshCompareLabel(): void {
  if (!state.compareViewer) {
    dom.compareLabel.textContent = t("viewerCompareLabel");
    return;
  }
  dom.compareLabel.textContent = t("viewerCompareNamed", state.compareName, state.currentName);
}

function applyCompareControlDefaults(): void {
  isBaseVisible = true;
  isCompareVisible = true;
  compareOpacity = 100;
  applyBaseVisibility();
  applyCompareVisibility();
  applyCompareOpacity();
  applyControlsUiState();
}

function applyBaseVisibility(): void {
  const host = getMainViewerRoot();
  if (!host) return;
  host.style.visibility = isBaseVisible ? "visible" : "hidden";
}

function applyCompareVisibility(): void {
  if (!state.compareHost) return;
  state.compareHost.style.visibility = isCompareVisible ? "visible" : "hidden";
  if (isCompareVisible) {
    syncCompareFromMain();
  }
}

function applyCompareOpacity(): void {
  dom.compareOpacity.value = String(compareOpacity);
  if (!state.compareHost) return;
  state.compareHost.style.opacity = String(compareOpacity / 100);
}

function applyControlsUiState(): void {
  dom.compareBaseToggle.classList.toggle("active", isBaseVisible);
  dom.compareLayerToggle.classList.toggle("active", isCompareVisible);
  dom.compareBaseToggle.setAttribute("aria-pressed", String(isBaseVisible));
  dom.compareLayerToggle.setAttribute("aria-pressed", String(isCompareVisible));
  dom.compareBaseIcon.textContent = isBaseVisible ? "👁" : "🙈";
  dom.compareLayerIcon.textContent = isCompareVisible ? "👁" : "🙈";
  dom.compareOpacity.disabled = !isBaseVisible && !isCompareVisible;
}

function getMainViewerRoot(): HTMLElement | null {
  if (!state.viewer) return null;
  const canvas = getViewerCanvas(state.viewer);
  if (!canvas) return null;
  if (canvas.parentElement && canvas.parentElement !== dom.canvasHost) {
    return canvas.parentElement;
  }
  return canvas;
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}
