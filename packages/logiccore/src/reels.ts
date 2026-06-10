import { LogicParseError } from './errors';
import { LogicReels, ReelSpinDirection, ReelSpinStartYOptions } from './types';
import { assertArray, assertFiniteNumber, assertInteger, freezeArray } from './validation';

export class LogicReelsModel implements LogicReels {
  readonly #name: string;
  readonly #reels: readonly (readonly number[])[];

  constructor(name: string, reels: readonly (readonly number[])[]) {
    this.#name = name;
    this.#reels = freezeArray(reels.map((reel) => freezeArray(reel)));
    Object.freeze(this);
  }

  getName(): string {
    return this.#name;
  }

  getReelCount(): number {
    return this.#reels.length;
  }

  getLength(x: number): number {
    this.#assertReelIndex(x);

    return this.#reels[x].length;
  }

  get(x: number, y: number): number {
    this.#assertReelIndex(x);

    if (!Number.isInteger(y)) {
      throw new RangeError(`reel y ${y} must be an integer.`);
    }

    return this.#reels[x][this.normalizeY(x, y)];
  }

  normalizeY(x: number, y: number): number {
    this.#assertReelIndex(x);
    assertFiniteNumber(y, 'reel y');

    const length = this.#reels[x].length;
    return ((y % length) + length) % length;
  }

  findStopYCandidates(x: number, visibleSymbols: readonly number[]): readonly number[] {
    this.#assertReelIndex(x);
    const parsedVisibleSymbols = parseVisibleSymbols(visibleSymbols, 'visibleSymbols');
    const length = this.#reels[x].length;
    const candidates: number[] = [];

    for (let y = 0; y < length; y += 1) {
      const matches = parsedVisibleSymbols.every(
        (symbol, visibleY) => this.get(x, y + visibleY) === symbol
      );

      if (matches) {
        candidates.push(y);
      }
    }

    return freezeArray(candidates);
  }

  getStopY(x: number, visibleSymbols: readonly number[]): number {
    const candidates = this.findStopYCandidates(x, visibleSymbols);

    if (candidates.length === 0) {
      throw new LogicParseError(
        `No stop y candidate found for reels "${this.#name}", x ${x}, visibleSymbols ${JSON.stringify(
          visibleSymbols
        )}.`
      );
    }

    return candidates[0];
  }

  calculateSpinStartY(options: ReelSpinStartYOptions): number {
    this.#assertReelIndex(options.x);
    const finalY = assertFiniteNumber(options.finalY, 'spinStart.finalY');
    const durationMs = assertNonNegativeFiniteNumber(options.durationMs, 'spinStart.durationMs');
    const speedSymbolsPerSecond = assertNonNegativeFiniteNumber(
      options.speedSymbolsPerSecond,
      'spinStart.speedSymbolsPerSecond'
    );
    const direction = parseSpinDirection(options.direction);
    const travel = (speedSymbolsPerSecond * durationMs) / 1000;
    const startY = direction === 'forward' ? finalY - travel : finalY + travel;

    return this.normalizeY(options.x, startY);
  }

  #assertReelIndex(x: number): void {
    if (!Number.isInteger(x) || x < 0 || x >= this.#reels.length) {
      throw new RangeError(`reel index ${x} is out of range.`);
    }
  }
}

function parseVisibleSymbols(value: unknown, path: string): readonly number[] {
  const symbols = assertArray(value, path).map((symbol, index) =>
    assertInteger(symbol, `${path}[${index}]`)
  );

  if (symbols.length === 0) {
    throw new LogicParseError(`${path} must contain at least one symbol.`);
  }

  return freezeArray(symbols);
}

function assertNonNegativeFiniteNumber(value: unknown, path: string): number {
  const parsed = assertFiniteNumber(value, path);

  if (parsed < 0) {
    throw new LogicParseError(`${path} must be non-negative.`);
  }

  return parsed;
}

function parseSpinDirection(value: unknown): ReelSpinDirection {
  if (value === undefined) {
    return 'forward';
  }

  if (value === 'forward' || value === 'backward') {
    return value;
  }

  throw new LogicParseError('spinStart.direction must be "forward" or "backward".');
}
