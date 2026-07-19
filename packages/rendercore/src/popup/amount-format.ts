import type { PopupAmountFormat } from "./types.js";

export function formatPopupAmount(
  amountRaw: number,
  format: PopupAmountFormat,
): string {
  if (!Number.isSafeInteger(amountRaw) || amountRaw < 0) {
    throw new Error("popup amount raw 必须是 non-negative safe integer。");
  }
  const whole = Math.floor(amountRaw / format.rawScale);
  const remainder = amountRaw % format.rawScale;
  const factor = 10 ** format.fractionDigits;
  const fraction = Math.floor((remainder * factor) / format.rawScale);
  let integer = String(whole);
  if (format.useGrouping) {
    integer = integer.replace(/\B(?=(\d{3})+(?!\d))/gu, format.groupSeparator);
  }
  const decimals =
    format.fractionDigits > 0
      ? `${format.decimalSeparator}${String(fraction).padStart(format.fractionDigits, "0")}`
      : "";
  return `${format.prefix}${integer}${decimals}${format.suffix}`;
}

export function requiredPopupAmountCharacters(
  format: PopupAmountFormat,
): readonly string[] {
  return Object.freeze([
    ...new Set(
      `0123456789${format.prefix}${format.suffix}${format.fractionDigits > 0 ? format.decimalSeparator : ""}${format.useGrouping ? format.groupSeparator : ""}`,
    ),
  ]);
}
