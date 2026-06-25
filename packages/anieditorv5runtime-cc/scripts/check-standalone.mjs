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
  "export interface V5GLayerGroupConfig",
  "export interface V5GProjectConfig",
  "export const DEFAULT_VNI_LAYER_GROUP_ID",
  "export interface VNIRenderGroupInfo",
  "export interface VNILayerGroupSlot",
  "export function normalizeVNIProjectLayerGroups",
  "export function getVNIProjectRenderGroupOrder",
  "export function getVNIProjectLayerGroupSlots",
  "export function assertVNIAdjacentLayerGroupSlot",
  "export interface SampledLayerState",
  "export interface VNISafeGlowLayerSampleState",
  "export interface VNISafeGlowSpriteSample",
  "export interface ParticleSpriteSample",
  "export interface ParticleAnimationRuntimeState",
  "export interface V5GPlayRangeOptions",
  "export interface V5GSegmentedPlaybackOptions",
  "export type V5GPlaybackMode",
  "export type V5GSegmentedPlaybackPhase",
  "export interface V5GPlaybackState",
  "export interface V5GCocosAssetResolver",
  "export interface V5GCocosSpriteAtlasLike",
  "export interface V5GCocosSpriteAtlasAssetSource",
  "export type V5GCocosAssetSource",
  "export interface V5GCocosPlayerOptions",
  "export interface V5GCocosNodeDriver",
  "export type V5GCocosPlaybackRange",
  "export type V5GCocosPlaybackPoint",
  "export type V5GCocosPlayRangeOptions",
  "export type V5GCocosPlaybackMode",
  "export type V5GCocosSegmentedPlaybackPhase",
  "export type V5GCocosSegmentedPlaybackOptions",
  "export type V5GCocosPlayOptions",
  "export type V5GCocosPlaybackState",
  "export interface V5GCocosLayerGroupInfo",
  "export type V5GCocosLayerGroupSlot",
  "export interface V5GCocosAttachNodeBetweenLayerGroupsOptions",
  "export interface V5GCocosAttachProjectAssetBetweenLayerGroupsOptions",
  "export interface V5GCocosAttachSpriteFrameBetweenLayerGroupsOptions",
  "export interface V5GCocosPlaybackEventOptions",
  "export interface V5GCocosPlaybackEventContext",
  "export interface V5GCocosPlaybackCompleteContext",
  "export type SupportedCocosBlendMode",
  "export interface CocosBlendModeConfig",
  "export type V5GCocosNodeTransformSnapshot",
  "export class V5GSegmentedPlaybackSequence",
  "export class V5GParticleRuntime",
  "export class V5GCocosPlayer",
  "export function createV5GCocosPlayer",
  "export function getCocosBlendModeConfig",
  "export function assertV5GProject",
  "export function validateV5GProject",
  "export function validateCocosV5GProject",
  "export function parseColorHex",
  "export function sampleProjectAtTime",
  "export function sampleLayerAtTime",
  "export function sampleLayerAnimationsAtTime",
  "export function getSafeGlowProgress",
  "export function hasActiveSafeGlowAnimation",
  "export function sampleSafeGlowSpritesForLayer",
  "export function sampleParticleSpritesForLayer",
  "export function sampleParticleSpritesForLayerRuntime",
  "export function sampleLiveParticleSprites",
  "export function normalizeSegmentedPlaybackOptions",
  "export function hasActiveParticleAnimation",
  "export function opacityToCocosOpacity",
  "export function v5gTransformToCocosPosition",
];

for (const expected of requiredExports) {
  if (!source.includes(expected)) {
    violations.push(`missing public API: ${expected}`);
  }
}

const requiredSnippets = [
  "getParent(node: TNode): TNode | null",
  "captureLocalTransform(node: TNode): V5GCocosNodeTransformSnapshot",
  "captureWorldTransform(node: TNode): V5GCocosNodeTransformSnapshot",
  "detachMountedNodes(targets: readonly (string | TNode)[]): void",
  "hasActiveSafeGlowAnimation: boolean",
  "safe_glow",
];

for (const expected of requiredSnippets) {
  if (!source.includes(expected)) {
    violations.push(`missing standalone runtime snippet: ${expected}`);
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
