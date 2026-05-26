import type { DxfViewer, LayerInfo } from "dxf-viewer";

export type Theme = "light" | "dark";
export type ThemeMode = "theme" | "original";
export type ViewState = { centerX: number; centerY: number; width: number };
export type TextHit = { text: string; x: number; y: number };
export type SnapKindActive = "endpoint" | "midpoint" | "center";

export type LayerEntry = {
  info: LayerInfo;
  row: HTMLLIElement;
  checkbox: HTMLInputElement;
  nameNode: HTMLSpanElement;
  swatch: HTMLSpanElement;
};

export type ViewerCamera = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom?: number;
  position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
  updateProjectionMatrix: () => void;
};

export type ViewerControls = {
  enabled: boolean;
  target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
  update: () => void;
};

export type DxfHeader = Record<string, unknown>;

export type ParsedDxf = {
  entities?: unknown[];
  header?: DxfHeader;
  headers?: DxfHeader;
};

export type ViewerWithInternals = DxfViewer & {
  camera?: ViewerCamera;
  controls?: ViewerControls;
  parsedDxf?: ParsedDxf;
  GetDxf?: () => ParsedDxf | null;
  GetOrigin?: () => { x: number; y: number } | null;
  scene?: unknown;
};

export function getParsedDxf(instance: DxfViewer): ParsedDxf | null {
  const v = instance as ViewerWithInternals;
  if (v.parsedDxf) return v.parsedDxf;
  if (typeof v.GetDxf === "function") return v.GetDxf();
  return null;
}

export function getViewerCanvas(instance: DxfViewer): HTMLCanvasElement | null {
  const getCanvas = (instance as unknown as { GetCanvas?: () => HTMLCanvasElement }).GetCanvas;
  const canvas = typeof getCanvas === "function" ? getCanvas.call(instance) : null;
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}
