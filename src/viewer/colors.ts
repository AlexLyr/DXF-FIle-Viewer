import { Color } from "three";
import type { DxfViewer } from "dxf-viewer";
import { state } from "./state";
import { dom } from "./dom";
import { scheduleMinimapPreviewRefresh } from "./minimapUtils";

export const DARK_CC_PARAMS = {
  darkBgTargetL: 0.55,
  darkBgTriggerL: 0.4,
  darkBgTriggerY: 0.3,
};

export const LIGHT_CC_PARAMS = {
  lightBgTargetL: 0.32,
  lightBgTriggerL: 0.4,
  lightBgTriggerY: 0.45,
};

export const LIGHT_PALETTE: Record<number, number> = {
  0xff0000: 0xc62828,
  0xffff00: 0xa68900,
  0x00ff00: 0x2e7d32,
  0x00ffff: 0x00838f,
  0x0000ff: 0x1565c0,
  0xff00ff: 0xc2185b,
  0xffffff: 0x1f2328,
  0x414141: 0x2a2c30,
  0x808080: 0x4d5159,
  0x404040: 0x2a2c30,
  0xc0c0c0: 0x7a7d85,
  0xff8000: 0xb35900,
  0x800000: 0x6e1c1c,
  0x008000: 0x1e5e21,
  0x000080: 0x122a5e,
  0x808000: 0x595900,
  0x800080: 0x5e1c5e,
  0x008080: 0x005e63,
};

export const DARK_PALETTE: Record<number, number> = {
  0xff0000: 0xff7b7b,
  0xffff00: 0xffe066,
  0x00ff00: 0x6cdc7e,
  0x00ffff: 0x6fdce8,
  0x0000ff: 0x809eff,
  0xff00ff: 0xff8fd2,
  0x000000: 0xeaecef,
  0x414141: 0x8d9099,
  0x808080: 0xb8bbc2,
  0x404040: 0x8d9099,
  0xc0c0c0: 0xdadde2,
  0xff8000: 0xffb066,
  0x800000: 0xff9999,
  0x008000: 0x7ed395,
  0x000080: 0xa0b5ff,
  0x808000: 0xd6d188,
  0x800080: 0xd29cd2,
  0x008080: 0x8fdce0,
};

export const COMPARE_BASE_PALETTE: Record<number, number> = {
  0x000000: 0xff3b30,
  0xffffff: 0xff3b30,
  0xff0000: 0xff3b30,
  0xffff00: 0xff3b30,
  0x00ff00: 0xff3b30,
  0x00ffff: 0xff3b30,
  0x0000ff: 0xff3b30,
  0xff00ff: 0xff3b30,
  0x414141: 0xff3b30,
  0x808080: 0xff3b30,
  0xc0c0c0: 0xff3b30,
};

export function getClearColor(): InstanceType<typeof Color> {
  return new Color(state.theme === "dark" ? 0x262a32 : 0xf6f7f9);
}

export function toHexColor(color: number): string {
  if (!Number.isFinite(color) || color < 0) {
    return "#9aa3b2";
  }
  return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function applyColorMode(): void {
  const isOriginal = state.colorMode === "original";
  dom.colorModeToggle.classList.toggle("active", isOriginal);
  dom.colorModeToggle.setAttribute("aria-pressed", String(isOriginal));
  if (!state.viewer) return;

  const isDark = state.theme === "dark";
  const clearColor = getClearColor();

  if (state.colorMode === "original") {
    state.viewer.SetColorPalette(null);
    state.viewer.SetColorCorrection(false);
    state.viewer.SetBlackWhiteInversion(false);
  } else {
    state.viewer.SetColorCorrectionParams(isDark ? DARK_CC_PARAMS : LIGHT_CC_PARAMS);
    state.viewer.SetColorPalette(isDark ? DARK_PALETTE : LIGHT_PALETTE);
    state.viewer.SetColorCorrection(true);
    state.viewer.SetBlackWhiteInversion(true);
  }
  state.viewer.SetClearColor(clearColor);

  if (state.compareViewer) {
    state.compareViewer.SetClearColor(new Color(0x000000));
  }
  scheduleMinimapPreviewRefresh();
}

export function refreshLayerSwatches(instance: DxfViewer): void {
  const updated = Array.from(instance.GetLayers() ?? []);
  const byName = new Map<string, { color: number }>();
  for (const info of updated) {
    byName.set(info.name, info);
  }
  for (const entry of state.layerEntries) {
    const fresh = byName.get(entry.info.name);
    if (fresh) {
      entry.info = { ...entry.info, color: fresh.color };
      entry.swatch.style.backgroundColor = toHexColor(fresh.color);
    }
  }
}

export function toggleTheme(): void {
  state.theme = state.theme === "dark" ? "light" : "dark";
  state.persistTheme(state.theme);
  state.applyThemeClass();
  applyColorMode();
  if (state.viewer) refreshLayerSwatches(state.viewer);
}
