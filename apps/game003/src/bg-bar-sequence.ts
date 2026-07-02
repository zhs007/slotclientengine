import type { GameLogic } from "@slotclientengine/gameframeworks";

export const GAME003_BG_BAR_COMPONENT_NAME = "bg-bar";
export const GAME003_BG_BAR_FEATURES = Object.freeze([
  "normal",
  "wild",
  "up",
] as const);
export type Game003BgBarFeature = (typeof GAME003_BG_BAR_FEATURES)[number];

export interface Game003BgBarSpinPlan {
  readonly stepIndex: 0;
  readonly features: readonly [
    Game003BgBarFeature,
    Game003BgBarFeature,
    Game003BgBarFeature,
    Game003BgBarFeature,
    Game003BgBarFeature,
  ];
}

const FEATURE_BAR_TYPE_URL = "type.googleapis.com/sgc7pb.FeatureBar2Data";
const EMPTY_BASIC_ARRAY_FIELDS = Object.freeze([
  "usedScenes",
  "usedOtherScenes",
  "usedResults",
  "usedPrizeScenes",
  "srcScenes",
  "pos",
] as const);

export function createGame003BgBarSpinPlan(
  logic: GameLogic,
): Game003BgBarSpinPlan | null {
  const step = logic.getStep(0);
  if (!step.hasComponent(GAME003_BG_BAR_COMPONENT_NAME)) {
    return null;
  }
  const component = step.getComponent(GAME003_BG_BAR_COMPONENT_NAME);
  if (!component) {
    throw new Error("game003 bg-bar component is missing in mapComponents.");
  }
  if (!component.hasBasicComponentData) {
    throw new Error(
      "game003 bg-bar component must include basicComponentData.",
    );
  }
  const raw = assertRecord(component.raw, "game003 bg-bar component");
  const typeUrl = raw["@type"];
  if (typeUrl !== undefined && typeUrl !== FEATURE_BAR_TYPE_URL) {
    throw new Error("game003 bg-bar @type must be FeatureBar2Data.");
  }
  const features = parseFeatures(raw.features);
  assertArray(raw.usedFeatures, "game003 bg-bar usedFeatures");
  assertArray(raw.cacheFeatures, "game003 bg-bar cacheFeatures");
  assertFeature(raw.curFeature, "game003 bg-bar curFeature");
  validateBasicComponentData(raw.basicComponentData);

  return Object.freeze({
    stepIndex: 0,
    features,
  });
}

function parseFeatures(value: unknown): Game003BgBarSpinPlan["features"] {
  if (!Array.isArray(value)) {
    throw new Error("game003 bg-bar features must be an array.");
  }
  if (value.length !== 5) {
    throw new Error("game003 bg-bar features length must be 5.");
  }
  return Object.freeze(
    value.map((feature, index) =>
      assertFeature(feature, `game003 bg-bar features[${index}]`),
    ),
  ) as Game003BgBarSpinPlan["features"];
}

function validateBasicComponentData(value: unknown): void {
  const record = assertRecord(value, "game003 bg-bar basicComponentData");
  for (const field of EMPTY_BASIC_ARRAY_FIELDS) {
    const array = assertArray(
      record[field],
      `game003 bg-bar basicComponentData.${field}`,
    );
    if (array.length !== 0) {
      throw new Error(
        `game003 bg-bar basicComponentData.${field} must be empty.`,
      );
    }
  }
  assertZero(record.coinWin, "game003 bg-bar basicComponentData.coinWin");
  assertZero(record.cashWin, "game003 bg-bar basicComponentData.cashWin");
}

function assertFeature(value: unknown, label: string): Game003BgBarFeature {
  if (value === "normal" || value === "wild" || value === "up") {
    return value;
  }
  throw new Error(`${label} must be normal, wild or up.`);
}

function assertZero(value: unknown, label: string): void {
  if (value !== 0) {
    throw new Error(`${label} must be 0.`);
  }
}

function assertArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
