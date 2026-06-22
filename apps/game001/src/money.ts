export const SERVER_USD_AMOUNT_SCALE = 100;

export function formatServerUsdAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new Error("amount must be finite.");
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / SERVER_USD_AMOUNT_SCALE);
}
