import { SymbolAnimationError } from "./errors.js";
import { createStaticSymbolAni } from "./ani.js";
import type { SymbolAni, SymbolAnimationResolver } from "./types.js";

export function createDefaultSymbolAnimationResolver(): SymbolAnimationResolver {
  return (context) => {
    if (context.resolvedState === "normal") {
      return createStaticSymbolAni(context);
    }

    throw new SymbolAnimationError(
      `No default symbol animation is registered for resolved state "${context.resolvedState}".`,
    );
  };
}

export function assertResolvedSymbolAni(
  value: unknown,
  stateId: string,
): asserts value is SymbolAni {
  const candidate = value as Partial<SymbolAni> | null;
  if (
    !candidate ||
    candidate.stateId === undefined ||
    typeof candidate.reset !== "function" ||
    typeof candidate.update !== "function"
  ) {
    throw new SymbolAnimationError(
      `Animation resolver did not return a SymbolAni for "${stateId}".`,
    );
  }
}
