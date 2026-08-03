import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../../assets/crave");
const map = JSON.parse(
  readFileSync(resolve(root, "assets.map.json"), "utf8"),
) as { readonly files: Readonly<Record<string, { readonly path: string }>> };

export function readCraveFixture(name: string): Uint8Array {
  const logicalKey = name.toLowerCase().replace(/\.png$/u, ".webp");
  const path = map.files[logicalKey]?.path;
  if (!path) throw new Error(`Crave fixture "${logicalKey}" is unavailable.`);
  return readFileSync(resolve(root, path));
}

export function readCraveFixtureJson(name: string): unknown {
  return JSON.parse(
    new TextDecoder().decode(readCraveFixture(name)),
  ) as unknown;
}
