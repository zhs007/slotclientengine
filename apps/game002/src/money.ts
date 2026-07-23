export const SERVER_USD_AMOUNT_SCALE = 100;

export function createServerCurrencyAmountFormatter(options: {
  readonly currency: string;
  readonly locale: string;
}): (amount: number) => string {
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (amount: number): string => {
    if (!Number.isFinite(amount)) {
      throw new Error("amount must be finite.");
    }
    return formatter.format(amount / SERVER_USD_AMOUNT_SCALE);
  };
}

export function formatServerUsdAmount(amount: number): string {
  return createServerCurrencyAmountFormatter({
    currency: "USD",
    locale: "en-US",
  })(amount);
}
