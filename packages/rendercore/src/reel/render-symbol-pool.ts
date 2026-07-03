import { ReelError } from "./errors.js";
import type {
  RenderSymbolPool,
  RenderSymbolPoolOptions,
  RenderSymbolPoolStats,
} from "./types.js";
import type { RenderSymbol } from "../symbol/index.js";

interface IdleSymbolEntry {
  readonly code: number;
  readonly symbol: RenderSymbol;
  lastUsedSequence: number;
}

interface NormalizedRenderSymbolPoolOptions {
  readonly targetIdlePerCode: number;
  readonly maxIdlePerCode: number;
  readonly maxIdleTotal: number;
}

const DEFAULT_TARGET_IDLE_PER_CODE = 5;
const DEFAULT_MAX_IDLE_PER_CODE = 10;
const DEFAULT_MAX_IDLE_TOTAL = 80;

export class RenderSymbolPoolModel implements RenderSymbolPool {
  readonly #options: NormalizedRenderSymbolPoolOptions;
  readonly #idleByCode = new Map<number, IdleSymbolEntry[]>();
  #sequence = 0;
  #destroyed = false;

  constructor(options: RenderSymbolPoolOptions = {}) {
    this.#options = normalizeRenderSymbolPoolOptions(options);
  }

  acquire(
    code: number,
    create: () => RenderSymbol | null,
  ): RenderSymbol | null {
    this.assertNotDestroyed();
    assertSymbolCode(code);

    const idle = this.#idleByCode.get(code);
    const entry = idle?.pop();
    if (idle && idle.length === 0) {
      this.#idleByCode.delete(code);
    }
    if (entry) {
      return entry.symbol;
    }

    return create();
  }

  release(code: number, symbol: RenderSymbol): void {
    this.assertNotDestroyed();
    assertSymbolCode(code);
    if (symbol.code !== code) {
      throw new ReelError(
        `Cannot release symbol code ${symbol.code} into pool bucket ${code}.`,
      );
    }

    symbol.parent?.removeChild(symbol);
    symbol.resetForPoolRelease();
    const bucket = this.#idleByCode.get(code) ?? [];
    bucket.push({
      code,
      symbol,
      lastUsedSequence: ++this.#sequence,
    });
    this.#idleByCode.set(code, bucket);
    this.trimCode(code);
    this.trimTotal();
  }

  trimCode(code: number): void {
    this.assertNotDestroyed();
    assertSymbolCode(code);
    const bucket = this.#idleByCode.get(code);
    if (!bucket || bucket.length <= this.#options.maxIdlePerCode) {
      return;
    }

    this.trimBucketToSize(code, this.#options.targetIdlePerCode);
  }

  trimTotal(): void {
    this.assertNotDestroyed();
    while (this.getTotalIdle() > this.#options.maxIdleTotal) {
      const oldest = this.findOldestIdleEntry();
      if (!oldest) {
        return;
      }
      this.removeIdleEntry(oldest.code, oldest.entry);
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    for (const bucket of this.#idleByCode.values()) {
      for (const entry of bucket) {
        entry.symbol.destroy({ children: true });
      }
    }
    this.#idleByCode.clear();
  }

  getStats(): RenderSymbolPoolStats {
    const idlePerCode: Record<number, number> = {};
    for (const [code, bucket] of this.#idleByCode.entries()) {
      idlePerCode[code] = bucket.length;
    }
    return Object.freeze({
      totalIdle: this.getTotalIdle(),
      idlePerCode: Object.freeze(idlePerCode),
    });
  }

  private trimBucketToSize(code: number, size: number): void {
    const bucket = this.#idleByCode.get(code);
    if (!bucket) {
      return;
    }
    while (bucket.length > size) {
      const entry = bucket.shift();
      entry?.symbol.destroy({ children: true });
    }
    if (bucket.length === 0) {
      this.#idleByCode.delete(code);
    }
  }

  private getTotalIdle(): number {
    let total = 0;
    for (const bucket of this.#idleByCode.values()) {
      total += bucket.length;
    }
    return total;
  }

  private findOldestIdleEntry(): {
    readonly code: number;
    readonly entry: IdleSymbolEntry;
  } | null {
    let oldest: {
      readonly code: number;
      readonly entry: IdleSymbolEntry;
    } | null = null;
    for (const [code, bucket] of this.#idleByCode.entries()) {
      for (const entry of bucket) {
        if (
          oldest === null ||
          entry.lastUsedSequence < oldest.entry.lastUsedSequence
        ) {
          oldest = { code, entry };
        }
      }
    }
    return oldest;
  }

  private removeIdleEntry(code: number, entry: IdleSymbolEntry): void {
    const bucket = this.#idleByCode.get(code);
    if (!bucket) {
      return;
    }
    const index = bucket.indexOf(entry);
    if (index < 0) {
      return;
    }
    bucket.splice(index, 1);
    entry.symbol.destroy({ children: true });
    if (bucket.length === 0) {
      this.#idleByCode.delete(code);
    }
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new ReelError("RenderSymbolPool was destroyed.");
    }
  }
}

export function createRenderSymbolPool(
  options: RenderSymbolPoolOptions | undefined,
): RenderSymbolPool | null {
  if (!options?.enabled) {
    return null;
  }
  return new RenderSymbolPoolModel(options);
}

function normalizeRenderSymbolPoolOptions(
  options: RenderSymbolPoolOptions,
): NormalizedRenderSymbolPoolOptions {
  const targetIdlePerCode =
    options.targetIdlePerCode ?? DEFAULT_TARGET_IDLE_PER_CODE;
  const maxIdlePerCode = options.maxIdlePerCode ?? DEFAULT_MAX_IDLE_PER_CODE;
  const maxIdleTotal = options.maxIdleTotal ?? DEFAULT_MAX_IDLE_TOTAL;

  if (!Number.isInteger(targetIdlePerCode) || targetIdlePerCode < 0) {
    throw new ReelError("targetIdlePerCode must be an integer >= 0.");
  }
  if (!Number.isInteger(maxIdlePerCode) || maxIdlePerCode < targetIdlePerCode) {
    throw new ReelError(
      "maxIdlePerCode must be an integer >= targetIdlePerCode.",
    );
  }
  if (!Number.isInteger(maxIdleTotal) || maxIdleTotal < 0) {
    throw new ReelError("maxIdleTotal must be an integer >= 0.");
  }

  return Object.freeze({
    targetIdlePerCode,
    maxIdlePerCode,
    maxIdleTotal,
  });
}

function assertSymbolCode(code: number): void {
  if (!Number.isInteger(code) || code < 0) {
    throw new ReelError("symbol pool code must be a non-negative integer.");
  }
}
