declare module "three" {
  export class Color {
    constructor(color?: number | string);
    getHex(): number;
    set(color: number): this;
  }

  export class Vector2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
  }

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    project(camera: unknown): this;
    unproject(camera: unknown): this;
  }

  export class Scene {}
  export class WebGLRenderer {}
  export class OrthographicCamera {}
}

declare namespace THREE {
  type Color = import("three").Color;
  type Vector2 = import("three").Vector2;
  type Vector3 = import("three").Vector3;
  type Scene = import("three").Scene;
  type WebGLRenderer = import("three").WebGLRenderer;
  type OrthographicCamera = import("three").OrthographicCamera;
}
