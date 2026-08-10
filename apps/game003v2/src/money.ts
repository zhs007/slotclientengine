export function formatGame003v2Amount(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error("amount must be finite.");
  return String(Math.floor(amount));
}
