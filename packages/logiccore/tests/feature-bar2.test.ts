import { describe, expect, it } from "vitest";
import basicMessage from "./fixtures/gamemoduleinfo-basic.json";
import { createGameLogic, LogicParseError, parseFeatureBar2Data } from "../src";

const TYPE = "type.googleapis.com/sgc7pb.FeatureBar2Data";

describe("FeatureBar2Data", () => {
  it("reads frozen component data by exact name from a step or GameLogic", () => {
    const logic = createGameLogic(
      withFeatureBar({
        features: ["first", "second", "future-value"],
        usedFeatures: ["first"],
        cacheFeatures: [],
        curFeature: "first",
        "@type": TYPE,
      }),
    );

    const fromStep = logic.getStep(0).getFeatureBar2Data("feature-queue");
    expect(fromStep).toEqual({
      features: ["first", "second", "future-value"],
      usedFeatures: ["first"],
      cacheFeatures: [],
      curFeature: "first",
    });
    expect(logic.getFeatureBar2Data(0, "feature-queue")).toEqual(fromStep);
    expect(Object.isFrozen(fromStep)).toBe(true);
    expect(Object.isFrozen(fromStep?.features)).toBe(true);
    expect(() => ((fromStep!.features as string[])[0] = "changed")).toThrow(
      TypeError,
    );
  });

  it("returns undefined when the exact component was not triggered", () => {
    const logic = createGameLogic(basicMessage);
    expect(
      logic.getStep(0).getFeatureBar2Data("not-triggered"),
    ).toBeUndefined();
    expect(logic.getFeatureBar2Data(0, "not-triggered")).toBeUndefined();
  });

  it("rejects a triggered component with the wrong protobuf type or shape", () => {
    expect(() =>
      createGameLogic(
        withFeatureBar({
          features: [],
          usedFeatures: [],
          cacheFeatures: [],
          curFeature: "",
          "@type": "type.googleapis.com/sgc7pb.OtherData",
        }),
      )
        .getStep(0)
        .getFeatureBar2Data("feature-queue"),
    ).toThrow(LogicParseError);

    expect(() =>
      parseFeatureBar2Data({
        features: ["ok", 1],
        usedFeatures: [],
        cacheFeatures: [],
        curFeature: "ok",
        "@type": TYPE,
      }),
    ).toThrow(/features\[1\] must be a string/);
  });

  it("does not impose business feature names or queue cardinality", () => {
    expect(
      parseFeatureBar2Data({
        features: [""],
        usedFeatures: ["unknown"],
        cacheFeatures: ["future"],
        curFeature: "",
        "@type": TYPE,
      }),
    ).toMatchObject({ features: [""], curFeature: "" });
  });
});

function withFeatureBar(data: Readonly<Record<string, unknown>>): any {
  const message = structuredClone(basicMessage) as any;
  const params = message.gmi.replyPlay.results[0].clientData.curGameModParam;
  params.historyComponents.push("feature-queue");
  params.mapComponents["feature-queue"] = data;
  return message;
}
