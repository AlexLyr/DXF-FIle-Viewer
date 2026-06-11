import { Color } from "three";
import type { DrawingRenderer } from "./types";
import { DxfRenderAdapter } from "./dxfRenderAdapter";
import { COMPARE_BASE_PALETTE } from "../colors";

export function createPrimaryRenderer(host: HTMLElement): DrawingRenderer {
  return new DxfRenderAdapter(host);
}

export function createCompareRenderer(host: HTMLElement): DrawingRenderer {
  const renderer = new DxfRenderAdapter(host);
  renderer.SetColorPalette(COMPARE_BASE_PALETTE);
  renderer.SetColorCorrection(false);
  renderer.SetBlackWhiteInversion(false);
  renderer.SetClearColor(new Color(0x000000), 0);
  return renderer;
}
