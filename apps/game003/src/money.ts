export const SERVER_AMOUNT_SCALE = 100;

export function formatServerAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new Error("amount must be finite.");
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / SERVER_AMOUNT_SCALE);
}
