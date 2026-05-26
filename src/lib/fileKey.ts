const SLICE_BYTES = 64 * 1024;

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function computeFileKey(buffer: ArrayBuffer): Promise<string> {
  const head = buffer.slice(0, Math.min(SLICE_BYTES, buffer.byteLength));
  const digest = await crypto.subtle.digest("SHA-1", head);
  const hashHex = toHex(new Uint8Array(digest));
  return `${hashHex}:${buffer.byteLength}`;
}
