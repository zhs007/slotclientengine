import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import { compileGame002FreeGamePlan } from "../src/freegame-plan.js";
import { compileGame002RoundOperationPlan } from "../src/game002-operation-compiler.js";
import type { Game002ReelRuntime } from "../src/game002-reel-controller.js";

const SAMPLE_RESULTS = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "../../docs/crave/gameresults.json"),
    "utf8",
  ),
) as unknown[];
const CODES = Object.freeze({ WL: 0, CN: 8, CO: 10, AF: 11, BN: 12 });
const DISPLAY_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
  "BN",
]);

describe("game002 FreeGame plan", () => {
  it("serializes the sample into explicit frontend operations", () => {
    const options = {
      logic: createSampleLogic(),
      runtime: compilerRuntime(),
      displaySymbols: DISPLAY_SYMBOLS,
    } as const;
    const compilation = compileGame002RoundOperationPlan(options);
    expect(compilation).toEqual(compileGame002RoundOperationPlan(options));
    expect(Object.isFrozen(compilation.plan.operations)).toBe(true);

    const kinds = compilation.plan.operations.map(({ kind }) => kind);
    expect(kinds).toContain("game002:freegame-trigger");
    expect(
      kinds.filter((kind) => kind === "game002:freegame-spin"),
    ).toHaveLength(10);
    expect(kinds).toContain("game002:freegame-af");
    expect(kinds).toContain("game002:freegame-co");
    expect(kinds.at(-1)).toBe("game002:freegame-exit");
  });

  it("compiles the sample FG, AF and CO sequence", () => {
    const plan = compileFreeGame(createSampleMessage());
    expect(plan?.initialFreeSpins).toBe(7);
    expect(plan?.spins).toHaveLength(10);
    expect(plan?.spins.filter(({ af }) => af)).toHaveLength(2);
    expect(plan?.spins.filter(({ co }) => co)).toHaveLength(4);
    expect(plan?.finalStepIndex).toBe(17);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("returns null without an FG trigger", () => {
    const raw = createSampleMessage();
    removeActiveComponent(raw, 7, "bg-triggerfg");
    expect(compileFreeGame(raw)).toBeNull();
  });

  it("accepts a CO segment without a trailing separator", () => {
    const raw = createSampleMessage();
    const encoded = components(raw, 11)["fg-vortex"]!.pos;
    if (!Array.isArray(encoded)) throw new Error("expected vortex array");
    encoded.pop();
    expect(compileFreeGame(raw)).not.toBeNull();
  });

  it.each([
    {
      name: "duplicate trigger position",
      mutate: (raw: SampleMessage) => {
        const pos = result(raw, 7, 2).pos as number[];
        result(raw, 7, 2).pos = [pos[0], pos[1], pos[0], pos[1]];
      },
      error: /contains duplicate/,
    },
    {
      name: "missing trigger counter",
      mutate: (raw: SampleMessage) => delete components(raw, 7)["fg-start"],
      error: /fg-start is missing/,
    },
    {
      name: "missing spin component",
      mutate: (raw: SampleMessage) => removeActiveComponent(raw, 9, "fg-spin"),
      error: /must contain fg-start and fg-spin/,
    },
    {
      name: "out-of-range feature position",
      mutate: (raw: SampleMessage) => {
        components(raw, 9)["fg-spin"]!.pos = [99, 99];
      },
      error: /out of bounds/,
    },
    {
      name: "missing spin scene",
      mutate: (raw: SampleMessage) => {
        basic(raw, 9, "fg-spin").usedScenes = [];
      },
      error: /exactly one scene/,
    },
    {
      name: "partial AF operation",
      mutate: (raw: SampleMessage) =>
        removeActiveComponent(raw, 8, "fg-rollaf"),
      error: /AF protocol is partial/,
    },
    {
      name: "AF targets a non-AF cell",
      mutate: (raw: SampleMessage) => {
        result(raw, 8, 0).pos = [0, 0];
      },
      error: /must use symbol code 11/,
    },
    {
      name: "invalid AF coin value",
      mutate: (raw: SampleMessage) => {
        const index = basic(raw, 8, "fg-genafcn").usedOtherScenes[0]!;
        otherSceneColumns(raw, 8, index)[4]!.values[5] = -1;
      },
      error: /must be positive/,
    },
    {
      name: "partial CO operation",
      mutate: (raw: SampleMessage) =>
        removeActiveComponent(raw, 11, "fg-cogencn"),
      error: /CO protocol is partial/,
    },
    {
      name: "malformed CO coordinates",
      mutate: (raw: SampleMessage) => {
        components(raw, 11)["fg-vortex"]!.pos = [1, 0, 0];
      },
      error: /partial tuple/,
    },
  ])("rejects a basic $name error", ({ mutate, error }) => {
    const raw = createSampleMessage();
    mutate(raw);
    expect(() => compileFreeGame(raw)).toThrow(error);
  });
});

type SampleMessage = ReturnType<typeof createSampleMessage>;

function compilerRuntime() {
  return {
    gameConfig: {
      getSymbolCode: (symbol: string) => DISPLAY_SYMBOLS.indexOf(symbol),
    },
  } as Game002ReelRuntime;
}

function createSampleLogic() {
  return createSlotGameLogicResult(createSampleMessage(), {
    bet: { bet: 1, lines: 1, times: 1 },
    userInfo: { gameid: 2 },
  }).logic;
}

function createSampleMessage() {
  const first = SAMPLE_RESULTS[0] as {
    clientData: { scenes: readonly unknown[] };
  };
  return structuredClone({
    gmi: {
      defaultScene: first.clientData.scenes[0],
      replyPlay: { randomNumbers: [], results: SAMPLE_RESULTS },
    },
    totalwin: 1,
    results: SAMPLE_RESULTS.length,
  });
}

function compileFreeGame(raw: SampleMessage) {
  const logic = createSlotGameLogicResult(raw, {
    bet: { bet: 1, lines: 1, times: 1 },
    userInfo: { gameid: 2 },
  }).logic;
  const firstSpin = logic.getStep(8);
  const entryScene = firstSpin.getScene(0);
  const entryValues = firstSpin
    .getOtherScene(0)
    .map((column, x) =>
      column.map((value, y) =>
        entryScene[x]![y] === CODES.WL || entryScene[x]![y] === CODES.CN
          ? value || null
          : null,
      ),
    );
  return compileGame002FreeGamePlan({
    logic,
    entryScene,
    entryValues,
    symbolCodes: CODES,
  });
}

function components(raw: SampleMessage, stepIndex: number) {
  return (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: {
        curGameModParam: {
          mapComponents: Record<string, Record<string, unknown>>;
        };
      };
    }
  ).clientData.curGameModParam.mapComponents;
}

function removeActiveComponent(
  raw: SampleMessage,
  stepIndex: number,
  name: string,
): void {
  const param = (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: { curGameModParam: { historyComponents: string[] } };
    }
  ).clientData.curGameModParam;
  param.historyComponents = param.historyComponents.filter(
    (item) => item !== name,
  );
}

function basic(raw: SampleMessage, stepIndex: number, name: string) {
  return components(raw, stepIndex)[name]!.basicComponentData as {
    usedScenes: number[];
    usedOtherScenes: number[];
  };
}

function result(raw: SampleMessage, stepIndex: number, resultIndex: number) {
  return (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: { results: Array<Record<string, unknown>> };
    }
  ).clientData.results[resultIndex]!;
}

function otherSceneColumns(
  raw: SampleMessage,
  stepIndex: number,
  sceneIndex: number,
) {
  return (
    raw.gmi.replyPlay.results[stepIndex] as {
      clientData: {
        otherScenes: Array<{ values: Array<{ values: number[] }> }>;
      };
    }
  ).clientData.otherScenes[sceneIndex]!.values;
}
