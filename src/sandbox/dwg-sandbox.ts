import { Dwg_File_Type, LibreDwg } from "@mlightcad/libredwg-web";

type LibreDwgInstance = Awaited<ReturnType<typeof LibreDwg.create>>;

interface ConvertRequest {
  type: "convert";
  id: string;
  buffer: ArrayBuffer;
}

interface DwgHeaderSnapshot {
  INSUNITS?: number;
  MEASUREMENT?: number;
}

let libredwgPromise: Promise<LibreDwgInstance> | null = null;

function getLibredwg(): Promise<LibreDwgInstance> {
  libredwgPromise ??= LibreDwg.create();
  return libredwgPromise;
}

function isConvertRequest(value: unknown): value is ConvertRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; id?: unknown; buffer?: unknown };
  return (
    v.type === "convert" &&
    typeof v.id === "string" &&
    v.buffer instanceof ArrayBuffer
  );
}

function postToParent(payload: unknown, transfer: Transferable[] = []): void {
  window.parent.postMessage(payload, "*", transfer);
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getHeaderFieldNumber(
  lib: LibreDwgInstance,
  dataPtr: number,
  field: "INSUNITS" | "MEASUREMENT",
): number | undefined {
  const getter = (lib as unknown as {
    dwg_dynapi_header_value?: (data: number, fieldName: string) => { success?: boolean; data?: unknown };
  }).dwg_dynapi_header_value;
  if (typeof getter !== "function") return undefined;
  const value = getter.call(lib, dataPtr, field);
  if (!value?.success) return undefined;
  return toFiniteNumber(value.data);
}

function readDwgHeaderSnapshot(lib: LibreDwgInstance, buffer: ArrayBuffer): DwgHeaderSnapshot {
  const readData = (lib as unknown as {
    dwg_read_data?: (fileContent: ArrayBuffer, fileType: number) => number | undefined;
  }).dwg_read_data;
  const freeData = (lib as unknown as { dwg_free?: (data: number) => void }).dwg_free;
  if (typeof readData !== "function" || typeof freeData !== "function") return {};

  const dataPtr = readData.call(lib, buffer, Dwg_File_Type.DWG);
  if (typeof dataPtr !== "number") return {};

  try {
    const INSUNITS = getHeaderFieldNumber(lib, dataPtr, "INSUNITS");
    const MEASUREMENT = getHeaderFieldNumber(lib, dataPtr, "MEASUREMENT");
    const snapshot: DwgHeaderSnapshot = {};
    if (INSUNITS !== undefined) snapshot.INSUNITS = INSUNITS;
    if (MEASUREMENT !== undefined) snapshot.MEASUREMENT = MEASUREMENT;
    return snapshot;
  } finally {
    freeData.call(lib, dataPtr);
  }
}

async function handleConvert(request: ConvertRequest): Promise<void> {
  try {
    const lib = await getLibredwg();
    const header = readDwgHeaderSnapshot(lib, request.buffer);
    const dwgWriter = (lib as unknown as {
      dwg_write_dxf?: (fileContent: Uint8Array) => Uint8Array | null;
    }).dwg_write_dxf;
    if (typeof dwgWriter !== "function") {
      throw new Error("DXF writer is unavailable in current libredwg-web build.");
    }
    const dxfBytes = (lib as unknown as {
      dwg_write_dxf: (fileContent: Uint8Array) => Uint8Array | null;
    }).dwg_write_dxf(new Uint8Array(request.buffer));
    if (!dxfBytes || dxfBytes.length === 0) {
      throw new Error("DWG conversion returned empty DXF payload.");
    }
    // Copy out of WASM heap into a fresh, transferable buffer.
    const out = new Uint8Array(dxfBytes.length);
    out.set(dxfBytes);
    postToParent({ type: "result", id: request.id, dxf: out, header }, [out.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postToParent({ type: "error", id: request.id, error: message });
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  if (!isConvertRequest(event.data)) return;
  void handleConvert(event.data);
});

postToParent({ type: "ready" });
