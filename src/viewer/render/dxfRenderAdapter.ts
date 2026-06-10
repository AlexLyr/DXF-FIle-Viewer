import { Box3, Color, Object3D, OrthographicCamera, Scene, Vector3, WebGLRenderer } from "three";
import { buildRasterPlaceholders } from "./rasterPlaceholders";
import type { ColorCorrectionParams, DrawingRenderer, LayerInfo, ParsedDxf, RendererEventName, RendererLoadOptions, ViewerCamera, ViewerControls } from "./types";

type EventHandler = (event: unknown) => void;

type OriginOffset = { x: number; y: number; z: number };

type ThreeLikeControls = {
  enabled: boolean;
  target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
  update: () => void;
  addEventListener?: (type: string, handler: () => void) => void;
  removeEventListener?: (type: string, handler: () => void) => void;
  dispose?: () => void;
};

type DxfRenderModule = {
  parseDxfAsync?: (text: string) => Promise<ParsedDxf>;
  parseDxf?: (text: string) => ParsedDxf;
  loadDefaultFont?: () => unknown;
  createThreeObjectsFromDXF: (
    dxf: ParsedDxf,
    options?: {
      darkTheme?: boolean;
      font?: unknown;
      signal?: AbortSignal;
      onProgress?: (fraction: number) => void;
    },
  ) => Promise<{
    group: { traverse: (fn: (obj: unknown) => void) => void } & Object3D;
    materials?: unknown;
    originOffset?: OriginOffset;
  }>;
  useCamera?: () => {
    fitCameraToBox?: (box: Box3, camera: OrthographicCamera) => void;
    fitCameraToObject?: (object: Object3D, camera: OrthographicCamera) => void;
    handleResize?: (
      container: HTMLElement,
      camera: OrthographicCamera | null,
      renderer: WebGLRenderer | null,
      scene: Scene | null,
      afterResize?: (width: number, height: number) => void,
    ) => void;
  };
  useControls?: () => {
    initControls?: (camera: OrthographicCamera, domElement: HTMLElement) => ThreeLikeControls;
    setTarget?: (x: number, y: number, z: number) => void;
    getControls?: () => ThreeLikeControls | null;
    cleanup?: () => void;
  };
};

type LayerVisibilityMap = Map<string, boolean>;

// Must match dxf-render's useCamera(): it positions the camera at z=100 and
// derives fit-zoom from a frustum height of 100. Keep these in sync.
const FRUSTUM_SIZE = 100;
const CAMERA_Z = 100;
// Wide ortho near/far so DWG geometry with large Z extents is never clipped.
const CAMERA_DEPTH = 1e5;
// dxf-render's fitCameraToBox leaves ~25% padding around the box. Multiply the
// resulting zoom to tighten the framing so content fills more of the viewport.
const FIT_ZOOM_BOOST = 1.2;
const MAX_PIXEL_RATIO = 2;
// Keep rendering for a short window after an interaction (drag/zoom) so the GPU
// stays "warm" through it without a first-frame wake stutter. Only triggered by
// real interaction (pointerdown / wheel), NOT by hover, to keep idle cost low.
const ACTIVITY_KEEP_ALIVE_MS = 1200;

function toFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeLayerName(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw : "0";
}

function parseLayerEntries(dxf: ParsedDxf): LayerInfo[] {
  const seen = new Map<string, LayerInfo>();
  const addLayer = (name: string, displayName: string, color: number): void => {
    if (!seen.has(name)) {
      seen.set(name, { name, displayName, color });
    }
  };

  const tables = dxf.tables as Record<string, unknown> | undefined;
  const layerTable = tables?.layer as { layers?: Record<string, unknown> } | undefined;
  const layersRecord = layerTable?.layers;
  if (layersRecord && typeof layersRecord === "object") {
    for (const [key, row] of Object.entries(layersRecord)) {
      const layer = (row ?? {}) as Record<string, unknown>;
      const name = normalizeLayerName((typeof layer.name === "string" ? layer.name : undefined) ?? key);
      const color =
        typeof layer.color === "number"
          ? layer.color
          : typeof layer.colorIndex === "number"
            ? layer.colorIndex
            : 0x808080;
      addLayer(name, name, color);
    }
  }

  if (Array.isArray(dxf.entities)) {
    for (const entity of dxf.entities) {
      const row = entity as Record<string, unknown>;
      const name = normalizeLayerName(row.layer);
      addLayer(name, name, 0x808080);
    }
  }

  return Array.from(seen.values());
}

function extractEntityLayer(obj: unknown): string | null {
  const row = obj as {
    userData?: {
      layer?: unknown;
      layerName?: unknown;
      dxfLayerName?: unknown;
      entity?: { layer?: unknown };
      sourceEntity?: { layer?: unknown };
    };
  };
  const fromUserData = row.userData;
  if (!fromUserData) return null;
  const candidate =
    fromUserData.layer ??
    fromUserData.layerName ??
    fromUserData.dxfLayerName ??
    fromUserData.entity?.layer ??
    fromUserData.sourceEntity?.layer;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function getObjectColor(obj: unknown): number | null {
  const row = obj as {
    material?: {
      color?: { getHex?: () => number };
    };
  };
  const color = row.material?.color;
  if (color && typeof color.getHex === "function") {
    return color.getHex();
  }
  return null;
}

function setObjectColor(obj: unknown, hex: number): void {
  const row = obj as {
    material?: {
      color?: { set?: (hex: number) => void };
      uniforms?: { color?: { value?: { set?: (hex: number) => void } } };
      needsUpdate?: boolean;
    };
  };
  const material = row.material;
  if (!material) return;
  if (material.color && typeof material.color.set === "function") {
    material.color.set(hex);
    material.needsUpdate = true;
  }
  if (material.uniforms?.color?.value && typeof material.uniforms.color.value.set === "function") {
    material.uniforms.color.value.set(hex);
    material.needsUpdate = true;
  }
}

function colorLuminance(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function adjustHslLightness(hex: number, nextL: number): number {
  const color = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  hsl.l = clamp01(nextL);
  color.setHSL(hsl.h, hsl.s, hsl.l);
  return color.getHex();
}

function transformColor(
  source: number,
  clearColorHex: number,
  palette: Record<number, number> | null,
  colorCorrectionEnabled: boolean,
  blackWhiteInversionEnabled: boolean,
  correctionParams: Required<ColorCorrectionParams>,
): number {
  const normalizedSource = source >>> 0;
  if (palette) {
    const mapped = palette[normalizedSource];
    if (typeof mapped === "number") {
      return mapped >>> 0;
    }
  }

  let result = normalizedSource;
  const backgroundLum = colorLuminance(clearColorHex);
  if (blackWhiteInversionEnabled) {
    if (result === 0xffffff && backgroundLum >= 0.8) result = 0;
    if (result === 0x000000 && backgroundLum <= 0.2) result = 0xffffff;
  }

  if (!colorCorrectionEnabled) return result;

  const fgColor = new Color(result);
  const fgHsl = { h: 0, s: 0, l: 0 };
  fgColor.getHSL(fgHsl);
  const fgLum = colorLuminance(result);
  const bgColor = new Color(clearColorHex);
  const bgHsl = { h: 0, s: 0, l: 0 };
  bgColor.getHSL(bgHsl);

  const tooDarkOnDark =
    bgHsl.l <= correctionParams.darkBgMaxL &&
    (fgHsl.l < correctionParams.darkBgTriggerL || fgLum < correctionParams.darkBgTriggerY);
  if (tooDarkOnDark) {
    return adjustHslLightness(result, Math.max(fgHsl.l, correctionParams.darkBgTargetL));
  }

  const tooLightOnLight =
    bgHsl.l >= correctionParams.lightBgMinL &&
    (fgHsl.l > correctionParams.lightBgTriggerL || fgLum > correctionParams.lightBgTriggerY);
  if (tooLightOnLight) {
    return adjustHslLightness(result, Math.min(fgHsl.l, correctionParams.lightBgTargetL));
  }

  return result;
}

function readDxfBounds(parsed: ParsedDxf): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const header = parsed.header ?? parsed.headers;
  if (!header) return null;

  const extMin = (header.$EXTMIN ?? header.EXTMIN) as { x?: number; y?: number } | undefined;
  const extMax = (header.$EXTMAX ?? header.EXTMAX) as { x?: number; y?: number } | undefined;
  if (
    extMin &&
    extMax &&
    typeof extMin.x === "number" &&
    typeof extMin.y === "number" &&
    typeof extMax.x === "number" &&
    typeof extMax.y === "number" &&
    Number.isFinite(extMin.x) &&
    Number.isFinite(extMin.y) &&
    Number.isFinite(extMax.x) &&
    Number.isFinite(extMax.y) &&
    extMax.x > extMin.x &&
    extMax.y > extMin.y
  ) {
    return { minX: extMin.x, maxX: extMax.x, minY: extMin.y, maxY: extMax.y };
  }

  return null;
}

const DEFAULT_CC_PARAMS: Required<ColorCorrectionParams> = {
  darkBgMaxL: 0.3,
  darkBgTargetL: 0.55,
  darkBgTriggerL: 0.4,
  darkBgTriggerY: 0.3,
  lightBgMinL: 0.7,
  lightBgTargetL: 0.4,
  lightBgTriggerL: 0.6,
  lightBgTriggerY: 0.7,
};

export class DxfRenderAdapter implements DrawingRenderer {
  camera?: ViewerCamera;
  controls?: ViewerControls;

  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly orthoCamera: OrthographicCamera;
  private parsed: ParsedDxf | null = null;
  private bounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
  private fullBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
  private originOffset: OriginOffset = { x: 0, y: 0, z: 0 };
  private group: Object3D | null = null;
  private rafId = 0;
  private running = false;
  private dirty = true;
  private activeUntil = 0;
  private activePointerId: number | null = null;
  private readonly handlers = new Map<RendererEventName, Set<EventHandler>>();
  private layerVisibility: LayerVisibilityMap = new Map();
  private layerEntries: LayerInfo[] = [];
  private baseObjectColors = new WeakMap<object, number>();
  private colorPalette: Record<number, number> | null = null;
  private colorCorrectionEnabled = false;
  private blackWhiteInversionEnabled = false;
  private colorCorrectionParams: Required<ColorCorrectionParams> = { ...DEFAULT_CC_PARAMS };
  private clearColorHex = 0xf6f7f9;
  private clearAlpha = 1;
  private dxfRenderModule: DxfRenderModule | null = null;
  private cameraApi: ReturnType<NonNullable<DxfRenderModule["useCamera"]>> | null = null;
  private mapControls: ThreeLikeControls | null = null;
  private controlsApi: ReturnType<NonNullable<DxfRenderModule["useControls"]>> | null = null;
  private lastViewportWidth = 0;
  private lastViewportHeight = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "dxf-render-canvas";
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.host.append(this.canvas);

    this.scene = new Scene();

    const aspect = this.getAspect();
    this.orthoCamera = new OrthographicCamera(
      (-FRUSTUM_SIZE * aspect) / 2,
      (FRUSTUM_SIZE * aspect) / 2,
      FRUSTUM_SIZE / 2,
      -FRUSTUM_SIZE / 2,
      -CAMERA_DEPTH,
      CAMERA_DEPTH,
    );
    this.orthoCamera.position.set(0, 0, CAMERA_Z);
    this.orthoCamera.zoom = 1;
    this.orthoCamera.updateProjectionMatrix();
    this.camera = this.orthoCamera as unknown as ViewerCamera;

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      // Off by default to cut per-frame compositing cost; capture paths
      // (screenshot/print/minimap) call Render() synchronously before reading
      // the canvas, so the backbuffer is still valid for toDataURL/drawImage.
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(new Color(this.clearColorHex), this.clearAlpha);

    this.applyViewportSize(true);
    window.addEventListener("resize", this.handleResize);
    this.attachActivityWake();
    this.startRenderLoop();
  }

  async Load(options: RendererLoadOptions): Promise<void> {
    const module = await this.loadDxfRenderModule();
    this.ensureSceneApis(module);

    options.progressCbk?.("fetch", 0, 100);
    const response = await fetch(options.url);
    const text = await response.text();
    options.progressCbk?.("fetch", 100, 100);

    options.progressCbk?.("font", 0, 100);
    const font = await Promise.resolve(module.loadDefaultFont?.());
    options.progressCbk?.("font", 100, 100);

    options.progressCbk?.("parse", 0, 100);
    if (typeof module.parseDxfAsync === "function") {
      this.parsed = await module.parseDxfAsync(text);
    } else if (typeof module.parseDxf === "function") {
      this.parsed = module.parseDxf(text);
    } else {
      throw new Error("dxf-render parser is unavailable.");
    }
    options.progressCbk?.("parse", 100, 100);

    options.progressCbk?.("prepare", 0, 100);
    if (this.group) {
      this.scene.remove(this.group);
      this.group = null;
    }
    const darkTheme = this.clearColorHex === 0x262a32;
    const { group, originOffset } = await module.createThreeObjectsFromDXF(this.parsed, {
      darkTheme,
      font: font ?? undefined,
      onProgress: (p) => options.progressCbk?.("prepare", Math.round(toFinite(p, 0) * 100), 100),
    });
    this.group = group;
    this.originOffset = originOffset ?? { x: 0, y: 0, z: 0 };
    this.scene.add(group);
    this.captureBaseObjectColors(group);
    this.layerEntries = parseLayerEntries(this.parsed);
    this.layerVisibility = new Map(this.layerEntries.map((entry) => [entry.name, true]));
    this.applyLayerVisibilityToScene();

    const geomBox = new Box3().setFromObject(group);
    const headerBounds = readDxfBounds(this.parsed);
    const headerBox = headerBounds ? this.offsetBoxFromBounds(headerBounds) : null;

    // Full extent (true DXF) — drives "show everything" (GetFullBounds) and is
    // the fallback when geometry is empty.
    const fullSceneBox = !geomBox.isEmpty() ? geomBox : headerBox && !headerBox.isEmpty() ? headerBox : null;
    this.fullBounds = fullSceneBox ? this.toTrueBounds(fullSceneBox) : null;

    // Smart content extent: drop lonely strays far from the main drawing so the
    // default view frames the actual content, not a near-empty bounding box.
    // Falls back to the full box on dense/continuous drawings (no large gap).
    let contentSceneBox = fullSceneBox;
    if (!geomBox.isEmpty()) {
      const content = this.computeSmartContentBox(group, geomBox);
      if (
        !content.isEmpty() &&
        DxfRenderAdapter.boxMaxDimension(content) < DxfRenderAdapter.boxMaxDimension(geomBox) * 0.8
      ) {
        contentSceneBox = content;
      }
    }
    this.bounds = contentSceneBox ? this.toTrueBounds(contentSceneBox) : null;

    if (contentSceneBox) {
      this.fitToBox(contentSceneBox, 0.05);
    }

    // Raster underlays: dxf-render skips IMAGE entities, and the pixels live in
    // external files anyway. Draw a frame + filename marker so these layers are
    // not silently blank. Added after bounds/fit so the (often far-off) frames
    // don't distort the default view, and after captureBaseObjectColors so the
    // markers keep their own color instead of being color-corrected.
    const rasterBox = this.addRasterPlaceholders(text);
    if (rasterBox) {
      // "Show all" should reveal raster markers even when they sit far from the
      // main drawing; the smart default fit above intentionally still excludes them.
      const mergedFull = fullSceneBox ? fullSceneBox.clone().union(rasterBox) : rasterBox;
      this.fullBounds = this.toTrueBounds(mergedFull);
    }

    this.applyMaterialTransforms();
    options.progressCbk?.("prepare", 100, 100);
    this.emit("loaded", null);
  }

  Render(): void {
    this.syncViewportIfNeeded();
    this.renderer.render(this.scene, this.orthoCamera);
    this.dirty = false;
  }

  private markDirty(): void {
    this.dirty = true;
  }

  Destroy(): void {
    this.stopRenderLoop();
    window.removeEventListener("resize", this.handleResize);
    this.detachActivityWake();
    if (this.mapControls?.removeEventListener) {
      this.mapControls.removeEventListener("change", this.handleViewChanged);
    }
    this.controlsApi?.cleanup?.();
    this.mapControls?.dispose?.();
    this.canvas.remove();
    this.renderer.dispose();
    this.group = null;
    this.parsed = null;
    this.mapControls = null;
    this.controlsApi = null;
    this.cameraApi = null;
    this.handlers.clear();
  }

  GetCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  GetDxf(): ParsedDxf | null {
    return this.parsed;
  }

  GetOrigin(): { x: number; y: number } | null {
    return { x: this.originOffset.x, y: this.originOffset.y };
  }

  GetBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    return this.bounds;
  }

  GetFullBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    return this.fullBounds ?? this.bounds;
  }

  FitView(minX: number, maxX: number, minY: number, maxY: number, padding: number): void {
    const box = new Box3(new Vector3(minX, minY, -1), new Vector3(maxX, maxY, 1));
    this.fitToBox(box, padding);
    this.emit("viewChanged", null);
  }

  SetView(center: Vector3, width: number): void {
    const zoomWidth = Math.max(width, 1e-6);
    const baseWidth = Math.max(this.orthoCamera.right - this.orthoCamera.left, 1e-6);
    this.orthoCamera.zoom = baseWidth / zoomWidth;
    this.orthoCamera.position.set(center.x, center.y, this.orthoCamera.position.z || CAMERA_Z);
    this.mapControls?.target.set(center.x, center.y, 0);
    this.orthoCamera.updateProjectionMatrix();
    this.mapControls?.update();
    this.markDirty();
    this.emit("viewChanged", null);
  }

  GetLayers(): LayerInfo[] {
    return this.layerEntries;
  }

  ShowLayer(name: string, show: boolean): void {
    this.layerVisibility.set(name, show);
    this.applyLayerVisibilityToScene();
    this.emit("viewChanged", null);
  }

  SetLayersVisibility(visibilityMap: Map<string, boolean> | Iterable<[string, boolean]>): void {
    for (const [name, visible] of visibilityMap) {
      this.layerVisibility.set(name, visible);
    }
    this.applyLayerVisibilityToScene();
    this.emit("viewChanged", null);
  }

  SetColorPalette(palette: Record<number, number> | null): void {
    this.colorPalette = palette;
    this.applyMaterialTransforms();
  }

  SetColorCorrection(enable: boolean): void {
    this.colorCorrectionEnabled = enable;
    this.applyMaterialTransforms();
  }

  SetBlackWhiteInversion(enable: boolean): void {
    this.blackWhiteInversionEnabled = enable;
    this.applyMaterialTransforms();
  }

  SetColorCorrectionParams(params: ColorCorrectionParams): void {
    this.colorCorrectionParams = {
      ...this.colorCorrectionParams,
      ...params,
    };
    this.applyMaterialTransforms();
  }

  SetClearColor(color: Color, alpha = this.clearAlpha): void {
    this.clearColorHex = color.getHex();
    this.clearAlpha = alpha;
    this.renderer.setClearColor(color, alpha);
    this.applyMaterialTransforms();
    this.markDirty();
  }

  Subscribe(eventName: RendererEventName, eventHandler: (event: unknown) => void): void {
    const listeners = this.handlers.get(eventName) ?? new Set<EventHandler>();
    listeners.add(eventHandler);
    this.handlers.set(eventName, listeners);
  }

  Unsubscribe(eventName: RendererEventName, eventHandler: (event: unknown) => void): void {
    this.handlers.get(eventName)?.delete(eventHandler);
  }

  private async loadDxfRenderModule(): Promise<DxfRenderModule> {
    if (this.dxfRenderModule) return this.dxfRenderModule;
    const loaded = (await import("dxf-render")) as unknown as DxfRenderModule;
    this.dxfRenderModule = loaded;
    return loaded;
  }

  private ensureSceneApis(module: DxfRenderModule): void {
    if (!this.cameraApi && typeof module.useCamera === "function") {
      this.cameraApi = module.useCamera();
    }
    if (!this.mapControls && typeof module.useControls === "function") {
      this.controlsApi = module.useControls();
      this.bindControls();
    }
  }

  private bindControls(): void {
    const created = this.controlsApi?.initControls?.(this.orthoCamera, this.canvas) ?? null;
    if (!created) return;
    // Zoom toward the cursor (AutoCAD-like) instead of the frame center, and
    // disable inertia: damping interpolation fights our direct camera writes
    // in SetView (causing a jump on the first drag after restoring a view).
    const tunable = created as unknown as {
      zoomToCursor?: boolean;
      zoomSpeed?: number;
      enableDamping?: boolean;
    };
    tunable.zoomToCursor = true;
    tunable.enableDamping = false;
    // Larger step per wheel notch so zoom feels snappy, not gradual.
    tunable.zoomSpeed = 2.4;
    created.addEventListener?.("change", this.handleViewChanged);
    this.mapControls = created;
    this.controls = created as unknown as ViewerControls;
  }

  // Recover from an orphaned gesture (canvas lost pointer capture, so the
  // controls' pan listener stays attached and the drawing follows an unpressed
  // cursor). Disposing + re-creating the controls removes the stuck listeners
  // safely, without dispatching synthetic events into OrbitControls internals.
  private resetControls(): void {
    if (!this.controlsApi) return;
    const { x, y } = this.orthoCamera.position;
    this.mapControls?.removeEventListener?.("change", this.handleViewChanged);
    this.controlsApi.cleanup?.();
    this.mapControls = null;
    this.bindControls();
    this.mapControls?.target.set(x, y, 0);
    this.mapControls?.update();
  }

  private offsetBoxFromBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number }): Box3 {
    return new Box3(
      new Vector3(bounds.minX - this.originOffset.x, bounds.minY - this.originOffset.y, -1),
      new Vector3(bounds.maxX - this.originOffset.x, bounds.maxY - this.originOffset.y, 1),
    );
  }

  private static boxMaxDimension(box: Box3): number {
    const size = box.getSize(new Vector3());
    return Math.max(size.x, size.y);
  }

  private toTrueBounds(sceneBox: Box3): { minX: number; maxX: number; minY: number; maxY: number } {
    return {
      minX: sceneBox.min.x + this.originOffset.x,
      maxX: sceneBox.max.x + this.originOffset.x,
      minY: sceneBox.min.y + this.originOffset.y,
      maxY: sceneBox.max.y + this.originOffset.y,
    };
  }

  // Cap on sampled vertices: gap/cluster analysis only needs a representative
  // sample, and sampling keeps this O(cap) even for multi-million-vertex DWGs.
  private static readonly SMART_FIT_SAMPLE_CAP = 120000;
  // A gap wider than this fraction of the CURRENT span splits the points into
  // separate clusters. Evaluated relative to the shrinking span at each step,
  // so densestCluster tightens onto the dense core; continuous drawings have no
  // such gap at any scale and stay a single cluster.
  private static readonly SMART_FIT_GAP_FRACTION = 0.35;
  // Cap recursive tightening so we never zoom into a microscopic sub-cluster.
  private static readonly SMART_FIT_MAX_DEPTH = 5;

  // Build the "content" box: the extent of the densest body of geometry,
  // ignoring far-away clusters (lonely strays, distant survey markers, a stray
  // block, etc.). dxf-render merges geometry, so a stray vertex can live inside
  // a shared mesh — object-level trimming misses it. We therefore work at the
  // vertex level: sample world-space X/Y, pick the dominant cluster along X
  // (most points), then the dominant Y cluster within it. Continuous drawings
  // have no large gap, so they come back as the full extent.
  private computeSmartContentBox(group: Object3D, fullBox: Box3): Box3 {
    group.updateMatrixWorld(true);

    let total = 0;
    group.traverse((obj) => {
      const count = (obj as { geometry?: { attributes?: { position?: { count?: number } } } }).geometry?.attributes
        ?.position?.count;
      if (typeof count === "number") total += count;
    });
    if (total === 0) return fullBox;

    const stride = Math.max(1, Math.ceil(total / DxfRenderAdapter.SMART_FIT_SAMPLE_CAP));
    const xs: number[] = [];
    const ys: number[] = [];
    const v = new Vector3();
    group.traverse((obj) => {
      const node = obj as Object3D & {
        geometry?: {
          attributes?: {
            position?: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number };
          };
        };
      };
      const pos = node.geometry?.attributes?.position;
      if (!pos) return;
      const matrix = node.matrixWorld;
      for (let i = 0; i < pos.count; i += stride) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(matrix);
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) continue;
        xs.push(v.x);
        ys.push(v.y);
      }
    });
    if (xs.length < 16) return fullBox;

    const sortedX = xs.slice().sort((a, b) => a - b);
    const [x0, x1] = DxfRenderAdapter.densestCluster(sortedX);

    // Y extent of only the points that fall in the dominant X cluster, so the
    // box lands on the real 2D blob rather than spanning diagonal clusters.
    const ysInX: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] >= x0 && xs[i] <= x1) ysInX.push(ys[i]);
    }
    const sortedY = (ysInX.length >= 16 ? ysInX : ys.slice()).sort((a, b) => a - b);
    const [y0, y1] = DxfRenderAdapter.densestCluster(sortedY);

    if (!(x1 > x0) || !(y1 > y0)) return fullBox;
    return new Box3(new Vector3(x0, y0, fullBox.min.z), new Vector3(x1, y1, fullBox.max.z));
  }

  // Recursively narrow to the densest contiguous run. At each step the largest
  // gap is compared to a fraction of the CURRENT span, so after isolating a
  // far cluster the next pass can still split sparse fringe inside it (its gaps
  // are now large relative to the smaller span). Stops when the densest run is
  // the whole window (continuous), when it gets too small, or at a depth cap.
  private static densestCluster(sorted: number[]): [number, number] {
    let lo = 0;
    let hi = sorted.length - 1;
    for (let depth = 0; depth < DxfRenderAdapter.SMART_FIT_MAX_DEPTH; depth++) {
      const span = sorted[hi] - sorted[lo];
      if (!(span > 0)) break;
      const gapThreshold = span * DxfRenderAdapter.SMART_FIT_GAP_FRACTION;

      let bestStart = lo;
      let bestEnd = hi;
      let bestCount = 0;
      let runStart = lo;
      for (let i = lo + 1; i <= hi + 1; i++) {
        const isBreak = i === hi + 1 || sorted[i] - sorted[i - 1] > gapThreshold;
        if (!isBreak) continue;
        const count = i - runStart;
        if (count > bestCount) {
          bestCount = count;
          bestStart = runStart;
          bestEnd = i - 1;
        }
        runStart = i;
      }

      if ((bestStart === lo && bestEnd === hi) || bestCount < 16) break;
      lo = bestStart;
      hi = bestEnd;
    }
    return [sorted[lo], sorted[hi]];
  }

  private applyFrustum(): void {
    // dxf-render's fitCameraToBox derives zoom from the camera's current
    // frustum, so it must reflect the live viewport aspect at fit time.
    const aspect = this.getAspect();
    this.orthoCamera.left = (-FRUSTUM_SIZE * aspect) / 2;
    this.orthoCamera.right = (FRUSTUM_SIZE * aspect) / 2;
    this.orthoCamera.top = FRUSTUM_SIZE / 2;
    this.orthoCamera.bottom = -FRUSTUM_SIZE / 2;
    this.orthoCamera.updateProjectionMatrix();
  }

  private fitToBox(box: Box3, padding: number): void {
    if (box.isEmpty()) return;
    this.applyFrustum();
    const padded = box.clone();
    if (padding > 0) {
      const size = padded.getSize(new Vector3());
      padded.expandByVector(new Vector3(size.x * padding, size.y * padding, 0));
    }
    const center = padded.getCenter(new Vector3());

    if (this.cameraApi?.fitCameraToBox) {
      this.cameraApi.fitCameraToBox(padded, this.orthoCamera);
    } else {
      const aspect = this.getAspect();
      const width = Math.max(padded.max.x - padded.min.x, 1e-6);
      const height = Math.max(padded.max.y - padded.min.y, 1e-6);
      const viewWidth = Math.max(width, height * aspect);
      const halfWidth = viewWidth / 2;
      this.orthoCamera.left = -halfWidth;
      this.orthoCamera.right = halfWidth;
      this.orthoCamera.top = halfWidth / Math.max(aspect, 1e-6);
      this.orthoCamera.bottom = -halfWidth / Math.max(aspect, 1e-6);
      this.orthoCamera.zoom = 1;
      this.orthoCamera.position.set(center.x, center.y, this.orthoCamera.position.z || CAMERA_Z);
      this.orthoCamera.updateProjectionMatrix();
    }

    if (this.orthoCamera.zoom > 0 && Number.isFinite(this.orthoCamera.zoom)) {
      this.orthoCamera.zoom *= FIT_ZOOM_BOOST;
      this.orthoCamera.updateProjectionMatrix();
    }

    this.mapControls?.target.set(center.x, center.y, 0);
    this.mapControls?.update();
    this.markDirty();
  }

  private captureBaseObjectColors(group: Object3D): void {
    this.baseObjectColors = new WeakMap();
    group.traverse((obj) => {
      const color = getObjectColor(obj);
      if (color !== null) {
        this.baseObjectColors.set(obj, color);
      }
    });
  }

  private applyMaterialTransforms(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      const base = this.baseObjectColors.get(obj);
      if (typeof base !== "number") return;
      const transformed = transformColor(
        base,
        this.clearColorHex,
        this.colorPalette,
        this.colorCorrectionEnabled,
        this.blackWhiteInversionEnabled,
        this.colorCorrectionParams,
      );
      setObjectColor(obj, transformed);
    });
    this.markDirty();
  }

  private addRasterPlaceholders(dxfText: string): Box3 | null {
    if (!this.group) return null;
    let placeholders: Object3D[];
    try {
      placeholders = buildRasterPlaceholders(dxfText, this.originOffset);
    } catch {
      return null;
    }
    if (placeholders.length === 0) return null;
    const box = new Box3();
    for (const obj of placeholders) {
      const layer = extractEntityLayer(obj);
      if (layer) {
        const visible = this.layerVisibility.get(layer);
        if (visible !== undefined) obj.visible = visible;
      }
      this.group.add(obj);
      box.expandByObject(obj);
    }
    this.markDirty();
    return box.isEmpty() ? null : box;
  }

  private applyLayerVisibilityToScene(): void {
    if (!this.group) return;
    this.group.traverse((obj) => {
      const layer = extractEntityLayer(obj);
      if (!layer) return;
      const visible = this.layerVisibility.get(layer);
      if (visible === undefined) return;
      (obj as { visible: boolean }).visible = visible;
    });
    this.markDirty();
  }

  private getAspect(): number {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    return width / height;
  }

  private syncViewportIfNeeded(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    if (width === this.lastViewportWidth && height === this.lastViewportHeight) return;
    this.applyViewportSize(false);
  }

  private applyViewportSize(initial: boolean): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.lastViewportWidth = width;
    this.lastViewportHeight = height;
    this.markDirty();

    if (!initial && this.cameraApi?.handleResize) {
      this.cameraApi.handleResize(this.host, this.orthoCamera, this.renderer, this.scene);
      return;
    }

    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const frustumHeight = this.orthoCamera.top - this.orthoCamera.bottom;
    this.orthoCamera.left = (-frustumHeight * aspect) / 2;
    this.orthoCamera.right = (frustumHeight * aspect) / 2;
    this.orthoCamera.updateProjectionMatrix();
  }

  private emit(eventName: RendererEventName, event: unknown): void {
    const listeners = this.handlers.get(eventName);
    if (!listeners) return;
    for (const handler of listeners) {
      handler(event);
    }
  }

  private handleResize = (): void => {
    this.applyViewportSize(false);
    this.emit("viewChanged", null);
  };

  private handleActivity = (): void => {
    this.activeUntil = performance.now() + ACTIVITY_KEEP_ALIVE_MS;
  };

  private handleCanvasPointerDown = (event: PointerEvent): void => {
    this.activePointerId = event.pointerId;
    this.handleActivity();
  };

  private handleCanvasPointerEnd = (): void => {
    this.activePointerId = null;
  };

  // Safety net: if the canvas never received the matching up/cancel (capture was
  // lost), our canvas handler did not clear activePointerId. The controls' pan
  // listener is now orphaned, so reset the controls to stop the runaway pan.
  private handleGlobalPointerEnd = (): void => {
    const id = this.activePointerId;
    if (id === null) return;
    this.activePointerId = null;
    try {
      if (this.canvas.hasPointerCapture?.(id)) this.canvas.releasePointerCapture(id);
    } catch {
      // ignore
    }
    this.resetControls();
  };

  private attachActivityWake(): void {
    this.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown, { passive: true });
    this.canvas.addEventListener("wheel", this.handleActivity, { passive: true });
    this.canvas.addEventListener("pointerup", this.handleCanvasPointerEnd, { passive: true });
    this.canvas.addEventListener("pointercancel", this.handleCanvasPointerEnd, { passive: true });
    window.addEventListener("pointerup", this.handleGlobalPointerEnd);
    window.addEventListener("pointercancel", this.handleGlobalPointerEnd);
    window.addEventListener("blur", this.handleGlobalPointerEnd);
  }

  private detachActivityWake(): void {
    this.canvas.removeEventListener("pointerdown", this.handleCanvasPointerDown);
    this.canvas.removeEventListener("wheel", this.handleActivity);
    this.canvas.removeEventListener("pointerup", this.handleCanvasPointerEnd);
    this.canvas.removeEventListener("pointercancel", this.handleCanvasPointerEnd);
    window.removeEventListener("pointerup", this.handleGlobalPointerEnd);
    window.removeEventListener("pointercancel", this.handleGlobalPointerEnd);
    window.removeEventListener("blur", this.handleGlobalPointerEnd);
  }

  private handleViewChanged = (): void => {
    this.markDirty();
    this.emit("viewChanged", null);
  };

  private startRenderLoop(): void {
    if (this.running) return;
    this.running = true;
    const tick = (): void => {
      if (!this.running) return;
      this.syncViewportIfNeeded();
      // Drive control inertia/input only when enabled (compare overlay disables
      // its controls and is driven externally via Render()).
      if (this.mapControls && this.mapControls.enabled !== false) {
        const moved = (this.mapControls.update as unknown as () => unknown)();
        if (moved) this.dirty = true;
      }
      if (this.dirty || performance.now() < this.activeUntil) {
        this.renderer.render(this.scene, this.orthoCamera);
        this.dirty = false;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRenderLoop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }
}
