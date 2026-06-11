import type { Color, Vector3 } from "three";

export type RendererEventName = "loaded" | "viewChanged";

export type LayerInfo = {
  name: string;
  displayName: string;
  color: number;
};

export type DxfHeader = Record<string, unknown>;

export type ParsedDxf = {
  entities?: unknown[];
  header?: DxfHeader;
  headers?: DxfHeader;
  tables?: Record<string, unknown>;
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

export type ViewerWithInternals = DrawingRenderer & {
  camera?: ViewerCamera;
  controls?: ViewerControls;
  scene?: unknown;
};

export type RendererLoadOptions = {
  url: string;
  fonts?: string[];
  progressCbk?: (phase: "font" | "fetch" | "parse" | "prepare", processed: number, total: number) => void;
};

export type ColorCorrectionParams = {
  darkBgMaxL?: number;
  darkBgTargetL?: number;
  darkBgTriggerL?: number;
  darkBgTriggerY?: number;
  lightBgMinL?: number;
  lightBgTargetL?: number;
  lightBgTriggerL?: number;
  lightBgTriggerY?: number;
};

export interface DrawingRenderer {
  camera?: ViewerCamera;
  controls?: ViewerControls;
  Load(options: RendererLoadOptions): Promise<void>;
  Render(): void;
  Destroy(): void;
  GetCanvas(): HTMLCanvasElement | null;
  GetDxf(): ParsedDxf | null;
  GetOrigin(): { x: number; y: number } | null;
  GetBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null;
  GetFullBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null;
  FitView(minX: number, maxX: number, minY: number, maxY: number, padding: number): void;
  SetView(center: Vector3, width: number): void;
  GetLayers(): LayerInfo[];
  ShowLayer(name: string, show: boolean): void;
  SetLayersVisibility(visibilityMap: Map<string, boolean> | Iterable<[string, boolean]>): void;
  SetColorPalette(palette: Record<number, number> | null): void;
  SetColorCorrection(enable: boolean): void;
  SetBlackWhiteInversion(enable: boolean): void;
  SetColorCorrectionParams(params: ColorCorrectionParams): void;
  SetClearColor(color: Color, alpha?: number): void;
  Subscribe(eventName: RendererEventName, eventHandler: (event: unknown) => void): void;
  Unsubscribe(eventName: RendererEventName, eventHandler: (event: unknown) => void): void;
}
