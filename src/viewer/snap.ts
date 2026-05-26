import type { DxfViewer } from "dxf-viewer";
import { state } from "./state";
import { getParsedDxf } from "./types";
import { buildSnapGrid, buildSnapPoints } from "./spatialIndex";

export function buildSnapIndex(instance: DxfViewer): void {
  const parsed = getParsedDxf(instance);
  const points = buildSnapPoints(parsed);
  state.snapGrid = points.length ? buildSnapGrid(points, 50) : null;
}
