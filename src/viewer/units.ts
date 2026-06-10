import type { DrawingRenderer } from "./render/types";
import { getParsedDxf, type DxfHeader } from "./types";
import { state } from "./state";

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

function readMeasurementCode(instance: DrawingRenderer | null): number | null {
  const override = coerceCode(state.dwgHeaderOverride?.MEASUREMENT);
  if (override !== null) return override;
  if (!instance) return null;
  const parsed = getParsedDxf(instance);
  if (!parsed) return null;
  const header = parsed.header ?? parsed.headers;
  const raw = readHeaderValue(header, "$MEASUREMENT") ?? readHeaderValue(header, "MEASUREMENT");
  return coerceCode(raw);
}

function fallbackUnitsFromMeasurement(measurementCode: number | null): number | null {
  if (measurementCode === 1) return 4;
  if (measurementCode === 0) return 1;
  return null;
}

export function getDxfUnitsCode(instance: DrawingRenderer | null): number {
  const overrideUnits = coerceCode(state.dwgHeaderOverride?.INSUNITS);
  if (overrideUnits !== null && overrideUnits in INSUNITS_LABELS && overrideUnits !== 0) {
    return overrideUnits;
  }

  if (!instance) return 0;
  const parsed = getParsedDxf(instance);
  if (!parsed) return 0;
  const header = parsed.header ?? parsed.headers;
  const raw = readHeaderValue(header, "$INSUNITS") ?? readHeaderValue(header, "INSUNITS");
  const parsedUnits = coerceCode(raw);
  if (parsedUnits !== null && parsedUnits in INSUNITS_LABELS && parsedUnits !== 0) {
    return parsedUnits;
  }

  const fallback = fallbackUnitsFromMeasurement(readMeasurementCode(instance));
  return fallback ?? 0;
}

export function getUnitLabel(instance: DrawingRenderer | null): string {
  const code = getDxfUnitsCode(instance);
  return INSUNITS_LABELS[code] ?? "u";
}

export function getUnitFullName(instance: DrawingRenderer | null): string {
  const code = getDxfUnitsCode(instance);
  return INSUNITS_FULL[code] ?? "unitless";
}
