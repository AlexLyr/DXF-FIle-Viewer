export type SnapKind = "endpoint" | "midpoint" | "center";

export type SnapPoint = {
  x: number;
  y: number;
  kind: SnapKind;
};

type CellKey = string;

export type SnapGrid = {
  step: number;
  cells: Map<CellKey, SnapPoint[]>;
};

function cellKey(ix: number, iy: number): CellKey {
  return `${ix}:${iy}`;
}

function pushPoint(out: SnapPoint[], x: unknown, y: unknown, kind: SnapKind): void {
  if (typeof x !== "number" || typeof y !== "number") return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  out.push({ x, y, kind });
}

export function buildSnapPoints(parsedDxf: unknown): SnapPoint[] {
  const entities = (parsedDxf as { entities?: unknown[] } | null)?.entities;
  if (!Array.isArray(entities)) return [];
  const points: SnapPoint[] = [];
  for (const raw of entities) {
    const e = raw as Record<string, unknown>;
    const type = typeof e.type === "string" ? e.type : "";
    if (type === "LINE") {
      const s = e.start as { x?: number; y?: number } | undefined;
      const t = e.end as { x?: number; y?: number } | undefined;
      pushPoint(points, s?.x, s?.y, "endpoint");
      pushPoint(points, t?.x, t?.y, "endpoint");
      if (typeof s?.x === "number" && typeof s?.y === "number" &&
          typeof t?.x === "number" && typeof t?.y === "number") {
        pushPoint(points, (s.x + t.x) / 2, (s.y + t.y) / 2, "midpoint");
      }
      continue;
    }
    if (type === "CIRCLE" || type === "ARC") {
      const c = e.center as { x?: number; y?: number } | undefined;
      pushPoint(points, c?.x, c?.y, "center");
      continue;
    }
    if (type === "LWPOLYLINE" || type === "POLYLINE") {
      const verts = e.vertices as Array<{ x?: number; y?: number }> | undefined;
      if (!Array.isArray(verts) || verts.length === 0) continue;
      for (let i = 0; i < verts.length; i += 1) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        pushPoint(points, a?.x, a?.y, "endpoint");
        if (i < verts.length - 1) {
          if (typeof a?.x === "number" && typeof a?.y === "number" &&
              typeof b?.x === "number" && typeof b?.y === "number") {
            pushPoint(points, (a.x + b.x) / 2, (a.y + b.y) / 2, "midpoint");
          }
        }
      }
    }
  }
  return points;
}

export function buildSnapGrid(points: SnapPoint[], step: number): SnapGrid {
  const cells = new Map<CellKey, SnapPoint[]>();
  for (const p of points) {
    const ix = Math.floor(p.x / step);
    const iy = Math.floor(p.y / step);
    const key = cellKey(ix, iy);
    const list = cells.get(key);
    if (list) list.push(p);
    else cells.set(key, [p]);
  }
  return { step, cells };
}

const SNAP_PRIORITY: Record<SnapKind, number> = {
  endpoint: 0,
  midpoint: 1,
  center: 2,
};

export function findNearestSnap(
  grid: SnapGrid | null,
  x: number,
  y: number,
  radius: number,
): SnapPoint | null {
  if (!grid) return null;
  const r2 = radius * radius;
  const minX = Math.floor((x - radius) / grid.step);
  const maxX = Math.floor((x + radius) / grid.step);
  const minY = Math.floor((y - radius) / grid.step);
  const maxY = Math.floor((y + radius) / grid.step);
  let best: SnapPoint | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let ix = minX; ix <= maxX; ix += 1) {
    for (let iy = minY; iy <= maxY; iy += 1) {
      const list = grid.cells.get(cellKey(ix, iy));
      if (!list) continue;
      for (const p of list) {
        const dx = p.x - x;
        const dy = p.y - y;
        const dist = dx * dx + dy * dy;
        if (dist > r2) continue;
        if (!best || dist < bestDist || (dist === bestDist && SNAP_PRIORITY[p.kind] < SNAP_PRIORITY[best.kind])) {
          best = p;
          bestDist = dist;
        }
      }
    }
  }
  return best;
}
