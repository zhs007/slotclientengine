import { buildLogicComponent } from "./component";
import { LogicParseError } from "./errors";
import type { FeatureBar2Data, ParsedGameLogicStepData } from "./types";
import { assertRecord, assertStringArray, freezeArray } from "./validation";

const FEATURE_BAR2_TYPE = "type.googleapis.com/sgc7pb.FeatureBar2Data";

export function getFeatureBar2DataForStep(
  step: ParsedGameLogicStepData,
  name: string,
): FeatureBar2Data | undefined {
  const component = buildLogicComponent(step, name);
  if (!component) return undefined;

  const path = `step[${step.index}].mapComponents.${name}`;
  return parseFeatureBar2Data(component.raw, path);
}

export function parseFeatureBar2Data(
  value: unknown,
  path = "FeatureBar2Data",
): FeatureBar2Data {
  const record = assertRecord(value, path);
  if (record["@type"] !== FEATURE_BAR2_TYPE) {
    throw new LogicParseError(`${path}.@type must be "${FEATURE_BAR2_TYPE}".`);
  }
  if (typeof record.curFeature !== "string") {
    throw new LogicParseError(`${path}.curFeature must be a string.`);
  }

  return Object.freeze({
    features: freezeArray(
      assertStringArray(record.features, `${path}.features`),
    ),
    usedFeatures: freezeArray(
      assertStringArray(record.usedFeatures, `${path}.usedFeatures`),
    ),
    cacheFeatures: freezeArray(
      assertStringArray(record.cacheFeatures, `${path}.cacheFeatures`),
    ),
    curFeature: record.curFeature,
  });
}
