import { DxfViewer } from "dxf-viewer";
import { Color } from "three";
import { state } from "./state";
import { dom } from "./dom";
import { COMPARE_BASE_PALETTE } from "./colors";
import type { ViewerWithInternals } from "./types";
import { showToast } from "./toast";
import RobotoUrl from "../assets/fonts/roboto.ttf?url";
import DxfWorkerFactory from "../worker/dxf.worker.ts?worker";

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
  state.compareOnTop = true;

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
    dom.compareBar.classList.remove("hidden");
    dom.compareLabel.textContent = `Comparing: ${name} vs ${state.currentName}`;
    syncCompareFromMain();
  } catch {
    showToast("Could not load file for comparison", { variant: "error" });
    exitCompareMode();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function syncCompareFromMain(): void {
  if (!state.viewer || !state.compareViewer || state.isSyncingCompare) return;
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

export function swapCompareLayers(): void {
  if (!state.compareViewer || !state.compareHost) return;
  state.compareOnTop = !state.compareOnTop;
  state.compareHost.style.display = state.compareOnTop ? "block" : "none";
  dom.compareLabel.textContent = state.compareOnTop
    ? `Comparing: ${state.compareName} vs ${state.currentName}`
    : "Overlay hidden";
}

export function exitCompareMode(): void {
  dom.compareBar.classList.add("hidden");
  dom.compareLabel.textContent = "Comparing drawings";
  if (state.compareViewer) {
    const host = state.compareHost;
    state.compareViewer.Destroy();
    state.compareViewer = null;
    if (host) host.remove();
  }
  state.compareHost = null;
  state.compareOnTop = false;
  state.compareName = "";
}
