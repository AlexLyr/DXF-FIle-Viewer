import { normalizeDxfText } from "../lib/dxfText";
import { state } from "./state";
import { dom } from "./dom";
import { getWorldFromPointer, worldToScreen } from "./coords";
import { getParsedDxf } from "./types";

export function hideEntityTooltip(): void {
  state.hoverTooltipAnchor = null;
  dom.entityTooltip.classList.add("hidden");
}

export function showEntityTooltip(event: MouseEvent): void {
  if (!state.viewer) return;
  const hit = queryHoverInfo(event);
  if (!hit) {
    hideEntityTooltip();
    return;
  }
  state.hoverTooltipAnchor = hit;
  refreshEntityTooltipPosition();
}

export function refreshEntityTooltipPosition(): void {
  const anchor = state.hoverTooltipAnchor;
  if (!anchor) return;
  const screen = worldToScreen(anchor.x, anchor.y);
  if (!screen) {
    hideEntityTooltip();
    return;
  }
  dom.entityTooltip.textContent = anchor.text;
  dom.entityTooltip.style.left = `${screen.x}px`;
  dom.entityTooltip.style.top = `${screen.y}px`;
  dom.entityTooltip.classList.remove("hidden");
}

function queryHoverInfo(event: MouseEvent): { x: number; y: number; text: string } | null {
  if (!state.viewer) return null;
  const world = getWorldFromPointer(event);
  if (!world) return null;

  const parsed = getParsedDxf(state.viewer);
  const entities = parsed?.entities;
  if (!Array.isArray(entities) || entities.length === 0) return null;

  let best: { dist2: number; x: number; y: number; text: string } | null = null;

  for (const raw of entities) {
    const e = raw as Record<string, unknown>;
    const type = String(e.type ?? "");
    if (type !== "TEXT" && type !== "MTEXT") continue;

    const pos = (e.position ?? e.startPoint ?? e.anchorPoint ?? e.insertPoint) as
      | { x?: number; y?: number }
      | undefined;
    if (typeof pos?.x !== "number" || typeof pos?.y !== "number") continue;

    const dx = pos.x - world.x;
    const dy = pos.y - world.y;
    const dist2 = dx * dx + dy * dy;

    if (!best || dist2 < best.dist2) {
      const layer = typeof e.layer === "string" ? e.layer : "?";
      const text = normalizeDxfText(String(e.text ?? ""));
      best = { dist2, x: pos.x, y: pos.y, text: `${type} · ${layer} · "${text.slice(0, 40)}"` };
    }
  }

  if (!best) return null;
  if (best.dist2 > 900) return null;
  return { x: best.x, y: best.y, text: best.text };
}
