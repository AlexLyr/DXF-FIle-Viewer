import { DxfViewer, type LayerInfo } from "dxf-viewer";
import { Color, Vector3 } from "three";
import RobotoUrl from "../assets/fonts/roboto.ttf?url";
import { claimPending, purgeStalePending, savePending } from "../lib/pendingFiles";
import {
  getRecentBuffer,
  listRecent,
  removeRecent,
  saveRecent,
  type RecentFile,
} from "../lib/recentFiles";
import DxfWorkerFactory from "../worker/dxf.worker.ts?worker";

const MAX_BYTES = 50 * 1024 * 1024;
type Theme = "light" | "dark";

type LayerEntry = {
  info: LayerInfo;
  row: HTMLLIElement;
  checkbox: HTMLInputElement;
  nameNode: HTMLSpanElement;
  swatch: HTMLSpanElement;
};

const fileNameNode = mustGet<HTMLSpanElement>("#fileName");
const fileSizeNode = mustGet<HTMLSpanElement>("#fileSize");
const themeToggleButton = mustGet<HTMLButtonElement>("#themeToggle");
const openAnotherButton = mustGet<HTMLButtonElement>("#openAnother");
const fitButton = mustGet<HTMLButtonElement>("#fit");
const sidebarToggle = mustGet<HTMLButtonElement>("#sidebarToggle");
const layersList = mustGet<HTMLUListElement>("#layers");
const layersEmpty = mustGet<HTMLParagraphElement>("#layersEmpty");
const layerSearch = mustGet<HTMLInputElement>("#layerSearch");
const canvasHost = mustGet<HTMLDivElement>("#canvasHost");
const dropOverlay = mustGet<HTMLDivElement>("#dropOverlay");
const overlay = mustGet<HTMLDivElement>("#overlay");
const overlayText = mustGet<HTMLParagraphElement>("#overlayText");
const overlaySpinner = mustGet<HTMLDivElement>("#overlaySpinner");
const overlayAction = mustGet<HTMLButtonElement>("#overlayAction");
const fileInput = mustGet<HTMLInputElement>("#fileInput");
const contentSection = mustGet<HTMLElement>(".content");
const coordReadout = mustGet<HTMLDivElement>("#coordReadout");
const coordX = mustGet<HTMLSpanElement>("#coordX");
const coordY = mustGet<HTMLSpanElement>("#coordY");
const recentToggle = mustGet<HTMLButtonElement>("#recentToggle");
const recentMenu = mustGet<HTMLDivElement>("#recentMenu");
const recentList = mustGet<HTMLUListElement>("#recentList");
const recentEmpty = mustGet<HTMLParagraphElement>("#recentEmpty");

let viewer: DxfViewer | null = null;
let currentBlobUrl: string | null = null;
let currentBuffer: ArrayBuffer | null = null;
let currentName = "";
let currentSize = 0;
let theme: Theme = readStoredTheme();
let layerEntries: LayerEntry[] = [];
let soloLayer: string | null = null;
let hoverPreviewRestore: Map<string, boolean> | null = null;
let coordCanvas: HTMLCanvasElement | null = null;
let coordHandlers: { move: (e: MouseEvent) => void; leave: () => void } | null =
  null;
let renderRaf = 0;

bindUi();
void bootstrap();

function scheduleRender(instance: DxfViewer): void {
  if (renderRaf) return;
  renderRaf = requestAnimationFrame(() => {
    renderRaf = 0;
    instance.Render();
  });
}

function bindUi(): void {
  applyThemeClass();

  themeToggleButton.addEventListener("click", () => {
    toggleTheme();
  });
  openAnotherButton.addEventListener("click", () => fileInput.click());
  overlayAction.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const next = fileInput.files?.[0];
    fileInput.value = "";
    if (next) {
      void openInNewTab(next);
    }
  });

  fitButton.addEventListener("click", () => {
    if (viewer) {
      fitToDrawing(viewer);
    }
  });

  sidebarToggle.addEventListener("click", () => {
    const isCollapsed = contentSection.classList.toggle("collapsed");
    sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
  });

  layerSearch.addEventListener("input", () => {
    applyLayerFilter(layerSearch.value);
  });

  window.addEventListener("resize", () => {
    // do not auto-fit on resize, only re-render
    if (viewer) scheduleRender(viewer);
  });

  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepth += 1;
    dropOverlay.classList.remove("hidden");
  });
  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) {
      return;
    }
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      dropOverlay.classList.add("hidden");
    }
  });
  window.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.add("hidden");
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void openInNewTab(file);
    }
  });

  window.addEventListener("beforeunload", () => {
    cleanupViewer();
  });

  recentToggle.addEventListener("click", async (event) => {
    event.stopPropagation();
    const isOpen = !recentMenu.classList.contains("hidden");
    if (isOpen) {
      recentMenu.classList.add("hidden");
      recentToggle.setAttribute("aria-expanded", "false");
      return;
    }
    await renderRecent();
    recentMenu.classList.remove("hidden");
    recentToggle.setAttribute("aria-expanded", "true");
  });

  document.addEventListener("click", (event) => {
    if (recentMenu.classList.contains("hidden")) return;
    if (event.target instanceof Node && recentMenu.contains(event.target)) return;
    if (event.target === recentToggle) return;
    recentMenu.classList.add("hidden");
    recentToggle.setAttribute("aria-expanded", "false");
  });
}

async function bootstrap(): Promise<void> {
  void purgeStalePending();
  const fileId = new URLSearchParams(window.location.search).get("id");
  if (!fileId) {
    showOverlay("Drop a .dxf file here\nor click Open another", {
      loading: false,
      showAction: true,
    });
    return;
  }

  showOverlay("Loading drawing…", { loading: true, showAction: false });

  const pendingFile = await claimPending(fileId);

  if (!pendingFile) {
    showOverlay(
      "Could not open this drawing.\nThe file may have expired.",
      { loading: false, showAction: true },
    );
    return;
  }

  await loadFromBuffer(pendingFile.buffer, pendingFile.name, pendingFile.size);
}

async function openInNewTab(
  file: File | { name: string; size: number; buffer: ArrayBuffer },
): Promise<void> {
  const name = "name" in file ? file.name : "(unknown)";
  if (name && !name.toLowerCase().endsWith(".dxf")) {
    showOverlay(
      "Could not read file.\nPlease choose a valid .dxf file.",
      { loading: false, showAction: true },
    );
    return;
  }
  const buffer = file instanceof File ? await file.arrayBuffer() : file.buffer;
  if (buffer.byteLength > MAX_BYTES) {
    showOverlay(
      "File is too large.\nThe viewer supports drawings up to 50 MB.",
      { loading: false, showAction: true },
    );
    return;
  }
  const fileId = crypto.randomUUID();
  await savePending({
    id: fileId,
    name,
    size: buffer.byteLength,
    buffer,
    createdAt: Date.now(),
  });
  const tabUrl = chrome.runtime.getURL(`src/viewer/viewer.html?id=${fileId}`);
  await createTabSafely(tabUrl);
}

async function createTabSafely(url: string): Promise<void> {
  // Some Chromium-based browsers block chrome.tabs.create on the first session
  // after install ("Onboarding tab should not be opened at startup"). Retry a
  // few times, then fall back to window.open.
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

async function loadFromBuffer(
  buffer: ArrayBuffer,
  name: string,
  size: number,
): Promise<void> {
  cleanupViewer();
  if (buffer !== currentBuffer) {
    currentBuffer = buffer;
  }
  currentName = name;
  currentSize = size;

  setHeader(name, size);

  const blob = new Blob([buffer], { type: "application/dxf" });
  currentBlobUrl = URL.createObjectURL(blob);

  const isDark = theme === "dark";
  viewer = new DxfViewer(canvasHost, {
    clearColor: new Color(isDark ? 0x262a32 : 0xf6f7f9),
    autoResize: true,
    colorCorrection: true,
    blackWhiteInversion: !isDark,
  });

  try {
    await viewer.Load({
      url: currentBlobUrl,
      fonts: [RobotoUrl],
      progressCbk: handleProgress,
      workerFactory: DxfWorkerFactory,
    });

    renderLayers(viewer);
    hideOverlay();
    void saveRecent(name, size, buffer);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (viewer) {
          fitToDrawing(viewer);
          attachCoordReadout(viewer);
        }
      });
    });
    setTimeout(() => {
      if (viewer) fitToDrawing(viewer);
    }, 150);
  } catch (error) {
    console.error(error);
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
    showOverlay(
      "Could not open this drawing.\nThe file may be corrupted or unsupported.",
      { loading: false, showAction: true },
    );
  }
}

async function renderRecent(): Promise<void> {
  const items = await listRecent();
  recentList.innerHTML = "";
  if (items.length === 0) {
    recentEmpty.classList.remove("hidden");
    return;
  }
  recentEmpty.classList.add("hidden");
  let activeMarked = false;
  for (const item of items) {
    const isCurrent = !activeMarked && isCurrentRecent(item);
    if (isCurrent) activeMarked = true;
    recentList.append(buildRecentRow(item, isCurrent));
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
    activeTag.textContent = "Open";
    info.append(activeTag);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "recent-remove";
  remove.title = "Remove from recents";
  remove.setAttribute("aria-label", "Remove from recents");
  remove.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  remove.addEventListener("click", async (event) => {
    event.stopPropagation();
    await removeRecent(item.id);
    await renderRecent();
  });

  li.addEventListener("click", async () => {
    const record = await getRecentBuffer(item.id);
    if (!record) return;
    recentMenu.classList.add("hidden");
    recentToggle.setAttribute("aria-expanded", "false");
    await openInNewTab({
      name: record.name,
      size: record.size,
      buffer: record.buffer,
    });
  });

  li.append(info, remove);
  return li;
}

function isCurrentRecent(item: RecentFile): boolean {
  return currentName !== "" && item.name === currentName && item.size === currentSize;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function handleProgress(
  phase: "font" | "fetch" | "parse" | "prepare",
  processed: number,
  total: number,
): void {
  const label = phaseLabel(phase);
  const percent =
    total > 0 ? ` ${Math.min(100, Math.round((processed / total) * 100))}%` : "";
  showOverlay(`${label}${percent}`, { loading: true, showAction: false });
}

function phaseLabel(phase: "font" | "fetch" | "parse" | "prepare"): string {
  switch (phase) {
    case "font":
      return "Loading fonts…";
    case "fetch":
      return "Loading drawing…";
    case "parse":
      return "Parsing drawing…";
    case "prepare":
      return "Preparing geometry…";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function setHeader(name: string, size: number): void {
  fileNameNode.textContent = name;
  fileNameNode.title = name;
  fileSizeNode.textContent = `· ${formatMb(size)} MB`;
}

function renderLayers(instance: DxfViewer): void {
  layersList.innerHTML = "";
  layerEntries = [];
  soloLayer = null;
  layerSearch.value = "";

  const layers = Array.from(instance.GetLayers() ?? []);
  if (layers.length === 0) {
    layersEmpty.classList.remove("hidden");
    return;
  }

  layersEmpty.classList.add("hidden");
  for (const info of layers) {
    layerEntries.push(createLayerEntry(instance, info));
  }
}

function createLayerEntry(
  instance: DxfViewer,
  info: LayerInfo,
): LayerEntry {
  const row = document.createElement("li");
  row.className = "layer-row";
  row.dataset.layerName = info.name;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.title = "Toggle layer";
  checkbox.addEventListener("change", () => {
    if (soloLayer) {
      clearSolo();
    }
    instance.ShowLayer(info.name, checkbox.checked);
    scheduleRender(instance);
  });

  const swatch = document.createElement("span");
  swatch.className = "layer-color";
  swatch.style.backgroundColor = toHexColor(info.color);

  const nameNode = document.createElement("span");
  nameNode.className = "layer-name";
  nameNode.textContent = info.displayName || info.name;
  nameNode.title = info.displayName || info.name;

  const soloButton = document.createElement("button");
  soloButton.type = "button";
  soloButton.className = "solo-btn";
  soloButton.title = "Show only this layer";
  soloButton.setAttribute("aria-label", "Show only this layer");
  soloButton.innerHTML = soloIconSvg();
  soloButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSolo(instance, info.name);
  });

  let hoverTimer = 0;
  let hoverActive = false;

  function startPreview() {
    if (soloLayer || hoverActive) return;
    const restore = new Map<string, boolean>();
    const next = new Map<string, boolean>();
    for (const e of layerEntries) {
      restore.set(e.info.name, e.checkbox.checked);
      next.set(e.info.name, e.info.name === info.name);
    }
    hoverPreviewRestore = restore;
    hoverActive = true;
    instance.SetLayersVisibility(next);
    row.classList.add("preview-active");
  }

  function endPreview() {
    if (!hoverActive) return;
    hoverActive = false;
    if (hoverPreviewRestore) {
      instance.SetLayersVisibility(hoverPreviewRestore);
      hoverPreviewRestore = null;
    }
    row.classList.remove("preview-active");
  }

  row.addEventListener("mouseenter", () => {
    if (hoverTimer) window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(startPreview, 200);
  });
  row.addEventListener("mouseleave", () => {
    if (hoverTimer) {
      window.clearTimeout(hoverTimer);
      hoverTimer = 0;
    }
    endPreview();
  });

  row.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    // Ignore clicks on checkbox or solo button — they have own handlers
    if (target.closest("input, .solo-btn")) return;
    endPreview();
    if (hoverPreviewRestore) {
      hoverPreviewRestore = null;
    }
    toggleSolo(instance, info.name);
  });

  row.append(checkbox, swatch, nameNode, soloButton);
  layersList.append(row);
  return { info, row, checkbox, nameNode, swatch };
}

function toggleSolo(instance: DxfViewer, layerName: string): void {
  hoverPreviewRestore = null;
  if (soloLayer === layerName) {
    clearSolo();
    const allOn = new Map<string, boolean>();
    for (const entry of layerEntries) {
      entry.checkbox.checked = true;
      allOn.set(entry.info.name, true);
    }
    instance.SetLayersVisibility(allOn);
    return;
  }

  soloLayer = layerName;
  const onlyOne = new Map<string, boolean>();
  for (const entry of layerEntries) {
    const isTarget = entry.info.name === layerName;
    entry.checkbox.checked = isTarget;
    entry.row.classList.toggle("solo-active", isTarget);
    onlyOne.set(entry.info.name, isTarget);
  }
  instance.SetLayersVisibility(onlyOne);
}

function clearSolo(): void {
  hoverPreviewRestore = null;
  soloLayer = null;
  for (const entry of layerEntries) {
    entry.row.classList.remove("solo-active");
  }
}

function applyLayerFilter(query: string): void {
  const trimmed = query.trim().toLowerCase();
  for (const entry of layerEntries) {
    const haystack = (
      entry.info.displayName || entry.info.name
    ).toLowerCase();
    const matches = trimmed === "" || haystack.includes(trimmed);
    entry.row.classList.toggle("hidden", !matches);
  }
}

function fitToDrawing(instance: DxfViewer): void {
  const bounds = instance.GetBounds();
  if (!bounds) return;
  const w = canvasHost.clientWidth;
  const h = canvasHost.clientHeight;
  if (w <= 0 || h <= 0) return;
  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx <= 0 || dy <= 0) {
    return;
  }
  const span = Math.max(dx, dy);
  const padding = Math.max(span * 0.05, 1);
  instance.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, padding);
}

function attachCoordReadout(instance: DxfViewer): void {
  detachCoordReadout();
  const getCanvas = (instance as unknown as { GetCanvas?: () => HTMLCanvasElement })
    .GetCanvas;
  const canvas = typeof getCanvas === "function" ? getCanvas.call(instance) : null;
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const camera = (instance as unknown as { camera?: unknown }).camera;
  if (!camera) return;

  const v = new Vector3();

  const move = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    v.set(ndcX, ndcY, 0);
    v.unproject(camera as never);
    coordX.textContent = `X: ${v.x.toFixed(2)}`;
    coordY.textContent = `Y: ${v.y.toFixed(2)}`;
    coordReadout.classList.remove("hidden");
  };
  const leave = () => {
    coordReadout.classList.add("hidden");
  };

  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseleave", leave);
  coordCanvas = canvas;
  coordHandlers = { move, leave };
}

function detachCoordReadout(): void {
  if (coordCanvas && coordHandlers) {
    coordCanvas.removeEventListener("mousemove", coordHandlers.move);
    coordCanvas.removeEventListener("mouseleave", coordHandlers.leave);
  }
  coordCanvas = null;
  coordHandlers = null;
  coordReadout.classList.add("hidden");
}

function toHexColor(color: number): string {
  if (!Number.isFinite(color) || color < 0) {
    return "#9aa3b2";
  }
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

function showOverlay(
  text: string,
  options: { loading: boolean; showAction: boolean },
): void {
  overlay.classList.remove("hidden");
  overlayText.textContent = text;
  overlaySpinner.classList.toggle("hidden", !options.loading);
  overlayAction.classList.toggle("hidden", !options.showAction);
}

function hideOverlay(): void {
  overlay.classList.add("hidden");
}

function cleanupViewer(): void {
  detachCoordReadout();
  if (renderRaf) {
    cancelAnimationFrame(renderRaf);
    renderRaf = 0;
  }
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  if (viewer) {
    viewer.Destroy();
    viewer = null;
  }
  canvasHost.querySelectorAll("canvas").forEach((c) => c.remove());
}

function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function readStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem("dxf-theme");
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function persistTheme(t: Theme): void {
  try {
    window.localStorage.setItem("dxf-theme", t);
  } catch {
    // ignore storage failures
  }
}

function applyThemeClass(): void {
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
  document.documentElement.classList.toggle("theme-light", theme === "light");
}

function toggleTheme(): void {
  theme = theme === "dark" ? "light" : "dark";
  persistTheme(theme);
  applyThemeClass();
  if (!viewer) return;

  const isDark = theme === "dark";
  const clearColor = new Color(isDark ? 0x262a32 : 0xf6f7f9);
  viewer.SetClearColor(clearColor);
  viewer.SetBlackWhiteInversion(!isDark);
  refreshLayerSwatches(viewer);
}

function refreshLayerSwatches(instance: DxfViewer): void {
  const updated = Array.from(instance.GetLayers() ?? []);
  const byName = new Map<string, LayerInfo>();
  for (const info of updated) {
    byName.set(info.name, info);
  }
  for (const entry of layerEntries) {
    const fresh = byName.get(entry.info.name);
    if (fresh) {
      entry.info = fresh;
      entry.swatch.style.backgroundColor = toHexColor(fresh.color);
    }
  }
}

function soloIconSvg(): string {
  return `
<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
    fill="none" stroke="currentColor" stroke-width="1.4"
    stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
</svg>`.trim();
}

function mustGet<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Viewer element missing: ${selector}`);
  }
  return node;
}
