import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";

/**
 * Compatibility shim for packages importing `three/addons/postprocessing/FXAAPass.js`.
 * three@0.161 ships FXAAShader but not FXAAPass class.
 */
export class FXAAPass extends ShaderPass {
  constructor() {
    super(FXAAShader);
  }

  setSize(width: number, height: number): void {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    this.material.uniforms.resolution.value.set(1 / safeW, 1 / safeH);
  }
}
