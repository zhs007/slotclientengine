import { SlotGameConfigError, SlotGameRuntimeError } from "./errors.js";
import type { SlotGameRngConsoleOptions } from "./types.js";

const RNG_COMMAND_NAME = "rng";

export interface SlotGameRngConsoleController {
  takeNext(): readonly number[] | undefined;
  logRandomNumbers(randomNumbers: readonly number[]): void;
  destroy(): void;
}

export function createSlotGameRngConsoleController(
  options: SlotGameRngConsoleOptions,
): SlotGameRngConsoleController {
  validateOptions(options);
  const target = options.target;
  const log = options.log ?? ((message: string) => console.info(message));
  if (Reflect.has(target, RNG_COMMAND_NAME)) {
    throw new SlotGameConfigError(
      `RNG console target already defines "${RNG_COMMAND_NAME}".`,
    );
  }

  let pending: readonly number[] | undefined;
  let destroyed = false;
  const command = (...values: unknown[]): void => {
    if (destroyed) {
      throw new SlotGameRuntimeError(
        "RNG console command belongs to a destroyed slot game framework.",
      );
    }
    const validated = validateRandomNumbers(values);
    pending = Object.freeze([...validated]);
  };

  try {
    Object.defineProperty(target, RNG_COMMAND_NAME, {
      configurable: true,
      enumerable: false,
      value: command,
      writable: true,
    });
  } catch {
    throw new SlotGameConfigError(
      `RNG console target cannot define "${RNG_COMMAND_NAME}".`,
    );
  }

  return Object.freeze({
    takeNext(): readonly number[] | undefined {
      const next = pending;
      pending = undefined;
      return next;
    },
    logRandomNumbers(randomNumbers: readonly number[]): void {
      try {
        log(`rng(${randomNumbers.join(",")})`);
      } catch {
        // Diagnostic observers must not change the spin lifecycle.
      }
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      pending = undefined;
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(target, RNG_COMMAND_NAME);
      } catch {
        throw new SlotGameRuntimeError(
          `Failed to inspect RNG console command "${RNG_COMMAND_NAME}" during destroy.`,
        );
      }
      if (descriptor?.value !== command) {
        return;
      }
      try {
        if (!Reflect.deleteProperty(target, RNG_COMMAND_NAME)) {
          throw new Error("property deletion returned false");
        }
      } catch {
        throw new SlotGameRuntimeError(
          `Failed to remove RNG console command "${RNG_COMMAND_NAME}" during destroy.`,
        );
      }
    },
  });
}

function validateOptions(options: SlotGameRngConsoleOptions): void {
  if (
    typeof options !== "object" ||
    options === null ||
    (typeof options.target !== "object" &&
      typeof options.target !== "function") ||
    options.target === null
  ) {
    throw new SlotGameConfigError(
      "rngConsole.target must be a non-null object.",
    );
  }
  if (options.log !== undefined && typeof options.log !== "function") {
    throw new SlotGameConfigError("rngConsole.log must be a function.");
  }
}

function validateRandomNumbers(values: readonly unknown[]): readonly number[] {
  if (values.length === 0) {
    throw new SlotGameConfigError("rng() requires at least one random number.");
  }
  return values.map((value, index) => {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new SlotGameConfigError(
        `rng argument[${index}] must be a non-negative safe integer; received ${describeValue(value)}.`,
      );
    }
    return value;
  });
}

function describeValue(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}
