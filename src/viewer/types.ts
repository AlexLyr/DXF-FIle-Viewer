import type { DrawingRenderer, LayerInfo, ParsedDxf, ViewerCamera, ViewerControls } from "./render/types";

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

export type DxfHeader = Record<string, unknown>;

export type ViewerWithInternals = DrawingRenderer & {
  camera?: ViewerCamera;
  controls?: ViewerControls;
  parsedDxf?: ParsedDxf | null;
  GetDxf?: () => ParsedDxf | null;
  GetOrigin?: () => { x: number; y: number } | null;
  scene?: unknown;
};

export function getParsedDxf(instance: DrawingRenderer): ParsedDxf | null {
  const v = instance as ViewerWithInternals;
  if (v.parsedDxf) return v.parsedDxf ?? null;
  if (typeof v.GetDxf === "function") return v.GetDxf();
  return null;
}

export function getViewerCanvas(instance: DrawingRenderer): HTMLCanvasElement | null {
  const canvas = instance.GetCanvas();
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}
