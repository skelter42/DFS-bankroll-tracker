export function parseMoney(v: unknown): number {
  if (v === undefined || v === null) return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

export function extractMax(entryName: unknown): number | null {
  const m = String(entryName ?? '').match(/\((\d+)\/(\d+)\)/);
  return m ? parseInt(m[2], 10) : null;
}
