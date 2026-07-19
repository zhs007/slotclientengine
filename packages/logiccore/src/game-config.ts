import { LogicParseError } from "./errors";
import { LogicReelsModel } from "./reels";
import {
  GameConfigPaytableEntry,
  GameConfigNumberWeightEntry,
  LogicGameConfig,
  LogicReels,
  ParsedGameConfigData,
  ReelSpinStartYsOptions,
  ReelStopYOptions,
  SceneMatrix,
} from "./types";
import {
  assertArray,
  assertInteger,
  assertNonEmptyString,
  assertRecord,
  assertSafeNonNegativeInteger,
  cloneAndFreeze,
  freezeArray,
  hasOwn,
} from "./validation";

export function createGameConfig(config: unknown): LogicGameConfig {
  return new LogicGameConfigModel(parseGameConfig(config));
}

export class LogicGameConfigModel implements LogicGameConfig {
  readonly #data: ParsedGameConfigData;
  readonly #reelsByName: Readonly<Record<string, LogicReelsModel>>;

  constructor(data: ParsedGameConfigData) {
    this.#data = data;
    this.#reelsByName = Object.freeze(
      Object.fromEntries(
        Object.entries(data.reels).map(([name, reels]) => [
          name,
          new LogicReelsModel(name, reels),
        ]),
      ),
    );
    Object.freeze(this);
  }

  getRawConfig(): unknown {
    return this.#data.rawConfig;
  }

  getPaytableEntry(code: number): GameConfigPaytableEntry | undefined {
    if (!Number.isInteger(code)) {
      return undefined;
    }

    return this.#data.paytable[String(code)];
  }

  getSymbolCode(symbol: string): number | undefined {
    if (typeof symbol !== "string") {
      return undefined;
    }

    return this.#data.symbolCodes[symbol];
  }

  getReelNames(): readonly string[] {
    return this.#data.reelNames;
  }

  getReels(name: string): LogicReels {
    if (!hasOwn(this.#reelsByName, name)) {
      throw new RangeError(`reels "${name}" does not exist.`);
    }

    return this.#reelsByName[name];
  }

  getNumberWeightTableNames(): readonly string[] {
    return this.#data.numberWeightTableNames;
  }

  getNumberWeightTable(name: string): readonly GameConfigNumberWeightEntry[] {
    if (!hasOwn(this.#data.numberWeightTables, name)) {
      throw new RangeError(`number weight table "${name}" does not exist.`);
    }
    return this.#data.numberWeightTables[name];
  }

  getStopYCoordinates(options: ReelStopYOptions): readonly number[] {
    const optionsRecord = assertRecord(options, "reelStopYOptions");
    const reelsName = assertNonEmptyString(
      optionsRecord.reelsName,
      "reelStopYOptions.reelsName",
    );
    const sceneName = assertNonEmptyString(
      optionsRecord.sceneName,
      "reelStopYOptions.sceneName",
    );
    const scene = parseSceneMatrix(
      optionsRecord.scene,
      `reelStopYOptions.scene "${sceneName}"`,
    );
    const reels = this.getReels(reelsName);

    if (scene.length !== reels.getReelCount()) {
      throw new LogicParseError(
        `Scene "${sceneName}" width ${scene.length} does not match reels "${reelsName}" reel count ${reels.getReelCount()}.`,
      );
    }

    return freezeArray(
      scene.map((visibleSymbols, x) => {
        if (visibleSymbols.length === 0) {
          throw new LogicParseError(
            `Scene "${sceneName}" column ${x} must contain visible symbols.`,
          );
        }

        return reels.getStopY(x, visibleSymbols);
      }),
    );
  }

  getSpinStartYCoordinates(options: ReelSpinStartYsOptions): readonly number[] {
    const optionsRecord = assertRecord(options, "reelSpinStartYsOptions");
    const reelsName = assertNonEmptyString(
      optionsRecord.reelsName,
      "reelSpinStartYsOptions.reelsName",
    );
    const finalYs = assertArray(
      optionsRecord.finalYs,
      "reelSpinStartYsOptions.finalYs",
    );
    const reels = this.getReels(reelsName);

    if (finalYs.length !== reels.getReelCount()) {
      throw new LogicParseError(
        `finalYs length ${finalYs.length} does not match reels "${reelsName}" reel count ${reels.getReelCount()}.`,
      );
    }

    return freezeArray(
      finalYs.map((finalY, x) =>
        reels.calculateSpinStartY({
          x,
          finalY: assertFiniteNumberForSpinStart(
            finalY,
            `reelSpinStartYsOptions.finalYs[${x}]`,
          ),
          durationMs: options.durationMs,
          speedSymbolsPerSecond: options.speedSymbolsPerSecond,
          direction: options.direction,
        }),
      ),
    );
  }
}

function parseGameConfig(config: unknown): ParsedGameConfigData {
  const configRecord = assertRecord(config, "gameConfig");
  const paytable = parsePaytable(configRecord.paytable);
  const symbolCodes = parseSymbolCodes(configRecord.symbolCodes, paytable);
  const reels = parseReels(configRecord.reels, paytable);
  const numberWeightTables = parseNumberWeightTables(
    configRecord.numberWeightTables,
  );

  return Object.freeze({
    rawConfig: cloneAndFreeze(config),
    paytable,
    symbolCodes,
    reels,
    reelNames: freezeArray(Object.keys(reels)),
    numberWeightTables,
    numberWeightTableNames: freezeArray(Object.keys(numberWeightTables)),
  });
}

const NUMBER_WEIGHT_TABLE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TOTAL_WEIGHT = 0x1_0000_0000;

function parseNumberWeightTables(
  value: unknown,
): Readonly<Record<string, readonly GameConfigNumberWeightEntry[]>> {
  if (value === undefined) {
    return Object.freeze({});
  }
  const record = assertRecord(value, "gameConfig.numberWeightTables");
  const tables: Record<string, readonly GameConfigNumberWeightEntry[]> = {};

  for (const [name, rawEntries] of Object.entries(record)) {
    if (!NUMBER_WEIGHT_TABLE_NAME_PATTERN.test(name)) {
      throw new LogicParseError(
        `gameConfig.numberWeightTables key "${name}" must be lowercase ASCII kebab-case.`,
      );
    }
    const path = `gameConfig.numberWeightTables["${name}"]`;
    const entries = assertArray(rawEntries, path);
    if (entries.length === 0) {
      throw new LogicParseError(`${path} must contain at least one entry.`);
    }

    const seenValues = new Set<number>();
    let totalWeight = 0;
    tables[name] = freezeArray(
      entries.map((rawEntry, index) => {
        const entryPath = `${path}[${index}]`;
        const entry = assertRecord(rawEntry, entryPath);
        const keys = Object.keys(entry);
        if (
          keys.length !== 2 ||
          !hasOwn(entry, "value") ||
          !hasOwn(entry, "weight")
        ) {
          throw new LogicParseError(
            `${entryPath} must contain exactly value and weight.`,
          );
        }
        const parsedValue = assertSafeNonNegativeInteger(
          entry.value,
          `${entryPath}.value`,
        );
        const weight = assertSafeNonNegativeInteger(
          entry.weight,
          `${entryPath}.weight`,
        );
        if (parsedValue === 0) {
          throw new LogicParseError(`${entryPath}.value must be positive.`);
        }
        if (weight === 0) {
          throw new LogicParseError(`${entryPath}.weight must be positive.`);
        }
        if (seenValues.has(parsedValue)) {
          throw new LogicParseError(
            `${path} contains duplicate value ${parsedValue}.`,
          );
        }
        seenValues.add(parsedValue);
        totalWeight += weight;
        if (
          !Number.isSafeInteger(totalWeight) ||
          totalWeight > MAX_TOTAL_WEIGHT
        ) {
          throw new LogicParseError(
            `${path} total weight must be between 1 and ${MAX_TOTAL_WEIGHT}.`,
          );
        }
        return Object.freeze({ value: parsedValue, weight });
      }),
    );
  }

  return Object.freeze(tables);
}

function parsePaytable(
  value: unknown,
): Readonly<Record<string, GameConfigPaytableEntry>> {
  const paytableRecord = assertRecord(value, "gameConfig.paytable");
  const entries: Record<string, GameConfigPaytableEntry> = {};
  const symbols = new Set<string>();

  for (const [key, rawEntry] of Object.entries(paytableRecord)) {
    const codeFromKey = parseCodeKey(key, `gameConfig.paytable key "${key}"`);
    const entryPath = `gameConfig.paytable["${key}"]`;
    const entryRecord = assertRecord(rawEntry, entryPath);
    const code = assertSafeNonNegativeInteger(
      entryRecord.code,
      `${entryPath}.code`,
    );

    if (code !== codeFromKey) {
      throw new LogicParseError(
        `${entryPath}.code ${code} must match paytable key ${key}.`,
      );
    }

    const symbol = assertNonEmptyString(
      entryRecord.symbol,
      `${entryPath}.symbol`,
    );
    if (symbols.has(symbol)) {
      throw new LogicParseError(
        `gameConfig.paytable contains duplicate symbol "${symbol}".`,
      );
    }
    symbols.add(symbol);

    entries[key] = Object.freeze({
      code,
      symbol,
      pays: parsePays(entryRecord.pays, `${entryPath}.pays`),
    });
  }

  if (Object.keys(entries).length === 0) {
    throw new LogicParseError(
      "gameConfig.paytable must contain at least one entry.",
    );
  }

  return Object.freeze(entries);
}

function parseSymbolCodes(
  value: unknown,
  paytable: Readonly<Record<string, GameConfigPaytableEntry>>,
): Readonly<Record<string, number>> {
  const symbolCodesRecord = assertRecord(value, "gameConfig.symbolCodes");
  const symbolCodes: Record<string, number> = {};

  for (const [symbol, rawCode] of Object.entries(symbolCodesRecord)) {
    if (symbol.length === 0) {
      throw new LogicParseError(
        "gameConfig.symbolCodes cannot contain an empty symbol key.",
      );
    }

    const code = assertSafeNonNegativeInteger(
      rawCode,
      `gameConfig.symbolCodes["${symbol}"]`,
    );
    const paytableEntry = paytable[String(code)];
    if (paytableEntry === undefined) {
      throw new LogicParseError(
        `gameConfig.symbolCodes["${symbol}"] references unknown paytable code ${code}.`,
      );
    }

    if (paytableEntry.symbol !== symbol) {
      throw new LogicParseError(
        `gameConfig.symbolCodes["${symbol}"] must match paytable symbol "${paytableEntry.symbol}" for code ${code}.`,
      );
    }

    symbolCodes[symbol] = code;
  }

  for (const entry of Object.values(paytable)) {
    if (symbolCodes[entry.symbol] !== entry.code) {
      throw new LogicParseError(
        `gameConfig.symbolCodes must contain symbol "${entry.symbol}" for paytable code ${entry.code}.`,
      );
    }
  }

  return Object.freeze(symbolCodes);
}

function parseReels(
  value: unknown,
  paytable: Readonly<Record<string, GameConfigPaytableEntry>>,
): Readonly<Record<string, readonly (readonly number[])[]>> {
  const reelsRecord = assertRecord(value, "gameConfig.reels");
  const reelsByName: Record<string, readonly (readonly number[])[]> = {};

  for (const [name, rawReels] of Object.entries(reelsRecord)) {
    if (name.length === 0) {
      throw new LogicParseError(
        "gameConfig.reels cannot contain an empty reels name.",
      );
    }

    const reelSetPath = `gameConfig.reels["${name}"]`;
    const reelSet = assertArray(rawReels, reelSetPath);
    if (reelSet.length === 0) {
      throw new LogicParseError(
        `${reelSetPath} must contain at least one reel.`,
      );
    }

    reelsByName[name] = freezeArray(
      reelSet.map((rawReel, x) =>
        parseReel(rawReel, `${reelSetPath}[${x}]`, paytable),
      ),
    );
  }

  if (Object.keys(reelsByName).length === 0) {
    throw new LogicParseError(
      "gameConfig.reels must contain at least one reels set.",
    );
  }

  return Object.freeze(reelsByName);
}

function parseReel(
  value: unknown,
  path: string,
  paytable: Readonly<Record<string, GameConfigPaytableEntry>>,
): readonly number[] {
  const symbols = assertArray(value, path).map((rawSymbol, y) => {
    const symbolCode = assertSafeNonNegativeInteger(rawSymbol, `${path}[${y}]`);

    if (paytable[String(symbolCode)] === undefined) {
      throw new LogicParseError(
        `${path}[${y}] references unknown paytable code ${symbolCode}.`,
      );
    }

    return symbolCode;
  });

  if (symbols.length === 0) {
    throw new LogicParseError(`${path} must contain at least one symbol.`);
  }

  return freezeArray(symbols);
}

function parsePays(value: unknown, path: string): readonly number[] {
  const pays = assertArray(value, path).map((pay, index) =>
    assertInteger(pay, `${path}[${index}]`),
  );

  if (pays.length === 0) {
    throw new LogicParseError(`${path} must contain at least one pay value.`);
  }

  return freezeArray(pays);
}

function parseCodeKey(key: string, path: string): number {
  if (!/^(0|[1-9]\d*)$/.test(key)) {
    throw new LogicParseError(
      `${path} must be a stringified non-negative safe integer.`,
    );
  }

  const code = Number(key);
  if (!Number.isSafeInteger(code)) {
    throw new LogicParseError(
      `${path} must be a stringified non-negative safe integer.`,
    );
  }

  return code;
}

function parseSceneMatrix(value: unknown, path: string): SceneMatrix {
  return freezeArray(
    assertArray(value, path).map((column, x) =>
      freezeArray(
        assertArray(column, `${path}[${x}]`).map((symbol, y) =>
          assertInteger(symbol, `${path}[${x}][${y}]`),
        ),
      ),
    ),
  );
}

function assertFiniteNumberForSpinStart(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LogicParseError(`${path} must be a finite number.`);
  }

  return value;
}
