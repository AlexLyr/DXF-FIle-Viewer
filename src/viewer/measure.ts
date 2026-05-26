import { state } from "./state";
import { dom } from "./dom";
import { worldToScreen } from "./coords";
import { getUnitFullName, getUnitLabel } from "./units";

export function toggleMeasureMode(force?: boolean): void {
  const next = force ?? !state.measureActive;
  state.measureActive = next;
  dom.measureToggle.classList.toggle("active", next);
  dom.measureOverlay.classList.toggle("hidden", !next);
  dom.measureOverlay.classList.toggle("active", next);
  dom.canvasHost.style.cursor = next ? "crosshair" : "default";
  if (next && state.viewer) {
    state.viewer.Render();
  }
  if (!next) {
    clearMeasure();
  }
}

export function clearMeasure(): void {
  state.measureStart = null;
  state.measureEnd = null;
  state.measureComplete = false;
  dom.measureOverlay.innerHTML = "";
}

export function handleMeasureClick(worldX: number, worldY: number): void {
  if (state.measureComplete) {
    clearMeasure();
  }

  if (!state.measureStart) {
    state.measureStart = { x: worldX, y: worldY };
  } else {
    state.measureEnd = { x: worldX, y: worldY };
    state.measureComplete = true;
  }
  renderMeasureOverlay();
}

export function handleMeasureMove(worldX: number, worldY: number): void {
  if (!state.measureStart || state.measureComplete) return;
  state.measureEnd = { x: worldX, y: worldY };
  renderMeasureOverlay();
}

export function renderMeasureOverlay(): void {
  dom.measureOverlay.innerHTML = "";

  if (!state.measureStart) return;

  const a = worldToScreen(state.measureStart.x, state.measureStart.y);
  if (!a) return;

  const startMarker = document.createElement("div");
  startMarker.className = "measure-point measure-point-start";
  startMarker.style.left = `${a.x}px`;
  startMarker.style.top = `${a.y}px`;
  dom.measureOverlay.append(startMarker);

  if (!state.measureEnd) return;

  const b = worldToScreen(state.measureEnd.x, state.measureEnd.y);
  if (!b) return;

  const endMarker = document.createElement("div");
  endMarker.className = "measure-point measure-point-end";
  endMarker.style.left = `${b.x}px`;
  endMarker.style.top = `${b.y}px`;
  dom.measureOverlay.append(endMarker);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx) * (180 / Math.PI);

  const line = document.createElement("div");
  line.className = "measure-line";
  line.style.left = `${a.x}px`;
  line.style.top = `${a.y}px`;
  line.style.width = `${len}px`;
  line.style.transform = `rotate(${ang}deg)`;
  dom.measureOverlay.append(line);

  const wdx = state.measureEnd.x - state.measureStart.x;
  const wdy = state.measureEnd.y - state.measureStart.y;
  const wlen = Math.hypot(wdx, wdy);
  const wang = Math.atan2(wdy, wdx) * (180 / Math.PI);
  const unit = getUnitLabel(state.viewer);
  const unitFull = getUnitFullName(state.viewer);

  const label = document.createElement("div");
  label.className = "measure-label";
  label.style.left = `${(a.x + b.x) / 2}px`;
  label.style.top = `${(a.y + b.y) / 2}px`;
  label.title =
    `Distance: ${wlen.toFixed(2)} ${unitFull}\n` +
    `ΔX (horizontal): ${formatSigned(wdx)} ${unit}\n` +
    `ΔY (vertical): ${formatSigned(wdy)} ${unit}\n` +
    `Angle from +X axis: ${wang.toFixed(1)}°`;

  const lengthRow = document.createElement("div");
  lengthRow.className = "measure-label-length";

  const lengthValue = document.createElement("span");
  lengthValue.className = "measure-label-value";
  lengthValue.textContent = wlen.toFixed(2);

  const lengthUnit = document.createElement("span");
  lengthUnit.className = "measure-label-unit";
  lengthUnit.textContent = unit;

  lengthRow.append(lengthValue, lengthUnit);

  const detailsRow = document.createElement("div");
  detailsRow.className = "measure-label-details";
  detailsRow.textContent = `ΔX ${formatSigned(wdx)} ${unit}  ·  ΔY ${formatSigned(wdy)} ${unit}  ·  ∠ ${wang.toFixed(1)}°`;

  label.append(lengthRow, detailsRow);
  dom.measureOverlay.append(label);
}

function formatSigned(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

export function hideSnapMarker(): void {
  state.activeSnap = null;
  dom.snapMarker.classList.add("hidden");
}
