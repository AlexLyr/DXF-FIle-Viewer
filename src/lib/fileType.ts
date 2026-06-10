export type CadFileType = "dxf" | "dwg" | "unknown";

function hasDxfMarker(head: Uint8Array): boolean {
  if (head.length === 0) return false;
  const text = new TextDecoder().decode(head).replace(/\0/g, "");
  return (
    /^\s*0\r?\nSECTION\b/i.test(text) ||
    /^\s*999\b/m.test(text) ||
    /\bSECTION\b/i.test(text)
  );
}

export function detectCadType(name: string, head: Uint8Array): CadFileType {
  if (head.length >= 6) {
    const signature = String.fromCharCode(head[0], head[1], head[2], head[3], head[4], head[5]);
    if (/^AC1\d{3}$/.test(signature)) {
      return "dwg";
    }
  }

  if (hasDxfMarker(head)) {
    return "dxf";
  }

  if (/\.dxf$/i.test(name)) {
    return "dxf";
  }
  if (/\.dwg$/i.test(name)) {
    return "dwg";
  }

  return "unknown";
}
