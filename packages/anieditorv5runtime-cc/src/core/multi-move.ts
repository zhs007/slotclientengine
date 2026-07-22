import { roundTo } from "./coordinates.js";
import type { V5GEasingName } from "./animation-sampler.js";

export interface V5GMultiMovePoint {
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly easing: V5GEasingName;
}

interface IndexedMultiMovePoint {
  readonly index: number;
  readonly point: V5GMultiMovePoint;
}

export function parseMultiMovePointsJson(
  value: unknown,
  duration: number,
  label: string,
  isSupportedEasing: (value: string) => value is V5GEasingName,
): readonly V5GMultiMovePoint[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`${label} duration must be a positive finite number.`);
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a JSON string.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} must be valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }
  if (parsed.length < 2) {
    throw new Error(`${label} must contain at least two points.`);
  }

  return parsed
    .map((item, index): IndexedMultiMovePoint => {
      const pointLabel = `${label}[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`${pointLabel} must be an object.`);
      }
      const record = item as Record<string, unknown>;
      const x = assertFinitePointNumber(record.x, `${pointLabel}.x`);
      const y = assertFinitePointNumber(record.y, `${pointLabel}.y`);
      const time = assertFinitePointNumber(record.time, `${pointLabel}.time`);
      if (x < -5000 || x > 5000) {
        throw new Error(`${pointLabel}.x must be within -5000..5000.`);
      }
      if (y < -5000 || y > 5000) {
        throw new Error(`${pointLabel}.y must be within -5000..5000.`);
      }
      if (time < 0 || time > duration) {
        throw new Error(
          `${pointLabel}.time must be within 0..${roundTo(duration, 4)}.`,
        );
      }
      if (
        typeof record.easing !== "string" ||
        !isSupportedEasing(record.easing)
      ) {
        throw new Error(`${pointLabel}.easing must be a supported easing.`);
      }

      return {
        index,
        point: {
          x: roundTo(x, 4),
          y: roundTo(y, 4),
          time: roundTo(time, 4),
          easing: record.easing,
        },
      };
    })
    .sort(
      (left, right) =>
        left.point.time - right.point.time || left.index - right.index,
    )
    .map((entry) => entry.point);
}

function assertFinitePointNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${label} must be a finite number.`);
}
