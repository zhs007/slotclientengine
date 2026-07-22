export function createLeoMoneyFormatter(options: {
  readonly currency?: string;
  readonly locale?: string;
}): (amount: number) => string {
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency?.trim() || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (amount: number) => formatter.format(amount);
}
