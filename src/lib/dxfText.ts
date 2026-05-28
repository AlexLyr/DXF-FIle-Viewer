export function normalizeDxfText(text: string): string {
  return text
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/\\P/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
