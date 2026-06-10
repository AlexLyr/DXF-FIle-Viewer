const SANDBOX_PATH = "src/sandbox/dwg-sandbox.html";
const REQUEST_TIMEOUT_MS = 15_000;

export type DwgHeaderSnapshot = {
  INSUNITS?: number;
  MEASUREMENT?: number;
};

type SandboxReply =
  | { type: "ready" }
  | { type: "result"; id: string; dxf: Uint8Array; header?: DwgHeaderSnapshot; encoding?: string }
  | { type: "error"; id: string; error: string; version?: string };

// Surfaces a DWG-specific failure to the UI. `dwgVersion` is the human-readable
// format name (e.g. "AutoCAD Release 2007") when the sandbox managed to read the
// drawing's header before conversion failed, which lets us show a far more
// actionable message than a generic "could not convert".
export class DwgConversionError extends Error {
  readonly dwgVersion?: string;

  constructor(message: string, dwgVersion?: string) {
    super(message);
    this.name = "DwgConversionError";
    this.dwgVersion = dwgVersion;
  }
}

interface PendingRequest {
  resolve: (result: { dxf: Uint8Array; header: DwgHeaderSnapshot; encoding: string }) => void;
  reject: (err: Error) => void;
  timer: number;
}

// Legacy DWG (pre-R2007) stores text in the drawing's ANSI code page, so the
// converted DXF bytes are not UTF-8. The sandbox reports the right label; decode
// non-fatally and fall back to UTF-8 if the label is unknown to the platform.
function decodeDxf(bytes: Uint8Array, encoding: string | undefined): string {
  const label = encoding && encoding.trim() ? encoding : "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

let frameElement: HTMLIFrameElement | null = null;
let readyPromise: Promise<WindowProxy> | null = null;
const pendingRequests = new Map<string, PendingRequest>();

function isSandboxReply(value: unknown): value is SandboxReply {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown };
  return v.type === "ready" || v.type === "result" || v.type === "error";
}

function ensureSandboxReady(): Promise<WindowProxy> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<WindowProxy>((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "DWG sandbox";
    frame.tabIndex = -1;
    Object.assign(frame.style, {
      position: "absolute",
      width: "0",
      height: "0",
      border: "0",
      visibility: "hidden",
      pointerEvents: "none",
    });

    const dispatchSandboxMessage = (data: SandboxReply): void => {
      if (data.type === "ready") {
        const win = frame.contentWindow;
        if (!win) {
          reject(new Error("DWG sandbox iframe has no window."));
          return;
        }
        frameElement = frame;
        resolve(win);
        return;
      }
      const pending = pendingRequests.get(data.id);
      if (!pending) return;
      pendingRequests.delete(data.id);
      window.clearTimeout(pending.timer);
      if (data.type === "result") {
        pending.resolve({ dxf: data.dxf, header: data.header ?? {}, encoding: data.encoding ?? "utf-8" });
      } else {
        pending.reject(new DwgConversionError(data.error || "DWG conversion failed.", data.version));
      }
    };

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.contentWindow) return;
      if (!isSandboxReply(event.data)) return;
      dispatchSandboxMessage(event.data);
    };

    const onError = (): void => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Failed to load DWG sandbox iframe."));
    };

    window.addEventListener("message", onMessage);
    frame.addEventListener("error", onError);
    frame.src = chrome.runtime.getURL(SANDBOX_PATH);
    document.body.appendChild(frame);
  });
  return readyPromise;
}

export async function dwgToDxfString(
  buffer: ArrayBuffer,
): Promise<{ dxf: string; header: DwgHeaderSnapshot }> {
  const sandbox = await ensureSandboxReady();
  const id = crypto.randomUUID();
  // Copy: source ArrayBuffer may still be needed by the caller after this call.
  const transferable = buffer.slice(0);
  const result = await new Promise<{ dxf: Uint8Array; header: DwgHeaderSnapshot; encoding: string }>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      // Stop a runaway conversion: a few DWG versions hit a buggy path in the
      // WASM DXF writer that loops forever and pins a CPU core. The sandbox
      // iframe is our isolation boundary, so destroying it terminates that work
      // (it is recreated lazily on the next conversion). Fail any in-flight
      // requests rather than leaving them hanging.
      teardownSandboxFrame();
      for (const pending of pendingRequests.values()) {
        window.clearTimeout(pending.timer);
        pending.reject(new Error("DWG conversion timed out."));
      }
      pendingRequests.clear();
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(id, { resolve, reject, timer });
    sandbox.postMessage(
      { type: "convert", id, buffer: transferable },
      "*",
      [transferable],
    );
  });
  return {
    dxf: decodeDxf(result.dxf, result.encoding),
    header: result.header,
  };
}

// Removes the sandbox iframe and resets the ready handshake without touching
// pending requests; callers decide how to settle those. The next conversion
// rebuilds the iframe (and reloads the WASM) on demand.
function teardownSandboxFrame(): void {
  if (frameElement?.parentNode) {
    frameElement.parentNode.removeChild(frameElement);
  }
  frameElement = null;
  readyPromise = null;
}

export function disposeDwgSandbox(): void {
  for (const pending of pendingRequests.values()) {
    window.clearTimeout(pending.timer);
    pending.reject(new Error("DWG sandbox was disposed."));
  }
  pendingRequests.clear();
  teardownSandboxFrame();
}
