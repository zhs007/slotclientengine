import { SymbolAssetError } from "../symbol/errors.js";
import type {
  SymbolValueTextFormatter,
  SymbolValueTextFormatterMap,
} from "../symbol/types.js";
import type {
  SymbolValuePresentationResource,
  SymbolValuePresentationResourceMap,
} from "./types.js";
import { assertSymbolValueDisplayResource } from "./value-display.js";

export function formatSymbolValueDisplayText(options: {
  readonly value: number;
  readonly tierIndex?: number;
  readonly resource: SymbolValuePresentationResource;
  readonly formatter?: SymbolValueTextFormatter;
}): string {
  const { formatter, resource, value } = options;
  if (formatter !== undefined && resource.text.type !== "image-string") {
    throw new SymbolAssetError(
      `Symbol "${resource.symbol}" value text formatter requires image-string valuePresentation text.`,
    );
  }
  let text: unknown;
  try {
    text = formatter ? formatter(value) : String(value);
  } catch (error) {
    throw new SymbolAssetError(
      `Symbol "${resource.symbol}" value text formatter failed for ${value}: ${formatError(error)}.`,
    );
  }
  if (typeof text !== "string" || text.length === 0) {
    throw new SymbolAssetError(
      `Symbol "${resource.symbol}" value text formatter for ${value} must return a non-empty string.`,
    );
  }
  assertSymbolValueDisplayResource({
    value,
    ...(options.tierIndex === undefined
      ? {}
      : { tierIndex: options.tierIndex }),
    resource,
    text,
  });
  return text;
}

export function normalizeSymbolValueTextFormatters(options: {
  readonly resources: SymbolValuePresentationResourceMap;
  readonly displaySymbols: readonly string[];
  readonly value: SymbolValueTextFormatterMap | undefined;
}): Readonly<Partial<Record<string, SymbolValueTextFormatter>>> {
  const { resources, value } = options;
  if (
    value !== undefined &&
    (typeof value !== "object" || value === null || Array.isArray(value))
  ) {
    throw new SymbolAssetError(
      "Symbol value text formatters must be an object.",
    );
  }
  const displaySymbols = new Set(options.displaySymbols);
  const normalized: Partial<Record<string, SymbolValueTextFormatter>> = {};
  for (const [symbol, formatter] of Object.entries(value ?? {})) {
    if (!displaySymbols.has(symbol)) {
      throw new SymbolAssetError(
        `Symbol value text formatters reference unknown display symbol "${symbol}".`,
      );
    }
    const resource = resources[symbol];
    if (!resource) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" has no valuePresentation for value text formatting.`,
      );
    }
    if (resource.text.type !== "image-string") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" value text formatter requires image-string valuePresentation text.`,
      );
    }
    if (typeof formatter !== "function") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" value text formatter must be a function.`,
      );
    }
    normalized[symbol] = formatter;
  }
  for (const symbol of displaySymbols) {
    const resource = resources[symbol];
    if (!resource || resource.text.type !== "image-string") continue;
    const formatter = normalized[symbol];
    for (const defaultValue of resource.defaultValues) {
      formatSymbolValueDisplayText({
        value: defaultValue,
        resource,
        ...(formatter ? { formatter } : {}),
      });
    }
  }
  return Object.freeze(normalized);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
