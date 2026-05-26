import type { DxfViewer } from "dxf-viewer";
import { getParsedDxf, type DxfHeader } from "./types";

/* DXF $INSUNITS codes — see Autodesk DXF Reference. */
const INSUNITS_LABELS: Record<number, string> = {
  0: "u",
  1: "in",
  2: "ft",
  3: "mi",
  4: "mm",
  5: "cm",
  6: "m",
  7: "km",
  8: "µin",
  9: "mil",
  10: "yd",
  11: "Å",
  12: "nm",
  13: "µm",
  14: "dm",
  15: "dam",
  16: "hm",
  17: "Gm",
  18: "AU",
  19: "ly",
  20: "pc",
  21: "ft",
};

const INSUNITS_FULL: Record<number, string> = {
  0: "unitless",
  1: "inches",
  2: "feet",
  3: "miles",
  4: "millimeters",
  5: "centimeters",
  6: "meters",
  7: "kilometers",
  8: "microinches",
  9: "mils",
  10: "yards",
  11: "angstroms",
  12: "nanometers",
  13: "microns",
  14: "decimeters",
  15: "decameters",
  16: "hectometers",
  17: "gigameters",
  18: "astronomical units",
  19: "light years",
  20: "parsecs",
  21: "US survey feet",
};

function readHeaderValue(header: DxfHeader | undefined, key: string): unknown {
  if (!header) return undefined;
  const direct = header[key];
  if (direct !== undefined) return direct;
  const lower = header[key.toLowerCase()];
  if (lower !== undefined) return lower;
  const upper = header[key.toUpperCase()];
  if (upper !== undefined) return upper;
  return undefined;
}

function coerceCode(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const inner = obj.value ?? obj[0] ?? obj["70"];
    if (inner !== undefined && inner !== raw) return coerceCode(inner);
  }
  return null;
}

export function getDxfUnitsCode(instance: DxfViewer | null): number {
  if (!instance) return 0;
  const parsed = getParsedDxf(instance);
  if (!parsed) return 0;
  const header = parsed.header ?? parsed.headers;
  const raw = readHeaderValue(header, "$INSUNITS") ?? readHeaderValue(header, "INSUNITS");
  const code = coerceCode(raw);
  return code !== null && code in INSUNITS_LABELS ? code : 0;
}

export function getUnitLabel(instance: DxfViewer | null): string {
  const code = getDxfUnitsCode(instance);
  return INSUNITS_LABELS[code] ?? "u";
}

export function getUnitFullName(instance: DxfViewer | null): string {
  const code = getDxfUnitsCode(instance);
  return INSUNITS_FULL[code] ?? "unitless";
}
