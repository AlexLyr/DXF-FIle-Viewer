import { DxfViewer } from "dxf-viewer";
import { Color } from "three";
import RobotoUrl from "../assets/fonts/roboto.ttf?url";
import { MAX_BYTES } from "../lib/constants";
import { computeFileKey } from "../lib/fileKey";
import { applyI18n, setHtmlLang, t } from "../lib/i18n";
import { openTabSafely } from "../lib/openTab";
import { claimPending, purgeStalePending, savePending } from "../lib/pendingFiles";
import { getRecentBuffer, listRecent, removeRecent, saveRecent, type RecentFile } from "../lib/recentFiles";
import DxfWorkerFactory from "../worker/dxf.worker.ts?worker";

import { dom } from "./dom";
import { state } from "./state";
import { getViewerCanvas } from "./types";
import {
  applyColorMode,
  DARK_CC_PARAMS,
  DARK_PALETTE,
  LIGHT_CC_PARAMS,
  LIGHT_PALETTE,
  refreshLayerSwatches,
  toHexColor,
  toggleTheme,
} from "./colors";
import { applyCoordsVisibility, attachCoordReadout, detachCoordReadout, fitToDrawing, getWorldFromPointer, getWorldPerPixel, worldToScreen } from "./coords";
import { clearMeasure, handleMeasureClick, handleMeasureMove, hideSnapMarker, renderMeasureOverlay, toggleMeasureMode } from "./measure";
import { clearFindResults, gotoFindHit, runFindQuery, toggleFindBar } from "./find";
import { addBookmarkFromCurrentView, renderBookmarks } from "./bookmarksUi";
import { enterCompareMode, exitCompareMode, swapCompareLayers, syncCompareFromMain } from "./compare";
import { applyLayerFilter, renderLayers } from "./layers";
import { handleGlobalKeydown } from "./keyboard";
import {
  applyMinimapVisibility,
  captureMinimapPreviewNow,
  panFromMinimap,
  scheduleMinimapPreviewRefresh,
  updateMinimapFromViewer,
} from "./minimapUtils";
import { hideEntityTooltip, refreshEntityTooltipPosition, showEntityTooltip } from "./hover";
import { buildSnapIndex } from "./snap";
import { findNearestSnap } from "./spatialIndex";
import { setScreenshotEnabled, takeScreenshot } from "./screenshot";

const HOVER_TOOLTIP_DELAY_MS = 450;
const HOVER_TOOLTIP_STILL_PX = 6;

setHtmlLang();
applyI18n();

bindUi();
void bootstrap();

function bindUi(): void {
  state.applyThemeClass();
  state.initMinimap();
  applyColorMode();

  dom.themeToggle.addEventListener("click", () => toggleTheme());
  dom.measureToggle.addEventListener("click", () => toggleMeasureMode());
  dom.findToggle.addEventListener("click", () => toggleFindBar(true));
  dom.printBtn.addEventListener("click", () => window.print());
  dom.screenshotBtn.addEventListener("click", () => void takeScreenshot());
  dom.minimapToggle.addEventListener("click", () => {
    state.minimapVisible = !state.minimapVisible;
    state.persistMinimapVisible(state.minimapVisible);
    applyMinimapVisibility();
  });
  dom.coordsToggle.addEventListener("click", () => {
    state.coordsVisible = !state.coordsVisible;
    state.persistCoordsVisible(state.coordsVisible);
    applyCoordsVisibility();
  });
  dom.colorModeToggle.addEventListener("click", () => {
    state.colorMode = state.colorMode === "original" ? "theme" : "original";
    state.persistColorMode(state.colorMode);
    applyColorMode();
    if (state.viewer) refreshLayerSwatches(state.viewer);
  });
  setScreenshotEnabled(false);

  dom.bookmarkAdd.addEventListener("click", () => void addBookmarkFromCurrentView());
  dom.compareSwap.addEventListener("click", () => swapCompareLayers());
  dom.compareExit.addEventListener("click", () => exitCompareMode());

  dom.findInput.addEventListener("input", () => {
    if (state.findDebounce) window.clearTimeout(state.findDebounce);
    state.findDebounce = window.setTimeout(() => runFindQuery(dom.findInput.value), 200);
  });
  dom.findNext.addEventListener("click", () => gotoFindHit(state.textHitIndex + 1));
  dom.findPrev.addEventListener("click", () => gotoFindHit(state.textHitIndex - 1));
  dom.findClose.addEventListener("click", () => toggleFindBar(false));

  dom.openAnother.addEventListener("click", () => dom.fileInput.click());
  dom.overlayAction.addEventListener("click", () => dom.fileInput.click());

  dom.fileInput.addEventListener("change", () => {
    const next = dom.fileInput.files?.[0];
    dom.fileInput.value = "";
    if (next) void openInNewTab(next);
  });

  dom.fit.addEventListener("click", () => {
    if (state.viewer) fitToDrawing(state.viewer);
  });

  dom.canvasHost.addEventListener("mousemove", handleCanvasMouseMove);
  dom.canvasHost.addEventListener("mouseleave", () => {
    if (state.hoverTooltipTimer) {
      window.clearTimeout(state.hoverTooltipTimer);
      state.hoverTooltipTimer = 0;
    }
    state.hoverPointerClient = null;
    hideSnapMarker();
    hideEntityTooltip();
  });
  dom.canvasHost.addEventListener("click", handleCanvasClick);

  window.addEventListener("keydown", handleGlobalKeydown);

  dom.sidebarToggle.addEventListener("click", () => {
    const isCollapsed = dom.content.classList.toggle("collapsed");
    dom.viewer.classList.toggle("sidebar-collapsed", isCollapsed);
    dom.sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
  });
  dom.viewer.classList.toggle("sidebar-collapsed", dom.content.classList.contains("collapsed"));

  dom.layerSearch.addEventListener("input", () => applyLayerFilter(dom.layerSearch.value));

  window.addEventListener("resize", () => {
    if (state.viewer) state.scheduleRender();
  });

  setupDragDrop();
  setupRecentMenu();
  setupMinimap();
  setupPrintHandlers();
  applyMinimapVisibility();
  applyCoordsVisibility();

  window.addEventListener("beforeunload", cleanupViewer);
}

function handleCanvasMouseMove(event: MouseEvent): void {
  const world = getWorldFromPointer(event);
  if (!world) return;
  state.mouseWorld = world;

  if (state.measureActive) {
    let snapCoord: { x: number; y: number } | null = null;
    const snapDisabled = event.altKey;

    if (state.snapGrid && !snapDisabled) {
      const worldPerPixel = getWorldPerPixel();
      if (worldPerPixel !== null) {
        const snap = findNearestSnap(state.snapGrid, world.x, world.y, worldPerPixel * 4);
        if (snap) {
          state.activeSnap = { x: snap.x, y: snap.y, kind: snap.kind };
          snapCoord = { x: snap.x, y: snap.y };
          const s = worldToScreen(snap.x, snap.y);
          if (s) {
            dom.snapMarker.className = `snap-marker ${snap.kind}`;
            dom.snapMarker.style.left = `${s.x}px`;
            dom.snapMarker.style.top = `${s.y}px`;
            dom.snapMarker.classList.remove("hidden");
          }
        } else {
          hideSnapMarker();
        }
      } else {
        hideSnapMarker();
      }
    } else {
      state.activeSnap = null;
      hideSnapMarker();
    }

    const coord = snapCoord ?? world;
    handleMeasureMove(coord.x, coord.y);
  }

  if (state.hoverTooltipTimer) window.clearTimeout(state.hoverTooltipTimer);
  state.hoverPointerClient = { x: event.clientX, y: event.clientY };
  const anchorX = event.clientX;
  const anchorY = event.clientY;
  state.hoverTooltipTimer = window.setTimeout(() => {
    state.hoverTooltipTimer = 0;
    const current = state.hoverPointerClient;
    if (!current) return;
    const dx = current.x - anchorX;
    const dy = current.y - anchorY;
    if (dx * dx + dy * dy > HOVER_TOOLTIP_STILL_PX * HOVER_TOOLTIP_STILL_PX) return;
    showEntityTooltip(event);
  }, HOVER_TOOLTIP_DELAY_MS);
}

function handleCanvasClick(event: MouseEvent): void {
  if (!state.viewer || !state.measureActive) return;
  const world = getWorldFromPointer(event);
  if (!world) return;
  const useSnap = !event.altKey && state.activeSnap !== null;
  const coord = useSnap ? state.activeSnap! : world;
  handleMeasureClick(coord.x, coord.y);
}

function setupDragDrop(): void {
  let dragDepth = 0;

  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    dom.dropOverlay.classList.remove("hidden");
  });

  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
  });

  window.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dom.dropOverlay.classList.add("hidden");
  });

  window.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dom.dropOverlay.classList.add("hidden");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      if (state.viewer) {
        const shouldCompare = window.confirm(
          "Compare this file with current drawing?\nPress Cancel to open in a new tab.",
        );
        if (shouldCompare) {
          void file.arrayBuffer().then((buffer) => enterCompareMode(file.name, buffer));
          return;
        }
      }
      void openInNewTab(file);
    }
  });
}

function setupRecentMenu(): void {
  dom.recentToggle.addEventListener("click", async (event) => {
    event.stopPropagation();
    const isOpen = !dom.recentMenu.classList.contains("hidden");
    if (isOpen) {
      dom.recentMenu.classList.add("hidden");
      dom.recentToggle.setAttribute("aria-expanded", "false");
      return;
    }
    await renderRecent();
    dom.recentMenu.classList.remove("hidden");
    dom.recentToggle.setAttribute("aria-expanded", "true");
  });

  document.addEventListener("click", (event) => {
    if (dom.recentMenu.classList.contains("hidden")) return;
    if (event.target instanceof Node && dom.recentMenu.contains(event.target)) return;
    if (event.target === dom.recentToggle) return;
    dom.recentMenu.classList.add("hidden");
    dom.recentToggle.setAttribute("aria-expanded", "false");
  });
}

function setupMinimap(): void {
  dom.minimapCanvas.addEventListener("mousedown", (event) => {
    state.minimapDrag = true;
    panFromMinimap(event);
  });
  window.addEventListener("mousemove", (event) => {
    if (!state.minimapDrag) return;
    panFromMinimap(event);
  });
  window.addEventListener("mouseup", () => {
    state.minimapDrag = false;
  });
}

function setupPrintHandlers(): void {
  const clearPrintSnapshot = () => {
    if (state.printSnapshot) {
      state.printSnapshot.remove();
      state.printSnapshot = null;
    }
  };

  window.addEventListener("beforeprint", () => {
    if (state.isPrinting || !state.viewer) return;
    const canvas = getViewerCanvas(state.viewer);
    if (!canvas) return;
    try {
      state.viewer.Render();
      const dataUrl = canvas.toDataURL("image/png");
      clearPrintSnapshot();
      const snapshot = document.createElement("img");
      snapshot.className = "print-snapshot";
      snapshot.alt = "DXF print snapshot";
      snapshot.src = dataUrl;
      dom.canvasHost.append(snapshot);
      state.printSnapshot = snapshot;
      dom.viewer.classList.add("printing");
      state.isPrinting = true;
    } catch {
      clearPrintSnapshot();
      dom.viewer.classList.remove("printing");
      state.isPrinting = false;
    }
  });

  window.addEventListener("afterprint", () => {
    if (!state.isPrinting) return;
    clearPrintSnapshot();
    dom.viewer.classList.remove("printing");
    state.isPrinting = false;
  });
}

async function bootstrap(): Promise<void> {
  void purgeStalePending();
  const params = new URLSearchParams(window.location.search);
  const fileId = params.get("id");
  const themeParam = params.get("theme");

  if (themeParam === "dark" || themeParam === "light") {
    state.theme = themeParam;
    state.persistTheme(state.theme);
    state.applyThemeClass();
  }

  if (!fileId) {
    showOverlay(t("viewerOverlayDropHint"), { loading: false, showAction: true });
    return;
  }

  showOverlay(t("viewerOverlayLoading"), { loading: true, showAction: false });

  const pendingFile = await claimPending(fileId);
  if (!pendingFile) {
    showOverlay(t("viewerOverlayErrorExpired"), { loading: false, showAction: true });
    return;
  }

  await loadFromBuffer(pendingFile.buffer, pendingFile.name, pendingFile.size);
}

async function openInNewTab(file: File | { name: string; size: number; buffer: ArrayBuffer }): Promise<void> {
  const name = "name" in file ? file.name : "(unknown)";
  if (name && !name.toLowerCase().endsWith(".dxf")) {
    showOverlay(t("viewerOverlayErrorInvalid"), { loading: false, showAction: true });
    return;
  }
  const buffer = file instanceof File ? await file.arrayBuffer() : file.buffer;
  if (buffer.byteLength > MAX_BYTES) {
    showOverlay(t("viewerOverlayErrorTooLarge"), { loading: false, showAction: true });
    return;
  }
  const fileId = crypto.randomUUID();
  await savePending({ id: fileId, name, size: buffer.byteLength, buffer, createdAt: Date.now() });
  const tabUrl = chrome.runtime.getURL(`src/viewer/viewer.html?id=${fileId}`);
  await openTabSafely(tabUrl);
}

async function loadFromBuffer(buffer: ArrayBuffer, name: string, size: number): Promise<void> {
  cleanupViewer();
  state.minimapPreviewReady = false;
  state.minimapPreviewDirty = true;
  state.minimap?.setPreview(null);
  state.currentName = name;
  state.currentSize = size;

  setHeader(name, size);

  const blob = new Blob([buffer], { type: "application/dxf" });
  state.currentBlobUrl = URL.createObjectURL(blob);

  const isDark = state.theme === "dark";
  state.viewer = new DxfViewer(dom.canvasHost, {
    clearColor: new Color(isDark ? 0x262a32 : 0xf6f7f9),
    autoResize: true,
    retainParsedDxf: true,
    colorCorrection: true,
    blackWhiteInversion: true,
    colorCorrectionParams: isDark ? DARK_CC_PARAMS : LIGHT_CC_PARAMS,
    colorPalette: isDark ? DARK_PALETTE : LIGHT_PALETTE,
  });

  try {
    state.currentFileKey = await computeFileKey(buffer);
    await state.viewer.Load({
      url: state.currentBlobUrl,
      fonts: [RobotoUrl],
      progressCbk: handleProgress,
      workerFactory: () => new DxfWorkerFactory(),
    });
    // Eager preview: Load() ends with fit-to-all render, before user interaction starts.
    captureMinimapPreviewNow({ force: true });

    renderLayers(state.viewer);
    setScreenshotEnabled(true);
    await renderBookmarks();
    buildSnapIndex(state.viewer);
    attachViewerSubscriptions(state.viewer);
    applyColorMode();
    hideOverlay();
    void saveRecent(name, size, buffer);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (state.viewer) {
          fitToDrawing(state.viewer);
          attachCoordReadout(state.viewer);
        }
      });
    });
    setTimeout(() => {
      if (state.viewer) {
        fitToDrawing(state.viewer);
        scheduleMinimapPreviewRefresh({ immediate: true, force: true });
      }
    }, 150);
    applyMinimapVisibility();
    updateMinimapFromViewer();
  } catch (error) {
    console.error(error);
    if (state.currentBlobUrl) {
      URL.revokeObjectURL(state.currentBlobUrl);
      state.currentBlobUrl = null;
    }
    showOverlay(t("viewerOverlayErrorCorrupted"), {
      loading: false,
      showAction: true,
    });
    setScreenshotEnabled(false);
  }
}

function attachViewerSubscriptions(instance: DxfViewer): void {
  instance.Subscribe("viewChanged", () => {
    renderMeasureOverlay();
    updateMinimapFromViewer();
    refreshEntityTooltipPosition();
    if (state.compareViewer) syncCompareFromMain();
  });
}

async function renderRecent(): Promise<void> {
  const items = await listRecent();
  dom.recentList.innerHTML = "";
  if (items.length === 0) {
    dom.recentEmpty.classList.remove("hidden");
    return;
  }
  dom.recentEmpty.classList.add("hidden");
  let activeMarked = false;
  for (const item of items) {
    const isCurrent = !activeMarked && isCurrentRecent(item);
    if (isCurrent) activeMarked = true;
    dom.recentList.append(buildRecentRow(item, isCurrent));
  }
}

function buildRecentRow(item: RecentFile, isCurrent: boolean): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "recent-item";
  li.dataset.id = item.id;
  li.classList.toggle("recent-item-active", isCurrent);

  const info = document.createElement("div");
  info.className = "recent-item-info";

  const name = document.createElement("span");
  name.className = "recent-item-name";
  name.textContent = item.name;
  name.title = item.name;

  const meta = document.createElement("span");
  meta.className = "recent-item-meta";
  meta.textContent = `${formatMb(item.size)} MB · ${relativeTime(item.openedAt)}`;

  info.append(name, meta);
  if (isCurrent) {
    const activeTag = document.createElement("span");
    activeTag.className = "recent-item-active-tag";
    activeTag.textContent = t("viewerRecentBadgeOpen");
    info.append(activeTag);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "recent-remove";
  remove.title = t("viewerRecentRemoveTitle");
  remove.setAttribute("aria-label", t("viewerRecentRemoveTitle"));
  remove.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  remove.addEventListener("click", async (event) => {
    event.stopPropagation();
    await removeRecent(item.id);
    await renderRecent();
  });

  const compare = document.createElement("button");
  compare.type = "button";
  compare.className = "recent-remove";
  compare.title = t("viewerRecentCompareTitle");
  compare.setAttribute("aria-label", t("viewerRecentCompareTitle"));
  compare.textContent = "⇄";
  compare.style.opacity = "1";
  compare.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (isCurrent) return;
    const record = await getRecentBuffer(item.id);
    if (!record) return;
    await enterCompareMode(record.name, record.buffer);
    dom.recentMenu.classList.add("hidden");
    dom.recentToggle.setAttribute("aria-expanded", "false");
  });

  li.addEventListener("click", async () => {
    const record = await getRecentBuffer(item.id);
    if (!record) return;
    dom.recentMenu.classList.add("hidden");
    dom.recentToggle.setAttribute("aria-expanded", "false");
    await openInNewTab({ name: record.name, size: record.size, buffer: record.buffer });
  });

  li.append(info, compare, remove);
  return li;
}

function isCurrentRecent(item: RecentFile): boolean {
  return state.currentName !== "" && item.name === state.currentName && item.size === state.currentSize;
}

function relativeTime(timestamp: number): string {
  const rtf = new Intl.RelativeTimeFormat(chrome.i18n.getUILanguage(), { numeric: "auto" });
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return rtf.format(-sec, "second");
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hr = Math.floor(min / 60);
  if (hr < 24) return rtf.format(-hr, "hour");
  const day = Math.floor(hr / 24);
  return rtf.format(-day, "day");
}

function handleProgress(phase: "font" | "fetch" | "parse" | "prepare", processed: number, total: number): void {
  const label = phaseLabel(phase);
  const percent = total > 0 ? ` ${Math.min(100, Math.round((processed / total) * 100))}%` : "";
  showOverlay(`${label}${percent}`, { loading: true, showAction: false });
}

function phaseLabel(phase: "font" | "fetch" | "parse" | "prepare"): string {
  switch (phase) {
    case "font":
      return t("viewerOverlayLoadingFonts");
    case "fetch":
      return t("viewerOverlayLoading");
    case "parse":
      return t("viewerOverlayParsing");
    case "prepare":
      return t("viewerOverlayPreparing");
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function setHeader(name: string, size: number): void {
  dom.fileName.textContent = name;
  dom.fileName.title = name;
  dom.fileSize.textContent = `· ${formatMb(size)} MB`;
}

function showOverlay(text: string, options: { loading: boolean; showAction: boolean }): void {
  dom.overlay.classList.remove("hidden");
  dom.overlayText.textContent = text;
  dom.overlaySpinner.classList.toggle("hidden", !options.loading);
  dom.overlayAction.classList.toggle("hidden", !options.showAction);
}

function hideOverlay(): void {
  dom.overlay.classList.add("hidden");
}

function cleanupViewer(): void {
  if (state.hoverTooltipTimer) {
    window.clearTimeout(state.hoverTooltipTimer);
    state.hoverTooltipTimer = 0;
  }
  state.hoverPointerClient = null;
  detachCoordReadout();
  exitCompareMode();
  clearMeasure();
  clearFindResults();
  hideEntityTooltip();
  hideSnapMarker();
  if (state.printSnapshot) {
    state.printSnapshot.remove();
    state.printSnapshot = null;
  }
  dom.viewer.classList.remove("printing");
  state.isPrinting = false;
  dom.compareBar.classList.add("hidden");

  if (state.renderRaf) {
    cancelAnimationFrame(state.renderRaf);
    state.renderRaf = 0;
  }
  if (state.currentBlobUrl) {
    URL.revokeObjectURL(state.currentBlobUrl);
    state.currentBlobUrl = null;
  }
  if (state.viewer) {
    state.viewer.Destroy();
    state.viewer = null;
  }

  dom.canvasHost.querySelectorAll("canvas").forEach((c) => c.remove());
  if (state.minimap && !dom.canvasHost.contains(dom.minimapCanvas)) {
    dom.canvasHost.append(dom.minimapCanvas);
  }
  if (state.minimap) {
    state.minimap.setPreview(null);
    state.minimap.setEnabled(false);
    state.minimapPreviewReady = false;
    state.minimapPreviewDirty = true;
  }
  if (state.minimapPreviewTimer) {
    window.clearTimeout(state.minimapPreviewTimer);
    state.minimapPreviewTimer = 0;
  }

  state.currentFileKey = null;
  state.snapGrid = null;
  setScreenshotEnabled(false);
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}
