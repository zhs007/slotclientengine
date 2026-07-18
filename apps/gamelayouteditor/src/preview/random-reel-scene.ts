import type { SymbolPackageResource } from "@slotclientengine/rendercore/symbol";

const UINT32_RANGE = 0x1_0000_0000;

export interface RandomUint32Source {
  nextUint32(): number;
}

export interface RandomReelSceneSnapshot {
  readonly reelSetName: string;
  readonly columns: number;
  readonly rows: number;
  readonly stopYs: readonly number[];
  readonly codes: readonly (readonly number[])[];
  readonly symbols: readonly (readonly string[])[];
}

export interface ReelSetPreviewInfo {
  readonly name: string;
  readonly reelCount: number;
  readonly compatible: boolean;
  readonly reason?: string;
}

type PackageGameConfig = SymbolPackageResource["gameConfig"];

export function createWebCryptoRandomUint32Source(
  cryptoApi: Pick<Crypto, "getRandomValues"> | undefined = globalThis.crypto,
): RandomUint32Source {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error(
      "Web Crypto getRandomValues 不可用，随机 symbol 预览已停止。",
    );
  }
  const values = new Uint32Array(1);
  return Object.freeze({
    nextUint32(): number {
      cryptoApi.getRandomValues(values);
      return values[0];
    },
  });
}

export function sampleUnbiasedInteger(
  maxExclusive: number,
  source: RandomUint32Source,
): number {
  if (
    !Number.isSafeInteger(maxExclusive) ||
    maxExclusive <= 0 ||
    maxExclusive > UINT32_RANGE
  ) {
    throw new Error(
      `随机整数上界必须是 1..${UINT32_RANGE} 的安全整数，实际为 ${maxExclusive}。`,
    );
  }
  const acceptedRange = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
  for (;;) {
    const value = source.nextUint32();
    if (!Number.isSafeInteger(value) || value < 0 || value >= UINT32_RANGE) {
      throw new Error(
        `random source 必须返回 uint32，实际为 ${String(value)}。`,
      );
    }
    if (value < acceptedRange) return value % maxExclusive;
  }
}

export function inspectReelSets(options: {
  readonly gameConfig: PackageGameConfig;
  readonly displaySymbols: readonly string[];
  readonly columns: number;
}): readonly ReelSetPreviewInfo[] {
  const columns = positiveInteger(options.columns, "layout columns");
  const names = options.gameConfig.getReelNames();
  if (names.length === 0) {
    throw new Error("symbols package game config 没有 reel set。");
  }
  const displaySymbols = new Set(options.displaySymbols);
  return freezeArray(
    names.map((name) => {
      const reels = options.gameConfig.getReels(name);
      const reelCount = reels.getReelCount();
      if (!Number.isSafeInteger(reelCount) || reelCount <= 0) {
        return freezeInfo({
          name,
          reelCount,
          compatible: false,
          reason: `reel count ${reelCount} 不是正安全整数`,
        });
      }
      const validationError = validateReelSetDisplayability({
        gameConfig: options.gameConfig,
        reelSetName: name,
        displaySymbols,
      });
      if (validationError) {
        return freezeInfo({
          name,
          reelCount,
          compatible: false,
          reason: validationError,
        });
      }
      if (reelCount !== columns) {
        return freezeInfo({
          name,
          reelCount,
          compatible: false,
          reason: `需要 ${columns} reels，实际为 ${reelCount}`,
        });
      }
      return freezeInfo({ name, reelCount, compatible: true });
    }),
  );
}

export function requireCompatibleReelSets(
  infos: readonly ReelSetPreviewInfo[],
  columns: number,
): readonly ReelSetPreviewInfo[] {
  const compatible = infos.filter((info) => info.compatible);
  if (compatible.length > 0) return freezeArray(compatible);
  throw new Error(
    `layout columns=${columns} 没有兼容 reel set：${infos
      .map(
        (info) =>
          `${info.name} (${info.reelCount} reels${info.reason ? `；${info.reason}` : ""})`,
      )
      .join("；")}。`,
  );
}

export function sampleRandomReelScene(options: {
  readonly gameConfig: PackageGameConfig;
  readonly displaySymbols: readonly string[];
  readonly reelSetName: string;
  readonly columns: number;
  readonly rows: number;
  readonly randomSource: RandomUint32Source;
}): RandomReelSceneSnapshot {
  const columns = positiveInteger(options.columns, "layout columns");
  const rows = positiveInteger(options.rows, "layout rows");
  const reels = options.gameConfig.getReels(options.reelSetName);
  if (reels.getReelCount() !== columns) {
    throw new Error(
      `reel set "${options.reelSetName}" 的 reel count ${reels.getReelCount()} 与 layout columns ${columns} 不匹配。`,
    );
  }
  const validationError = validateReelSetDisplayability({
    gameConfig: options.gameConfig,
    reelSetName: options.reelSetName,
    displaySymbols: new Set(options.displaySymbols),
  });
  if (validationError) throw new Error(validationError);

  const stopYs: number[] = [];
  const codes: Array<readonly number[]> = [];
  const symbols: Array<readonly string[]> = [];
  for (let x = 0; x < columns; x += 1) {
    const length = validReelLength(reels.getLength(x), options.reelSetName, x);
    const stopY = sampleUnbiasedInteger(length, options.randomSource);
    const codeColumn: number[] = [];
    const symbolColumn: string[] = [];
    for (let y = 0; y < rows; y += 1) {
      const code = reels.get(x, stopY + y);
      const entry = options.gameConfig.getPaytableEntry(code)!;
      codeColumn.push(code);
      symbolColumn.push(entry.symbol);
    }
    stopYs.push(stopY);
    codes.push(freezeArray(codeColumn));
    symbols.push(freezeArray(symbolColumn));
  }
  return Object.freeze({
    reelSetName: options.reelSetName,
    columns,
    rows,
    stopYs: freezeArray(stopYs),
    codes: freezeArray(codes),
    symbols: freezeArray(symbols),
  });
}

function validateReelSetDisplayability(options: {
  readonly gameConfig: PackageGameConfig;
  readonly reelSetName: string;
  readonly displaySymbols: ReadonlySet<string>;
}): string | undefined {
  const reels = options.gameConfig.getReels(options.reelSetName);
  const reelCount = reels.getReelCount();
  if (!Number.isSafeInteger(reelCount) || reelCount <= 0) {
    return `reel set "${options.reelSetName}" 的 reel count ${reelCount} 不是正安全整数`;
  }
  for (let x = 0; x < reelCount; x += 1) {
    let length: number;
    try {
      length = validReelLength(reels.getLength(x), options.reelSetName, x);
    } catch (error) {
      return formatError(error);
    }
    for (let y = 0; y < length; y += 1) {
      const code = reels.get(x, y);
      const entry = options.gameConfig.getPaytableEntry(code);
      if (!entry) {
        return `reel set "${options.reelSetName}" column ${x} position ${y} 的 code ${code} 不在 paytable/symbolCodes`;
      }
      if (
        entry.code !== code ||
        options.gameConfig.getSymbolCode(entry.symbol) !== code
      ) {
        return `reel set "${options.reelSetName}" column ${x} position ${y} 的 code ${code} 与 symbol "${entry.symbol}" 映射不一致`;
      }
      if (!options.displaySymbols.has(entry.symbol)) {
        return `reel set "${options.reelSetName}" column ${x} position ${y} 的 code ${code} / symbol "${entry.symbol}" 不属于 package display set`;
      }
    }
  }
  return undefined;
}

function validReelLength(value: number, name: string, x: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > UINT32_RANGE) {
    throw new Error(
      `reel set "${name}" column ${x} length ${value} 必须是 1..${UINT32_RANGE} 的安全整数`,
    );
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是正安全整数，实际为 ${value}。`);
  }
  return value;
}

function freezeArray<T>(values: T[]): readonly T[] {
  return Object.freeze(values);
}

function freezeInfo(info: ReelSetPreviewInfo): ReelSetPreviewInfo {
  return Object.freeze(info);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
