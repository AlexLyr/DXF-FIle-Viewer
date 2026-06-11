import { state } from "./state";
import { dom } from "./dom";
import { toHexColor } from "./colors";
import type { LayerEntry } from "./types";
import type { DrawingRenderer, LayerInfo } from "./render/types";
import { scheduleMinimapPreviewRefresh } from "./minimapUtils";
import { t } from "../lib/i18n";

function soloIconSvg(): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
    fill="none" stroke="currentColor" stroke-width="1.4"
    stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
</svg>`.trim();
}

export function renderLayers(instance: DrawingRenderer): void {
  dom.layers.innerHTML = "";
  state.layerEntries = [];
  state.soloLayer = null;
  dom.layerSearch.value = "";

  const layers = Array.from(instance.GetLayers() ?? []);
  if (layers.length === 0) {
    dom.layersEmpty.classList.remove("hidden");
    return;
  }

  dom.layersEmpty.classList.add("hidden");
  for (const info of layers) {
    state.layerEntries.push(createLayerEntry(instance, info));
  }
}

function createLayerEntry(instance: DrawingRenderer, info: LayerInfo): LayerEntry {
  const row = document.createElement("li");
  row.className = "layer-row";
  row.dataset.layerName = info.name;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.title = t("viewerLayerToggleTitle");
  checkbox.addEventListener("change", () => {
    if (state.soloLayer) {
      clearSolo();
    }
    instance.ShowLayer(info.name, checkbox.checked);
    state.scheduleRender();
    scheduleMinimapPreviewRefresh();
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
  soloButton.title = t("viewerLayerSoloTitle");
  soloButton.setAttribute("aria-label", t("viewerLayerSoloTitle"));
  soloButton.innerHTML = soloIconSvg();
  soloButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSolo(instance, info.name);
  });

  let hoverTimer = 0;
  let hoverActive = false;

  function startPreview() {
    if (state.soloLayer || hoverActive) return;
    const restore = new Map<string, boolean>();
    const next = new Map<string, boolean>();
    for (const e of state.layerEntries) {
      restore.set(e.info.name, e.checkbox.checked);
      next.set(e.info.name, e.info.name === info.name);
    }
    state.hoverPreviewRestore = restore;
    hoverActive = true;
    instance.SetLayersVisibility(next);
    row.classList.add("preview-active");
  }

  function endPreview() {
    if (!hoverActive) return;
    hoverActive = false;
    state.hoverPreviewRestore = null;
    // Restore from the live checkbox states, not the snapshot taken when the
    // preview began: the user may have toggled a layer during the preview, and
    // the checkboxes are the source of truth for their intent. Using the stale
    // snapshot would revert that toggle (and invert the next one).
    const restore = new Map<string, boolean>();
    for (const e of state.layerEntries) {
      restore.set(e.info.name, e.checkbox.checked);
    }
    instance.SetLayersVisibility(restore);
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
    if (target.closest("input, .solo-btn")) return;
    endPreview();
    if (state.hoverPreviewRestore) {
      state.hoverPreviewRestore = null;
    }
    toggleSolo(instance, info.name);
  });

  row.append(checkbox, swatch, nameNode, soloButton);
  dom.layers.append(row);
  return { info, row, checkbox, nameNode, swatch };
}

function toggleSolo(instance: DrawingRenderer, layerName: string): void {
  state.hoverPreviewRestore = null;
  if (state.soloLayer === layerName) {
    clearSolo();
    const allOn = new Map<string, boolean>();
    for (const entry of state.layerEntries) {
      entry.checkbox.checked = true;
      allOn.set(entry.info.name, true);
    }
    instance.SetLayersVisibility(allOn);
    scheduleMinimapPreviewRefresh();
    return;
  }

  state.soloLayer = layerName;
  const onlyOne = new Map<string, boolean>();
  for (const entry of state.layerEntries) {
    const isTarget = entry.info.name === layerName;
    entry.checkbox.checked = isTarget;
    entry.row.classList.toggle("solo-active", isTarget);
    onlyOne.set(entry.info.name, isTarget);
  }
  instance.SetLayersVisibility(onlyOne);
  scheduleMinimapPreviewRefresh();
}

function clearSolo(): void {
  state.hoverPreviewRestore = null;
  state.soloLayer = null;
  for (const entry of state.layerEntries) {
    entry.row.classList.remove("solo-active");
  }
}

export function applyLayerFilter(query: string): void {
  const trimmed = query.trim().toLowerCase();
  for (const entry of state.layerEntries) {
    const haystack = (entry.info.displayName || entry.info.name).toLowerCase();
    const matches = trimmed === "" || haystack.includes(trimmed);
    entry.row.classList.toggle("hidden", !matches);
  }
}
