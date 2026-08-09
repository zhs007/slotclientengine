import {
  createWeightedGridCellPresentationValueResolver,
  type GridCellSymbolPresentationValueResolver,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore";

export function createGame002v2DefaultSceneValueResolver(
  symbols: SymbolPackageResource,
  randomUint32: () => number = secureRandomUint32,
): GridCellSymbolPresentationValueResolver {
  const coinCode = symbols.gameConfig.getSymbolCode("CN");
  if (coinCode === undefined)
    throw new Error('game002v2 requires symbol "CN".');
  const table = symbols.gameConfig.getNumberWeightTable("bgcoinweight");
  return createWeightedGridCellPresentationValueResolver({
    randomUint32,
    resolveTable: ({ code }) => (code === coinCode ? table : null),
  });
}

function secureRandomUint32(): number {
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.getRandomValues !== "function")
    throw new Error("game002v2 default scene values require Web Crypto.");
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  if (value === undefined)
    throw new Error("game002v2 default scene random returned no value.");
  return value;
}
