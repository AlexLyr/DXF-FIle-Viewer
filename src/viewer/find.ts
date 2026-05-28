import { normalizeDxfText } from "../lib/dxfText";
import { state } from "./state";
import { dom } from "./dom";
import { getParsedDxf } from "./types";
import { focusOnWorld } from "./coords";

export function toggleFindBar(open: boolean): void {
  dom.findBar.classList.toggle("hidden", !open);
  if (open) {
    dom.findInput.focus();
    dom.findInput.select();
    runFindQuery(dom.findInput.value);
  } else {
    clearFindResults();
  }
}

export function runFindQuery(query: string): void {
  if (!state.viewer) return;
  const parsed = getParsedDxf(state.viewer);
  const entities = parsed?.entities;
  const needle = query.trim().toLowerCase();

  state.textHits = [];
  state.textHitIndex = -1;

  if (!needle || !Array.isArray(entities)) {
    dom.findCount.textContent = "0/0";
    return;
  }

  for (const raw of entities) {
    const e = raw as Record<string, unknown>;
    const type = String(e.type ?? "");
    if (type !== "TEXT" && type !== "MTEXT") continue;

    const text = normalizeDxfText(String(e.text ?? ""));
    if (!text.toLowerCase().includes(needle)) continue;

    const pos = (e.position ?? e.startPoint ?? e.anchorPoint ?? e.insertPoint) as
      | { x?: number; y?: number }
      | undefined;
    if (typeof pos?.x !== "number" || typeof pos?.y !== "number") continue;

    state.textHits.push({ text, x: pos.x, y: pos.y });
  }

  dom.findCount.textContent = state.textHits.length ? `1/${state.textHits.length}` : "0/0";
  if (state.textHits.length) gotoFindHit(0);
}

export function gotoFindHit(nextIndex: number): void {
  if (!state.textHits.length || !state.viewer) {
    dom.findCount.textContent = "0/0";
    return;
  }
  if (nextIndex < 0) nextIndex = state.textHits.length - 1;
  if (nextIndex >= state.textHits.length) nextIndex = 0;
  state.textHitIndex = nextIndex;
  dom.findCount.textContent = `${state.textHitIndex + 1}/${state.textHits.length}`;
  const hit = state.textHits[state.textHitIndex];
  focusOnWorld(hit.x, hit.y);
}

export function clearFindResults(): void {
  state.textHits = [];
  state.textHitIndex = -1;
  dom.findCount.textContent = "0/0";
}
