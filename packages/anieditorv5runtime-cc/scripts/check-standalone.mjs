import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const standalonePath = fileURLToPath(
  new URL("../standalone/anieditorv5runtime-cc.ts", import.meta.url),
);
const source = readFileSync(standalonePath, "utf8");
const violations = [];

const importModules = [
  ...source.matchAll(/^\s*import[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gm),
].map((match) => match[1]);

if (importModules.length === 0) {
  violations.push("standalone runtime must import the Cocos Creator cc module");
}
for (const moduleName of importModules) {
  if (moduleName !== "cc") {
    violations.push(`forbidden import module: ${moduleName}`);
  }
}

const forbiddenPatterns = [
  [/from\s+["']\.\.?\//u, "relative imports are not allowed"],
  [/from\s+["']@slotclientengine\//u, "workspace imports are not allowed"],
  [/from\s+["']pixi\.js["']/u, "pixi.js is not allowed"],
  [/from\s+["'](?:fs|path|url|node:)/u, "Node builtins are not allowed"],
  [/\brequire\s*\(/u, "CommonJS require is not allowed"],
  [/\bwindow\b/u, "window global is not allowed"],
  [/\bdocument\b/u, "document global is not allowed"],
  [/@ccclass/u, "decorated Cocos Components are not allowed in runtime"],
  [/@property/u, "decorated Cocos properties are not allowed in runtime"],
  [/\.js["']/u, "internal .js suffix imports are not allowed"],
  [/\bJsonAsset\b/u, "runtime must not bind JsonAsset"],
  [/\bresources\.load\b/u, "runtime must not load Cocos resources"],
  [/\bdist\//u, "runtime must not depend on dist output"],
  [
    /\bsrc\/(?:core|cocos)\b/u,
    "runtime must not depend on package source paths",
  ],
  [
    /\.includes\s*\(/u,
    "ES2016 includes() is not allowed in the ES2015 standalone runtime",
  ],
];

for (const [pattern, message] of forbiddenPatterns) {
  if (pattern.test(source)) violations.push(message);
}

const requiredExports = [
  "export type V5GCoordinateMode",
  "export type V5GAnimationType",
  "export interface V5GAssetConfig",
  "export interface V5GExportProfileConfig",
  "export interface V5GProjectConfig",
  "export interface SampledLayerState",
  "export interface ParticleSpriteSample",
  "export interface V5GCocosAssetResolver",
  "export interface V5GCocosPlayerOptions",
  "export type V5GCocosPlaybackRange",
  "export type V5GCocosPlaybackPoint",
  "export interface V5GCocosPlayRangeOptions",
  "export interface V5GCocosPlaybackEventOptions",
  "export interface V5GCocosPlaybackEventContext",
  "export interface V5GCocosPlaybackCompleteContext",
  "export class V5GCocosPlayer",
  "export function createV5GCocosPlayer",
  "export function assertV5GProject",
  "export function validateV5GProject",
  "export function validateCocosV5GProject",
  "export function parseColorHex",
  "export function sampleProjectAtTime",
  "export function sampleLayerAtTime",
  "export function sampleLayerAnimationsAtTime",
  "export function sampleParticleSpritesForLayer",
  "export function hasActiveParticleAnimation",
  "export function opacityToCocosOpacity",
  "export function v5gTransformToCocosPosition",
];

for (const expected of requiredExports) {
  if (!source.includes(expected)) {
    violations.push(`missing public API: ${expected}`);
  }
}

if (violations.length > 0) {
  console.error("standalone runtime check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("standalone runtime check passed");
}
