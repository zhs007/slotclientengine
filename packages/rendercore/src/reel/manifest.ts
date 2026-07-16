import { ReelError } from "./errors.js";

export interface ReelSpinMotionManifest {
  readonly bounceStrength: number;
  readonly dimmingAlpha: number;
}

export interface ParsedReelManifest {
  readonly version: 1;
  readonly spin: ReelSpinMotionManifest;
}

export function parseReelManifest(value: unknown): ParsedReelManifest {
  const record = assertRecord(value, "reel manifest");
  assertOnlyKnownKeys(record, "reel manifest", ["version", "spin"]);
  if (record.version !== 1) {
    throw new ReelError("Reel manifest version must be 1.");
  }
  const spin = assertRecord(record.spin, "reel manifest spin");
  assertOnlyKnownKeys(spin, "reel manifest spin", [
    "bounceStrength",
    "dimmingAlpha",
  ]);
  if (
    typeof spin.bounceStrength !== "number" ||
    !Number.isFinite(spin.bounceStrength) ||
    spin.bounceStrength < 0
  ) {
    throw new ReelError(
      "Reel manifest spin.bounceStrength must be a non-negative finite number.",
    );
  }
  if (
    typeof spin.dimmingAlpha !== "number" ||
    !Number.isFinite(spin.dimmingAlpha) ||
    spin.dimmingAlpha < 0 ||
    spin.dimmingAlpha > 1
  ) {
    throw new ReelError(
      "Reel manifest spin.dimmingAlpha must be a finite number between 0 and 1.",
    );
  }
  return Object.freeze({
    version: 1,
    spin: Object.freeze({
      bounceStrength: spin.bounceStrength,
      dimmingAlpha: spin.dimmingAlpha,
    }),
  });
}

function assertRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReelError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  label: string,
  knownKeys: readonly string[],
): void {
  const known = new Set(knownKeys);
  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      throw new ReelError(`${label} contains unknown field "${key}".`);
    }
  }
}
