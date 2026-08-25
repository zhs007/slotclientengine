import { SceneLayoutError } from "../errors.js";
import { SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS } from "./package-limits.js";

export type SceneLayoutJsonPrimitive = null | boolean | string | number;

export type SceneLayoutJsonValue =
  | SceneLayoutJsonPrimitive
  | SceneLayoutJsonObject
  | SceneLayoutJsonArray;

export interface SceneLayoutJsonObject {
  readonly [key: string]: SceneLayoutJsonValue;
}

export type SceneLayoutJsonArray = readonly SceneLayoutJsonValue[];

export type SceneLayoutJsonData = SceneLayoutJsonObject | SceneLayoutJsonArray;

/** Parses one opaque program asset without assigning any game-specific schema. */
export function parseSceneLayoutJsonData(
  bytes: Uint8Array,
  path = "JSON data",
): SceneLayoutJsonData {
  if (bytes.byteLength > SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS.maxFileBytes)
    throw new SceneLayoutError(
      `Scene layout JSON data "${path}" exceeds ${SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS.maxFileBytes} bytes.`,
    );
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout JSON data "${path}" is invalid UTF-8: ${formatError(error)}`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout JSON data "${path}" is invalid JSON: ${formatError(error)}`,
    );
  }
  if (!isContainer(value))
    throw new SceneLayoutError(
      `Scene layout JSON data "${path}" root must be an object or array.`,
    );

  const pending: object[] = [value];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const child of Object.values(current)) {
      if (typeof child === "number" && !Number.isFinite(child))
        throw new SceneLayoutError(
          `Scene layout JSON data "${path}" contains a non-finite number.`,
        );
      if (isContainer(child)) pending.push(child);
    }
    Object.freeze(current);
  }
  return value as SceneLayoutJsonData;
}

function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
