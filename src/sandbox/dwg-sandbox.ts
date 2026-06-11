import { Dwg_File_Type, DwgCodePage, LibreDwg } from "@mlightcad/libredwg-web";

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

// DWG version number at which text became Unicode (R2007 / AC1021). Files at or
// above this emit UTF-8 from the DXF writer; older files emit code-page bytes.
const UNICODE_DWG_VERSION = 27;

// Picks a TextDecoder label for the DXF bytes the writer produced. Modern files
// are UTF-8; legacy files carry text in the drawing's ANSI code page (e.g.
// windows-1251 for Russian), which is what causes mojibake when read as UTF-8.
function pickDxfEncoding(versionNumber: number | undefined, codepageName: string | undefined): string {
  if (versionNumber !== undefined && versionNumber >= UNICODE_DWG_VERSION) return "utf-8";
  const match = /(\d{3,4})$/.exec(codepageName ?? "");
  if (match) return `windows-${match[1]}`;
  return "windows-1252";
}

let libredwgPromise: Promise<LibreDwgInstance> | null = null;

// libredwg's DXF writer streams "utf-8: BAD_CONTINUATION_BYTE" warnings to
// stderr (one console call per offending byte) on legacy code-page drawings
// (R2000/R2004). They are non-fatal, can number in the thousands, and each one
// triggers the host error panel's capture machinery — drowning real messages
// and pinning the CPU. Drop only those lines; everything else passes through.
function installEncodingWarningFilter(): void {
  const noise = /BAD_CONTINUATION_BYTE|utf-8:/i;
  const levels = ["error", "warn", "log"] as const;
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      if (typeof args[0] === "string" && noise.test(args[0])) return;
      original(...args);
    };
  }
}
installEncodingWarningFilter();

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

interface DwgReadInfo {
  header: DwgHeaderSnapshot;
  encoding: string;
  versionDescription?: string;
}

function readDwgInfo(lib: LibreDwgInstance, buffer: ArrayBuffer): DwgReadInfo {
  const fallback: DwgReadInfo = { header: {}, encoding: "utf-8" };
  const readData = (lib as unknown as {
    dwg_read_data?: (fileContent: ArrayBuffer, fileType: number) => number | undefined;
  }).dwg_read_data;
  const freeData = (lib as unknown as { dwg_free?: (data: number) => void }).dwg_free;
  if (typeof readData !== "function" || typeof freeData !== "function") return fallback;

  const dataPtr = readData.call(lib, buffer, Dwg_File_Type.DWG);
  if (typeof dataPtr !== "number") return fallback;

  try {
    const INSUNITS = getHeaderFieldNumber(lib, dataPtr, "INSUNITS");
    const MEASUREMENT = getHeaderFieldNumber(lib, dataPtr, "MEASUREMENT");
    const header: DwgHeaderSnapshot = {};
    if (INSUNITS !== undefined) header.INSUNITS = INSUNITS;
    if (MEASUREMENT !== undefined) header.MEASUREMENT = MEASUREMENT;

    const versionGetter = (lib as unknown as {
      dwg_get_version_type?: (data: number) => { version?: number; description?: string } | undefined;
    }).dwg_get_version_type;
    const codepageGetter = (lib as unknown as {
      dwg_get_codepage?: (data: number) => number | undefined;
    }).dwg_get_codepage;
    const versionType = typeof versionGetter === "function" ? versionGetter.call(lib, dataPtr) : undefined;
    const codepage = typeof codepageGetter === "function" ? codepageGetter.call(lib, dataPtr) : undefined;
    const codepageName = typeof codepage === "number" ? (DwgCodePage as Record<number, string>)[codepage] : undefined;

    return {
      header,
      encoding: pickDxfEncoding(versionType?.version, codepageName),
      versionDescription: versionType?.description,
    };
  } finally {
    freeData.call(lib, dataPtr);
  }
}

async function handleConvert(request: ConvertRequest): Promise<void> {
  // Captured before the (potentially crashing) DXF write so we can still tell the
  // user which DWG version failed even when the writer traps.
  let versionDescription: string | undefined;
  try {
    const lib = await getLibredwg();
    const { header, encoding, versionDescription: detectedVersion } = readDwgInfo(lib, request.buffer);
    versionDescription = detectedVersion;
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
    postToParent({ type: "result", id: request.id, dxf: out, header, encoding }, [out.buffer]);
  } catch (error) {
    // A WASM trap (e.g. "memory access out of bounds" thrown by the DXF writer
    // on some DWG versions) can leave the module instance unusable. Drop it so
    // the next conversion reinitializes a clean instance instead of failing too.
    libredwgPromise = null;
    const message = error instanceof Error ? error.message : String(error);
    postToParent({ type: "error", id: request.id, error: message, version: versionDescription });
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  if (!isConvertRequest(event.data)) return;
  void handleConvert(event.data);
});

postToParent({ type: "ready" });
