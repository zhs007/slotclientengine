import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../assets/crave");
const map = JSON.parse(
  readFileSync(resolve(root, "assets.map.json"), "utf8"),
) as { readonly files: Readonly<Record<string, { readonly path: string }>> };

export function craveLogicalPath(key: string): string {
  const path = map.files[key]?.path;
  if (!path) throw new Error(`Crave logical fixture "${key}" is unavailable.`);
  return resolve(root, path);
}

export function readCraveJson<T = any>(key: string): T {
  return JSON.parse(readFileSync(craveLogicalPath(key), "utf8")) as T;
}

export function readCraveText(key: string): string {
  return readFileSync(craveLogicalPath(key), "utf8");
}

export function readCraveBytes(key: string): Uint8Array {
  return readFileSync(craveLogicalPath(key));
}
