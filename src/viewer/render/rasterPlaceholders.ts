import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Object3D,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";

export type OriginOffset = { x: number; y: number; z: number };

// Color of the placeholder frame/label. Raster underlays in DWG reference
// external files (the pixels are never stored in the drawing), so we cannot
// draw the image itself — only mark where it belongs and which file it needs.
const FRAME_COLOR = 0xff8a3d;

type ParsedImage = {
  layer: string;
  insertion: { x: number; y: number };
  u: { x: number; y: number };
  v: { x: number; y: number };
  nU: number;
  nV: number;
  defHandle: string;
};

function normalizeHandle(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/^0x/i, "").toLowerCase();
}

function baseName(filePath: string): string {
  const cleaned = filePath.trim();
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned;
}

// Minimal group-code scan of the converted DXF. dxf-render skips IMAGE entities
// entirely, so we recover them here straight from the text the sandbox produced.
function parseImagesAndDefs(dxfText: string): { images: ParsedImage[]; defNames: Map<string, string> } {
  const lines = dxfText.split(/\r\n|\r|\n/);
  const images: ParsedImage[] = [];
  const defNames = new Map<string, string>();

  let section: string | null = null;
  let pendingSection = false;
  let type: string | null = null;
  // Accumulators for the entity/object currently being read.
  let img: ParsedImage | null = null;
  let defHandle = "";
  let defName = "";

  const flush = (): void => {
    if (type === "IMAGE" && img && section === "ENTITIES") images.push(img);
    if (type === "IMAGEDEF" && defHandle) defNames.set(normalizeHandle(defHandle), defName);
    img = null;
    defHandle = "";
    defName = "";
  };

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1];
    const v = value.trim();

    if (code === "0") {
      flush();
      if (v === "SECTION") {
        pendingSection = true;
        type = null;
      } else if (v === "ENDSEC") {
        section = null;
        type = null;
      } else if (v === "EOF") {
        break;
      } else {
        type = v;
        if (v === "IMAGE") {
          img = { layer: "0", insertion: { x: 0, y: 0 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, nU: 0, nV: 0, defHandle: "" };
        }
      }
      continue;
    }

    if (pendingSection && code === "2") {
      section = v;
      pendingSection = false;
      continue;
    }

    if (type === "IMAGE" && img) {
      switch (code) {
        case "8": img.layer = v || "0"; break;
        case "10": img.insertion.x = Number(v); break;
        case "20": img.insertion.y = Number(v); break;
        case "11": img.u.x = Number(v); break;
        case "21": img.u.y = Number(v); break;
        case "12": img.v.x = Number(v); break;
        case "22": img.v.y = Number(v); break;
        case "13": if (!img.nU) img.nU = Number(v); break;
        case "23": if (!img.nV) img.nV = Number(v); break;
        case "340": if (!img.defHandle) img.defHandle = v; break;
        default: break;
      }
    } else if (type === "IMAGEDEF") {
      if (code === "5" && !defHandle) defHandle = v;
      else if (code === "1" && !defName) defName = v;
    }
  }
  flush();

  return { images, defNames };
}

function makeLabelSprite(text: string, color: number): { sprite: Sprite; aspect: number } {
  const padding = 12;
  const fontSize = 64;
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  const font = `bold ${fontSize}px sans-serif`;
  let textWidth = text.length * fontSize * 0.6;
  if (measureCtx) {
    measureCtx.font = font;
    textWidth = measureCtx.measureText(text).width;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = fontSize + padding * 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = `#${new Color(color).getHexString()}`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 4;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new Sprite(material);
  return { sprite, aspect: canvas.width / canvas.height };
}

/**
 * Builds frame + filename placeholders for every IMAGE entity in the DXF.
 * Each returned object carries userData.layer so the existing layer-visibility
 * machinery can toggle it like any other entity.
 */
// Collapse identical placements (same IMAGEDEF + same position/size) into one
// marker. A drawing often inserts the same raster twice on different layers
// (e.g. "0" and "Растр_100тыс"); without this the two frames overlap exactly,
// so hiding one layer appears to do nothing. The kept marker binds to the most
// specific layer (anything other than "0") so the obvious raster layer toggles it.
function dedupeImages(images: ParsedImage[]): ParsedImage[] {
  const byKey = new Map<string, ParsedImage>();
  for (const image of images) {
    const key = [
      normalizeHandle(image.defHandle),
      image.insertion.x.toFixed(3),
      image.insertion.y.toFixed(3),
      image.nU,
      image.nV,
    ].join("|");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, image);
    } else if (existing.layer === "0" && image.layer !== "0") {
      byKey.set(key, image);
    }
  }
  return [...byKey.values()];
}

export function buildRasterPlaceholders(dxfText: string, originOffset: OriginOffset): Object3D[] {
  const { images, defNames } = parseImagesAndDefs(dxfText);
  if (images.length === 0) return [];

  const result: Object3D[] = [];
  for (const image of dedupeImages(images)) {
    if (!(image.nU > 0) || !(image.nV > 0)) continue;

    const ox = originOffset.x;
    const oy = originOffset.y;
    const p0 = new Vector3(image.insertion.x - ox, image.insertion.y - oy, 0);
    const uW = new Vector3(image.u.x * image.nU, image.u.y * image.nU, 0);
    const vW = new Vector3(image.v.x * image.nV, image.v.y * image.nV, 0);
    const p1 = p0.clone().add(uW);
    const p2 = p0.clone().add(uW).add(vW);
    const p3 = p0.clone().add(vW);

    const group = new Group();
    group.userData = { layer: image.layer, rasterPlaceholder: true };

    const frameGeom = new BufferGeometry().setFromPoints([p0, p1, p2, p3, p0]);
    const frameMat = new LineBasicMaterial({ color: FRAME_COLOR });
    group.add(new Line(frameGeom, frameMat));

    const crossGeom = new BufferGeometry().setFromPoints([p0, p2, p1, p3]);
    group.add(new LineSegments(crossGeom, frameMat));

    const fileName = defNames.get(normalizeHandle(image.defHandle));
    const label = fileName ? baseName(fileName) : "(нет растрового файла)";
    const { sprite, aspect } = makeLabelSprite(label, FRAME_COLOR);
    const center = p0.clone().add(p2).multiplyScalar(0.5);
    const frameW = uW.length();
    const frameH = vW.length();
    let labelH = Math.min(frameW, frameH) * 0.12;
    let labelW = labelH * aspect;
    if (labelW > frameW * 0.95) {
      const scale = (frameW * 0.95) / labelW;
      labelW *= scale;
      labelH *= scale;
    }
    sprite.position.set(center.x, center.y, 1);
    sprite.scale.set(labelW, labelH, 1);
    sprite.userData = { layer: image.layer, rasterPlaceholder: true };
    group.add(sprite);

    result.push(group);
  }

  return result;
}
