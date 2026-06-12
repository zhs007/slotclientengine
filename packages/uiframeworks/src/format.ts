import { SlotUiConfigError } from "./errors.js";

export interface MoneyFormatOptions {
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
}

export type MoneyFormatter = (amount: number) => string;

export function assertFiniteMoneyAmount(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new SlotUiConfigError(`${label} must be a finite number.`);
  }
  return value;
}

export function createMoneyFormatter(
  options: MoneyFormatOptions = {},
): MoneyFormatter {
  if (options.formatMoney) {
    return (amount: number) => {
      assertFiniteMoneyAmount(amount, "amount");
      const formatted = options.formatMoney?.(amount);
      if (typeof formatted !== "string" || formatted.length === 0) {
        throw new SlotUiConfigError("formatMoney must return a non-empty string.");
      }
      return formatted;
    };
  }

  const formatter =
    options.currency === undefined
      ? new Intl.NumberFormat(options.locale ?? "en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      : new Intl.NumberFormat(options.locale ?? "en-US", {
          style: "currency",
          currency: options.currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });

  return (amount: number) => formatter.format(assertFiniteMoneyAmount(amount, "amount"));
}
