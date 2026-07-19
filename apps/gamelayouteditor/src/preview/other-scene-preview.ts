import type { SymbolPackageResource } from "@slotclientengine/rendercore/symbol";
import type { RandomReelSceneSnapshot } from "./random-reel-scene.js";
import type { RandomUint32Source } from "./random-reel-scene.js";
import { sampleNumberWeightTable } from "./number-weight-table.js";

export interface SymbolOtherScenePreviewBinding {
  readonly symbol: string;
  readonly target:
    | { readonly kind: "image-string-node"; readonly name: string }
    | { readonly kind: "legacy-presentation-value" };
  readonly source:
    | { readonly kind: "number-weight-table"; readonly tableName: string }
    | { readonly kind: "fixed-number"; readonly value: number };
}

export interface OtherScenePreviewAssignment {
  readonly x: number;
  readonly y: number;
  readonly symbol: string;
  readonly target: SymbolOtherScenePreviewBinding["target"];
  readonly value: number;
}

export interface OtherScenePreviewSnapshot {
  readonly matrix: readonly (readonly number[])[];
  readonly assignments: readonly OtherScenePreviewAssignment[];
}

export function createOtherScenePreview(options: {
  readonly scene: RandomReelSceneSnapshot;
  readonly bindings: readonly SymbolOtherScenePreviewBinding[];
  readonly gameConfig: SymbolPackageResource["gameConfig"];
  readonly randomSource: RandomUint32Source;
  readonly validateTarget?: (
    symbol: string,
    target: SymbolOtherScenePreviewBinding["target"],
  ) => void;
}): OtherScenePreviewSnapshot {
  const bindingBySymbol = new Map<string, SymbolOtherScenePreviewBinding>();
  const availableTables = new Set(
    typeof options.gameConfig.getNumberWeightTableNames === "function"
      ? options.gameConfig.getNumberWeightTableNames()
      : [],
  );
  for (const binding of options.bindings) {
    if (typeof binding.symbol !== "string" || binding.symbol.length === 0) {
      throw new Error("otherScene binding symbol 必须是非空 string。");
    }
    if (bindingBySymbol.has(binding.symbol)) {
      throw new Error(
        `symbol "${binding.symbol}" 只能配置一个 otherScene mapping。`,
      );
    }
    options.validateTarget?.(binding.symbol, binding.target);
    if (binding.source.kind === "fixed-number") {
      if (
        !Number.isSafeInteger(binding.source.value) ||
        binding.source.value <= 0
      ) {
        throw new Error(
          `symbol "${binding.symbol}" fixed number 必须是正安全整数。`,
        );
      }
    } else if (!availableTables.has(binding.source.tableName)) {
      throw new Error(
        `number weight table "${binding.source.tableName}" 不存在。`,
      );
    }
    bindingBySymbol.set(binding.symbol, binding);
  }

  const assignments: OtherScenePreviewAssignment[] = [];
  const matrix = options.scene.symbols.map((column, x) =>
    Object.freeze(
      column.map((symbol, y) => {
        const binding = bindingBySymbol.get(symbol);
        if (!binding) return 0;
        const value =
          binding.source.kind === "fixed-number"
            ? binding.source.value
            : sampleNumberWeightTable(
                options.gameConfig.getNumberWeightTable(
                  binding.source.tableName,
                ),
                options.randomSource,
              );
        assignments.push(
          Object.freeze({ x, y, symbol, target: binding.target, value }),
        );
        return value;
      }),
    ),
  );
  if (
    matrix.length !== options.scene.columns ||
    matrix.some((column) => column.length !== options.scene.rows)
  ) {
    throw new Error("otherScene matrix 与 sampled scene 尺寸不一致。");
  }
  return Object.freeze({
    matrix: Object.freeze(matrix),
    assignments: Object.freeze(assignments),
  });
}
