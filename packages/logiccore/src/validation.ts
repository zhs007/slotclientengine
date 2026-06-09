import { LogicParseError } from './errors';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new LogicParseError(`${path} must be an object.`);
  }

  return value;
}

export function assertArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new LogicParseError(`${path} must be an array.`);
  }

  return value;
}

export function assertFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LogicParseError(`${path} must be a finite number.`);
  }

  return value;
}

export function assertOptionalFiniteNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return assertFiniteNumber(value, path);
}

export function assertOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new LogicParseError(`${path} must be a string.`);
  }

  return value;
}

export function assertInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new LogicParseError(`${path} must be an integer.`);
  }

  return value;
}

export function assertNumberArray(value: unknown, path: string): readonly number[] {
  return freezeArray(
    assertArray(value, path).map((item, index) =>
      assertFiniteNumber(item, `${path}[${index}]`)
    )
  );
}

export function assertIntegerArray(value: unknown, path: string): readonly number[] {
  return freezeArray(
    assertArray(value, path).map((item, index) => assertInteger(item, `${path}[${index}]`))
  );
}

export function assertNonNegativeIntegerArray(value: unknown, path: string): readonly number[] {
  return freezeArray(
    assertArray(value, path).map((item, index) => {
      const parsed = assertInteger(item, `${path}[${index}]`);

      if (parsed < 0) {
        throw new LogicParseError(`${path}[${index}] must be a non-negative integer.`);
      }

      return parsed;
    })
  );
}

export function assertStringArray(
  value: unknown,
  path: string,
  options: { readonly nonEmptyItems?: boolean } = {}
): readonly string[] {
  return freezeArray(
    assertArray(value, path).map((item, index) => {
      if (typeof item !== 'string') {
        throw new LogicParseError(`${path}[${index}] must be a string.`);
      }

      if (options.nonEmptyItems === true && item.length === 0) {
        throw new LogicParseError(`${path}[${index}] must be a non-empty string.`);
      }

      return item;
    })
  );
}

export function freezeArray<T>(value: readonly T[]): readonly T[] {
  return Object.freeze([...value]);
}

export function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(cloneValue(value)) as T;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isRecord(value)) {
    const cloned: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      cloned[key] = cloneValue(item);
    }

    return cloned;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }

    return Object.freeze(value);
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }

    return Object.freeze(value);
  }

  return value;
}
