import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readSymbolArtifactFixtureBytes } from "./artifact-fixtures.js";

export function readCraveFixture(name: string): Uint8Array {
  if (name === "symbol-state-textures.manifest.json")
    return encode(createGame002SymbolManifest());
  if (/^CN_[1-4]\.json$/u.test(name))
    return readSymbolArtifactFixtureBytes("H1.json");
  if (name === "Symbol.atlas" || name === "Symbol.png")
    return readSymbolArtifactFixtureBytes(name);
  if (name === "H2.png") return readSymbolArtifactFixtureBytes("H2.png");
  if (name.endsWith(".png")) return readSymbolArtifactFixtureBytes("H1.png");
  throw new Error(`Unknown Symbols Editor compatibility fixture: ${name}.`);
}

export function readCraveFixtureJson(name: string): unknown {
  return JSON.parse(
    new TextDecoder().decode(readCraveFixture(name)),
  ) as unknown;
}

function createGame002SymbolManifest() {
  const config = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../../assets/gamecfg002/gameconfig.json"),
      "utf8",
    ),
  ) as { paytable: Record<string, { symbol: string }> };
  const symbols: Record<string, unknown> = Object.fromEntries(
    Object.values(config.paytable).map(({ symbol }) => [
      symbol,
      { normal: `./${symbol}.png`, scale: 1 },
    ]),
  );
  symbols.CN = createCoinValueSymbol();
  return {
    version: 1,
    settings: {
      additionalStateDefinitions: [
        { id: "winStart", phase: "once", playback: "once" },
        { id: "winLoop", phase: "stable", playback: "loop" },
        { id: "collect", phase: "once", playback: "once" },
      ],
      disabled: { brightness: 0.72, kind: "grayscale" },
      spinBlur: { kernelHeight: 21, kind: "verticalBoxBlur" },
    },
    states: ["spinBlur", "disabled"],
    symbols,
  };
}

function createCoinValueSymbol() {
  const resources = [
    "digits-small.image-string.manifest.json",
    "digits-medium.image-string.manifest.json",
    "digits-large.image-string.manifest.json",
    "digits-xl.image-string.manifest.json",
  ];
  return {
    animations: {
      winStart: activeSpine("Win_Start", false),
      winLoop: activeSpine("Win", true),
      collect: activeSpine("Collect", false),
      remove: activeSpine("End", false),
    },
    cascadeWinPresentation: {
      order: 1,
      playback: {
        mode: "sequentialCollect",
        startState: "winStart",
        loopState: "winLoop",
        collectState: "collect",
        removeState: "remove",
      },
      summary: { mode: "itemAmount" },
    },
    scale: 1,
    valuePresentation: {
      defaultValues: [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000],
      reelStates: {
        normal: { kind: "transparent", width: 200, height: 200 },
        spinBlur: "./CN.spinBlur.png",
        disabled: "./CN.disabled.png",
      },
      text: {
        type: "image-string",
        tiers: resources.map((resource) => ({
          resource: `./${resource}`,
          slot: "coin",
          anchor: { x: 0.5, y: 0.5 },
          transform: { x: 0, y: 0, scale: 1 },
          followSlotColor: true,
        })),
      },
      tiers: resources.map((_, index) => ({
        ...(index < 3 ? { maxExclusive: [10, 100, 1000][index] } : {}),
        animation: {
          kind: "spine",
          skeleton: `./CN_${index + 1}.json`,
          atlas: "./Symbol.atlas",
          texture: "./Symbol.png",
          playback: {
            mode: "animation",
            animationName: "Loop",
            loop: true,
          },
        },
      })),
    },
  };
}

function activeSpine(animationName: string, loop: boolean) {
  return {
    kind: "activeSpine",
    playback: { mode: "animation", animationName, loop },
  };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
