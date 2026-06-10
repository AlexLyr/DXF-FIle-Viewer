const SANDBOX_PATH = "src/sandbox/dwg-sandbox.html";
const REQUEST_TIMEOUT_MS = 60_000;

export type DwgHeaderSnapshot = {
  INSUNITS?: number;
  MEASUREMENT?: number;
};

type SandboxReply =
  | { type: "ready" }
  | { type: "result"; id: string; dxf: Uint8Array; header?: DwgHeaderSnapshot }
  | { type: "error"; id: string; error: string };

interface PendingRequest {
  resolve: (result: { dxf: Uint8Array; header: DwgHeaderSnapshot }) => void;
  reject: (err: Error) => void;
  timer: number;
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
        pending.resolve({ dxf: data.dxf, header: data.header ?? {} });
      } else {
        pending.reject(new Error(data.error || "DWG conversion failed."));
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
  const result = await new Promise<{ dxf: Uint8Array; header: DwgHeaderSnapshot }>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error("DWG conversion timed out."));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(id, { resolve, reject, timer });
    sandbox.postMessage(
      { type: "convert", id, buffer: transferable },
      "*",
      [transferable],
    );
  });
  return {
    dxf: new TextDecoder().decode(result.dxf),
    header: result.header,
  };
}

export function disposeDwgSandbox(): void {
  for (const pending of pendingRequests.values()) {
    window.clearTimeout(pending.timer);
    pending.reject(new Error("DWG sandbox was disposed."));
  }
  pendingRequests.clear();
  if (frameElement?.parentNode) {
    frameElement.parentNode.removeChild(frameElement);
  }
  frameElement = null;
  readyPromise = null;
}
