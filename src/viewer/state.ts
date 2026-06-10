import type { Bookmark } from "../lib/bookmarks";
import type { DwgHeaderSnapshot } from "../lib/dwgLoader";
import type { LayerEntry, SnapKindActive, TextHit, Theme, ThemeMode } from "./types";
import type { DrawingRenderer } from "./render/types";
import type { SnapGrid } from "./spatialIndex";
import { Minimap } from "./minimap";
import { dom } from "./dom";

const THEME_KEY = "dxf-theme";
const ORIGINAL_COLORS_KEY = "dxf-original-colors";
const MINIMAP_VISIBLE_KEY = "dxf:minimap";
const COORDS_VISIBLE_KEY = "dxf:coords";

function readStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readStoredColorMode(): ThemeMode {
  try {
    return window.localStorage.getItem(ORIGINAL_COLORS_KEY) === "1" ? "original" : "theme";
  } catch {
    return "theme";
  }
}

function readStoredMinimapVisible(): boolean {
  try {
    return window.localStorage.getItem(MINIMAP_VISIBLE_KEY) === "true";
  } catch {
    return false;
  }
}

function readStoredCoordsVisible(): boolean {
  try {
    const raw = window.localStorage.getItem(COORDS_VISIBLE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

class ViewerState {
  viewer: DrawingRenderer | null = null;
  currentBlobUrl: string | null = null;
  currentName = "";
  currentSize = 0;
  currentFileKey: string | null = null;
  dwgHeaderOverride: DwgHeaderSnapshot | null = null;
  theme: Theme = readStoredTheme();
  colorMode: ThemeMode = readStoredColorMode();

  layerEntries: LayerEntry[] = [];
  soloLayer: string | null = null;
  hoverPreviewRestore: Map<string, boolean> | null = null;

  coordCanvas: HTMLCanvasElement | null = null;
  coordHandlers: { move: (e: MouseEvent) => void; leave: () => void } | null = null;

  renderRaf = 0;
  bookmarks: Bookmark[] = [];

  isPrinting = false;
  printSnapshot: HTMLImageElement | null = null;

  hoverTooltipTimer = 0;
  hoverTooltipAnchor: { x: number; y: number; text: string } | null = null;
  hoverPointerClient: { x: number; y: number } | null = null;
  mouseWorld = { x: 0, y: 0 };

  textHits: TextHit[] = [];
  textHitIndex = -1;
  findDebounce = 0;

  measureActive = false;
  measureStart: { x: number; y: number } | null = null;
  measureEnd: { x: number; y: number } | null = null;
  measureComplete = false;

  snapGrid: SnapGrid | null = null;
  activeSnap: { x: number; y: number; kind: SnapKindActive } | null = null;

  minimap: Minimap | null = null;
  minimapDrag = false;
  minimapVisible = readStoredMinimapVisible();
  coordsVisible = readStoredCoordsVisible();
  minimapPreviewReady = false;
  minimapPreviewDirty = true;
  minimapPreviewTimer = 0;
  minimapPreviewCanvas: HTMLCanvasElement | null = null;

  compareViewer: DrawingRenderer | null = null;
  compareName = "";
  isSyncingCompare = false;
  compareHost: HTMLDivElement | null = null;

  persistTheme(t: Theme): void {
    try {
      window.localStorage.setItem(THEME_KEY, t);
    } catch {
      // ignore
    }
  }

  persistColorMode(mode: ThemeMode): void {
    try {
      window.localStorage.setItem(ORIGINAL_COLORS_KEY, mode === "original" ? "1" : "0");
    } catch {
      // ignore
    }
  }

  persistMinimapVisible(v: boolean): void {
    try {
      window.localStorage.setItem(MINIMAP_VISIBLE_KEY, String(v));
    } catch {
      // ignore
    }
  }

  persistCoordsVisible(v: boolean): void {
    try {
      window.localStorage.setItem(COORDS_VISIBLE_KEY, String(v));
    } catch {
      // ignore
    }
  }

  applyThemeClass(): void {
    document.documentElement.classList.toggle("theme-dark", this.theme === "dark");
    document.documentElement.classList.toggle("theme-light", this.theme === "light");
  }

  scheduleRender(): void {
    if (this.renderRaf || !this.viewer) return;
    const instance = this.viewer;
    this.renderRaf = requestAnimationFrame(() => {
      this.renderRaf = 0;
      instance.Render();
    });
  }

  initMinimap(): void {
    if (!this.minimap) {
      this.minimap = new Minimap(dom.minimapCanvas);
    }
  }
}

export const state = new ViewerState();
